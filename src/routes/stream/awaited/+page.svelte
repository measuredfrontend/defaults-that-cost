<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>{data.product.name}</title>
	<meta name="description" content={data.product.description.slice(0, 150)} />
</svelte:head>

<article id="product">
	<h1>{data.product.name}</h1>
	<p class="description">{data.product.description}</p>
	<h2>Reviews</h2>
	<ul>{#each data.reviews as r (r)}<li class="review">{r}</li>{/each}</ul>
</article>
