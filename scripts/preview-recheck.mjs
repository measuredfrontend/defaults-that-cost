// Re-checks an earlier probe's "vite preview does not stream" with the probe's own client: Node's
// global fetch (which sends accept-encoding and decompresses, like a browser).
// Starts `vite preview` and then `node build` on port 4303, fetches /stream/streamed and
// /stream/awaited 6 times each (first run = warm-up), writes results/preview-recheck.json.
//   bun run build && node scripts/preview-recheck.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { BASE, environment, median, startPreview, startServer, stopServer } from './lib.mjs';

async function time(path) {
	const runs = [];
	for (let i = 0; i < 6; i++) {
		const t0 = performance.now();
		const res = await fetch(BASE + path);
		const reader = res.body.getReader();
		let first = 0;
		let chunks = 0;
		for (;;) {
			const { done } = await reader.read();
			if (done) break;
			chunks++;
			if (!first) first = performance.now() - t0;
		}
		runs.push({ firstReadMs: Math.round(first), completeMs: Math.round(performance.now() - t0), chunks, contentEncoding: res.headers.get('content-encoding') ?? 'identity' });
	}
	const r = runs.slice(1);
	return { firstReadMsMedian: median(r.map((x) => x.firstReadMs)), completeMsMedian: median(r.map((x) => x.completeMs)), runs: r };
}

const out = { env: environment(), client: 'Node global fetch (undici): sends accept-encoding, decompresses', servers: {} };
for (const [name, start] of [['vite preview', () => startPreview('node')], ['node build', startServer]]) {
	const proc = await start();
	try {
		out.servers[name] = { '/stream/streamed': await time('/stream/streamed'), '/stream/awaited': await time('/stream/awaited') };
	} finally {
		await stopServer(proc);
		await new Promise((r) => setTimeout(r, 1000));
	}
	console.log(name, JSON.stringify(Object.fromEntries(Object.entries(out.servers[name]).map(([k, v]) => [k, v.firstReadMsMedian]))));
}
mkdirSync('results', { recursive: true });
writeFileSync('results/preview-recheck.json', JSON.stringify(out, null, 2));
console.log('wrote results/preview-recheck.json');
