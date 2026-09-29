<script lang="ts">
	import Specs from './Specs.svelte';
	let { data } = $props();
</script>

<svelte:head><title>{data.product.name}</title></svelte:head>

<article id="product" data-product-id={data.product.id}>
	<h1>{data.product.name}</h1>
	<p>€{data.product.price}</p>
	<p>{data.product.description}</p>
	<Specs specs={data.product.specs} />
	<h2>Related</h2>
	<ul>
		{#each data.product.related as r (r.id)}
			<li><a href="/products/{r.id}">{r.name}</a></li>
		{/each}
	</ul>
</article>
