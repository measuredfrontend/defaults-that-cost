// Shared helpers for measure.mjs and pack-tests.mjs.
// Everything runs against the production build on the real Node adapter server (`node build`).
// Streaming and timing are never measured on `vite preview` or the dev server; the
// `vite preview` runs exist only to show what it does to streaming (gzip buffers it).
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import { readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';

export const PORT = Number(process.env.PORT ?? 4303);
export const BASE = `http://127.0.0.1:${PORT}`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const median = (xs) => {
	if (!xs.length) return null;
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

async function waitUp(proc, log) {
	for (let i = 0; i < 150; i++) {
		try {
			const r = await fetch(BASE + '/api/stats');
			if (r.ok || r.status === 404) return proc;
		} catch {}
		await sleep(100);
	}
	proc.kill();
	throw new Error('server did not start. Run `bun run build` first.\n' + log());
}

/** The real adapter-node server, as in production. */
export async function startServer() {
	const proc = spawn(process.execPath, ['build'], {
		env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let log = '';
	proc.stdout.on('data', (d) => (log += d));
	proc.stderr.on('data', (d) => (log += d));
	return waitUp(proc, () => log);
}

/**
 * `vite preview`, only to check whether it streams (an earlier probe said it doesn't).
 * how: 'node' = node runs vite; 'bun-run' = `bun run preview` (bun respects vite's node shebang);
 * 'bun-runtime' = `bun --bun run preview` (vite runs inside Bun).
 */
export async function startPreview(how = 'node') {
	// A preview killed earlier can leave this folder behind; the next start then fails (EEXIST).
	rmSync('node_modules/.vite-temp', { recursive: true, force: true });
	const args = ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'];
	const [cmd, argv] =
		how === 'node'
			? [process.execPath, ['node_modules/vite/bin/vite.js', 'preview', ...args]]
			: how === 'bun-run'
				? ['bun', ['run', 'preview', ...args]]
				: ['bun', ['--bun', 'run', 'preview', ...args]];
	const proc = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
	let log = '';
	proc.stdout.on('data', (d) => (log += d));
	proc.stderr.on('data', (d) => (log += d));
	return waitUp(proc, () => log);
}

export async function stopServer(proc) {
	if (!proc || proc.exitCode !== null) return;
	const done = new Promise((r) => proc.once('exit', r));
	// `bun run` starts vite as a child process: kill the whole tree on Windows.
	if (process.platform === 'win32') tryExec('taskkill', ['/PID', String(proc.pid), '/T', '/F']);
	else proc.kill();
	await Promise.race([done, sleep(3000)]);
}

export async function resetStats() {
	await fetch(BASE + '/api/stats', { method: 'DELETE' });
}
export async function getStats() {
	return (await fetch(BASE + '/api/stats')).json();
}

// ---------------------------------------------------------------- environment

function pkg(name) {
	try {
		return JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version;
	} catch {
		return null;
	}
}

async function cpuBusy(ms = 1000) {
	const snap = () => os.cpus().map((c) => c.times);
	const a = snap();
	await sleep(ms);
	const b = snap();
	let idle = 0;
	let total = 0;
	b.forEach((t, i) => {
		const d = Object.fromEntries(Object.keys(t).map((k) => [k, t[k] - a[i][k]]));
		idle += d.idle;
		total += d.user + d.nice + d.sys + d.idle + d.irq;
	});
	return Math.round((1 - idle / total) * 100);
}

function tryExec(cmd, args) {
	try {
		return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }).trim();
	} catch {
		return null;
	}
}

/** Other load on the machine (the GPU/TTS job, anything else), recorded with every result. */
export async function otherLoad() {
	const tasks = tryExec('tasklist', ['/FI', 'IMAGENAME eq python.exe', '/FO', 'CSV', '/NH']);
	const python = tasks ? tasks.split(/\r?\n/).filter((l) => l.startsWith('"python.exe"')).length : null;
	const gpu = tryExec('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader,nounits']);
	return {
		at: new Date().toISOString(),
		pythonProcesses: python,
		cpuBusyPercent: await cpuBusy(),
		gpuUtilPercentAndMemMiB: gpu
	};
}

export function environment() {
	return {
		date: new Date().toISOString(),
		node: process.version,
		os: `${os.type()} ${os.release()}`,
		cpu: os.cpus()[0]?.model?.trim(),
		cores: os.cpus().length,
		ramGb: Math.round(os.totalmem() / 2 ** 30),
		svelte: pkg('svelte'),
		kit: pkg('@sveltejs/kit'),
		adapterNode: pkg('@sveltejs/adapter-node'),
		vite: pkg('vite'),
		playwright: pkg('playwright'),
		server: `node build (adapter-node), production build, 127.0.0.1:${PORT}`,
		browser: 'Chromium (Playwright), headless, same machine'
	};
}

// ---------------------------------------------------------------- pointer paths

/** Small seeded RNG so every run of a path is the same path. */
export function rng(seed) {
	let a = seed >>> 0;
	return (lo = 0, hi = 1) => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		const x = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		return lo + x * (hi - lo);
	};
}

// Wait until an exact time. Windows timers can be 15 ms coarse, and SvelteKit starts a hover
// preload when the mouse rests for 20 ms, so short waits spin instead of sleeping.
async function until(t) {
	const left = t - performance.now();
	if (left > 25) await sleep(left - 20);
	while (performance.now() < t) {}
}

/**
 * Move the real (Playwright) mouse like a person: one mousemove every 16 ms (a 60 Hz pointer),
 * eased, from the current position to (x, y) in `ms`.
 */
export async function glide(page, pos, x, y, ms) {
	const n = Math.max(1, Math.round(ms / 16));
	const x0 = pos.x;
	const y0 = pos.y;
	const t0 = performance.now();
	for (let i = 1; i <= n; i++) {
		const k = i / n;
		const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // ease in-out
		await until(t0 + i * 16);
		await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
	}
	pos.x = x;
	pos.y = y;
}

export async function center(page, selector, dx = 0) {
	const b = await page.locator(selector).boundingBox();
	if (!b) throw new Error('not visible: ' + selector);
	return { x: b.x + Math.min(b.width / 2, 120) + dx, y: b.y + b.height / 2 };
}

/** A click as a person does it: button down, ~80 ms, button up. */
export async function humanClick(page, pressMs = 80) {
	await page.mouse.down();
	await sleep(pressMs);
	await page.mouse.up();
}

/** Records, in the page, the gaps between mousemove events and the time of the last mousedown. */
export const pageProbe = () => {
	const w = window;
	w.__gaps = [];
	let last = 0;
	addEventListener(
		'mousemove',
		(e) => {
			if (last) w.__gaps.push(e.timeStamp - last);
			last = e.timeStamp;
		},
		{ capture: true, passive: true }
	);
	addEventListener('mousedown', () => (w.__md = performance.now()), { capture: true });
	addEventListener('touchstart', () => (w.__md = performance.now()), { capture: true, passive: true });
	new MutationObserver(() => {
		if (!w.__content && document.querySelector('#product, #section') && w.__md) w.__content = performance.now();
	}).observe(document, { childList: true, subtree: true });
};

/** Emulates a browser with "reduced data usage" on: navigator.connection.saveData === true. */
export const saveDataOn = () => {
	Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData: true, effectiveType: '4g' }) });
};

export const waitHydrated = (page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true', null, { timeout: 30000 });

// ---------------------------------------------------------------- network + scenarios

/** Counts data (__data.json) and JavaScript requests with their response sizes. */
export function trackNetwork(page) {
	const t = { data: 0, dataBytes: 0, js: 0, jsBytes: 0, dataUrls: [], jsUrls: [] };
	let pending = [];
	let on = true;
	page.on('requestfinished', (req) => {
		if (!on) return;
		const url = req.url();
		const isData = url.includes('__data.json');
		const isJs = /\.js(\?|$)/.test(url);
		if (!isData && !isJs) return;
		// Count at once; the size lookup is async and is awaited in result().
		if (isData) {
			t.data++;
			t.dataUrls.push(new URL(url).pathname);
		} else {
			t.js++;
			t.jsUrls.push(new URL(url).pathname);
		}
		pending.push(
			req
				.sizes()
				.then((s) => {
					const bytes = s.responseBodySize + s.responseHeadersSize;
					if (isData) t.dataBytes += bytes;
					else t.jsBytes += bytes;
				})
				.catch(() => {})
		);
	});
	return {
		result: async () => {
			await Promise.all(pending);
			return { ...t, dataUrls: [...t.dataUrls], jsUrls: [...t.jsUrls] };
		},
		reset: async () => {
			await Promise.all(pending);
			pending = [];
			Object.assign(t, { data: 0, dataBytes: 0, js: 0, jsBytes: 0, dataUrls: [], jsUrls: [] });
		},
		stop: () => (on = false)
	};
}

export const DESKTOP = { viewport: { width: 1280, height: 1400 } };

/**
 * Open /products<query> in a fresh browser context, then run `path` (a function that moves the
 * mouse and clicks). Returns the server loads and data bytes caused AFTER the list page was
 * loaded and hydrated (the list page's own request is not counted), including the click.
 */
export async function runScenario(browser, { query = '', path, delay = '150-300', device = DESKTOP, seed = 1, initScript }) {
	const ctx = await browser.newContext(device);
	await ctx.addCookies([{ name: 'demo_delay', value: delay, url: BASE }]);
	await ctx.addInitScript(pageProbe);
	if (initScript) await ctx.addInitScript(initScript);
	const page = await ctx.newPage();
	const net = trackNetwork(page);
	try {
		await page.goto(BASE + '/products' + query);
		await waitHydrated(page);
		await sleep(300); // let eager/viewport code preloading finish; counted in jsBeforePath
		const jsBeforePath = await net.result();
		await net.reset();
		await resetStats();
		const t0 = performance.now();
		const opened = await path(page, rng(seed));
		await page.waitForSelector(opened.waitFor, { timeout: 15000 });
		await sleep(600); // let stray preloads finish
		const stats = await getStats();
		const n = await net.result();
		const probe = await page.evaluate(() => ({ gaps: window.__gaps ?? [], md: window.__md, content: window.__content }));
		const loads = Object.values(stats.loads).reduce((a, b) => a + b, 0);
		return {
			serverLoads: loads,
			loadsByRoute: stats.loads,
			dataRequests: stats.dataRequests,
			dataBytes: n.dataBytes,
			jsRequests: n.js,
			jsBytes: n.jsBytes,
			jsBeforePath: jsBeforePath.js,
			jsBytesBeforePath: jsBeforePath.jsBytes,
			pathMs: Math.round(performance.now() - t0),
			mousemoveEvents: probe.gaps.length + (probe.gaps.length ? 1 : 0),
			// gaps of 20-60 ms during a glide would be accidental "rests" (timer jitter); intended
			// dwells are 100 ms or more
			accidentalRests: probe.gaps.filter((g) => g > 20 && g < 60).length,
			medianMoveGapMs: r1(median(probe.gaps.filter((g) => g <= 60))),
			clickToContentMs: probe.md && probe.content ? r1(probe.content - probe.md) : null,
			dataUrls: n.dataUrls,
			jsUrlsBeforePath: jsBeforePath.jsUrls,
			jsUrlsDuringPath: n.jsUrls,
			opened: opened.opened,
			...(opened.scrolls ? { scrolls: opened.scrolls } : {})
		};
	} finally {
		await ctx.close();
	}
}

// ---------------------------------------------------------------- the pointer paths

const START = { x: 900, y: 700 }; // the mouse starts in empty page space, right of the list
const row = (i) => `[data-testid=row-${i}]`;
const nav = (name) => `[data-testid=nav-${name}]`;

export const PATHS = {
	/** Reads the first 12 rows (rests 200-700 ms on each), goes back to row 7 and opens it. */
	async scan(page, rand) {
		const pos = { ...START };
		await page.mouse.move(pos.x, pos.y);
		for (let i = 1; i <= 12; i++) {
			const c = await center(page, row(i), rand(-40, 40));
			await glide(page, pos, c.x, c.y, rand(250, 450));
			await sleep(rand(200, 700));
		}
		const c = await center(page, row(7));
		await glide(page, pos, c.x, c.y, 400);
		await sleep(150);
		await humanClick(page);
		return { opened: '/products/7', waitFor: '#product[data-product-id="7"]' };
	},
	/** Slides down over all 24 rows without stopping (about 800 px/s), comes back to row 20, opens it. */
	async skim(page, rand) {
		const pos = { ...START };
		await page.mouse.move(pos.x, pos.y);
		const a = await center(page, row(1));
		await glide(page, pos, a.x, a.y, 400);
		const b = await center(page, row(24));
		await glide(page, pos, b.x, b.y, ((b.y - a.y) / 800) * 1000);
		const c = await center(page, row(20), rand(-20, 20));
		await glide(page, pos, c.x, c.y, 300);
		await sleep(250);
		await humanClick(page);
		return { opened: '/products/20', waitFor: '#product[data-product-id="20"]' };
	},
	/** Goes up to the nav and slides along it to "Account" without stopping, then clicks. */
	async nav(page) {
		const pos = { ...START };
		await page.mouse.move(pos.x, pos.y);
		const d = await center(page, nav('deals'));
		await glide(page, pos, d.x, d.y, 500);
		const acc = await center(page, nav('account'));
		await glide(page, pos, acc.x, acc.y, 600);
		await sleep(150);
		await humanClick(page);
		return { opened: '/section/account', waitFor: '#section[data-section="account"]' };
	},
	/** Reads the nav: rests 250-500 ms on each item from Deals to Help, then opens Account. */
	async navBrowse(page, rand) {
		const pos = { ...START };
		await page.mouse.move(pos.x, pos.y);
		for (const name of ['deals', 'guides', 'stores', 'help', 'account']) {
			const c = await center(page, nav(name));
			await glide(page, pos, c.x, c.y, name === 'deals' ? 500 : 150);
			await sleep(name === 'account' ? 150 : rand(250, 500));
		}
		await humanClick(page);
		return { opened: '/section/account', waitFor: '#section[data-section="account"]' };
	},
	/** Straight to row 3, a short rest, click. */
	async direct(page) {
		const pos = { ...START };
		await page.mouse.move(pos.x, pos.y);
		const c = await center(page, row(3));
		await glide(page, pos, c.x, c.y, 300);
		await sleep(100);
		await humanClick(page);
		return { opened: '/products/3', waitFor: '#product[data-product-id="3"]' };
	}
};

// ---------------------------------------------------------------- touch

/**
 * A finger swipe up that starts at (x, y): a touch scroll gesture synthesized by Chromium
 * (touchstart on whatever is under the finger, touchmoves, touchend). Headless Chromium delivers
 * the touch events but did not move the page in our runs, so the page is then scrolled by the
 * same distance with scrollBy, the way the swipe would have moved it.
 */
async function swipe(page, cdp, x, y, dy) {
	await cdp.send('Input.synthesizeScrollGesture', { x, y, yDistance: dy, gestureSourceType: 'touch', speed: 1000 });
	await page.evaluate((d) => scrollBy(0, d), -dy);
}

async function rowAt(page, x, y) {
	return page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.dataset.testid ?? null, [x, y]);
}

export const TOUCH_PATHS = {
	/** Taps row 5. */
	async tap(page) {
		await page.tap(row(5));
		return { opened: '/products/5', waitFor: '#product[data-product-id="5"]' };
	},
	/** Scrolls the list with three swipes that start on a row (reading pauses), then taps a row. */
	async scrollTap(page) {
		const cdp = await page.context().newCDPSession(page);
		const scrolls = [];
		for (let i = 0; i < 3; i++) {
			const y0 = await page.evaluate(() => scrollY);
			const under = await rowAt(page, 150, 500);
			await swipe(page, cdp, 150, 500, -150);
			await sleep(500);
			scrolls.push({ startedOn: under, scrolledPx: Math.round((await page.evaluate(() => scrollY)) - y0) });
		}
		if (new URL(page.url()).pathname !== '/products') throw new Error('a swipe navigated: ' + page.url());
		const target = await rowAt(page, 150, 300);
		const id = Number(target?.replace('row-', ''));
		await page.tap(`[data-testid=${target}]`);
		return { opened: `/products/${id}`, waitFor: `#product[data-product-id="${id}"]`, scrolls };
	}
};

// ---------------------------------------------------------------- preload cache behaviour

export const CACHE_PATHS = {
	/** Hover row 2, move away, wait 10 s, come back and click row 2. */
	async hoverWaitClick(page) {
		const pos = { ...START };
		await page.mouse.move(pos.x, pos.y);
		const c = await center(page, row(2));
		await glide(page, pos, c.x, c.y, 300);
		await sleep(300);
		await glide(page, pos, START.x, c.y, 300);
		await sleep(10_000);
		await glide(page, pos, c.x, c.y, 300);
		await sleep(100);
		await humanClick(page);
		return { opened: '/products/2', waitFor: '#product[data-product-id="2"]' };
	},
	/** Hover row 2, then row 5, then back to row 2 and click it. */
	async abClickA(page) {
		const pos = { ...START };
		await page.mouse.move(pos.x, pos.y);
		for (const i of [2, 5, 2]) {
			const c = await center(page, row(i));
			await glide(page, pos, c.x, c.y, 300);
			await sleep(300);
		}
		await humanClick(page);
		return { opened: '/products/2', waitFor: '#product[data-product-id="2"]' };
	}
};

// ---------------------------------------------------------------- click-to-content latency

/**
 * Time from mouse button down to the new page's content in the DOM, for a user who rests on
 * the link for `dwell` ms before pressing. One browser context, a full page load per repetition.
 */
export async function runLatency(browser, { query = '', delay, dwell, reps = 7 }) {
	const ctx = await browser.newContext(DESKTOP);
	await ctx.addCookies([{ name: 'demo_delay', value: String(delay), url: BASE }]);
	await ctx.addInitScript(pageProbe);
	const page = await ctx.newPage();
	const samples = [];
	try {
		for (let r = 0; r < reps; r++) {
			const id = 2 + (r % 20);
			await page.goto(BASE + '/products' + query);
			await waitHydrated(page);
			await sleep(200);
			const pos = { ...START };
			await page.mouse.move(pos.x, pos.y);
			const c = await center(page, row(id));
			await glide(page, pos, c.x, c.y, 250);
			if (dwell) await sleep(dwell);
			await humanClick(page);
			await page.waitForSelector(`#product[data-product-id="${id}"]`, { timeout: 15000 });
			const p = await page.evaluate(() => ({ md: window.__md, content: window.__content }));
			samples.push(r1(p.content - p.md));
		}
	} finally {
		await ctx.close();
	}
	return { query: query || '(default: hover)', delay, dwell, reps, medianMs: r1(median(samples)), samples };
}

// ---------------------------------------------------------------- streaming

export const UA = {
	browser: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
	GPTBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
	ClaudeBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
	Googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
	facebookexternalhit: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
	Slackbot: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'
};

// Text that only the product description / the reviews contain.
export const DESCRIPTION_TEXT = 'built for people who spend whole days outside';
export const REVIEW_TEXT = 'great grip on wet rock';

/**
 * One GET with a fresh connection. Times the response headers, the first body chunk and the
 * end, and keeps every chunk with its arrival time.
 */
export function fetchTimed(path, ua = UA.browser, { gzip = false } = {}) {
	return new Promise((resolve, reject) => {
		const t0 = performance.now();
		const headers = { 'user-agent': ua, accept: 'text/html' };
		// Browsers always send accept-encoding. With it, a compressing server may buffer.
		if (gzip) headers['accept-encoding'] = 'gzip, deflate, br';
		const req = http.get({ host: '127.0.0.1', port: PORT, path, agent: false, headers }, (res) => {
			const headersMs = performance.now() - t0;
			const encoding = res.headers['content-encoding'] ?? 'identity';
			const stream = encoding === 'identity' ? res : res.pipe(encoding === 'br' ? zlib.createBrotliDecompress() : encoding === 'deflate' ? zlib.createInflate() : zlib.createGunzip());
			// Chunk timing is taken on the wire (before decompression).
			const wire = [];
			res.on('data', (c) => wire.push({ ms: performance.now() - t0, bytes: c.length }));
			// And on the readable HTML (after decompression): a gzip stream can send its 10-byte
			// header at once and hold back the content, so HTML timing is what counts.
			const texts = [];
			stream.on('data', (c) => texts.push({ ms: performance.now() - t0, text: c.toString('utf8') }));
			stream.on('end', () => {
				const body = texts.map((t) => t.text).join('');
				resolve({
					status: res.statusCode,
					encoding,
					headersMs: r1(headersMs),
					firstChunkMs: r1(texts[0]?.ms ?? null), // first readable HTML
					firstWireByteMs: r1(wire[0]?.ms ?? null),
					completeMs: r1(performance.now() - t0),
					chunks: texts.length, // readable HTML chunks
					wireChunks: wire.length,
					firstChunkBytes: Buffer.byteLength(texts[0]?.text ?? ''),
					totalBytes: Buffer.byteLength(body),
					wireBytes: wire.reduce((a, c) => a + c.bytes, 0),
					firstChunk: texts[0]?.text ?? '',
					body
				});
			});
		});
		req.on('error', reject);
	});
}

/** What a crawler that doesn't run JavaScript can read: the markup without scripts, as text. */
export function markupText(html) {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&[a-z#0-9]+;/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function headInfo(html) {
	return {
		title: html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null,
		metaDescription: html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? null
	};
}

/** Analyse one response the way a non-JS crawler and a text extractor would. */
export function analyse(r) {
	const markup = markupText(r.body);
	const lower = markup.toLowerCase();
	const bodyLower = r.body.toLowerCase();
	return {
		descriptionInMarkup: lower.includes(DESCRIPTION_TEXT),
		reviewsInMarkup: lower.includes(REVIEW_TEXT),
		reviewsAnywhereInResponse: bodyLower.includes(REVIEW_TEXT),
		descriptionInFirstChunk: markupText(r.firstChunk).toLowerCase().includes(DESCRIPTION_TEXT),
		placeholderInMarkup: /loading (reviews|product)/i.test(markup),
		markupTextChars: markup.length,
		...headInfo(r.body)
	};
}
