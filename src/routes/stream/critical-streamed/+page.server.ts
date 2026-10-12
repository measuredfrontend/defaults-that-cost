import { loadProduct, loadReviews } from '#lib/server/backend.js';

// Anti-pattern: the main content is streamed too, so the first HTML has only placeholders.
export const load = () => {
	return {
		product: loadProduct(7), // not awaited: streamed
		reviews: loadReviews(7) // not awaited: streamed
	};
};
