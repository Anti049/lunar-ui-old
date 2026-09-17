<script lang="ts">
	import ColorSwatch from './ColorSwatch.svelte';
</script>

<div class="flex h-fit w-full flex-col items-center justify-center gap-1">
	<!-- Colors -->
	<div class="grid h-20 w-full grid-cols-4 gap-1 compact:h-24 medium:h-32">
		<ColorSwatch name="Primary" color="primary" interactive format="HEX" />
		<ColorSwatch name="Secondary" color="secondary" interactive format="HEX" />
		<ColorSwatch name="Tertiary" color="tertiary" interactive format="HEX" />
		<ColorSwatch name="Error" color="error" interactive format="HEX" />
	</div>
	<!-- On Colors -->
	<div class="grid h-8 w-full grid-cols-4 gap-1 compact:h-10 medium:h-12">
		<ColorSwatch
			class="items-center"
			name="On Primary"
			color="inverse-primary"
			direction="horizontal"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			class="items-center"
			name="On Secondary"
			color="inverse-secondary"
			direction="horizontal"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			class="items-center"
			name="On Tertiary"
			color="inverse-tertiary"
			direction="horizontal"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			class="items-center"
			name="On Error"
			color="inverse-error"
			direction="horizontal"
			interactive
			format="HEX"
		/>
	</div>
	<!-- Container Colors -->
	<div class="grid h-20 w-full grid-cols-4 gap-1 compact:h-24 medium:h-32">
		<ColorSwatch name="Primary Container" color="primary-container" interactive format="HEX" />
		<ColorSwatch name="Secondary Container" color="secondary-container" interactive format="HEX" />
		<ColorSwatch name="Tertiary Container" color="tertiary-container" interactive format="HEX" />
		<ColorSwatch name="Error Container" color="error-container" interactive format="HEX" />
	</div>
	<!-- On Container Colors -->
	<div class="grid h-8 w-full grid-cols-4 gap-1 compact:h-10 medium:h-12">
		<ColorSwatch
			class="items-center"
			name="On Primary Container"
			color="inverse-primary-container"
			direction="horizontal"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			class="items-center"
			name="On Secondary Container"
			color="inverse-secondary-container"
			direction="horizontal"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			class="items-center"
			name="On Tertiary Container"
			color="inverse-tertiary-container"
			direction="horizontal"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			class="items-center"
			name="On Error Container"
			color="inverse-error-container"
			direction="horizontal"
			interactive
			format="HEX"
		/>
	</div>
	<!-- Surface Colors -->
	<div class="grid h-20 w-full grid-cols-4 gap-1 compact:h-24 medium:h-32">
		<ColorSwatch name="Surface Dim" color="surface-dim" interactive format="HEX" />
		<ColorSwatch name="Surface" color="surface" interactive format="HEX" />
		<ColorSwatch name="Surface Bright" color="surface-bright" interactive format="HEX" />
		<div class="col-span-1 flex flex-col gap-1">
			<ColorSwatch
				name="On Surface"
				color="inverse-surface"
				class="h-1/2 w-full max-w-full items-center"
				direction="horizontal"
				interactive
				format="HEX"
			/>
			<ColorSwatch
				name="On Surface Variant"
				color="inverse-surface-variant"
				class="h-1/2 w-full max-w-full items-center"
				direction="horizontal"
				interactive
				format="HEX"
			/>
		</div>
	</div>
	<!-- Surface Container Colors -->
	<div class="grid h-20 w-full grid-cols-5 gap-1 compact:h-24 medium:h-32">
		<ColorSwatch
			name="Surface Container Lowest"
			color="surface-container-lowest"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			name="Surface Container Low"
			color="surface-container-low"
			interactive
			format="HEX"
		/>
		<ColorSwatch name="Surface Container" color="surface-container" interactive format="HEX" />
		<ColorSwatch
			name="Surface Container High"
			color="surface-container-high"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			name="Surface Container Highest"
			color="surface-container-highest"
			interactive
			format="HEX"
		/>
	</div>
	<!-- Extended Colors -->
	<div class="grid h-20 w-full grid-cols-4 gap-1 compact:h-24 medium:h-32">
		<ColorSwatch name="Success" color="success" interactive format="HEX" />
		<ColorSwatch name="Warning" color="warning" interactive format="HEX" />
		<ColorSwatch name="Alert" color="alert" interactive format="HEX" />
		<ColorSwatch name="Info" color="info" interactive format="HEX" />
	</div>
	<!-- On Extended Colors -->
	<div class="grid h-8 w-full grid-cols-4 gap-1 compact:h-10 medium:h-12">
		<ColorSwatch
			name="On Success"
			color="inverse-success"
			class="items-center"
			direction="horizontal"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			name="On Warning"
			color="inverse-warning"
			class="items-center"
			direction="horizontal"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			name="On Alert"
			color="inverse-alert"
			class="items-center"
			direction="horizontal"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			name="On Info"
			color="inverse-info"
			class="items-center"
			direction="horizontal"
			interactive
			format="HEX"
		/>
	</div>
	<!-- Extended Container Colors -->
	<div class="grid h-20 w-full grid-cols-4 gap-1 compact:h-24 medium:h-32">
		<ColorSwatch name="Success Container" color="success-container" interactive format="HEX" />
		<ColorSwatch name="Warning Container" color="warning-container" interactive format="HEX" />
		<ColorSwatch name="Alert Container" color="alert-container" interactive format="HEX" />
		<ColorSwatch name="Info Container" color="info-container" interactive format="HEX" />
	</div>
	<!-- On Extended Container Colors -->
	<div class="grid h-8 w-full grid-cols-4 gap-1 compact:h-10 medium:h-12">
		<ColorSwatch
			name="On Success Container"
			color="inverse-success-container"
			class="items-center"
			direction="horizontal"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			name="On Warning Container"
			color="inverse-warning-container"
			class="items-center"
			direction="horizontal"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			name="On Alert Container"
			color="inverse-alert-container"
			class="items-center"
			direction="horizontal"
			interactive
			format="HEX"
		/>
		<ColorSwatch
			name="On Info Container"
			color="inverse-info-container"
			class="items-center"
			direction="horizontal"
			interactive
			format="HEX"
		/>
	</div>
</div>
