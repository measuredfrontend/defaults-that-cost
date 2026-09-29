// Measurement instrumentation: counts server `load` calls and data requests for the whole
// process. It is module-level state ON PURPOSE, because it counts every request together.
// Never keep per-user or per-request data like this (see Topic 02: SSR state leak).

export type Counts = {
	loads: Record<string, number>; // server `load` calls per route
	dataRequests: number; // requests for __data.json (client-side navigation and preloading)
	documentRequests: number; // full HTML page requests
};

const counts: Counts = { loads: {}, dataRequests: 0, documentRequests: 0 };

export function countLoad(route: string) {
	counts.loads[route] = (counts.loads[route] ?? 0) + 1;
}

export function countRequest(isDataRequest: boolean) {
	if (isDataRequest) counts.dataRequests++;
	else counts.documentRequests++;
}

export function snapshot(): Counts {
	return structuredClone(counts);
}

export function reset() {
	counts.loads = {};
	counts.dataRequests = 0;
	counts.documentRequests = 0;
}
