<script lang="ts">
	import { cn } from '$lib/utils';
	import { Minus, Plus } from '@lucide/svelte';
	import ComponentPreview from '$lib/demo/ComponentPreview.svelte';
	import ComponentClassTable from '$lib/demo/ComponentClassTable.svelte';

	let checked = $state(true);
	let disabled = $state(true);
</script>

<div class="flex h-full w-full flex-col gap-8">
	<!-- Header/Classes -->
	<ComponentClassTable name="button" />
	<!-- Elevated -->
	<ComponentPreview id="elevated" title="Elevated Button">
		<button class="button button-elevated button-surface">Surface</button>
		<button class="button button-elevated button-primary">Primary</button>
		<button class="button button-elevated button-secondary">Secondary</button>
		<button class="button button-elevated button-tertiary">Tertiary</button>
		<button class="button button-elevated button-error">Error</button>
		<button class="button button-elevated button-success">Success</button>
		<button class="button button-elevated button-warning">Warning</button>
		<button class="button button-elevated button-info">Info</button>
		<button class="button button-elevated button-alert">Alert</button>
	</ComponentPreview>
	<!-- Filled -->
	<ComponentPreview id="filled" title="Filled Button">
		<button class="button button-filled button-surface">Surface</button>
		<button class="button button-filled button-primary">Primary</button>
		<button class="button button-filled button-secondary">Secondary</button>
		<button class="button button-filled button-tertiary">Tertiary</button>
		<button class="button button-filled button-error">Error</button>
		<button class="button button-filled button-success">Success</button>
		<button class="button button-filled button-warning">Warning</button>
		<button class="button button-filled button-info">Info</button>
		<button class="button button-filled button-alert">Alert</button>
	</ComponentPreview>
	<!-- Tonal -->
	<ComponentPreview id="tonal" title="Tonal Button">
		<button class="button button-tonal button-surface">Surface</button>
		<button class="button button-tonal button-primary">Primary</button>
		<button class="button button-tonal button-secondary">Secondary</button>
		<button class="button button-tonal button-tertiary">Tertiary</button>
		<button class="button button-tonal button-error">Error</button>
		<button class="button button-tonal button-success">Success</button>
		<button class="button button-tonal button-warning">Warning</button>
		<button class="button button-tonal button-info">Info</button>
		<button class="button button-tonal button-alert">Alert</button>
	</ComponentPreview>
	<!-- Outlined -->
	<ComponentPreview id="outlined" title="Outlined Button">
		<button class="button button-outlined button-surface">Surface</button>
		<button class="button button-outlined button-primary">Primary</button>
		<button class="button button-outlined button-secondary">Secondary</button>
		<button class="button button-outlined button-tertiary">Tertiary</button>
		<button class="button button-outlined button-error">Error</button>
		<button class="button button-outlined button-success">Success</button>
		<button class="button button-outlined button-warning">Warning</button>
		<button class="button button-outlined button-info">Info</button>
		<button class="button button-outlined button-alert">Alert</button>
	</ComponentPreview>
	<!-- Text -->
	<ComponentPreview id="text" title="Text Button">
		<button class="button button-text button-surface">Surface</button>
		<button class="button button-text button-primary">Primary</button>
		<button class="button button-text button-secondary">Secondary</button>
		<button class="button button-text button-tertiary">Tertiary</button>
		<button class="button button-text button-error">Error</button>
		<button class="button button-text button-success">Success</button>
		<button class="button button-text button-warning">Warning</button>
		<button class="button button-text button-info">Info</button>
		<button class="button button-text button-alert">Alert</button>
	</ComponentPreview>
	<!-- Sizes -->
	<ComponentPreview id="sizes" title="Button Sizes">
		<button class="button button-xs button-elevated button-surface">Extra Small</button>
		<button class="button button-sm button-elevated button-surface">Small</button>
		<button class="button button-md button-elevated button-surface">Medium</button>
		<button class="button button-lg button-elevated button-surface">Large</button>
		<button class="button button-xl button-elevated button-surface">Extra Large</button>
	</ComponentPreview>
	<!-- Button with Icon -->
	<ComponentPreview id="icon" title="Button with Icon">
		<button class="button button-elevated button-primary">
			<Plus />
			<span>Add</span>
		</button>
		<button class="button button-elevated button-secondary" onclick={() => (checked = !checked)}>
			<input
				type="checkbox"
				class="button-leading pointer-events-none checkbox checkbox-sm checkbox-secondary"
				tabindex="-1"
				bind:checked
			/>
			<span>Select All</span>
		</button>
		<button class="button button-elevated button-secondary">
			<span>Remove</span>
			<Minus />
		</button>
	</ComponentPreview>
	<!-- Disabled -->
	<ComponentPreview
		id="disabled"
		title="Disabled Buttons"
		description="Toggle the checkbox to enable or disable the buttons."
	>
		<button class="button button-elevated button-surface" {disabled}>Surface</button>
		<button class="button button-elevated button-primary" {disabled}>Primary</button>
		<button class="button button-elevated button-secondary" {disabled}>Secondary</button>
		<button class="button button-elevated button-tertiary" {disabled}>Tertiary</button>
		<button class="button button-elevated button-error" {disabled}>Error</button>
		<button class="button button-elevated button-success" {disabled}>Success</button>
		<button class="button button-elevated button-warning" {disabled}>Warning</button>
		<button class="button button-elevated button-info" {disabled}>Info</button>
		<button class="button button-elevated button-alert" {disabled}>Alert</button>
		<button
			class={cn('button button-elevated', disabled ? 'button-primary' : 'button-surface')}
			onclick={() => (disabled = !disabled)}
		>
			<input
				type="checkbox"
				class={cn(
					'button-leading pointer-events-none checkbox checkbox-sm checkbox-outlined',
					disabled && 'checkbox-primary'
				)}
				tabindex="-1"
				bind:checked={disabled}
			/>
			<span>{disabled ? 'Disabled' : 'Enabled'}</span>
		</button>
	</ComponentPreview>
	<!-- Square & Circle -->
	<ComponentPreview id="shapes" title="Button Shapes">
		<button class="button button-square button-elevated button-success">Square</button>
		<button class="button button-square button-elevated button-success">
			<Plus />
		</button>
		<button class="button button-circle button-elevated button-error">Circle</button>
		<button class="button button-circle button-elevated button-error">
			<Minus />
		</button>
	</ComponentPreview>
</div>
