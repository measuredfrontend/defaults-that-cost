import { loadProduct, loadReviews } from '$lib/server/backend';

// Everything awaited: the HTML is sent when the slowest call is done.
export const load = async () => {
	const [product, reviews] = await Promise.all([loadProduct(7), loadReviews(7)]);
	return { product, reviews };
};
