<script lang="ts">
	import ComponentPreview from '$lib/demo/ComponentPreview.svelte';
	import ComponentClassTable from '$lib/demo/ComponentClassTable.svelte';
</script>

<div class="flex h-full w-full flex-col gap-4">
	<!-- Header/Classes -->
	<ComponentClassTable name="tooltip" />
	<!-- Tooltip -->
	<ComponentPreview id="tooltip" title="Tooltip">
		<div class="tooltip" data-tooltip="This is a tooltip">
			<button class="button button-md button-elevated button-surface">Hover me</button>
		</div>
	</ComponentPreview>
	<!-- Tooltip with tooltip-content -->
	<ComponentPreview id="tooltip-content" title="Tooltip with tooltip-content">
		<div class="tooltip tooltip-surface">
			<div class="tooltip-content">
				<div class="-rotate-10 animate-bounce text-title-large-emphasized text-primary">
					Tooltip!
				</div>
			</div>
			<button class="button button-md button-elevated button-surface">Hover me</button>
		</div>
	</ComponentPreview>
	<!-- Force open -->
	<ComponentPreview id="tooltip-force-open" title="Force Open">
		<div class="tooltip-open tooltip" data-tooltip="This tooltip is forcefully open">
			<button class="button button-md button-elevated button-surface">Hover me</button>
		</div>
	</ComponentPreview>
	<!-- Top -->
	<ComponentPreview id="tooltip-top" title="Top">
		<div class="flex flex-row items-center justify-center gap-8">
			<div class="tooltip-open tooltip tooltip-top tooltip-start" data-tooltip="Left">
				<button class="button button-md button-elevated button-surface">Hover me</button>
			</div>
			<div class="tooltip-open tooltip tooltip-top tooltip-center" data-tooltip="Center">
				<button class="button button-md button-elevated button-surface">Hover me</button>
			</div>
			<div class="tooltip-open tooltip tooltip-top tooltip-end" data-tooltip="Right">
				<button class="button button-md button-elevated button-surface">Hover me</button>
			</div>
		</div>
	</ComponentPreview>
	<!-- Bottom -->
	<ComponentPreview id="tooltip-bottom" title="Bottom">
		<div class="flex flex-row items-center justify-center gap-8">
			<div class="tooltip-open tooltip tooltip-bottom tooltip-start" data-tooltip="Left">
				<button class="button button-md button-elevated button-surface">Hover me</button>
			</div>
			<div class="tooltip-open tooltip tooltip-bottom tooltip-center" data-tooltip="Center">
				<button class="button button-md button-elevated button-surface">Hover me</button>
			</div>
			<div class="tooltip-open tooltip tooltip-bottom tooltip-end" data-tooltip="Right">
				<button class="button button-md button-elevated button-surface">Hover me</button>
			</div>
		</div>
	</ComponentPreview>
	<!-- Left -->
	<ComponentPreview id="tooltip-left" title="Left">
		<div class="flex flex-col items-center justify-center gap-8">
			<div class="tooltip-open tooltip tooltip-left tooltip-start" data-tooltip="Top">
				<button class="button button-md button-elevated button-surface">Hover me</button>
			</div>
			<div class="tooltip-open tooltip tooltip-left tooltip-center" data-tooltip="Center">
				<button class="button button-md button-elevated button-surface">Hover me</button>
			</div>
			<div class="tooltip-open tooltip tooltip-left tooltip-end" data-tooltip="Bottom">
				<button class="button button-md button-elevated button-surface">Hover me</button>
			</div>
		</div>
	</ComponentPreview>
	<!-- Right -->
	<ComponentPreview id="tooltip-right" title="Right">
		<div class="flex flex-col items-center justify-center gap-8">
			<div class="tooltip-open tooltip tooltip-right tooltip-start" data-tooltip="Top">
				<button class="button button-md button-elevated button-surface">Hover me</button>
			</div>
			<div class="tooltip-open tooltip tooltip-right tooltip-center" data-tooltip="Center">
				<button class="button button-md button-elevated button-surface">Hover me</button>
			</div>
			<div class="tooltip-open tooltip tooltip-right tooltip-end" data-tooltip="Bottom">
				<button class="button button-md button-elevated button-surface">Hover me</button>
			</div>
		</div>
	</ComponentPreview>
	<!-- Colors -->
	<ComponentPreview id="tooltip-colors" title="Colors">
		<div class="tooltip tooltip-top" data-tooltip="Default">
			<button class="button button-md button-tonal">Default</button>
		</div>
		<div class="tooltip tooltip-top tooltip-surface" data-tooltip="Surface">
			<button class="button button-md button-tonal button-surface">Surface</button>
		</div>
		<div class="tooltip tooltip-top tooltip-primary" data-tooltip="Primary">
			<button class="button button-md button-tonal button-primary">Primary</button>
		</div>
		<div class="tooltip tooltip-top tooltip-secondary" data-tooltip="Secondary">
			<button class="button button-md button-tonal button-secondary">Secondary</button>
		</div>
		<div class="tooltip tooltip-top tooltip-tertiary" data-tooltip="Tertiary">
			<button class="button button-md button-tonal button-tertiary">Tertiary</button>
		</div>
		<div class="tooltip tooltip-top tooltip-error" data-tooltip="Error">
			<button class="button button-md button-tonal button-error">Error</button>
		</div>
		<div class="tooltip tooltip-top tooltip-success" data-tooltip="Success">
			<button class="button button-md button-tonal button-success">Success</button>
		</div>
		<div class="tooltip tooltip-top tooltip-warning" data-tooltip="Warning">
			<button class="button button-md button-tonal button-warning">Warning</button>
		</div>
		<div class="tooltip tooltip-top tooltip-info" data-tooltip="Info">
			<button class="button button-md button-tonal button-info">Info</button>
		</div>
		<div class="tooltip tooltip-top tooltip-alert" data-tooltip="Alert">
			<button class="button button-md button-tonal button-alert">Alert</button>
		</div>
	</ComponentPreview>
</div>
