// Measurement endpoint: GET returns the counters, DELETE resets them. Demo only.
import { json } from '@sveltejs/kit';
import { reset, snapshot } from '$lib/server/counter';

export const GET = () => json(snapshot());

export const DELETE = () => {
	reset();
	return new Response(null, { status: 204 });
};
