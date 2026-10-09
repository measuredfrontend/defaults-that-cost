// Measurement endpoint: GET returns the counters, DELETE resets them. Demo only.
import { reset, snapshot } from '#lib/server/counter.js';

export const GET = () => Response.json(snapshot());

export const DELETE = () => {
	reset();
	return new Response(null, { status: 204 });
};
