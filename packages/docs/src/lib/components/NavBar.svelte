<script lang="ts">
	import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, SunMoon, X } from '@lucide/svelte';
	import { ThemedSVG } from '@anti049/lunar-ui-svelte';
	import { userPrefersMode as mode, setMode } from 'mode-watcher';
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { goto, pushState } from '$app/navigation';
	import { page } from '$app/state';
	import type { ResolvedPathname } from '$app/types';
	import NavLinks from './NavLinks.svelte';

	function cycleMode() {
		if (mode.current === 'light') {
			setMode('dark');
		} else if (mode.current === 'dark') {
			setMode('system');
		} else {
			setMode('light');
		}
	}

	interface NavBarProps {
		logo: Snippet<[]>;
		minimized: boolean;
	}
	let { logo, minimized = $bindable(false) }: NavBarProps = $props();
	// Mobile menu state is backed by shallow-routing history, so the browser
	// back button (popstate) dismisses it natively.
	let mobileMenuVisible = $derived(!!page.state.navMenuOpen);

	function openMobileMenu() {
		if (!mobileMenuVisible) pushState('', { navMenuOpen: true });
	}
	function closeMobileMenu() {
		if (mobileMenuVisible) history.back();
	}
	function toggleMobileMenu() {
		if (mobileMenuVisible) closeMobileMenu();
		else openMobileMenu();
	}
	// Navigate from the drawer by replacing its shallow-history entry, so the
	// "menu open" state is consumed instead of lingering behind the new route.
	function navigateFromMenu(event: MouseEvent, href: ResolvedPathname) {
		// Let modified clicks (new tab/window) behave natively.
		if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		event.preventDefault();
		goto(href, { replaceState: true });
	}
	// Focus trap: keeps Tab within the drawer, closes on Escape, and restores
	// focus to the trigger when dismissed.
	function trapFocus(node: HTMLElement) {
		const previous = document.activeElement as HTMLElement | null;
		const focusable = () =>
			Array.from(
				node.querySelectorAll<HTMLElement>(
					'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
				)
			).filter((el) => el.offsetParent !== null);

		function handleKeydown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeMobileMenu();
				return;
			}
			if (event.key !== 'Tab') return;
			const items = focusable();
			if (items.length === 0) return;
			const first = items[0];
			const last = items[items.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}

		(focusable()[0] ?? node).focus();
		node.addEventListener('keydown', handleKeydown);
		return {
			destroy() {
				node.removeEventListener('keydown', handleKeydown);
				previous?.focus?.();
			}
		};
	}
	// Mobile menu transition
	function slideFade(node: HTMLElement, params: unknown) {
		const {
			delay = 0,
			duration = 300,
			easing = (t: number) => t,
			y = 20
		} = params as { delay?: number; duration?: number; easing?: (t: number) => number; y?: number };
		return {
			delay,
			duration,
			easing,
			css: (t: number) => `transform: translateY(${(1 - t) * y}px); opacity: ${t}`
		};
	}
</script>

<!-- Appbar -->
<div class="appbar appbar-centered border-b border-b-surface-container">
	<div class="appbar-leading">
		<button
			class="button swap inline-grid button-square button-md button-text button-surface compact:hidden"
			onclick={toggleMobileMenu}
		>
			<input type="checkbox" checked={mobileMenuVisible} />
			<Menu class="swap-off" />
			<X class="swap-on" />
		</button>
		<button
			class="button swap hidden button-square button-md button-text button-surface compact:inline-grid"
			onclick={() => (minimized = !minimized)}
		>
			<input type="checkbox" bind:checked={minimized} />
			<PanelLeftClose class="swap-off" />
			<PanelLeftOpen class="swap-on" />
		</button>
	</div>
	<div class="appbar-body">
		{#if logo}
			{@render logo()}
		{:else}
			<ThemedSVG
				src="/moon_monochrome.svg"
				class="aspect-square h-full appbar-title"
				ariaLabel="Logo"
			/>
		{/if}
	</div>
	<div class="appbar-trailing">
		<button class="button button-square button-md button-text button-surface" onclick={cycleMode}>
			{#if mode.current === 'light'}
				<Sun />
			{:else if mode.current === 'dark'}
				<Moon />
			{:else}
				<SunMoon />
			{/if}
		</button>
	</div>
</div>
{#if mobileMenuVisible}
	<!-- Scrim: tap to dismiss -->
	<button
		type="button"
		aria-label="Close navigation menu"
		class="fixed inset-x-0 top-16 bottom-0 z-30 scrim compact:hidden"
		transition:fade={{ duration: 150 }}
		onclick={closeMobileMenu}
	></button>
	<!-- Drawer -->
	<nav
		use:trapFocus
		tabindex="-1"
		aria-label="Navigation menu"
		in:slideFade={{ y: 10, duration: 200 }}
		out:slideFade={{ y: 10, duration: 150 }}
		class="no-doc-scroll no-scrollbar fixed inset-x-0 top-16 bottom-0 z-40 flex flex-col gap-2 surface-container-low p-4 focus:outline-none compact:hidden"
	>
		<NavLinks onnavigate={navigateFromMenu} />
	</nav>
{/if}
