// Tests that back every rule in the Measured Rules pack (R14).
//   bun run build && bun run test:pack
// Each test states the behaviour a rule depends on. If a SvelteKit release changes it, the
// test fails and the rule gets reviewed. Writes results/pack-tests.json.
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';
import {
	BASE, CACHE_PATHS, PATHS, TOUCH_PATHS, UA, analyse, environment, fetchTimed, median, otherLoad,
	runLatency, runScenario, saveDataOn, startPreview, startServer, stopServer
} from './lib.mjs';

const results = [];
async function test(id, rule, title, fn) {
	try {
		const detail = await fn();
		results.push({ id, rule, title, pass: true, detail });
		console.log(`PASS ${id} (${rule}) ${title}  ${JSON.stringify(detail)}`);
	} catch (e) {
		results.push({ id, rule, title, pass: false, detail: String(e.message ?? e) });
		console.log(`FAIL ${id} (${rule}) ${title}  ${e.message ?? e}`);
	}
}
function expect(cond, msg) {
	if (!cond) throw new Error(msg);
}

const load = { before: await otherLoad() };
let server = await startServer();
const browser = await chromium.launch();
const scan = (query, extra = {}) => runScenario(browser, { query, path: PATHS.scan, seed: 7, ...extra });

try {
	await test('T1', 'rule 1', 'with the scaffolded hover default, reading a list of 12 links and opening one runs more server loads than pages opened', async () => {
		const r = await scan('');
		expect(r.serverLoads >= 6, `expected at least 6 server loads, got ${r.serverLoads}`);
		return { serverLoads: r.serverLoads, pagesOpened: 1, dataBytes: r.dataBytes };
	});

	await test('T2', 'rule 1', 'with preload-data="tap" the same path runs exactly one server load', async () => {
		const r = await scan('?data=tap');
		expect(r.serverLoads === 1, `expected 1, got ${r.serverLoads}`);
		return { serverLoads: r.serverLoads };
	});

	await test('T3', 'rule 1', 'with preload-data="false" the same path runs exactly one server load', async () => {
		const r = await scan('?data=false');
		expect(r.serverLoads === 1, `expected 1, got ${r.serverLoads}`);
		return { serverLoads: r.serverLoads };
	});

	await test('T4', 'rule 2', 'a hover preload is reused when that link is clicked, even 10 s later (no time limit in the client)', async () => {
		const r = await runScenario(browser, { path: CACHE_PATHS.hoverWaitClick, delay: '200' });
		expect(r.serverLoads === 1, `expected 1 server load, got ${r.serverLoads}`);
		return { serverLoads: r.serverLoads, clickToContentMs: r.clickToContentMs };
	});

	await test('T5', 'rule 2', 'only the most recent preload is kept: hover A, hover B, click A runs A twice (3 loads)', async () => {
		const r = await runScenario(browser, { path: CACHE_PATHS.abClickA, delay: '200' });
		expect(r.serverLoads === 3, `expected 3 server loads, got ${r.serverLoads}`);
		return { serverLoads: r.serverLoads, dataUrls: r.dataUrls };
	});

	await test('T6', 'rule 3', 'preload-data="tap" on the list container stops list preloads while the nav keeps hover', async () => {
		const list = await scan('?list=tap');
		const nav = await runScenario(browser, { query: '?list=tap', path: PATHS.navBrowse, seed: 7 });
		expect(list.serverLoads === 1, `list: expected 1, got ${list.serverLoads}`);
		expect(nav.serverLoads > 1, `nav: expected hover preloads (> 1), got ${nav.serverLoads}`);
		return { listScanLoads: list.serverLoads, navBrowseLoads: nav.serverLoads };
	});

	const phone = devices['Pixel 7'];
	await test('T7', 'rule 4', 'on a touch device, hover and tap behave the same for a tap: one server load', async () => {
		const hover = await runScenario(browser, { path: TOUCH_PATHS.tap, device: phone });
		const tap = await runScenario(browser, { query: '?data=tap', path: TOUCH_PATHS.tap, device: phone });
		expect(hover.serverLoads === 1 && tap.serverLoads === 1, `hover ${hover.serverLoads}, tap ${tap.serverLoads}`);
		return { hover: hover.serverLoads, tap: tap.serverLoads };
	});

	await test('T8', 'rule 4', 'on a touch device, a scroll swipe that starts on a link preloads it (touchstart), with hover or tap', async () => {
		const hover = await runScenario(browser, { path: TOUCH_PATHS.scrollTap, device: phone });
		const tap = await runScenario(browser, { query: '?data=tap', path: TOUCH_PATHS.scrollTap, device: phone });
		const off = await runScenario(browser, { query: '?data=false', path: TOUCH_PATHS.scrollTap, device: phone });
		const scrolled = hover.scrolls.every((s) => s.scrolledPx > 50);
		expect(scrolled, `the swipes did not scroll: ${JSON.stringify(hover.scrolls)}`);
		expect(hover.serverLoads > 1 && tap.serverLoads > 1 && off.serverLoads === 1, `hover ${hover.serverLoads}, tap ${tap.serverLoads}, off ${off.serverLoads}`);
		return { hover: hover.serverLoads, tap: tap.serverLoads, off: off.serverLoads, swipes: hover.scrolls.length };
	});

	await test('T9', 'rule 5', 'code-only preloading (preload-data off, preload-code hover/viewport/eager) runs no extra server load', async () => {
		const out = {};
		for (const code of ['hover', 'viewport', 'eager']) {
			const r = await scan(`?data=false&code=${code}`);
			expect(r.serverLoads === 1, `code=${code}: expected 1, got ${r.serverLoads}`);
			out[code] = { serverLoads: r.serverLoads, jsBeforePath: r.jsBeforePath, jsDuringPath: r.jsRequests };
		}
		return out;
	});

	await test('T10', 'rule 6', 'resting 300 ms on a link before clicking makes hover faster than off (300 ms load): the gain is real but bounded by the rest time', async () => {
		const hover = await runLatency(browser, { delay: 300, dwell: 300, reps: 5 });
		const off = await runLatency(browser, { query: '?data=false', delay: 300, dwell: 300, reps: 5 });
		const hover0 = await runLatency(browser, { delay: 300, dwell: 0, reps: 5 });
		const tap0 = await runLatency(browser, { query: '?data=tap', delay: 300, dwell: 0, reps: 5 });
		expect(off.medianMs - hover.medianMs >= 150, `hover ${hover.medianMs} ms vs off ${off.medianMs} ms`);
		expect(Math.abs(hover0.medianMs - tap0.medianMs) < 40, `no rest: hover ${hover0.medianMs} vs tap ${tap0.medianMs}`);
		return { rest300: { hover: hover.medianMs, off: off.medianMs }, rest0: { hover: hover0.medianMs, tap: tap0.medianMs } };
	});

	await test('T11', 'rule 1', 'with reduced data usage (navigator.connection.saveData) SvelteKit does not preload: one server load', async () => {
		const r = await scan('', { initScript: saveDataOn });
		expect(r.serverLoads === 1, `expected 1, got ${r.serverLoads}`);
		return { serverLoads: r.serverLoads };
	});

	// ------------------------------------------------------------ streaming
	const text = async (route, js) => {
		const ctx = await browser.newContext({ javaScriptEnabled: js });
		const page = await ctx.newPage();
		await page.goto(BASE + route);
		if (js) await page.waitForSelector('.review', { timeout: 10000 });
		else await page.waitForTimeout(1200);
		const t = (await page.innerText('body')).toLowerCase();
		await ctx.close();
		return t;
	};

	await test('T12', 'rule 7', 'a streamed (un-awaited) promise is not in the HTML markup, only in a script payload', async () => {
		const a = analyse(await fetchTimed('/stream/streamed'));
		expect(!a.reviewsInMarkup && a.reviewsAnywhereInResponse && a.placeholderInMarkup, JSON.stringify(a));
		return { reviewsInMarkup: a.reviewsInMarkup, reviewsInScriptPayload: a.reviewsAnywhereInResponse, placeholderInMarkup: a.placeholderInMarkup };
	});

	await test('T13', 'rule 7', 'awaited data is in the markup, and the first byte waits for the slowest awaited call', async () => {
		const r = await fetchTimed('/stream/awaited');
		const a = analyse(r);
		expect(a.reviewsInMarkup && a.descriptionInMarkup && r.firstChunkMs >= 750, `in markup ${a.reviewsInMarkup}, first chunk ${r.firstChunkMs} ms`);
		return { reviewsInMarkup: a.reviewsInMarkup, firstChunkMs: r.firstChunkMs };
	});

	await test('T14', 'rule 8', 'streaming the main content leaves it out of the markup, the title and the meta description; awaiting it keeps it', async () => {
		const bad = analyse(await fetchTimed('/stream/critical-streamed'));
		const good = analyse(await fetchTimed('/stream/streamed'));
		expect(!bad.descriptionInMarkup && bad.metaDescription === null && bad.title === 'Product', JSON.stringify(bad));
		expect(good.descriptionInMarkup && good.metaDescription && good.title !== 'Product', JSON.stringify(good));
		return { streamedMain: { descriptionInMarkup: false, title: bad.title }, awaitedMain: { descriptionInMarkup: true, title: good.title } };
	});

	await test('T15', 'rule 7', 'a browser with JavaScript off shows the placeholder, never the streamed content', async () => {
		const off = await text('/stream/streamed', false);
		const on = await text('/stream/streamed', true);
		expect(off.includes('loading reviews') && !off.includes('great grip') && on.includes('great grip'), 'unexpected page text');
		return { jsOff: 'placeholder', jsOn: 'reviews' };
	});

	await test('T16', 'rule 9', 'on `node build` the streamed page sends its first chunk before the slow call finishes, with the awaited content in it', async () => {
		const r = await fetchTimed('/stream/streamed', UA.browser, { gzip: true });
		const plain = await fetchTimed('/stream/streamed');
		const a = analyse(plain);
		expect(r.chunks >= 2 && r.firstChunkMs < 400 && a.descriptionInFirstChunk, `chunks ${r.chunks}, first ${r.firstChunkMs} ms`);
		return { firstChunkMs: r.firstChunkMs, completeMs: r.completeMs, chunks: r.chunks, contentEncoding: r.encoding };
	});

	await test('T17', 'rule 10', 'SvelteKit sends crawlers the same HTML as browsers: bot user agents get the same markup text', async () => {
		const out = {};
		for (const route of ['/stream/streamed', '/stream/critical-streamed']) {
			const base = analyse(await fetchTimed(route, UA.browser));
			for (const [name, ua] of Object.entries(UA)) {
				const a = analyse(await fetchTimed(route, ua));
				expect(JSON.stringify(a) === JSON.stringify(base), `${name} on ${route} differs`);
			}
			out[route] = `same for ${Object.keys(UA).length} user agents`;
		}
		return out;
	});
} finally {
	await browser.close().catch(() => {});
	await stopServer(server);
}

await test('T18', 'rule 9', '`vite preview` buffers a streamed page when the client accepts gzip (every browser does); without accept-encoding it streams', async () => {
	const proc = await startPreview('node');
	try {
		await fetchTimed('/stream/streamed', UA.browser, { gzip: true });
		const gz = await fetchTimed('/stream/streamed', UA.browser, { gzip: true });
		const plain = await fetchTimed('/stream/streamed');
		expect(gz.firstChunkMs >= 750 && gz.encoding !== 'identity', `gzip: first chunk ${gz.firstChunkMs} ms, ${gz.encoding}`);
		expect(plain.firstChunkMs < 400 && plain.chunks >= 2, `plain: first chunk ${plain.firstChunkMs} ms, ${plain.chunks} chunks`);
		return { gzip: { firstChunkMs: gz.firstChunkMs, contentEncoding: gz.encoding, chunks: gz.chunks }, noAcceptEncoding: { firstChunkMs: plain.firstChunkMs, chunks: plain.chunks } };
	} finally {
		await stopServer(proc);
	}
});

load.after = await otherLoad();
mkdirSync('results', { recursive: true });
writeFileSync('results/pack-tests.json', JSON.stringify({ env: environment(), otherLoad: load, results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
