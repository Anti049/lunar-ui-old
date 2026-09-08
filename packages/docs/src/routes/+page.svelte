<script lang="ts">
	import { ThemedSVG } from '@anti049/lunar-ui-svelte';

	const moonColors = {
		'#cdd6f4': 'fill-on-surface',
		'#7f849c': 'stroke-on-surface-variant',
		'#313244': 'fill-surface-container-high'
	};
</script>

<div class="flex h-full w-full flex-col items-center gap-4 p-6">
	<div class="max-w-xl space-y-2">
		<h1 class="text-title-large-emphasized">Themed SVG</h1>
		<p class="text-body-medium text-on-surface-variant">
			Load an SVG from <code>/static</code> and swap hard-coded colors for theme classes.
		</p>
	</div>

	<ThemedSVG
		src="/moon.svg"
		replacements={moonColors}
		class="h-120 w-full max-w-4xl"
		ariaLabel="Moon monochrome illustration"
	/>
</div>
