<script lang="ts">
	import ComponentPreview from '$lib/demo/ComponentPreview.svelte';
	import ComponentClassTable from '$lib/demo/ComponentClassTable.svelte';
	import { Moon, Sun } from '@lucide/svelte';
</script>

<div class="flex h-full w-full flex-col gap-4">
	<!-- Header/Classes -->
	<ComponentClassTable name="swap" />
	<!-- Basic -->
	<ComponentPreview id="swap" title="Swap" description="Click to toggle between two elements.">
		<label class="swap text-title-large-emphasized">
			<input type="checkbox" />
			<span class="text-primary swap-on">ON</span>
			<span class="text-on-surface-variant swap-off">OFF</span>
		</label>
	</ComponentPreview>
	<!-- Rotate -->
	<ComponentPreview
		id="swap-rotate"
		title="Rotate"
		description="Rotates the icons as they cross-fade."
	>
		<label class="swap swap-rotate">
			<input type="checkbox" />
			<Sun class="size-8 swap-on" />
			<Moon class="size-8 swap-off" />
		</label>
	</ComponentPreview>
	<!-- Flip -->
	<ComponentPreview id="swap-flip" title="Flip" description="3D flip between the icons.">
		<label class="swap swap-flip">
			<input type="checkbox" />
			<Sun class="size-8 swap-on" />
			<Moon class="size-8 swap-off" />
		</label>
	</ComponentPreview>
</div>
