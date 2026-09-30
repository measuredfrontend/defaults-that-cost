<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<!-- The head tries to use the streamed product. Without experimental async SSR, the server
	     renders the pending state of this {#await}: nothing. -->
	{#await data.product then p}
		<title>{p.name}</title>
		<meta name="description" content={p.description.slice(0, 150)} />
	{/await}
</svelte:head>

<article id="product">
	{#await data.product}
		<p class="pending">Loading product…</p>
	{:then product}
		<h1>{product.name}</h1>
		<p class="description">{product.description}</p>
	{/await}
	<h2>Reviews</h2>
	{#await data.reviews}
		<p class="pending">Loading reviews…</p>
	{:then reviews}
		<ul>{#each reviews as r (r)}<li class="review">{r}</li>{/each}</ul>
	{/await}
</article>
