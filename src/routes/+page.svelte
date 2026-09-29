<svelte:head><title>Defaults that cost you</title></svelte:head>

<h1>SvelteKit defaults that cost you</h1>
<p>A demo for two defaults: hover preloading and streamed data.</p>
<ul>
	<li><a href="/products">Product list</a> (preloading; switches: <code>?data=hover|tap|false</code>, <code>?code=eager|viewport|hover|tap</code>, <code>?list=tap</code>)</li>
	<li><a href="/stream/awaited" data-sveltekit-reload>Awaited product page</a></li>
	<li><a href="/stream/streamed" data-sveltekit-reload>Streamed reviews</a></li>
	<li><a href="/stream/critical-streamed" data-sveltekit-reload>Streamed description (anti-pattern)</a></li>
</ul>
