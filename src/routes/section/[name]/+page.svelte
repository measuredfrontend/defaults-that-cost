<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>{data.name}</title></svelte:head>

<h1 id="section" data-section={data.name}>{data.name}</h1>
<p>{data.text}</p>
