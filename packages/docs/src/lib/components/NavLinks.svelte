<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { ResolvedPathname } from '$app/types';
	import { cn, componentLinks, isDisabled } from '$lib/utils';
	import { MaskedImage } from '@anti049/lunar-ui-svelte';
	import { capitalCase } from 'change-case';
	import { MapPin, MapPinCheck, MapPinOff, MapPinPen, MapPinPlus } from '@lucide/svelte';

	// Fired when a link is activated, so hosts (e.g. the mobile menu) can react.
	let { onnavigate }: { onnavigate?: (event: MouseEvent, href: ResolvedPathname) => void } =
		$props();
</script>

<!-- Tooltips are opt-out here: navigation.css re-enables them only while the rail
	 is visible but collapsed, so they never duplicate a label that is on screen. -->
<div class="tooltip tooltip-right tooltip-center tooltip-disabled" data-tooltip="Home">
	<a
		href={resolve('/')}
		class="nav-link"
		data-active={page.url.pathname === '/' ? '' : undefined}
		onclick={(e) => onnavigate?.(e, resolve('/'))}
	>
		<MaskedImage src="/icons/navigation/house.svg" alt="Home" class="nav-link-icon" />
		<span class="nav-link-label">Home</span>
	</a>
</div>
<div class="h-0.5 w-full rounded-full surface-container"></div>
<div class="nav-rail-scroll scrollbar-hidden gap-2">
	{#each componentLinks as link (link.href)}
		<div
			class="tooltip tooltip-right tooltip-center tooltip-surface tooltip-disabled"
			data-tooltip={link.label}
		>
			<div class="flex flex-row items-center gap-2 tooltip-content">
				{link.label}
				<span
					class={cn(
						'badge badge-tonal text-caption-medium',
						link.status === 'planned' && 'badge-warning',
						link.status === 'up-next' && 'badge-primary',
						link.status === 'in-progress' && 'badge-info',
						link.status === 'completed' && 'badge-success',
						link.status === 'deprecated' && 'badge-error'
					)}>{capitalCase(link.status)}</span
				>
			</div>
			<a
				href={link.href}
				class={cn('nav-link nav-link-small', isDisabled(link) && 'disabled')}
				data-active={page.url.pathname === link.href ? '' : undefined}
				onclick={(e) => onnavigate?.(e, link.href)}
			>
				{#if link.icon}
					<MaskedImage src={link.icon} alt={link.label} class="nav-link-icon" />
				{/if}
				<span class="nav-link-label">{link.label}</span>
				<span
					class={cn(
						'badge badge-tonal',
						link.status === 'planned' && 'badge-warning',
						link.status === 'up-next' && 'badge-primary',
						link.status === 'in-progress' && 'badge-info',
						link.status === 'completed' && 'badge-success',
						link.status === 'deprecated' && 'badge-error'
					)}
				>
					{#if link.status === 'planned'}
						<MapPin class="aspect-square h-full" />
					{:else if link.status === 'up-next'}
						<MapPinPlus class="aspect-square h-full" />
					{:else if link.status === 'in-progress'}
						<MapPinPen class="aspect-square h-full" />
					{:else if link.status === 'completed'}
						<MapPinCheck class="aspect-square h-full" />
					{:else if link.status === 'deprecated'}
						<MapPinOff class="aspect-square h-full" />
					{/if}
				</span>
			</a>
		</div>
	{/each}
</div>
<div class="h-0.5 w-full rounded-full surface-container"></div>
<div class="tooltip tooltip-right tooltip-center tooltip-disabled" data-tooltip="Test">
	<a
		href={resolve('/test')}
		class="nav-link"
		data-active={page.url.pathname === '/test' ? '' : undefined}
		onclick={(e) => onnavigate?.(e, resolve('/test'))}
	>
		<MaskedImage src="/icons/navigation/test-tube-diagonal.svg" alt="Test" class="nav-link-icon" />
		<span class="nav-link-label">Test</span>
	</a>
</div>
<div class="tooltip tooltip-right tooltip-center tooltip-disabled" data-tooltip="Settings">
	<a
		href={resolve('/settings')}
		class="nav-link"
		data-active={page.url.pathname === '/settings' ? '' : undefined}
		onclick={(e) => onnavigate?.(e, resolve('/settings'))}
	>
		<MaskedImage src="/icons/navigation/settings.svg" alt="Settings" class="nav-link-icon" />
		<span class="nav-link-label">Settings</span>
	</a>
</div>
