# 6. Vue bindings

Read [3. The shared contract](03-bindings.md) first.

`create-vue` scaffolds applications, not libraries, so the shape here is the same
as React's: scaffold with `create-vite`, then build in Vite's **library mode**.
Declarations need `vue-tsc` — plain `tsc` cannot read `<script setup>`.

---

## 1. Scaffold

```powershell
cd packages
bunx create-vite@latest vue --template vue-ts --no-interactive
cd .. && bun install
```

`create-vue` is the other option (`bunx create-vue@latest --ts --bare`) but it
produces a full application with routing and state-management prompts. For a
component library `create-vite` is less to strip.

---

## 2. Trim and restructure

```powershell
Set-Location packages/vue

Remove-Item -Recurse -Force src/App.vue, src/style.css, src/components/HelloWorld.vue, `
	src/assets, public -ErrorAction SilentlyContinue

mkdir src/lib/components, src/lib/composables, src/lib/utils, src/demo
Move-Item src/main.ts src/demo/main.ts -ErrorAction SilentlyContinue
```

---

## 3. `package.json`

**`packages/vue/package.json`** — replace the whole file.

```jsonc
{
	"name": "@anti049/test-vue",
	"version": "0.0.0",
	"type": "module",
	"license": "MIT",
	"repository": {
		"type": "git",
		"url": "git+https://github.com/Anti049/test.git",
		"directory": "packages/vue"
	},
	"scripts": {
		"dev": "vite",
		"build": "vite build && vue-tsc -p tsconfig.build.json --emitDeclarationOnly && publint",
		"check": "vue-tsc --noEmit"
	},
	"files": ["dist"],
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js"
		},
		"./styles.css": "./dist/styles.css",
		"./package.json": "./package.json"
	},
	"sideEffects": ["**/*.css"],
	"peerDependencies": {
		"@anti049/test": "^0.0.0",
		"vue": "^3.5.0"
	},
	"dependencies": {
		"clsx": "^2.1.1",
		"tailwind-merge": "^3.7.0"
	},
	"devDependencies": {
		"@anti049/test": "workspace:*",
		"@vitejs/plugin-vue": "^6.0.9",
		"vue": "^3.5.43",
		"vue-tsc": "^3.3.11",
		"typescript": "~6.0.3",
		"vite": "^8.3.0",
		"publint": "^0.3.24"
	},
	"publishConfig": { "access": "public", "provenance": true },
	"keywords": ["vue", "tailwindcss", "ui", "components", "design-system"]
}
```

**ESM only.** Unlike React, Vue 3's ecosystem is ESM throughout and nothing
meaningful still `require()`s a Vue component library. Adding CJS here is cost
without benefit.

---

## 4. `vite.config.ts`

**`packages/vue/vite.config.ts`** — replace the whole file. `create-vite` wrote
one that only builds an app.

One config serves both the library build and the playground, switching on
`command`:

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command }) => ({
	plugins: [vue(), tailwindcss()],

	// Playground while serving.
	root: command === 'serve' ? 'src/demo' : undefined,

	build: {
		lib: {
			entry: fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
			formats: ['es'],
			fileName: 'index'
		},
		rollupOptions: {
			// Never bundle the consumer's Vue, or you ship a second runtime and
			// component instances stop sharing reactivity.
			external: ['vue', '@anti049/test'],
			output: {
				// Keep styles.css at a predictable name for the exports map.
				assetFileNames: 'styles.css'
			}
		}
	}
}));
```

---

## 5. `tsconfig.build.json`

**`packages/vue/tsconfig.build.json`** — new file, beside the `tsconfig.json`
the scaffold already wrote. Leave that one alone; it is what the editor reads.

Vite emits the JavaScript; `vue-tsc` emits declarations separately.

```jsonc
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"outDir": "./dist",
		"declaration": true,
		"emitDeclarationOnly": true,
		"types": ["vite/client"]
	},
	"include": ["src/lib/**/*.ts", "src/lib/**/*.vue"],
	"exclude": ["src/demo/**"]
}
```

`include` must list `.vue` explicitly — `vue-tsc` will otherwise skip your
components and emit declarations that reference types it never generated.

---

## 6. The class-merge helper

**`packages/vue/src/lib/utils/cn.ts`** — new file, byte-identical to the
other two.

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
```

---

## 7. The `@source` registration

**`packages/vue/src/lib/styles.css`** — new file.

```css
/*
	Registers this package's components with the consumer's Tailwind scan.
	Without this import their build never looks inside node_modules and the
	components render unstyled.
*/
@source '../**/*.vue';
```

**`packages/vue/src/lib/index.ts`** — one import at the top, so Vite emits the
stylesheet as an asset:

```ts
import './styles.css';
```

That import is why `sideEffects` lists CSS — blanket-false would let a bundler
drop it.

---

## 8. Two components, and a composable

**`packages/vue/src/lib/components/Button.vue`** — new file.

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '../utils/cn';

type Variant = 'filled' | 'tonal' | 'outlined' | 'text';
type Size = 'sm' | 'md' | 'lg';

const props = withDefaults(
	defineProps<{
		variant?: Variant;
		size?: Size;
		class?: string;
	}>(),
	{ variant: 'filled', size: 'md', class: '' }
);

// `class` is in props because inheritAttrs is off; merge it explicitly so the
// consumer's value wins.
const classes = computed(() =>
	cn('button', `button-${props.variant}`, `button-${props.size}`, props.class)
);
</script>

<script lang="ts">
// Vue merges attrs onto the root by default, which would append the consumer's
// class rather than letting tailwind-merge resolve the conflict. Turning it off
// and binding $attrs manually keeps "last wins" true.
export default { inheritAttrs: false };
</script>

<template>
	<button :class="classes" v-bind="$attrs">
		<slot />
	</button>
</template>
```

The two `<script>` blocks are deliberate: `inheritAttrs` cannot be set inside
`<script setup>`, and without it Vue concatenates the consumer's `class` onto the
element _after_ yours, so `twMerge` never sees the conflict and both classes
apply.

---

**`packages/vue/src/lib/components/Badge.vue`** — new file. Simpler on purpose:
one `<script setup>` block rather than two, because it has no `$attrs` to
manage.

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '../utils/cn';

type Variant = 'primary' | 'neutral';

const props = withDefaults(
	defineProps<{
		variant?: Variant;
		class?: string;
	}>(),
	{ variant: 'primary', class: '' }
);

const classes = computed(() => cn('badge', `badge-${props.variant}`, props.class));
</script>

<template>
	<span :class="classes">
		<slot />
	</span>
</template>
```

No `inheritAttrs: false` here, unlike Button. This component takes no rest
attributes, so there is no conflict for Vue to concatenate — which is exactly
why Button needs the second `<script>` block and this one does not.

**`packages/vue/src/lib/composables/useRipple.ts`** — new file. The Vue
equivalent of the Svelte action.

```ts
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/*
	Returns a template ref to bind:

	    const el = useRipple();
	    <button ref="el">…</button>

	The class name below is created by JAVASCRIPT at runtime, so Tailwind's
	scanner can never see it — which is why the plugin routes that rule through
	addBase rather than addUtilities. See guide 0, decision 3.
*/
export function useRipple(): Ref<HTMLElement | null> {
	const element = ref<HTMLElement | null>(null);

	const onPointerDown = (event: PointerEvent): void => {
		const node = element.value;
		if (!node) return;

		const rect = node.getBoundingClientRect();
		const circle = document.createElement('span');

		const diameter = Math.max(rect.width, rect.height);
		circle.style.width = circle.style.height = `${diameter}px`;
		circle.style.left = `${event.clientX - rect.left - diameter / 2}px`;
		circle.style.top = `${event.clientY - rect.top - diameter / 2}px`;

		// The one and only place this string exists.
		circle.className = 'project-ripple';

		circle.addEventListener('animationend', () => circle.remove());
		node.append(circle);
	};

	/*
		Vue has no action primitive, so the listener is attached in onMounted.

		It must be onMounted, not setup body and not queueMicrotask: a template
		ref is null until the component has mounted, so anything earlier attaches
		to nothing and fails silently — the ripple simply never appears.

		onBeforeUnmount detaches it, so the listener cannot outlive the node in a
		long-lived app.
	*/
	onMounted(() => element.value?.addEventListener('pointerdown', onPointerDown));
	onBeforeUnmount(() => element.value?.removeEventListener('pointerdown', onPointerDown));

	return element;
}
```

**`packages/vue/tsconfig.json`** — replace the whole file. `create-vite` wrote a
three-file setup (`tsconfig.json` referencing `tsconfig.app.json` and
`tsconfig.node.json`); this replaces all three with one, and you can delete the
other two.

```jsonc
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		// The base config sets "types": [], so this names what Vue needs.
		"types": ["vite/client"],
		// Vite and vue-tsc own emission; this config is a checker only.
		"noEmit": true
	},
	// `.vue` must be listed explicitly — vue-tsc will not infer it from a
	// `**/*.ts` glob, and silently checks nothing if you leave it out.
	"include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

---

## 9. The barrel

**`packages/vue/src/lib/index.ts`** — new file.

```ts
import './styles.css';

export { default as Button } from './components/Button.vue';
export { default as Badge } from './components/Badge.vue';

export { useRipple } from './composables/useRipple';
export { cn } from './utils/cn';
```

Vue SFC imports do **not** take a `.js` extension — the `.vue` extension is part
of the specifier. This differs from the React package and is correct in both.

Optionally also export a plugin so consumers can register everything globally —
same file, appended:

```ts
import type { App } from 'vue';
import Button from './components/Button.vue';

export const ProjectName = {
	install(app: App) {
		app.component('PButton', Button);
	}
};
```

---

## 10. A local playground

**`packages/vue/src/demo/index.html`** — new file. Vite uses it as the
playground's entry because step 4 sets `root: 'src/demo'` when serving.

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<title>test — Vue</title>
	</head>
	<body>
		<div id="app"></div>
		<script type="module" src="./main.ts"></script>
	</body>
</html>
```

**`packages/vue/src/demo/main.ts`** — replace it. Step 2 moved the
scaffold's `main.ts` here.

```ts
import { createApp } from 'vue';
import App from './App.vue';
import './app.css';

createApp(App).mount('#app');
```

**`packages/vue/src/demo/App.vue`** — new file.

```vue
<script setup lang="ts">
import { Button, Badge } from '../lib';
</script>

<template>
	<div class="flex flex-wrap items-center gap-2 p-8">
		<Button variant="filled">Filled</Button>
		<Button variant="tonal">Tonal</Button>
		<Button variant="outlined" disabled>Disabled</Button>
		<Badge>3</Badge>
	</div>
</template>
```

**`packages/vue/src/demo/app.css`** — new file.

```css
@import 'tailwindcss';
@plugin '@anti049/test';
@source '../lib/**/*.vue';
```

```powershell
bun run --filter '@anti049/test-vue' dev
```

---

## 11. Build and verify

```powershell
cd packages/vue
bun run check      # vue-tsc --noEmit
bun run build      # vite build + vue-tsc + publint
ls dist            # index.js, index.d.ts, styles.css
```

```powershell
node --input-type=module -e "import('@anti049/test-vue').then(m => console.log(Object.keys(m)))"
```

Then confirm the export-parity test from [guide 3](03-bindings.md) passes now
that all three exist.

---

## Files after this phase

Fourteen files. Everything the Vue package contains at this point, in full.

| File                                            | Status   | Written in | Next touched by                     |
| ----------------------------------------------- | -------- | ---------- | ----------------------------------- |
| `packages/vue/package.json`                     | replaced | step 3     | [8](08-conventions.md) — versioning |
| `packages/vue/vite.config.ts`                   | replaced | step 4     | never                               |
| `packages/vue/tsconfig.json`                    | replaced | step 8     | never                               |
| `packages/vue/tsconfig.build.json`              | added    | step 5     | never                               |
| `packages/vue/src/lib/utils/cn.ts`              | added    | step 6     | never                               |
| `packages/vue/src/lib/styles.css`               | added    | step 7     | never                               |
| `packages/vue/src/lib/components/Button.vue`    | added    | step 8     | you, per component                  |
| `packages/vue/src/lib/components/Badge.vue`     | added    | step 8     | you, per component                  |
| `packages/vue/src/lib/composables/useRipple.ts` | added    | step 8     | never                               |
| `packages/vue/src/lib/index.ts`                 | added    | step 9     | one block per component             |
| `packages/vue/src/demo/index.html`              | added    | step 10    | never                               |
| `packages/vue/src/demo/main.ts`                 | replaced | step 10    | never                               |
| `packages/vue/src/demo/App.vue`                 | added    | step 10    | you, as a scratchpad                |
| `packages/vue/src/demo/app.css`                 | added    | step 10    | never                               |

Deleted by step 2: `src/App.vue`, `src/style.css`,
`src/components/HelloWorld.vue`, `src/assets/`, `public/`. Delete
`tsconfig.app.json` and `tsconfig.node.json` too — step 8 replaces all three
with one.

Build output, gitignored: `packages/vue/dist/`.

---

### `packages/vue/package.json`

```json
{
	"name": "@anti049/test-vue",
	"version": "0.0.0",
	"type": "module",
	"license": "MIT",
	"description": "Vue 3 components for the test design system.",
	"keywords": ["vue", "tailwindcss", "ui", "components", "design-system"],
	"repository": {
		"type": "git",
		"url": "git+https://github.com/Anti049/test.git",
		"directory": "packages/vue"
	},
	"scripts": {
		"dev": "vite",
		"build": "vite build && vue-tsc -p tsconfig.build.json --emitDeclarationOnly && publint",
		"check": "vue-tsc --noEmit"
	},
	"files": ["dist"],
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js"
		},
		"./styles.css": "./dist/styles.css",
		"./package.json": "./package.json"
	},
	"sideEffects": ["**/*.css"],
	"peerDependencies": {
		"@anti049/test": "^0.0.0",
		"vue": "^3.5.0"
	},
	"dependencies": {
		"clsx": "^2.1.1",
		"tailwind-merge": "^3.7.0"
	},
	"devDependencies": {
		"@anti049/test": "workspace:*",
		"@tailwindcss/vite": "^4.3.3",
		"@vitejs/plugin-vue": "^6.0.9",
		"publint": "^0.3.24",
		"tailwindcss": "^4.3.3",
		"typescript": "~6.0.3",
		"vite": "^8.3.0",
		"vue": "^3.5.43",
		"vue-tsc": "^3.3.11"
	},
	"publishConfig": { "access": "public", "provenance": true }
}
```

**ESM only**, unlike React. Vue 3's ecosystem is ESM throughout and nothing
meaningful still `require()`s a Vue component library, so dual output would be
cost without benefit.

**Two tools emit here.** `vite build` produces the JavaScript and the CSS;
`vue-tsc --emitDeclarationOnly` produces the types. Plain `tsc` cannot parse
`<script setup>` — it does not error, it skips the file, and you ship `.d.ts`
referencing components that have no declarations.

---

### `packages/vue/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

/*
	One config serves both the library build and the playground, switching on
	`command`. Two files would drift; this way the playground is guaranteed to
	compile the same components the build does.
*/
export default defineConfig(({ command }) => ({
	plugins: [vue(), tailwindcss()],

	// Playground while serving; the library entry when building.
	root: command === 'serve' ? 'src/demo' : undefined,

	build: {
		lib: {
			entry: fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
			formats: ['es'],
			fileName: 'index'
		},
		rollupOptions: {
			/*
				Never bundle the consumer's Vue, or you ship a second runtime and
				component instances stop sharing reactivity — a component from your
				package cannot then inject anything the app provided.
			*/
			external: ['vue', '@anti049/test'],
			output: {
				/*
					Vite names library assets after the entry, so without this you get
					`test-vue.css` and the `./styles.css` export points at
					nothing. Check `ls dist` after the first build.
				*/
				assetFileNames: 'styles.css'
			}
		}
	}
}));
```

---

### `packages/vue/tsconfig.json`

Replaces the scaffold's three-file setup. Delete `tsconfig.app.json` and
`tsconfig.node.json`.

```jsonc
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		// The base config sets "types": [], so this names what Vue needs.
		"types": ["vite/client"],
		// Vite and vue-tsc own emission; this config is a checker only.
		"noEmit": true
	},
	// `.vue` must be listed explicitly — vue-tsc will not infer it from a
	// `**/*.ts` glob, and silently checks nothing if you leave it out.
	"include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

---

### `packages/vue/tsconfig.build.json`

```jsonc
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"outDir": "./dist",
		"declaration": true,
		// Vite already emitted the JavaScript. This pass is types only.
		"emitDeclarationOnly": true,
		"types": ["vite/client"]
	},
	/*
		`include` must list `.vue` explicitly — vue-tsc will otherwise skip your
		components and emit declarations that reference types it never generated.
		The failure is silent: a green build, and `any` in the consumer's editor.
	*/
	"include": ["src/lib/**/*.ts", "src/lib/**/*.vue"],
	// The playground is not published.
	"exclude": ["src/demo/**"]
}
```

---

### `packages/vue/src/lib/utils/cn.ts`

Byte-identical to the Svelte and React copies.

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/*
	Merge class names, letting the LAST conflicting utility win.

	clsx flattens the arguments — strings, arrays, conditional objects — into one
	string. twMerge then resolves Tailwind conflicts within it, so a consumer
	passing `rounded-full` beats the component's own `rounded-sm` instead of both
	applying and the cascade picking whichever came later in the stylesheet.
*/
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
```

---

### `packages/vue/src/lib/styles.css`

```css
/*
	Registers this package's components with the CONSUMER's Tailwind scan.

	Tailwind does not look inside node_modules by default, so without this import
	their build never sees `class="button button-filled"` in your components and
	the classes are never emitted — the components render completely unstyled.

	`index.ts` imports this file, which is why `sideEffects` lists CSS: a
	blanket `false` would let a bundler drop the import in production builds
	only, so components are styled in dev and unstyled in prod.
*/
@source '../**/*.vue';
```

---

### `packages/vue/src/lib/components/Button.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '../utils/cn';

type Variant = 'filled' | 'tonal' | 'outlined' | 'text';
type Size = 'sm' | 'md' | 'lg';

const props = withDefaults(
	defineProps<{
		variant?: Variant;
		size?: Size;
		class?: string;
	}>(),
	{ variant: 'filled', size: 'md', class: '' }
);

/*
	`class` is declared as a prop because inheritAttrs is off below. Merging it
	explicitly through cn() is what lets the consumer's value win — Vue's own
	attribute merging would concatenate instead.
*/
const classes = computed(() =>
	cn('button', `button-${props.variant}`, `button-${props.size}`, props.class)
);
</script>

<script lang="ts">
/*
	A second, non-setup script block, because `inheritAttrs` cannot be set inside
	`<script setup>`.

	Without it Vue appends the consumer's `class` to the element AFTER yours, so
	twMerge never sees the conflict: `rounded-full` and `rounded-sm` both land on
	the element and the cascade picks whichever came later in the stylesheet.
	That reads exactly like a specificity bug and is not one.
*/
export default { inheritAttrs: false };
</script>

<template>
	<!-- v-bind="$attrs" re-applies everything except class, which is handled above. -->
	<button :class="classes" v-bind="$attrs">
		<slot />
	</button>
</template>
```

---

### `packages/vue/src/lib/components/Badge.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '../utils/cn';

type Variant = 'primary' | 'neutral';

const props = withDefaults(
	defineProps<{
		variant?: Variant;
		class?: string;
	}>(),
	{ variant: 'primary', class: '' }
);

const classes = computed(() => cn('badge', `badge-${props.variant}`, props.class));
</script>

<template>
	<span :class="classes">
		<slot />
	</span>
</template>
```

No `inheritAttrs: false` here, unlike Button — this component takes no rest
attributes, so there is no conflict for Vue to concatenate. That is exactly why
Button needs the second `<script>` block and this one does not.

`badge` and `badge-primary` are the classes
`packages/core/src/components/badge.css` defines in [guide 2](02-plugin.md)
step 3.

---

### `packages/vue/src/lib/composables/useRipple.ts`

```ts
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/*
	Returns a template ref to bind:

	    const el = useRipple();
	    <button ref="el">…</button>

	The class name below is created by JAVASCRIPT at runtime, so Tailwind's
	scanner can never see it — there is no literal `project-ripple` anywhere in
	the consumer's source, and their scan skips node_modules anyway.

	That is why the plugin routes that rule through addBase rather than
	addUtilities: addBase emits unconditionally, addUtilities is usage-gated and
	would silently emit nothing. See guide 0, decision 3.
*/
export function useRipple(): Ref<HTMLElement | null> {
	const element = ref<HTMLElement | null>(null);

	const onPointerDown = (event: PointerEvent): void => {
		const node = element.value;
		if (!node) return;

		const rect = node.getBoundingClientRect();
		const circle = document.createElement('span');

		// Diameter large enough to cover the element from any origin point.
		const diameter = Math.max(rect.width, rect.height);
		circle.style.width = circle.style.height = `${diameter}px`;
		circle.style.left = `${event.clientX - rect.left - diameter / 2}px`;
		circle.style.top = `${event.clientY - rect.top - diameter / 2}px`;

		// The one and only place this string exists.
		circle.className = 'project-ripple';

		circle.addEventListener('animationend', () => circle.remove());
		node.append(circle);
	};

	/*
		Vue has no action primitive, so the listener is attached in onMounted.

		It must be onMounted, not the setup body and not queueMicrotask: a
		template ref is null until the component has mounted, so anything earlier
		attaches to nothing and fails silently — the ripple simply never appears.
	*/
	onMounted(() => element.value?.addEventListener('pointerdown', onPointerDown));
	onBeforeUnmount(() => element.value?.removeEventListener('pointerdown', onPointerDown));

	return element;
}
```

---

### `packages/vue/src/lib/index.ts`

```ts
/*
	Imported for its side effect only: it carries the `@source` registration
	that tells a consumer's Tailwind where this package's components live.
	Vite emits it as an asset, which is why `assetFileNames` in vite.config.ts
	pins the name.
*/
import './styles.css';

/*
	Vue SFC imports keep the `.vue` extension — it is part of the specifier, not
	something `moduleResolution: bundler` rewrites. This differs from the React
	package's `.js` extensions and is correct in both.
*/
export { default as Button } from './components/Button.vue';
export { default as Badge } from './components/Badge.vue';

export { useRipple } from './composables/useRipple';
export { cn } from './utils/cn';

/*
	Optional: a Vue plugin, so a consumer can register everything globally with
	`app.use(ProjectName)` rather than importing per component. Prefix the global
	names — `Button` alone will collide with something in any real app.
*/
import type { App } from 'vue';
import Button from './components/Button.vue';
import Badge from './components/Badge.vue';

export const ProjectName = {
	install(app: App) {
		app.component('PButton', Button);
		app.component('PBadge', Badge);
	}
};
```

---

### `packages/vue/src/demo/index.html`

Vite uses this as the playground's entry, because `vite.config.ts` sets
`root: 'src/demo'` when serving.

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>test — Vue</title>
	</head>
	<body>
		<div id="app"></div>
		<script type="module" src="./main.ts"></script>
	</body>
</html>
```

---

### `packages/vue/src/demo/main.ts`

```ts
import { createApp } from 'vue';
import App from './App.vue';
import './app.css';

createApp(App).mount('#app');
```

---

### `packages/vue/src/demo/App.vue`

```vue
<script setup lang="ts">
// From the source barrel, not the built package, so the playground reflects
// your edits without a build.
import { Button, Badge } from '../lib';
</script>

<template>
	<div class="flex flex-wrap items-center gap-2 p-8">
		<Button variant="filled">Filled</Button>
		<Button variant="tonal">Tonal</Button>
		<Button variant="outlined" disabled>Disabled</Button>
		<Badge>3</Badge>
	</div>
</template>
```

---

### `packages/vue/src/demo/app.css`

```css
/*
	The playground's stylesheet, never published — `files` lists only `dist`.

	It loads the plugin exactly as a consumer would. If the playground needs
	something a consumer could not write, that is a bug in the plugin.
*/
@import 'tailwindcss';
@plugin '@anti049/test';

/*
	Scan this package's own components. Without it the playground renders
	unstyled even though `lib/styles.css` exists — that file is for CONSUMERS,
	and this app is not consuming the built package.
*/
@source '../lib/**/*.vue';
```

---

## Traps

> **`tsc` instead of `vue-tsc`.** Plain `tsc` cannot parse `<script setup>`. It
> does not error loudly — it skips the file, and you ship `.d.ts` files
> referencing components that have no declarations.
>
> **How to tell:** a consumer's editor shows `any` for your components while your
> own build is green.

> **`inheritAttrs` left on.** The consumer's `class` is concatenated after yours
> rather than merged, so `rounded-full` and `rounded-sm` both apply and the
> cascade picks whichever came later in the stylesheet. Looks like a specificity
> bug and is not.

> **`.vue` files missing from `tsconfig.build.json`'s `include`.** Silent — you
> get a `dist` with JavaScript and incomplete types.

> **Bundling Vue.** Without `external: ['vue']` you ship a second Vue runtime;
> reactivity stops being shared and component instances behave as if they are in
> a different app.

> **The emitted CSS filename changes.** Vite names library assets from the entry
> unless told otherwise, so without `assetFileNames` you get something like
> `test-vue.css` and the `./styles.css` export points at nothing. Check
> `ls dist` after the first build.

---

## Commit

Verify, then commit:

```powershell
bun run --filter '@anti049/test-vue' check
git add -A
git commit -m "feat(vue): add Vue bindings"
```

All three bindings now exist, so the export-parity test from
[guide 3](03-bindings.md) can finally run. Build everything first —
`bun run build:packages` — then `bun test packages/core/test/unit`. If it
fails, one binding is missing a component the other two have; fix that
before committing rather than after.

---

## Checkpoint

Two checks. The parity test from [guide 3](03-bindings.md) goes green inside the
repository, and a Vite + Vue app installs the tarball and ships styled
production output.

**1. Parity, now that all three bindings exist.**

```powershell
bun run build:packages
bun test packages/core/test/unit/export-parity.test.ts    # passes
```

**2. A real consumer.** A `create-vite` Vue app in
`$env:TEMP\test-checkpoint\06-vue`. Run from the repository root:

```powershell
$cp   = "$env:TEMP\test-checkpoint"
$pkgs = "$cp\pkgs"
$app  = "$cp\06-vue"
Remove-Item -Recurse -Force $pkgs, $app -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $pkgs | Out-Null

'core', 'vue' | ForEach-Object {
	Push-Location "packages/$_"
	npm pack --pack-destination $pkgs | Out-Null
	Pop-Location
}
$tgz = (Get-ChildItem $pkgs -Filter *.tgz).FullName
$vue = $tgz | Where-Object { $_ -match '-vue-' }

tar -xzOf $vue package/package.json | Select-String 'workspace:'   # prints nothing
# Vite's library build must not have compiled this into plain CSS: it has to
# reach the consumer as an @source registration, or it registers nothing.
tar -xzOf $vue package/dist/styles.css                             # @source …

Push-Location $cp
bunx create-vite@latest 06-vue --template vue-ts --no-interactive
Set-Location 06-vue
npm install --no-audit --no-fund
npm install --no-audit --no-fund -D tailwindcss '@tailwindcss/vite'
npm install --no-audit --no-fund $tgz
```

**`vite.config.ts`** — replace it:

```ts
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [vue(), tailwindcss()] });
```

**`src/style.css`** — replace it. `main.ts` already imports it.

```css
@import 'tailwindcss';
@plugin '@anti049/test';
@import '@anti049/test-vue/styles.css';
```

**`src/App.vue`** — replace it:

```vue
<script setup lang="ts">
import { Badge, Button } from '@anti049/test-vue';
</script>

<template>
	<Button variant="filled">Filled</Button>
	<Badge>3</Badge>
</template>
```

```powershell
npm run build          # vue-tsc -b && vite build — type-checks against the published .d.ts

$css = (Get-ChildItem dist/assets -Filter *.css).FullName
(Select-String -Path $css -Pattern '\.badge\b').Count           # > 0
(Select-String -Path $css -Pattern '\.badge-primary\b').Count   # > 0
(Select-String -Path $css -Pattern '\.button-filled\b').Count   # > 0

Pop-Location
Remove-Item -Recurse -Force $cp
```

**Passes when** the parity test passes and every line prints what its comment
says.

**If it does not:** a parity failure names the component one binding is
missing — add it there rather than removing it from the other two. A
`dist/styles.css` full of compiled rules instead of an `@source` line means
the library build processed it through Tailwind; copy it into `dist/` after
`vite build` instead, the way the React package does.

---

Next: [The docs site](07-docs.md)
