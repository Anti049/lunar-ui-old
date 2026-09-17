<script lang="ts">
	import { ThemePreview } from '@anti049/lunar-ui-svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import {
		buildThemeDeclarations,
		themeSelectors,
		type ThemeOptions
	} from '../../../../lunar-ui/functions/buildTheme.js';
	import { VARIANT_NAMES } from '../../../../lunar-ui/functions/generateTheme.js';

	/*
		The generator runs the plugin's own `buildThemeDeclarations`, not a copy of
		it, so the CSS shown below is the CSS `@plugin '@anti049/lunar-ui/theme'`
		emits. material-color-utilities has no dependencies and no node builtins,
		so it runs here unchanged.

		No debouncing: a full 300-declaration palette takes ~1.9ms to generate,
		which fits inside a frame. Regenerating straight from $derived keeps the
		preview exact rather than trailing the controls.
	*/

	const STATUS = ['success', 'warning', 'info', 'alert'] as const;
	type Status = (typeof STATUS)[number];

	/*
		The palettes Material derives from the primary seed. Giving one its own
		seed replaces just that palette and leaves the rest derived, so a brand
		colour can be pinned without losing the relationships found for the rest.

		`primary` is not in this list: it seeds the scheme itself, which is the
		"Seed colour" field above, and it is what `variant` reshapes. Offering it
		here as well would emit `seed-primary` twice.
	*/
	const CORE = ['secondary', 'tertiary', 'neutral', 'neutral-variant', 'error'] as const;
	type Core = (typeof CORE)[number];

	let name = $state('brand');
	let seed = $state('#0956AA');
	let variant = $state('vibrant');
	let contrast = $state(0);
	let harmonize = $state(true);
	let colorScheme = $state<'light' | 'dark'>('light');
	let isDefault = $state(false);
	let statusSeeds = $state<Record<Status, string>>({
		success: '',
		warning: '',
		info: '',
		alert: ''
	});
	let coreSeeds = $state<Record<Core, string>>({
		secondary: '',
		tertiary: '',
		neutral: '',
		'neutral-variant': '',
		error: ''
	});
	let format = $state<'plugin' | 'css'>('plugin');
	let copied = $state(false);

	const options = $derived.by((): ThemeOptions => {
		const base: ThemeOptions = {
			name,
			'seed-primary': seed,
			variant,
			harmonize,
			'color-scheme': colorScheme
		};
		if (contrast !== 0) base.contrast = contrast;
		if (isDefault) base.default = true;
		for (const key of STATUS) {
			if (statusSeeds[key]) base['seed-' + key] = statusSeeds[key];
		}
		for (const key of CORE) {
			if (coreSeeds[key]) base['seed-' + key] = coreSeeds[key];
		}
		return base;
	});

	/*
		A half-typed seed throws, and the seed field changes on every keystroke, so
		the failure is expected rather than exceptional.
	*/
	const attempt = $derived.by(() => {
		try {
			return {
				declarations: buildThemeDeclarations(options) as Record<string, string> | null,
				error: null as string | null
			};
		} catch (error) {
			return {
				declarations: null as Record<string, string> | null,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	});

	/*
		Hold the last palette that built, so an invalid seed leaves the preview
		standing rather than blanking it while you type.

		The remembering happens in an effect rather than inside the $derived above:
		a derived has to stay pure, and assigning state from one is an error
		(`state_unsafe_mutation`). Effects do not run during SSR, which is fine --
		the defaults build, so nothing reads this until the first failure.
	*/
	let lastGood = $state<Record<string, string>>({});
	$effect(() => {
		if (attempt.declarations) lastGood = attempt.declarations;
	});

	const declarations = $derived(attempt.declarations ?? lastGood);

	const previewStyle = $derived(
		Object.entries(declarations)
			.map(([property, value]) => `${property}:${value}`)
			.join(';')
	);

	const pluginSnippet = $derived.by(() => {
		const lines = [`@plugin '@anti049/lunar-ui/theme' {`, `\tname: ${name || 'brand'};`];
		lines.push(`\tseed-primary: ${seed};`);
		if (variant !== 'vibrant') lines.push(`\tvariant: ${variant};`);
		if (contrast !== 0) lines.push(`\tcontrast: ${contrast};`);
		if (!harmonize) lines.push(`\tharmonize: false;`);
		for (const key of CORE) {
			if (coreSeeds[key]) lines.push(`\tseed-${key}: ${coreSeeds[key]};`);
		}
		for (const key of STATUS) {
			if (statusSeeds[key]) lines.push(`\tseed-${key}: ${statusSeeds[key]};`);
		}
		lines.push(`\tcolor-scheme: ${colorScheme};`);
		if (isDefault) lines.push(`\tdefault: true;`);
		lines.push('}');
		return lines.join('\n');
	});

	const expandedCss = $derived.by(() => {
		const body = Object.entries(declarations)
			.map(([property, value]) => `\t${property}: ${value};`)
			.join('\n');
		let selectors: string[];
		try {
			selectors = themeSelectors(options);
		} catch {
			selectors = [`[data-theme='brand']`];
		}
		return selectors.map((selector) => `${selector} {\n${body}\n}`).join('\n\n');
	});

	const output = $derived(format === 'plugin' ? pluginSnippet : expandedCss);

	async function copy() {
		try {
			await navigator.clipboard.writeText(output);
		} catch {
			// Clipboard API needs a secure context; fall back to a scratch textarea.
			const scratch = document.createElement('textarea');
			scratch.value = output;
			scratch.setAttribute('readonly', '');
			scratch.style.position = 'fixed';
			scratch.style.opacity = '0';
			document.body.append(scratch);
			scratch.select();
			document.execCommand('copy');
			scratch.remove();
		}
		copied = true;
		setTimeout(() => (copied = false), 1600);
	}

	const declarationCount = $derived(
		Object.keys(declarations).filter((k) => k.startsWith('--theme-color-')).length
	);
</script>

<svelte:head>
	<title>Generate a theme · lunar-ui</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4">
	<header class="flex flex-col gap-1">
		<h1 class="text-headline-medium">Generate a theme</h1>
		<p class="max-w-prose text-body-medium text-on-surface-variant">
			Pick a seed colour and lunar-ui builds a full Material tonal palette from it — every role,
			every tone step, with the status colours harmonized toward your seed. Copy the result as a
			plugin call or as plain CSS.
		</p>
	</header>

	<div class="grid gap-6 medium:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
		<!-- Controls -->
		<form class="flex flex-col gap-4" onsubmit={(e) => e.preventDefault()}>
			<label class="flex flex-col gap-1">
				<span class="text-label-large">Name</span>
				<input
					class="select"
					type="text"
					bind:value={name}
					placeholder="brand"
					autocomplete="off"
				/>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-label-large">Seed colour</span>
				<div class="flex items-center gap-2">
					<input
						class="h-10 w-12 shrink-0 cursor-pointer rounded-sm border border-outline-variant bg-transparent"
						type="color"
						bind:value={seed}
						aria-label="Seed colour picker"
					/>
					<input class="select flex-1 font-mono" type="text" bind:value={seed} spellcheck="false" />
				</div>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-label-large">Variant</span>
				<select class="select" bind:value={variant}>
					{#each VARIANT_NAMES as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</label>

			<label class="flex flex-col gap-1">
				<span class="flex items-baseline justify-between text-label-large">
					Contrast
					<span class="font-mono text-body-small text-on-surface-variant">{contrast}</span>
				</span>
				<input type="range" min="-1" max="1" step="0.1" bind:value={contrast} class="w-full" />
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-label-large">Colour scheme</span>
				<select class="select" bind:value={colorScheme}>
					<option value="light">light</option>
					<option value="dark">dark</option>
				</select>
			</label>

			<label class="flex items-center gap-2">
				<input class="checkbox" type="checkbox" bind:checked={harmonize} />
				<span class="text-label-large">Harmonize status colours</span>
			</label>

			<label class="flex items-center gap-2">
				<input class="checkbox" type="checkbox" bind:checked={isDefault} />
				<span class="text-label-large">Apply where no theme is set</span>
			</label>

			{#snippet seedRow(
				label: string,
				value: string,
				set: (next: string) => void,
				placeholder: string
			)}
				<div class="flex items-center gap-2">
					<span class="w-24 shrink-0 text-body-small">{label}</span>
					<input
						class="h-8 w-10 shrink-0 cursor-pointer rounded-sm border border-outline-variant bg-transparent"
						type="color"
						value={value || '#888888'}
						oninput={(e) => set(e.currentTarget.value)}
						aria-label="{label} seed"
					/>
					<input
						class="select flex-1 font-mono text-body-small"
						type="text"
						{placeholder}
						{value}
						oninput={(e) => set(e.currentTarget.value)}
						spellcheck="false"
					/>
					{#if value}
						<button
							class="button button-text"
							type="button"
							onclick={() => set('')}
							aria-label="Clear {label} seed">Clear</button
						>
					{/if}
				</div>
			{/snippet}

			<fieldset class="flex flex-col gap-2 border-t border-outline-variant pt-3">
				<legend class="text-label-large">Role seeds</legend>
				<p class="text-body-small text-on-surface-variant">
					Pin a role to an exact colour. Whatever you leave blank stays derived from the seed above,
					so the palette still hangs together.
				</p>
				{#each CORE as key (key)}
					{@render seedRow(key, coreSeeds[key], (next) => (coreSeeds[key] = next), 'derived')}
				{/each}
			</fieldset>

			<fieldset class="flex flex-col gap-2 border-t border-outline-variant pt-3">
				<legend class="text-label-large">Status seeds</legend>
				<p class="text-body-small text-on-surface-variant">
					Leave blank to use lunar-ui's defaults. Unlike role seeds these are harmonized toward the
					seed, so success stays green.
				</p>
				{#each STATUS as key (key)}
					{@render seedRow(key, statusSeeds[key], (next) => (statusSeeds[key] = next), 'default')}
				{/each}
			</fieldset>
		</form>

		<!-- Preview -->
		<div class="flex flex-col gap-3">
			{#if attempt.error}
				<p class="rounded-sm bg-error-container p-3 text-body-medium text-on-error-container">
					{attempt.error}
				</p>
			{/if}

			<!--
				The preview carries `data-theme` on purpose. modes.css and semantics.css
				re-declare their tokens at `:root, [data-theme]`, so only an element
				matching that selector re-resolves `light-dark()` and the `--color-*`
				roles against the tone steps set here. A plain div would inherit the
				root's already-substituted values and show the wrong palette.
			-->
			<div
				data-theme={name || 'preview'}
				style={previewStyle}
				class="flex flex-col gap-4 rounded-md surface p-4 elevation-2"
			>
				<ThemePreview />

				<div class="flex flex-wrap items-center gap-2 border-t border-outline-variant pt-4">
					<button class="button button-filled" type="button">Filled</button>
					<button class="button button-tonal" type="button">Tonal</button>
					<button class="button button-outlined" type="button">Outlined</button>
					<button class="button button-text" type="button">Text</button>
					<span class="badge badge-primary">Primary</span>
					<span class="badge badge-tonal badge-success">Success</span>
					<span class="badge badge-tonal badge-warning">Warning</span>
					<span class="badge badge-tonal badge-error">Error</span>
				</div>
			</div>

			<p class="text-body-small text-on-surface-variant">
				{declarationCount} declarations across 10 palettes.
			</p>
		</div>
	</div>

	<!-- Output -->
	<section class="flex flex-col gap-3">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<button
					class="button {format === 'plugin' ? 'button-filled' : 'button-outlined'}"
					type="button"
					aria-pressed={format === 'plugin'}
					onclick={() => (format = 'plugin')}>Plugin call</button
				>
				<button
					class="button {format === 'css' ? 'button-filled' : 'button-outlined'}"
					type="button"
					aria-pressed={format === 'css'}
					onclick={() => (format = 'css')}>Expanded CSS</button
				>
			</div>
			<button class="button button-tonal" type="button" onclick={copy}>
				{copied ? 'Copied' : 'Copy'}
			</button>
		</div>

		<p class="max-w-prose text-body-small text-on-surface-variant">
			{#if format === 'plugin'}
				Add this to the stylesheet where you load lunar-ui. It stays regenerable — change the seed
				later and the whole palette follows.
			{:else}
				The same theme, expanded. Use this to pin the palette or edit individual tones by hand;
				lunar-ui no longer generates it for you.
			{/if}
		</p>

		<div class="max-h-[32rem] overflow-auto rounded-sm border border-outline-variant">
			<CodeBlock code={output} lang="css" />
		</div>
	</section>
</div>
