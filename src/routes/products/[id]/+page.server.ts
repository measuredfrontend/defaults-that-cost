import { error } from '@sveltejs/kit';
import { detail, PRODUCT_COUNT } from '$lib/server/catalog';
import { countLoad } from '$lib/server/counter';
import { simulatedDelay } from '$lib/server/delay';

export const load = async ({ params, cookies }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id < 1 || id > PRODUCT_COUNT) error(404, 'Not found');
	countLoad('/products/[id]'); // one call = one database query, API call or function invocation
	await simulatedDelay(cookies);
	return { product: detail(id) };
};
