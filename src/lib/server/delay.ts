import type { Cookies } from '@sveltejs/kit';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Simulated data wait, like a database or API call.
 * Default: random 150-300 ms. The measure script can pin it with a `demo_delay` cookie
 * ("200" or "150-300"), which preload requests carry like any other request.
 */
export function simulatedDelay(cookies: Cookies) {
	const spec = cookies.get('demo_delay') ?? '150-300';
	const [lo, hi = lo] = spec.split('-').map(Number);
	return sleep(lo + Math.random() * (hi - lo));
}

export { sleep };
