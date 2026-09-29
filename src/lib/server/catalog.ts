// A small, deterministic fake catalogue. The detail payload is sized like a typical product
// page (description, specs, a few reviews) so the measured bytes mean something.

const NOUNS = ['Trail shoe', 'Rain jacket', 'Day pack', 'Headlamp', 'Water filter', 'Camp stove', 'Sleeping pad', 'Trekking pole', 'Base layer', 'Beanie', 'Gaiters', 'Bivy bag'];
const ADJ = ['Light', 'Ridge', 'Summit', 'Valley', 'Storm', 'Alpine'];

export const PRODUCT_COUNT = 24;

export type ProductSummary = { id: number; name: string; price: number; blurb: string };

export function summary(id: number): ProductSummary {
	const name = `${ADJ[id % ADJ.length]} ${NOUNS[id % NOUNS.length]} ${id}`;
	return { id, name, price: 29 + ((id * 37) % 170), blurb: `Tested on long days out. Model ${id}.` };
}

export function allProducts(): ProductSummary[] {
	return Array.from({ length: PRODUCT_COUNT }, (_, i) => summary(i + 1));
}

export function description(id: number): string {
	const s = summary(id);
	return (
		`${s.name} is built for people who spend whole days outside. ` +
		`It keeps the weight down without giving up the details that matter after hour six: ` +
		`seams that stay closed in rain, materials that dry overnight, and a fit that works with ` +
		`a pack on. We tested model ${id} on wet rock, forest trails and a few kilometres of ` +
		`road between them. It is not the lightest option in its class, and it is not trying to ` +
		`be; it is the one that still works at the end of the season. Care: rinse with clean ` +
		`water, dry away from direct heat, store loose.`
	);
}

export function detail(id: number) {
	const s = summary(id);
	return {
		...s,
		description: description(id),
		specs: Array.from({ length: 10 }, (_, i) => ({ label: `Spec ${i + 1}`, value: `${(id * (i + 3)) % 97} units` })),
		related: [1, 2, 3, 4].map((k) => summary(((id + k * 5) % PRODUCT_COUNT) + 1))
	};
}

export function reviews(id: number): string[] {
	return [
		`Review for model ${id}: great grip on wet rock.`,
		`Review for model ${id}: runs half a size small.`,
		`Review for model ${id}: survived a full season of weekend trips.`,
		`Review for model ${id}: the colour fades a little in strong sun.`,
		`Review for model ${id}: would buy again.`
	];
}
