// Measures the two defaults: hover preloading (server loads, bytes, latency) and streamed data
// (what the first response and a non-JS crawler contain, time to first byte).
//   bun run build && bun run measure          (ONLY=paths,touch,cache,latency,stream,preview)
// Writes results/measure.json (source of truth for the README, the guide and the video).
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';
import {
	BASE, CACHE_PATHS, PATHS, TOUCH_PATHS, UA, analyse, environment, fetchTimed, median, otherLoad, r1,
	runLatency, runScenario, startPreview, startServer, stopServer
} from './lib.mjs';

const only = process.env.ONLY?.split(',');
const want = (k) => !only || only.includes(k);
const REPS = Number(process.env.REPS ?? 3);

export const CONFIGS = [
	{ name: 'hover (scaffold default)', query: '' },
	{ name: 'data tap', query: '?data=tap' },
	{ name: 'data off', query: '?data=false' },
	{ name: 'data off + code hover', query: '?data=false&code=hover' },
	{ name: 'data off + code viewport', query: '?data=false&code=viewport' },
	{ name: 'data off + code eager', query: '?data=false&code=eager' },
	{ name: 'data tap + code hover', query: '?data=tap&code=hover' },
	{ name: 'list scoped to tap, nav hover', query: '?list=tap' }
];

const out = {
	env: environment(),
	otherLoad: { before: await otherLoad() },
	method: {
		server: 'node build on 127.0.0.1, production build; load delay random 150-300 ms unless stated',
		desktop: 'Chromium 1280x1400 (whole list visible), real Playwright mouse events every 16 ms (60 Hz), eased',
		touch: 'Playwright "Pixel 7" device (touch, mobile viewport); swipes via CDP touch events',
		counted: 'server `load` calls and __data.json requests AFTER the list page was loaded and hydrated, up to 600 ms after the opened page appeared; the opened page itself is included',
		reps: REPS
	},
	preload: { paths: [], touch: [], cache: [], latency: [] },
	stream: {}
};

const summarise = (runs) => ({
	serverLoadsMedian: median(runs.map((r) => r.serverLoads)),
	serverLoads: runs.map((r) => r.serverLoads),
	dataBytesMedian: median(runs.map((r) => r.dataBytes)),
	jsRequestsMedian: median(runs.map((r) => r.jsRequests)),
	jsBeforePathMedian: median(runs.map((r) => r.jsBeforePath)),
	accidentalRests: runs.reduce((a, r) => a + r.accidentalRests, 0),
	medianMoveGapMs: median(runs.map((r) => r.medianMoveGapMs).filter((x) => x != null)),
	runs
});

let server = await startServer();
const browser = await chromium.launch();
try {
	if (want('paths')) {
		for (const cfg of CONFIGS) {
			for (const [pathName, path] of Object.entries(PATHS)) {
				const runs = [];
				for (let i = 0; i < REPS; i++) runs.push(await runScenario(browser, { query: cfg.query, path, seed: 100 + i }));
				const s = { config: cfg.name, query: cfg.query, path: pathName, ...summarise(runs) };
				out.preload.paths.push(s);
				console.log(`${cfg.name.padEnd(30)} ${pathName.padEnd(10)} loads ${JSON.stringify(s.serverLoads)}  data ${s.dataBytesMedian} B  js ${s.jsRequestsMedian} (+${s.jsBeforePathMedian} before)  rests ${s.accidentalRests}`);
			}
		}
	}

	if (want('touch')) {
		const phone = devices['Pixel 7'];
		for (const cfg of CONFIGS.slice(0, 3)) {
			for (const [pathName, path] of Object.entries(TOUCH_PATHS)) {
				const runs = [];
				for (let i = 0; i < REPS; i++) runs.push(await runScenario(browser, { query: cfg.query, path, device: phone, seed: 200 + i }));
				const s = { config: cfg.name, query: cfg.query, path: pathName, device: 'Pixel 7 (emulated)', ...summarise(runs) };
				out.preload.touch.push(s);
				console.log(`touch ${cfg.name.padEnd(24)} ${pathName.padEnd(10)} loads ${JSON.stringify(s.serverLoads)}  ${runs[0].scrolls ? 'scrolls ' + JSON.stringify(runs[0].scrolls) : ''}`);
			}
		}
	}

	if (want('cache')) {
		for (const [cfg, pathName] of [[CONFIGS[0], 'hoverWaitClick'], [CONFIGS[0], 'abClickA'], [CONFIGS[1], 'abClickA']]) {
			const runs = [];
			for (let i = 0; i < REPS; i++) runs.push(await runScenario(browser, { query: cfg.query, path: CACHE_PATHS[pathName], delay: '200', seed: 300 + i }));
			const s = { config: cfg.name, query: cfg.query, path: pathName, ...summarise(runs) };
			out.preload.cache.push(s);
			console.log(`cache ${cfg.name.padEnd(24)} ${pathName.padEnd(15)} loads ${JSON.stringify(s.serverLoads)}  clickToContent ${JSON.stringify(runs.map((r) => r.clickToContentMs))}`);
		}
	}

	if (want('latency')) {
		for (const cfg of [CONFIGS[0], CONFIGS[1], CONFIGS[2], CONFIGS[6]]) {
			for (const delay of [150, 300]) {
				for (const dwell of [0, 100, 300]) {
					const r = { config: cfg.name, ...(await runLatency(browser, { query: cfg.query, delay, dwell, reps: 7 })) };
					out.preload.latency.push(r);
					console.log(`latency ${cfg.name.padEnd(24)} delay ${delay} dwell ${String(dwell).padStart(3)}  median ${r.medianMs} ms  ${JSON.stringify(r.samples)}`);
				}
			}
		}
	}

	if (want('stream')) {
		const ROUTES = ['/stream/awaited', '/stream/streamed', '/stream/critical-streamed'];
		out.stream.node = {};
		for (const route of ROUTES) {
			await fetchTimed(route); // warm-up
			const runs = [];
			for (let i = 0; i < 10; i++) runs.push(await fetchTimed(route));
			const a = analyse(runs[0]);
			out.stream.node[route] = {
				requests: runs.length,
				headersMsMedian: r1(median(runs.map((r) => r.headersMs))),
				firstChunkMsMedian: r1(median(runs.map((r) => r.firstChunkMs))),
				completeMsMedian: r1(median(runs.map((r) => r.completeMs))),
				chunksMedian: median(runs.map((r) => r.chunks)),
				firstChunkBytes: runs[0].firstChunkBytes,
				totalBytes: runs[0].totalBytes,
				allRunsSameAnalysis: runs.every((r) => JSON.stringify(analyse(r)) === JSON.stringify(a)),
				...a,
				withAcceptEncodingGzip: await (async () => {
					const g = [];
					for (let i = 0; i < 5; i++) g.push(await fetchTimed(route, UA.browser, { gzip: true }));
					return { contentEncoding: g[0].encoding, firstChunkMsMedian: r1(median(g.map((r) => r.firstChunkMs))), chunksMedian: median(g.map((r) => r.chunks)) };
				})(),
				crawlerTextSample: analyseSample(runs[0].body)
			};
			console.log('stream', route, JSON.stringify({ ...out.stream.node[route], crawlerTextSample: undefined }));
		}

		// The same pages as different crawlers request them. SvelteKit doesn't vary the response
		// by user agent; this checks that and records what each would read without JavaScript.
		out.stream.userAgents = {};
		for (const route of ROUTES) {
			const base = analyse(await fetchTimed(route, UA.browser));
			out.stream.userAgents[route] = {};
			for (const [name, ua] of Object.entries(UA)) {
				const a = analyse(await fetchTimed(route, ua));
				out.stream.userAgents[route][name] = { sameAsBrowser: JSON.stringify(a) === JSON.stringify(base), descriptionInMarkup: a.descriptionInMarkup, reviewsInMarkup: a.reviewsInMarkup };
			}
		}
		console.log('user agents', JSON.stringify(out.stream.userAgents));

		// A real browser, with and without JavaScript.
		out.stream.browser = {};
		for (const route of ROUTES) {
			const res = {};
			for (const js of [false, true]) {
				const ctx = await browser.newContext({ javaScriptEnabled: js });
				const page = await ctx.newPage();
				await page.goto(BASE + route, { waitUntil: js ? 'load' : 'domcontentloaded' });
				if (js) await page.waitForSelector('.review', { timeout: 10000 });
				else await page.waitForTimeout(1500);
				const text = (await page.innerText('body')).toLowerCase();
				const timing = await page.evaluate(() => {
					const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
					const nav = performance.getEntriesByType('navigation')[0];
					return { fcpMs: fcp, responseStartMs: nav?.responseStart ?? null, responseEndMs: nav?.responseEnd ?? null };
				});
				res[js ? 'jsOn' : 'jsOff'] = {
					descriptionVisible: text.includes('built for people who spend whole days outside'),
					reviewsVisible: text.includes('great grip on wet rock'),
					placeholderVisible: /loading (reviews|product)/.test(text),
					fcpMs: r1(timing.fcpMs),
					responseStartMs: r1(timing.responseStartMs),
					responseEndMs: r1(timing.responseEndMs)
				};
				await ctx.close();
			}
			out.stream.browser[route] = res;
			console.log('browser', route, JSON.stringify(res));
		}
	}

	if (want('preview')) {
		// R9 gotcha, re-checked: the same build served by `vite preview`, with and without
		// accept-encoding (browsers always send it). firstChunkMs = first readable HTML.
		await browser.close().catch(() => {});
		await stopServer(server);
		server = null;
		out.stream.vitePreview = {};
		for (const how of ['node', 'bun-run', 'bun-runtime']) {
			let proc;
			try {
				proc = await startPreview(how);
			} catch (e) {
				out.stream.vitePreview[how] = { error: String(e.message ?? e).slice(0, 300) };
				console.log('vite preview', how, 'did not start:', out.stream.vitePreview[how].error);
				continue;
			}
			out.stream.vitePreview[how] = {};
			try {
				for (const route of ['/stream/awaited', '/stream/streamed', '/stream/critical-streamed']) {
					out.stream.vitePreview[how][route] = {};
					for (const gzip of [false, true]) {
						await fetchTimed(route, UA.browser, { gzip });
						const runs = [];
						for (let i = 0; i < 5; i++) runs.push(await fetchTimed(route, UA.browser, { gzip }));
						out.stream.vitePreview[how][route][gzip ? 'acceptEncodingGzip' : 'noAcceptEncoding'] = {
							requests: runs.length,
							contentEncoding: runs[0].encoding,
							firstWireByteMsMedian: r1(median(runs.map((r) => r.firstWireByteMs))),
							firstChunkMsMedian: r1(median(runs.map((r) => r.firstChunkMs))),
							completeMsMedian: r1(median(runs.map((r) => r.completeMs))),
							chunksMedian: median(runs.map((r) => r.chunks))
						};
					}
				}
				if (how === 'node') {
					// In a real browser (which always sends accept-encoding).
					const b = await chromium.launch();
					const fcp = [];
					for (let i = 0; i < 4; i++) {
						const page = await b.newPage();
						await page.goto(BASE + '/stream/streamed');
						await page.waitForSelector('.review');
						fcp.push(await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null));
						await page.close();
					}
					await b.close();
					out.stream.vitePreview.node.browserStreamedFcpMs = fcp.slice(1).map(r1);
				}
			} finally {
				await stopServer(proc);
				await new Promise((r) => setTimeout(r, 1000));
			}
			console.log('vite preview', how, JSON.stringify(out.stream.vitePreview[how]));
		}
	}
} finally {
	await browser.close().catch(() => {});
	await stopServer(server);
}

function analyseSample(html) {
	const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
	return text.slice(0, 400);
}

// Cost framing, from the measured medians only: server loads per 1,000 visitors who each
// follow the path once (an assumption about behaviour, not a measurement of traffic).
out.costPer1000Visitors = out.preload.paths
	.filter((p) => ['hover (scaffold default)', 'data tap', 'data off', 'list scoped to tap, nav hover'].includes(p.config))
	.map((p) => ({ config: p.config, path: p.path, serverLoads: p.serverLoadsMedian * 1000, extraLoads: (p.serverLoadsMedian - 1) * 1000, dataKB: r1((p.dataBytesMedian * 1000) / 1024) }));

out.otherLoad.after = await otherLoad();
out.finished = new Date().toISOString();
mkdirSync('results', { recursive: true });
const file = only ? `results/measure-${only.join('-')}.json` : 'results/measure.json';
writeFileSync(file, JSON.stringify(out, null, 2));
console.log('\nwrote ' + file);
