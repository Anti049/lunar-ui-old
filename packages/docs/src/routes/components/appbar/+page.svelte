<script lang="ts">
	import ComponentPreview from '$lib/demo/ComponentPreview.svelte';
	import { Ellipsis, Menu, Search } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { ScrollState } from 'runed';
	import ComponentClassTable from '$lib/demo/ComponentClassTable.svelte';

	let appbarElement = $state<HTMLElement>();
	let scrollState = $state<ScrollState>();
	let isScrolled = $derived((scrollState?.arrived.top ?? true) !== true);
	onMount(() => {
		// The scaffold's <main> is the scroll container; fall back to the document.
		const scroller = appbarElement?.closest('.scaffold-main') ?? document.documentElement;
		scrollState = new ScrollState({ element: () => scroller as HTMLElement });
	});
</script>

<div class="flex h-full w-full flex-col gap-8">
	<!-- Header/Classes -->
	<ComponentClassTable name="appbar" />
	<!-- Scrollable -->
	<ComponentPreview
		id="medium"
		title="Scrollable App Bar"
		description="Raises the elevation upon scroll."
	>
		<div
			class="appbar-md appbar appbar-scrollable"
			data-scrolled={isScrolled || undefined}
			bind:this={appbarElement}
		>
			<div class="appbar-leading">
				<button class="button button-square button-md button-text">
					<Menu />
				</button>
			</div>
			<div class="appbar-body">
				<p class="appbar-title">LunarUI</p>
			</div>
			<div class="appbar-trailing">
				<button class="button button-square button-md button-text">
					<Search />
				</button>
			</div>
		</div>
	</ComponentPreview>
	<!-- Centered -->
	<ComponentPreview
		id="centered"
		title="Centered App Bar"
		description="Use on home pages or landing pages."
	>
		<div class="appbar appbar-centered">
			<div class="appbar-leading">
				<button class="button button-square button-md button-text">
					<Menu />
				</button>
			</div>
			<div class="appbar-body">
				<p class="appbar-title">Centered App Bar</p>
			</div>
			<div class="appbar-trailing">
				<button class="button button-square button-md button-text">
					<Search />
				</button>
			</div>
		</div>
	</ComponentPreview>
	<!-- Title Only -->
	<ComponentPreview
		id="title-only"
		title="App Bar with Title Only"
		description="Use when only the title is needed."
	>
		<div class="appbar">
			<div class="appbar-body">
				<p class="appbar-title">LunarUI</p>
			</div>
		</div>
	</ComponentPreview>
	<!-- Title and Icon Button -->
	<ComponentPreview
		id="title-and-icon"
		title="Appbar with Title and Icon Button"
		description="Use when you need a title and an icon button."
	>
		<div class="appbar">
			<div class="appbar-body">
				<p class="appbar-title">LunarUI</p>
			</div>
			<div class="appbar-trailing">
				<button class="button button-square button-md button-text">
					<Search />
				</button>
			</div>
		</div>
	</ComponentPreview>
	<!-- Icon at Start and End -->
	<ComponentPreview
		id="icon-start-end"
		title="App Bar with Icon at Start and End"
		description="Use when you need icons at both the start and end of the app bar."
	>
		<div class="appbar">
			<div class="appbar-leading">
				<button class="button button-square button-md button-text">
					<Menu />
				</button>
			</div>
			<div class="appbar-body">
				<p class="appbar-title">LunarUI</p>
			</div>
			<div class="appbar-trailing">
				<button class="button button-square button-md button-text">
					<Search />
				</button>
			</div>
		</div>
	</ComponentPreview>
	<!-- Title and Search -->
	<ComponentPreview
		id="title-and-search"
		title="App Bar with Title and Search"
		description="Use when you need a title and a search action."
	>
		<div class="appbar">
			<div class="appbar-body">
				<p class="appbar-title">LunarUI</p>
			</div>
			<div class="appbar-trailing pr-1">
				<!-- TODO: Replace with actual input classes -->
				<input
					type="text"
					placeholder="Search..."
					class="interactive w-full max-w-64 rounded-sm border-0 surface text-center ring-0 transition-[color,background-color] focus:surface-container focus:ring-0 focus:ring-transparent focus:ring-offset-0 focus:ring-offset-transparent compact:w-64"
				/>
			</div>
		</div>
	</ComponentPreview>
	<!-- Title, Badge and Icon Button -->
	<ComponentPreview
		id="title-badge-icon"
		title="App Bar with Title, Badge and Icon Button"
		description="Use when you need a title, a badge and an icon button."
	>
		<div class="appbar">
			<div class="appbar-body">
				<p class="appbar-title">LunarUI</p>
			</div>
			<div class="indicator appbar-trailing">
				<button class="button button-square button-md button-text">
					<Search />
				</button>
				<span class="badge indicator-item badge-primary">+99</span>
			</div>
			<div class="indicator appbar-trailing">
				<button class="button button-square button-md button-text">
					<Ellipsis />
				</button>
				<span class="badge badge-animate-alert indicator-item badge-error"></span>
			</div>
		</div>
	</ComponentPreview>
	<!-- Search -->
	<ComponentPreview
		id="search"
		title="App Bar with Search"
		description="Use when you need a search action."
	>
		<div class="appbar-sm appbar appbar-centered">
			<div class="appbar-body">
				<!-- TODO: Replace with actual input classes -->
				<input
					type="text"
					placeholder="Search..."
					class="w-full rounded-sm border-0 surface text-center ring-0 transition-[color,background-color] animated focus:surface-container focus:ring-0 focus:ring-transparent focus:ring-offset-0 focus:ring-offset-transparent"
				/>
			</div>
		</div>
	</ComponentPreview>
	<!-- Subtitle -->
	<ComponentPreview
		id="subtitle"
		title="App Bar with Subtitle"
		description="Use when you need a subtitle."
	>
		<div class="appbar-sm appbar">
			<div class="appbar-leading">
				<button class="button button-square button-md button-text">
					<Menu />
				</button>
			</div>
			<div class="appbar-body">
				<p class="appbar-title">App Bar Title</p>
				<p class="appbar-subtitle">App Bar Subtitle</p>
			</div>
			<div class="appbar-trailing">
				<button class="button button-square button-md button-text">
					<Search />
				</button>
			</div>
		</div>
	</ComponentPreview>
</div>
