<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	let { children } = $props();

	// Measurement switches, read from the first URL only (?data=tap&code=hover).
	// Without them nothing is set here, and the scaffolded `hover` on <body> applies.
	const data = page.url.searchParams.get('data') ?? undefined;
	const code = page.url.searchParams.get('code') ?? undefined;

	onMount(() => {
		document.documentElement.dataset.hydrated = 'true';
	});

	const nav = [
		['/products', 'Products'],
		['/section/deals', 'Deals'],
		['/section/guides', 'Guides'],
		['/section/stores', 'Stores'],
		['/section/help', 'Help'],
		['/section/account', 'Account']
	];
</script>

<div data-sveltekit-preload-data={data} data-sveltekit-preload-code={code}>
	<header>
		<a class="brand" href="/">Fernwick Outfitters</a>
		<nav>
			{#each nav as [href, label] (href)}
				<a {href} data-testid="nav-{label.toLowerCase()}">{label}</a>
			{/each}
		</nav>
	</header>
	<main>{@render children()}</main>
	<footer>Fernwick Outfitters is a made-up demo store for measurements. Nothing here is for sale.</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		font: 16px/1.4 system-ui, sans-serif;
	}
	header {
		display: flex;
		gap: 32px;
		align-items: center;
		height: 56px;
		padding: 0 24px;
		border-bottom: 1px solid #ddd;
	}
	nav {
		display: flex;
		gap: 8px;
	}
	nav a {
		display: block;
		padding: 8px 14px;
	}
	main {
		padding: 16px 24px;
	}
	footer {
		min-height: 60vh; /* room to scroll on a phone, like a real footer */
		padding: 24px;
		border-top: 1px solid #ddd;
		color: #666;
	}
</style>
