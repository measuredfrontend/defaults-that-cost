// Simulated backend calls for the streaming pages: the product itself (the content that
// matters for search and link previews) and reviews from a slower service.
import { description, reviews, summary } from './catalog';
import { sleep } from './delay';

export const PRODUCT_MS = 150;
export const REVIEWS_MS = 800;

export async function loadProduct(id: number) {
	await sleep(PRODUCT_MS);
	return { ...summary(id), description: description(id) };
}

export async function loadReviews(id: number) {
	await sleep(REVIEWS_MS);
	return reviews(id);
}
