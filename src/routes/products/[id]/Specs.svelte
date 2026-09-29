<script lang="ts">
	let { specs }: { specs: { label: string; value: string }[] } = $props();
	let open = $state(true);
</script>

<section>
	<button onclick={() => (open = !open)}>{open ? 'Hide' : 'Show'} specs</button>
	{#if open}
		<table>
			<tbody>
				{#each specs as s (s.label)}
					<tr><th>{s.label}</th><td>{s.value}</td></tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
