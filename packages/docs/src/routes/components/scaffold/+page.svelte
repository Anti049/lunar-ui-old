<script lang="ts">
	import ComponentClassTable from '$lib/demo/ComponentClassTable.svelte';
</script>

<div class="flex h-full w-full flex-col gap-4">
	<!-- Header/Classes -->
	<ComponentClassTable name="scaffold" />
	<p class="text-body-medium text-on-surface-variant">
		The scaffold is the application shell used by the root layout. It lays out a full-viewport grid
		with header, sidebar and main content slots; navigation sizing lives in the navigation
		component.
	</p>
</div>
