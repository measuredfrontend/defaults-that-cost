<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Products</title></svelte:head>

<h1>Products</h1>
<ul class="list" data-sveltekit-preload-data={data.list ?? undefined}>
	{#each data.products as p (p.id)}
		<li>
			<a href="/products/{p.id}" data-testid="row-{p.id}">
				<strong>{p.name}</strong>
				<span>€{p.price}</span>
			</a>
		</li>
	{/each}
</ul>

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		max-width: 560px;
	}
	.list a {
		display: flex;
		justify-content: space-between;
		height: 36px;
		align-items: center;
		padding: 0 12px;
		border-bottom: 1px solid #eee;
		color: inherit;
		text-decoration: none;
	}
</style>
