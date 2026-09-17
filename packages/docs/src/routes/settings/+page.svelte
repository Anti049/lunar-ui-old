<script lang="ts">
	import { ThemePreview } from '@anti049/lunar-ui-svelte';
	import { theme, setTheme } from 'mode-watcher';
	import { capitalCase } from 'change-case';

	let themes = [
		'default',
		'catppuccin',
		'catppuccin-latte',
		'catppuccin-frappe',
		'catppuccin-macchiato',
		'catppuccin-mocha',
		'dracula',
		'alucard',
		'gaziter',
		'brand'
	];
</script>

<div
	class="mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-4 compact:flex-1"
>
	<select
		class="select select-lg"
		value={theme.current}
		onchange={(e) => setTheme((e.currentTarget as HTMLSelectElement).value)}
	>
		{#each themes as theme (theme)}
			<option value={theme}>{capitalCase(theme)}</option>
		{/each}
	</select>
	<ThemePreview />
</div>
