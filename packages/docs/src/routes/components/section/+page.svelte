<script lang="ts">
	import { ChevronDown, ChevronUp, Hash } from '@lucide/svelte';

	let collapsed = $state(false);
</script>

<div class="flex flex-col w-full h-full gap-8">
	<div id="section" class="component-preview">
		<div class="component-preview-header">
			<a href="#section" class="component-preview-anchor">
				<Hash />
			</a>
			<p>Section</p>
		</div>
		<div class="component-preview-body">
			<div class="section">
				<div class="section-header">
					<div class="section-title-container">
						<p class="section-title">Section Title</p>
					</div>
				</div>
				<div class="section-body">
					<p class="text-body-medium">
						Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse
						lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor. Cras elementum
						ultrices diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi.
					</p>
				</div>
			</div>
		</div>
	</div>
	<div id="subtitle" class="component-preview">
		<div class="component-preview-header">
			<a href="#subtitle" class="component-preview-anchor">
				<Hash />
			</a>
			<p>Section with Subtitle</p>
		</div>
		<div class="component-preview-body">
			<div class="section">
				<div class="section-header">
					<div class="section-title-container">
						<p class="section-title">Section Title</p>
						<p class="section-subtitle">Section Subtitle</p>
					</div>
				</div>
				<div class="section-body">
					<p class="text-body-medium">
						Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse
						lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor. Cras elementum
						ultrices diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi.
					</p>
				</div>
			</div>
		</div>
	</div>
	<div id="collapsible" class="component-preview">
		<div class="component-preview-header">
			<a href="#collapsible" class="component-preview-anchor">
				<Hash />
			</a>
			<p>Collapsible Section</p>
		</div>
		<div class="component-preview-body">
			<div class="section section-collapsible">
				<div class="section-header">
					<div class="section-title-container">
						<p class="section-title">Section Title</p>
						<p class="section-subtitle">Section Subtitle</p>
					</div>
					<button
						class="button button-text button-square button-md swap"
						onclick={() => (collapsed = !collapsed)}
					>
						<input type="checkbox" bind:checked={collapsed} />
						<ChevronDown class="swap-off" />
						<ChevronUp class="swap-on" />
					</button>
				</div>
				<div class="section-body">
					<p class="text-body-medium">
						Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse
						lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor. Cras elementum
						ultrices diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi.
					</p>
				</div>
			</div>
		</div>
	</div>
</div>
