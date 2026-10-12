import { allProducts } from '#lib/server/catalog.js';
import { countLoad } from '#lib/server/counter.js';

export const load = async ({ url }) => {
	countLoad('/products');
	// `?list=tap` scopes preloading for the list only (the nav keeps its own setting).
	return { products: allProducts(), list: url.searchParams.get('list') };
};
