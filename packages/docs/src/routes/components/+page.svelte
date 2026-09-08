<script lang="ts">
	import { cn, componentLinks, isDisabled } from '$lib/utils';
	import { MaskedImage } from '@anti049/lunar-ui-svelte';
	import { MapPin, MapPinCheck, MapPinOff, MapPinPen, MapPinPlus } from '@lucide/svelte';
	import { capitalCase } from 'change-case';
</script>

<div
	class="grid h-full w-full grid-cols-1 gap-4 compact:grid-cols-2 medium:grid-cols-3 expanded:grid-cols-4"
>
	{#each componentLinks as link (link.href)}
		<a
			href={link.href}
			class="flex flex-col gap-2 rounded-sm surface-container p-4 elevation-2 transition-all animated hover:-translate-y-2 hover:elevation-4 {isDisabled(
				link
			)
				? 'pointer-events-none opacity-50'
				: ''}"
		>
			<div class="flex h-fit flex-row items-center gap-2 text-title-medium font-semibold">
				{#if link.icon}
					<MaskedImage
						src={link.icon}
						alt={link.label}
						class="aspect-square h-8 bg-current object-contain"
					/>
				{/if}
				<span class="flex grow">{link.label}</span>
				<div
					class={cn(
						'tooltip tooltip-left',
						link.status === 'planned' && 'tooltip-warning',
						link.status === 'up-next' && 'tooltip-primary',
						link.status === 'in-progress' && 'tooltip-info',
						link.status === 'completed' && 'tooltip-success',
						link.status === 'deprecated' && 'tooltip-error'
					)}
					data-tooltip={capitalCase(link.status)}
				>
					<span
						class={cn(
							'badge aspect-square badge-tonal',
							link.status === 'planned' && 'badge-warning',
							link.status === 'up-next' && 'badge-primary',
							link.status === 'in-progress' && 'badge-info',
							link.status === 'completed' && 'badge-success',
							link.status === 'deprecated' && 'badge-error'
						)}
					>
						{#if link.status === 'planned'}
							<MapPin class="aspect-square h-6 w-6" />
						{:else if link.status === 'up-next'}
							<MapPinPlus class="aspect-square h-6 w-6" />
						{:else if link.status === 'in-progress'}
							<MapPinPen class="aspect-square h-6 w-6" />
						{:else if link.status === 'completed'}
							<MapPinCheck class="aspect-square h-6 w-6" />
						{:else if link.status === 'deprecated'}
							<MapPinOff class="aspect-square h-6 w-6" />
						{/if}
					</span>
				</div>
			</div>
			<div class="h-0.5 w-full rounded-full surface-container-high"></div>
			<div class="component-card-body">
				<p>{link.label} component description goes here.</p>
			</div>
		</a>
	{/each}
</div>
