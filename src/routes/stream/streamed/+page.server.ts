import { loadProduct, loadReviews } from '$lib/server/backend';

// The product is awaited (it is in the HTML); reviews are streamed after the first chunk.
export const load = async () => {
	return {
		reviews: loadReviews(7), // not awaited: streamed
		product: await loadProduct(7) // awaited: in the markup
	};
};
