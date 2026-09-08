<script lang="ts">
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils';
	import {
		ArrowLeftRight,
		Info,
		PaintBucket,
		Puzzle,
		RulerDimensionLine,
		ScanBox,
		Shapes,
		Wrench,
		type LucideIcon
	} from '@lucide/svelte';
	import { capitalCase } from 'change-case';
	import { getComponentDoc, type ComponentClass, type ComponentClassType } from '$lib/docs';

	// Types
	interface ComponentDocProps {
		/** Slug of the doc under `src/lib/docs/components`, e.g. `tooltip`. */
		name: string;
		class?: string;
	}
	let typeDescriptors: Record<
		ComponentClassType,
		{ icon: LucideIcon | null; description: string; color: string }
	> = {
		component: {
			icon: null,
			description: 'Main component class',
			color: 'surface-container'
		},
		part: {
			icon: Puzzle,
			description: 'Class for a part of the component',
			color: 'primary-container'
		},
		modifier: {
			icon: Wrench,
			description: 'Modifies behavior of component/part',
			color: 'info-container'
		},
		direction: {
			icon: ArrowLeftRight,
			description: 'Direction of component/part',
			color: 'tertiary-container'
		},
		placement: {
			icon: ScanBox,
			description: 'Placement of component/part',
			color: 'secondary-container'
		},
		style: {
			icon: Shapes,
			description: 'Visual style of component/part',
			color: 'warning-container'
		},
		color: {
			icon: PaintBucket,
			description: 'Color of component/part',
			color: 'success-container'
		},
		size: {
			icon: RulerDimensionLine,
			description: 'Size of component/part',
			color: 'alert-container'
		}
	};

	// Props
	let { name, class: className = '' }: ComponentDocProps = $props();

	// Variables
	let doc = $derived(getComponentDoc(name));
	let prefix = $state('');
	let sortedClasses = $derived(sortClasses(doc?.classes ?? []));

	// Functions
	function sortClasses(classes: ComponentClass[]): ComponentClass[] {
		const typeOrder: ComponentClassType[] = [
			'component',
			'part',
			'modifier',
			'direction',
			'placement',
			'style',
			'color',
			'size'
		];
		return classes.sort((a, b) => {
			const typeComparison = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
			if (typeComparison !== 0) return typeComparison;
			// Don't change the order if the types are the same
			return 0;
		});
	}
</script>

{#if doc}
	<div class="flex flex-col gap-2">
		<p class="text-headline-large-emphasized text-primary">{doc.name}</p>
		<p class="text-body-medium text-on-surface-variant">{doc.description}</p>
	</div>
	<div class="h-fit max-h-107.5 overflow-x-auto rounded-sm border-2 border-outline-variant/50">
		<table class={cn('table-pin-rows table table-zebra table-md', className)}>
			<thead>
				<tr>
					<th class="flex flex-row items-center gap-2">
						<!-- TODO: Replace with proper input later -->
						<div
							class={cn(
								'tooltip tooltip-bottom w-fit! tooltip-start tooltip-info',
								prefix.length > 0 && 'tooltip-open'
							)}
						>
							{#if prefix.length > 0}
								<div class="w-fit max-w-1000 tooltip-content">
									<div class="flex flex-row items-center gap-2">
										<Info class="h-4 w-4 text-on-info" />
										<span class="pointer-events-auto text-caption-large text-nowrap"
											>To use a custom prefix, <a
												href={resolve('/')}
												class="text-info-container underline">add your prefix string to config</a
											></span
										>
									</div>
								</div>
							{/if}
							<input
								type="text"
								placeholder="prefix-"
								class="w-32 rounded-sm surface px-2 py-1 text-caption-large"
								bind:value={prefix}
							/>
						</div>
						Class
					</th>
					<th>Type</th>
					<th>Description</th>
				</tr>
			</thead>
			<tbody>
				{#each sortedClasses as { className, type, description } (className)}
					{@const Icon = typeDescriptors[type].icon}
					<tr>
						<td>
							<code>{prefix}{className}</code>
						</td>
						<td>
							<div
								class={cn(
									'tooltip flex w-fit cursor-help flex-row items-center gap-2 rounded-sm px-2 py-1 select-none',
									typeDescriptors[type].color
								)}
								data-tooltip={typeDescriptors[type].description}
							>
								{#if typeDescriptors[type].icon}
									<Icon class="h-4 w-4" />
								{/if}
								<span>{capitalCase(type)}</span>
							</div>
						</td>
						<td>{description}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
