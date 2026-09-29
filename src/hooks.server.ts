import type { Handle } from '@sveltejs/kit';
import { countRequest } from '$lib/server/counter';

export const handle: Handle = async ({ event, resolve }) => {
	// Count what reaches the server. `isDataRequest` is true for the __data.json requests that
	// client-side navigation and preloading send.
	if (!event.url.pathname.startsWith('/api/')) countRequest(event.isDataRequest);
	return resolve(event);
};
