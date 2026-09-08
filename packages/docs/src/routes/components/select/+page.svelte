<script lang="ts">
	import ComponentPreview from '$lib/demo/ComponentPreview.svelte';
	import { cn } from '$lib/utils';

	let values = [
		{
			key: 'Surface',
			value: 'select-surface'
		},
		{
			key: 'Primary',
			value: 'select-primary'
		},
		{
			key: 'Secondary',
			value: 'select-secondary'
		},
		{
			key: 'Tertiary',
			value: 'select-tertiary'
		},
		{
			key: 'Error',
			value: 'select-error'
		},
		{
			key: 'Success',
			value: 'select-success'
		},
		{
			key: 'Warning',
			value: 'select-warning'
		},
		{
			key: 'Info',
			value: 'select-info'
		},
		{
			key: 'Alert',
			value: 'select-alert'
		}
	];
	let elevatedValue = $state(values[0]);
	let filledValue = $state(values[0]);
	let tonalValue = $state(values[0]);
	let outlinedValue = $state(values[0]);
	let textValue = $state(values[0]);
	let sizes = [
		{
			key: 'Extra Small',
			value: 'select-xs'
		},
		{
			key: 'Small',
			value: 'select-sm'
		},
		{
			key: 'Medium',
			value: 'select-md'
		},
		{
			key: 'Large',
			value: 'select-lg'
		},
		{
			key: 'Extra Large',
			value: 'select-xl'
		}
	];
	let sizeValue = $state(sizes[2]);
</script>

<div class="flex h-full w-full flex-col gap-8">
	<!-- Header -->
	<div class="flex flex-col gap-2">
		<p class="text-headline-large-emphasized text-primary">Select</p>
		<p class="text-body-medium text-on-surface-variant">
			Select is used to pick a value from a list of options.
		</p>
	</div>
	<!-- Elevated -->
	<ComponentPreview
		id="elevated"
		title="Elevated Select"
		description="Elevated selects are used for high emphasis actions."
	>
		<select
			class={cn('select w-full max-w-64 select-elevated', elevatedValue.value)}
			bind:value={elevatedValue.value}
		>
			{#each values as item (item.value)}
				<option value={item.value}>{item.key}</option>
			{/each}
		</select>
	</ComponentPreview>
	<!-- Filled -->
	<ComponentPreview
		id="filled"
		title="Filled Select"
		description="Filled selects are used for medium emphasis actions."
	>
		<select
			class={cn('select w-full max-w-64 select-filled', filledValue.value)}
			bind:value={filledValue.value}
		>
			{#each values as item (item.value)}
				<option value={item.value}>{item.key}</option>
			{/each}
		</select>
	</ComponentPreview>
	<!-- Tonal -->
	<ComponentPreview
		id="tonal"
		title="Tonal Select"
		description="Tonal selects are used for medium emphasis actions."
	>
		<select
			class={cn('select w-full max-w-64 select-tonal', tonalValue.value)}
			bind:value={tonalValue.value}
		>
			{#each values as item (item.value)}
				<option value={item.value}>{item.key}</option>
			{/each}
		</select>
	</ComponentPreview>
	<!-- Outlined -->
	<ComponentPreview
		id="outlined"
		title="Outlined Select"
		description="Outlined selects are used for medium emphasis actions."
	>
		<select
			class={cn('select w-full max-w-64 select-outlined', outlinedValue.value)}
			bind:value={outlinedValue.value}
		>
			{#each values as item (item.value)}
				<option value={item.value}>{item.key}</option>
			{/each}
		</select>
	</ComponentPreview>
	<!-- Text -->
	<ComponentPreview
		id="text"
		title="Text Select"
		description="Text selects are used for medium emphasis actions."
	>
		<select
			class={cn('select w-full max-w-64 select-text', textValue.value)}
			bind:value={textValue.value}
		>
			{#each values as item (item.value)}
				<option value={item.value}>{item.key}</option>
			{/each}
		</select>
	</ComponentPreview>
	<!-- Sizes -->
	<ComponentPreview
		id="sizes"
		title="Select Sizes"
		description="Selects can be sized to fit the needs of the user."
	>
		<select
			class={cn('select w-full max-w-64 select-elevated', sizeValue.value)}
			bind:value={sizeValue.value}
		>
			{#each sizes as item (item.value)}
				<option value={item.value}>{item.key}</option>
			{/each}
		</select>
	</ComponentPreview>
	<!-- Disabled -->
	<ComponentPreview
		id="disabled"
		title="Disabled Select"
		description="Selects can be disabled to prevent user interaction."
	>
		<select class="select w-full max-w-64 select-tonal" disabled={true}>
			{#each values as item (item.value)}
				<option value={item.value}>{item.key}</option>
			{/each}
		</select>
	</ComponentPreview>
	<!-- Native Select -->
	<ComponentPreview
		id="native-select"
		title="Native Select"
		description="Native selects can also be used for consistent styling across different platforms."
	>
		<select
			class={cn('select w-full max-w-64 select-tonal', tonalValue.value)}
			bind:value={tonalValue.value}
		>
			{#each values as item (item.value)}
				<option value={item.value}>{item.key}</option>
			{/each}
		</select>
		<select
			class={cn('select w-full max-w-64 select-filled', filledValue.value)}
			bind:value={filledValue.value}
		>
			{#each values as item (item.value)}
				<option value={item.value}>{item.key}</option>
			{/each}
		</select>
	</ComponentPreview>
</div>
