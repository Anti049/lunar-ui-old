<script lang="ts">
	import { THEME_NAMES, THEME_SWATCHES } from '@anti049/lunar-ui/themes';
	import { theme, mode } from 'mode-watcher';
	import { capitalCase } from 'change-case';

	let primarySeed = $state('');

	let selectedBaseTheme = $state<string>(theme.current ?? '');

	$effect(() => {
		let swatch = THEME_SWATCHES[selectedBaseTheme];
		let modeSwatch = mode.current === 'light' ? swatch.light : swatch.dark;
		primarySeed = modeSwatch.primary;
	});
</script>

<div
	class="mx-auto grid h-full w-full max-w-7xl flex-1 grid-cols-4 items-center justify-center gap-4"
>
	<div
		class="col-span-1 flex h-full w-full flex-1 flex-col items-center gap-2 rounded-sm border border-surface-container-lowest surface-container-low p-4"
	>
		<h1 class="text-headline-small">Theme Generator</h1>
		<div class="pointer-events-none h-0.5 w-full rounded-full surface-container"></div>
		<select
			class="select w-full select-md select-tonal select-surface"
			bind:value={selectedBaseTheme}
		>
			{#each THEME_NAMES as name (name)}
				<option value={name}>{capitalCase(name)}</option>
			{/each}
		</select>
		<div class="pointer-events-none h-0.5 w-full rounded-full surface-container"></div>
		<!-- TODO: Replace later with styled inputs -->
		<div class="flex h-16 w-full flex-row items-center gap-2 rounded-sm surface-container p-2">
			<input
				class="aspect-square h-12 w-12 cursor-pointer rounded-full"
				bind:value={primarySeed}
				type="color"
			/>
			<input
				class="h-fit w-full rounded-sm surface px-2 py-1 font-mono"
				type="text"
				placeholder="#0956AA"
				bind:value={primarySeed}
			/>
		</div>
	</div>
	<div class="col-span-3 flex h-full w-full flex-1 flex-col rounded-sm surface-container"></div>
</div>
