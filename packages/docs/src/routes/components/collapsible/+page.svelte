<script lang="ts">
	import { Hash } from '@lucide/svelte';
</script>

<div class="flex flex-col w-full h-full gap-8">
	<div id="collapse-with-focus" class="component-preview">
		<div class="component-preview-header">
			<a href="#collapse-with-focus" class="component-preview-anchor">
				<Hash />
			</a>
			<p>Collapse with Focus</p>
		</div>
		<div class="component-preview-body">
			<div tabindex="0" class="collapse surface-container rounded-sm p-2">
				<div class="collapse-title text-title-medium-emphasized">Collapse Title</div>
				<div class="collapse-content test-body-medium">
					Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus
					tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor. Cras elementum ultrices
					diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi.
				</div>
			</div>
		</div>
	</div>
</div>
