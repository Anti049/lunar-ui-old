<script lang="ts">
	import ComponentPreview from '$lib/demo/ComponentPreview.svelte';
	import ComponentClassTable from '$lib/demo/ComponentClassTable.svelte';
</script>

<div class="flex h-full w-full flex-col gap-4">
	<!-- Header/Classes -->
	<ComponentClassTable name="badge" />
	<!-- Variants -->
	<ComponentPreview id="badge-variants" title="Variants">
		<span class="badge badge-filled badge-primary">Filled</span>
		<span class="badge badge-tonal badge-primary">Tonal</span>
		<span class="badge badge-elevated badge-primary">Elevated</span>
		<span class="badge badge-outlined badge-primary">Outlined</span>
		<span class="badge badge-text badge-primary">Text</span>
	</ComponentPreview>
	<!-- Colors -->
	<ComponentPreview id="badge-colors" title="Colors">
		<span class="badge badge-filled badge-surface">Surface</span>
		<span class="badge badge-filled badge-primary">Primary</span>
		<span class="badge badge-filled badge-secondary">Secondary</span>
		<span class="badge badge-filled badge-tertiary">Tertiary</span>
		<span class="badge badge-filled badge-error">Error</span>
		<span class="badge badge-filled badge-success">Success</span>
		<span class="badge badge-filled badge-warning">Warning</span>
		<span class="badge badge-filled badge-info">Info</span>
		<span class="badge badge-filled badge-alert">Alert</span>
	</ComponentPreview>
	<!-- Dot -->
	<ComponentPreview id="badge-dot" title="Dot" description="An empty badge renders as a dot.">
		<span class="badge badge-filled badge-error"></span>
		<span class="badge badge-filled badge-success"></span>
		<span class="badge badge-filled badge-info"></span>
	</ComponentPreview>
	<!-- Animated -->
	<ComponentPreview id="badge-animated" title="Animated">
		<span class="badge badge-animate-bounce badge-filled badge-primary">New</span>
		<span class="badge badge-animate-alert badge-filled badge-error">!</span>
	</ComponentPreview>
</div>
