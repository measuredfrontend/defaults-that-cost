<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<!-- Nothing product-specific can go here: the product isn't known when the head is sent. -->
	<title>Product</title>
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
