# @anti049/lunar-ui-svelte

Svelte 5 components for [lunar-ui](../core).

## Install

```sh
npm install @anti049/lunar-ui @anti049/lunar-ui-svelte
```

`svelte` ^5 and `@anti049/lunar-ui` are peer dependencies — the components render
markup that the lunar-ui plugin styles, so you need both.

## Use

```css
/* app.css */
@import 'tailwindcss';
@plugin '@anti049/lunar-ui';
@import '@anti049/lunar-ui-svelte/styles.css';
```

That last import is not optional if you use these components. It registers the
packaged `.svelte` files as a Tailwind `@source`, so utility classes referenced
inside the components survive tree-shaking in your build.

```svelte
<script lang="ts">
	import { Scaffold, ThemedSVG, initRipple } from '@anti049/lunar-ui-svelte';
	import { onMount } from 'svelte';

	onMount(() => initRipple());
</script>

<Scaffold>
	{#snippet header()}<header>…</header>{/snippet}
	<p>Content</p>
</Scaffold>
```

## Exports

Components: `ColorSwatch`, `MaskedImage`, `Scaffold`, `ThemedSVG`, `ThemePreview`.

Actions: `ripple`, `initRipple`, `rippleRoot`.

Utilities: `cn` (clsx + tailwind-merge).

## Development

```sh
bun run dev     # svelte-package --watch
bun run build   # svelte-package + publint
bun run check   # svelte-check
```
