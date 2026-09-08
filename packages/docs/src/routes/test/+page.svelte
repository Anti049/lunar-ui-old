<script lang="ts">
	import ComponentPreview from '$lib/demo/ComponentPreview.svelte';
</script>

<div class="flex h-full w-full grow flex-row items-center justify-center gap-4">
	<ComponentPreview id="before" title="Before" class="flex-1">
		<button class="button button-filled button-surface" disabled>Surface</button>
		<button class="button button-filled button-primary" disabled>Primary</button>
		<button class="button button-filled button-secondary">Secondary</button>
		<button class="button button-filled button-tertiary">Tertiary</button>
		<button class="button button-filled button-error">Error</button>
		<button class="button button-filled button-success">Success</button>
		<button class="button button-filled button-warning">Warning</button>
		<button class="button button-filled button-info">Info</button>
		<button class="button button-filled button-alert">Alert</button>
	</ComponentPreview>
	<ComponentPreview id="after" title="After" class="flex-1">
		<button class="btn btn-filled btn-surface" disabled>Surface</button>
		<button class="btn btn-filled btn-primary" disabled>Primary</button>
		<button class="btn btn-filled btn-secondary">Secondary</button>
		<button class="btn btn-filled btn-tertiary">Tertiary</button>
		<button class="btn btn-filled btn-error">Error</button>
		<button class="btn btn-filled btn-success">Success</button>
		<button class="btn btn-filled btn-warning">Warning</button>
		<button class="btn btn-filled btn-info">Info</button>
		<button class="btn btn-filled btn-alert">Alert</button>
	</ComponentPreview>
</div>
