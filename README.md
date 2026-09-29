# SvelteKit defaults that cost you: hover preloading and streamed data

Two SvelteKit defaults, measured on a production build:

1. **Hover preloading.** A new project's `src/app.html` has `<body data-sveltekit-preload-data="hover">`. Every link the mouse rests on for 20 ms runs the target page's `load`. On a list that people read, that is many server loads for one page view.
2. **Streamed data.** A promise returned un-awaited from a server `load` is streamed: the page arrives sooner, but the streamed content is not in the HTML markup. Readers that don't run JavaScript (many crawlers, link previews, text extractors) see the placeholder.

This demo measures both: what they cost, what they buy, and where to change them.

| Route | What it is |
| --- | --- |
| `/products` | 24 product links; a header with 6 section links. Switches for the measurement: `?data=hover\|tap\|false`, `?code=eager\|viewport\|hover\|tap` (on a wrapper around the whole page), `?list=tap` (on the list only) |
| `/products/[id]`, `/section/[name]` | Pages with a server `load` that waits 150–300 ms (like a database call) and counts itself |
| `/stream/awaited` | Product (150 ms) and reviews (800 ms) both awaited |
| `/stream/streamed` | Product awaited, reviews streamed |
| `/stream/critical-streamed` | Both streamed (the anti-pattern) |
| `/api/stats` | Measurement counters (GET, DELETE to reset). Demo only |

## Run it

```sh
bun install
bun run build
bunx playwright install chromium
bun run measure            # starts `node build` itself on port 4303; all tables below
bun run test:pack          # T1-T18, the tests behind every rule
bun run recheck:preview    # the vite preview / gzip check with Node's fetch
bun run start              # to click around: http://localhost:3000
```

Everything is measured on the real Node adapter server (`node build`). The only `vite preview` runs are there to show what it does to streaming.

## Measured

Local production build on `node build`, 29 Sep 2026 (run 04:24 UTC), Windows 11, i9-13900KF. No other load was running (no Python processes, CPU 4–7% busy, GPU 2–3%, recorded in `otherLoad`). Chromium via Playwright; the mouse moves every 16 ms (60 Hz). Each server `load` waits 150–300 ms.

### Hover preloading: server loads for one page opened (5 runs each, all identical unless noted)

| Pointer path | `hover` (scaffold) | `tap` | `false` | list `tap`, nav `hover` |
| --- | --- | --- | --- | --- |
| scan: rest 200–700 ms on each of 12 rows, back to row 7, click | **13** | 1 | 1 | 1 |
| skim: slide over 24 rows without stopping, back to row 20, click | 1 | 1 | 1 | 1 |
| nav: slide along the header, click "Account" | 1 | 1 | 1 | 1 (one run of five: 2) |
| navBrowse: rest 250–500 ms on each header link, click | **5** | 1 | 1 | **5** |
| direct: straight to row 3, rest 100 ms, click | 1 | 1 | 1 | 1 |

Data transferred on the scan path: 24,564 bytes of `__data.json` with `hover`, 1,900 with `tap` (headers included).

Every code-only setting (`preload-data` off + `preload-code` `hover`, `viewport` or `eager`) gave 1 server load on every path. `viewport` and `eager` fetched 12 JS files with the page instead of 9 (the three linked route chunks), then none while reading.

Per 1,000 visitors who each follow the scan path once (an assumption, not traffic data): 13,000 server loads with `hover`, 1,000 with `tap`.

### Touch (emulated Pixel 7, 5 runs)

| Touch path | `hover` | `tap` | `false` |
| --- | --- | --- | --- |
| one tap on a row | 1 | 1 | 1 |
| three swipes that start on a row, then a tap | **4** | **4** | 1 |

Headless Chromium delivered the swipe's touch events but did not scroll the page, so the script scrolls by the swipe distance itself after each swipe.

### The preload cache (`hover`, 200 ms load, 5 runs)

| Path | Server loads |
| --- | --- |
| rest on row 2, move away, wait 10 s, come back, click row 2 | 1 (reused after 10 s) |
| rest on row 2, then row 5, back to row 2, click | 3 (`tap`: 1) |

### What preloading buys: mouse button down → new content in the DOM (median of 7)

| Setting | 150 ms load: no rest | rest 100 ms | rest 300 ms | 300 ms load: no rest | rest 100 ms | rest 300 ms |
| --- | --- | --- | --- | --- | --- | --- |
| off | 245 ms | 250 ms | 250 ms | 401 ms | 406 ms | 406 ms |
| `tap` | 157 ms | 158 ms | 157 ms | 309 ms | 312 ms | 311 ms |
| `tap` + code `hover` | 157 ms | 156 ms | 157 ms | 309 ms | 313 ms | 312 ms |
| `hover` | 162 ms | 94 ms | 95 ms | 311 ms | 219 ms | 95 ms |

The click includes an 80 ms button press. Server and browser on one machine: no network round trips.

### Streaming (10 requests each, fresh connection)

| Route | First HTML | Complete | Description in markup | Reviews in markup | Reviews in the response | First paint (Chromium) |
| --- | --- | --- | --- | --- | --- | --- |
| `/stream/awaited` | 808 ms | 808 ms | yes | yes | yes | 828 ms |
| `/stream/streamed` | 156 ms | 810 ms | yes | **no** | yes, in a `<script>` | 176 ms |
| `/stream/critical-streamed` | 1 ms | 806 ms | **no** | **no** | yes, in a `<script>` | 28 ms |

- `/stream/critical-streamed`: title "Product", no meta description, 171 characters of text without scripts (awaited: 961).
- With JavaScript off, Chromium showed "Loading reviews…" on `/stream/streamed`, never the reviews.
- Six user agents (browser, GPTBot, ClaudeBot, Googlebot, facebookexternalhit, Slackbot) got the same markup.

### `vite preview` (same build, `/stream/streamed`)

| Client | `node build` | `vite preview` |
| --- | --- | --- |
| no `accept-encoding` | 156 ms | 156 ms |
| `accept-encoding: gzip` (what browsers send) | 157 ms (not compressed) | **810 ms** (gzip holds the stream back) |
| Chromium, first paint | 176 ms | 816–820 ms |

Same result with `vite preview` under Node, `bun run` and Bun's runtime. Node's `fetch` (which asks for gzip): 807 ms on `vite preview`, 155 ms on `node build` (`results/preview-recheck.json`).

Findings:

1. With the scaffolded `hover`, a server `load` runs for every link the pointer **rests** on for 20 ms. Reading a list costs; sliding over it doesn't.
2. `tap` and `false` both give one load per page opened with a mouse. On touch, `hover` and `tap` behave the same, and a swipe that starts on a link preloads it; only `false` stops that.
3. SvelteKit keeps one preload and never expires it: reused 10 s later, but A → B → A runs A twice.
4. The gain is real and capped: compared with `tap`, `hover` saves at most the rest time before the press, up to the `load` time. With no rest they are the same.
5. Streamed data is not in the HTML markup. Streaming the main content also leaves the title and meta description generic or empty.
6. `vite preview` doesn't stream to browsers, because of gzip. This corrects our own earlier probe, which said "vite preview does not stream" without the reason.

Raw numbers: `results/measure.json`, `results/pack-tests.json`, `results/preview-recheck.json`. Each file records the date, versions, machine, and whether other load was running (`otherLoad`).

Versions: SvelteKit 2.70.3, Svelte 5.57.1, adapter-node 5.5.7, Vite 8.3.1, Playwright 1.63.0 (Chromium), Node 26.3, Windows 11, i9-13900KF.

## Rules you can use today

1. **Scope preloading.** Keep `hover` where people rest on few links (the main navigation). Put `data-sveltekit-preload-data="tap"` on dense lists, and `"false"` on lists that are used on phones and on links to expensive or side-effecting `load` functions. (Tests `T1`–`T3`, `T6`–`T8`)
2. **Stream only what can be missing.** Await the main content and everything `<svelte:head>` needs; stream reviews and extras. (Tests `T12`–`T15`)

The SvelteKit docs describe both options ([link options](https://svelte.dev/docs/kit/link-options), [streaming with promises](https://svelte.dev/docs/kit/load#Streaming-with-promises)), including that streaming "will only work when JavaScript is enabled". This demo measures the cost and the gain.

The full set (10 rules with tests, a Playwright preload counter and a crawler-view check for your own app, an audit prompt, for Claude Code, Cursor, Copilot and AGENTS.md) is **Measured Rules: SvelteKit defaults**, coming in January 2027 at [measuredfrontend.com](https://measuredfrontend.com). Free checklist: [measuredfrontend.com/free](https://measuredfrontend.com/free).

## Key files

- `src/app.html`: the scaffolded `hover`
- `src/routes/+layout.svelte`: nav and the measurement switches
- `src/routes/products/`: the list and the product pages
- `src/routes/stream/*`: the three streaming versions
- `src/lib/server/counter.ts`: process-wide counters (instrumentation only; never keep per-user data like this)
- `scripts/lib.mjs`: server start, pointer paths (60 Hz mouse), touch, network counting, streaming timing
- `scripts/measure.mjs`: the tables above
- `scripts/pack-tests.mjs`: T1–T18
- `scripts/preview-recheck.mjs`: `vite preview` vs `node build` with Node's `fetch`

## Licence

MIT. Use it, learn from it, ship it. Made by [Measured Frontend](https://measuredfrontend.com): frontend patterns, measured before they're taught. Not affiliated with or endorsed by the Svelte project.
