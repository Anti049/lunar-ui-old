<script lang="ts">
	import { Scaffold, ThemedSVG, initRipple } from '@anti049/lunar-ui-svelte';
	import NavLinks from '$lib/components/NavLinks.svelte';
	import { onMount } from 'svelte';
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import NavBar from '$lib/components/NavBar.svelte';

	const { children } = $props();

	const moonColors = {
		'#cdd6f4': 'fill-on-surface',
		'#7f849c': 'stroke-on-surface-variant',
		'#313244': 'fill-surface-container-high'
	};
	let minimized = $state(false);

	onMount(() => initRipple());
</script>

<ModeWatcher defaultTheme="default" darkClassNames={['dark']} lightClassNames={['light']} />

<Scaffold {minimized}>
	{#snippet header()}
		<!-- <div class="appbar appbar-centered border-b border-b-surface-container">
			<div class="appbar-leading">
				<button
					class="button swap button-square button-md button-text"
					onclick={() => (minimized = !minimized)}
				>
					<input type="checkbox" bind:checked={minimized} />
					<PanelLeftClose class="swap-off" />
					<PanelLeftOpen class="swap-on" />
				</button>
			</div>
			<div class="appbar-body">
				<ThemedSVG
					src="/moon_monochrome.svg"
					replacements={moonColors}
					class="aspect-square h-full appbar-title"
					ariaLabel="Logo"
				/>
			</div>
			<div class="appbar-trailing">
				<button class="button button-square button-md button-text" onclick={cycleMode}>
					{#if mode.current === 'light'}
						<Sun />
					{:else if mode.current === 'dark'}
						<Moon />
					{:else}
						<SunMoon />
					{/if}
				</button>
			</div>
		</div> -->
		<NavBar bind:minimized>
			{#snippet logo()}
				<ThemedSVG
					src="/moon_monochrome.svg"
					replacements={moonColors}
					class="aspect-square h-full appbar-title"
					ariaLabel="Logo"
				/>
			{/snippet}
		</NavBar>
	{/snippet}

	{#snippet sidebar()}
		<nav class="nav-rail w-64 gap-2 border-r border-r-surface-container p-2 collapsed:w-16">
			<NavLinks />
		</nav>
	{/snippet}

	{@render children()}
</Scaffold>
