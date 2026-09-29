import { countLoad } from '$lib/server/counter';
import { simulatedDelay } from '$lib/server/delay';

export const load = async ({ params, cookies }) => {
	countLoad('/section/[name]');
	await simulatedDelay(cookies);
	return { name: params.name, text: `The ${params.name} section. Content comes from a slow backend.` };
};
