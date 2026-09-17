# 05 — The Vue Component Library (`@scope/project-name-vue`)

The third framework library. Same contract as Svelte
([03-svelte-package.md](03-svelte-package.md)) and React
([04-react-package.md](04-react-package.md)): components emit the plugin's class
names and own only behavior. Vue's specifics are Single-File Components (SFCs),
`vue-tsc` for type-aware builds, and Vite's library mode.

## 1. Scaffold

```sh
cd packages
mkdir vue && cd vue
```

`packages/vue/package.json`:

```jsonc
{
	"name": "@scope/project-name-vue",
	"version": "0.0.0",
	"description": "Vue 3 components for project-name.",
	"type": "module",
	"repository": {
		"type": "git",
		"url": "git+https://github.com/your-org/project-name.git",
		"directory": "packages/vue"
	},
	"scripts": {
		"build": "vite build && vue-tsc --declaration --emitDeclarationOnly -p tsconfig.build.json && publint",
		"dev": "vite build --watch",
		"check": "vue-tsc --noEmit",
		"test": "vitest run",
		"prepack": "bun run build"
	},
	"sideEffects": ["**/*.css"],
	"types": "./dist/index.d.ts",
	"files": ["dist"],
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js",
			"default": "./dist/index.js"
		},
		"./styles.css": "./dist/styles.css",
		"./package.json": "./package.json"
	},
	"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org" },
	"dependencies": { "clsx": "^2.1.0", "tailwind-merge": "^3.0.0" },
	"peerDependencies": { "@scope/project-name": "workspace:^", "vue": "^3.5.0" },
	"devDependencies": {
		"@scope/project-name": "workspace:*",
		"@testing-library/vue": "^8.1.0",
		"@vitejs/plugin-vue": "^5.2.0",
		"jsdom": "^25.0.0",
		"publint": "^0.3.0",
		"vite": "^6.0.0",
		"vitest": "^2.0.0",
		"vue": "^3.5.0",
		"vue-tsc": "^2.1.0",
		"typescript": "^5.7.0"
	},
	"keywords": ["vue", "vue3", "ui", "components"]
}
```

`vite.config.ts` (library mode — externalizes Vue and the plugin so they are not
bundled):

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: ['vue', '@scope/project-name'],
      output: { assetFileNames: 'styles.css' }
    }
  }
});
```

`tsconfig.json` / `tsconfig.build.json`:

```jsonc
// tsconfig.json
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": { "types": ["vite/client"], "jsx": "preserve" },
	"include": ["src/**/*.ts", "src/**/*.vue"]
}
```

```jsonc
// tsconfig.build.json — emits declarations only; Vite emits the JS
{
	"extends": "./tsconfig.json",
	"compilerOptions": { "declaration": true, "emitDeclarationOnly": true, "outDir": "dist" }
}
```

## 2. The `cn` utility

Identical to the other two libraries — `src/utils/cn.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

## 3. A component: `Button.vue`

`src/components/Button.vue`:

```vue
<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { cn } from '../utils/cn';
import { vRipple } from '../directives/ripple';

defineOptions({ inheritAttrs: false });

type Variant = 'filled' | 'outline' | 'text';
type Role = 'primary' | 'secondary' | 'danger';

const props = withDefaults(
	defineProps<{ variant?: Variant; role?: Role; rippleless?: boolean }>(),
	{ variant: 'filled', role: 'primary', rippleless: false }
);

const attrs = useAttrs();
const classes = computed(() =>
	cn('button', `button-${props.variant}`, `button-${props.role}`, attrs.class as string)
);
</script>

<template>
	<button
		v-ripple="{ disabled: rippleless }"
		:class="classes"
		v-bind="{ ...attrs, class: undefined }"
	>
		<slot />
	</button>
</template>
```

The parallels hold exactly: props map to the same plugin classes; the
consumer-supplied `class` (arriving via `attrs`) is merged last through `cn`;
remaining attributes (`onClick`, `disabled`, `aria-*`) spread through
`v-bind="attrs"`; behavior is a directive. `inheritAttrs: false` + explicit
`v-bind` gives precise control over where attributes land.

## 4. Behavior: the ripple directive

`src/directives/ripple.ts` — Vue's equivalent of the Svelte action / React hook:

```ts
import type { Directive } from 'vue';

export const vRipple: Directive<HTMLElement, { disabled?: boolean }> = {
  mounted(node, binding) {
    node.style.setProperty('--interactive', '1');
    node.addEventListener('pointerdown', (e) => {
      if (binding.value?.disabled) return;
      const el = document.createElement('span');
      el.className = 'ripple';
      const rect = node.getBoundingClientRect();
      el.style.left = `${e.clientX - rect.left}px`;
      el.style.top = `${e.clientY - rect.top}px`;
      node.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    });
  }
};
```

## 5. Safelist stylesheet and barrel export

`src/styles.css`:

```css
@source inline('ripple button button-filled button-outline button-text');
```

Import it into the library entry so Vite bundles it as `dist/styles.css`
(matching the `assetFileNames` config and the `./styles.css` export).

`src/index.ts`:

```ts
import './styles.css';
export { default as Button } from './components/Button.vue';
export { vRipple } from './directives/ripple';
export { cn } from './utils/cn';
```

> Provide an optional Vue **plugin install** too, so consumers can
> `app.use(ProjectName)` to globally register components and directives:
>
> ```ts
> import type { App } from 'vue';
> import Button from './components/Button.vue';
> import { vRipple } from './directives/ripple';
> export default {
>   install(app: App) {
>     app.component('PnButton', Button);
>     app.directive('ripple', vRipple);
>   }
> };
> ```

## 6. Build, check, test

```sh
bun run --filter '@scope/project-name-vue' build   # vite lib build + vue-tsc dts + publint
bun run --filter '@scope/project-name-vue' check   # vue-tsc --noEmit
bun run --filter '@scope/project-name-vue' test    # vitest + @testing-library/vue
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], test: { environment: 'jsdom' } });
```

Representative test:

```ts
import { render, screen } from '@testing-library/vue';
import { test, expect } from 'vitest';
import Button from '../src/components/Button.vue';

test('applies plugin classes from props', () => {
  render(Button, { props: { variant: 'outline', role: 'danger' }, slots: { default: 'Delete' } });
  const btn = screen.getByRole('button', { name: 'Delete' });
  expect(btn.className).toContain('button-outline');
  expect(btn.className).toContain('button-danger');
});
```

## 7. Consuming from a Vue app

```sh
npm install @scope/project-name @scope/project-name-vue
```

```css
/* app.css */
@import 'tailwindcss';
@plugin '@scope/project-name';
@import '@scope/project-name-vue/styles.css';
```

```vue
<script setup lang="ts">
import { Button } from '@scope/project-name-vue';
</script>

<template>
	<Button variant="filled" role="primary" class="rounded-full">Save</Button>
</template>
```

## 8. Now three libraries share one contract

You have implemented `Button` three times over three frameworks, and every
implementation:

- reads from the same plugin classes (`button`, `button-{variant}`,
  `button-{role}`),
- merges the consumer's `class` last through an identical `cn`,
- spreads native attributes,
- delegates ripple behavior to a framework-idiomatic primitive
  (action / hook / directive).

The shared **contract test** from
[04-react-package.md](04-react-package.md#8-keeping-the-three-libraries-in-lockstep)
now covers all three. This is the structural parity promised in
[00-overview.md](00-overview.md).

## Checklist

- [ ] Vite library build + `vue-tsc` declarations, Vue + plugin externalized.
- [ ] `vue`/plugin as **peer** deps.
- [ ] `Button.vue` maps the same props to the same classes; `class` merged last;
      `inheritAttrs:false` + explicit `v-bind`.
- [ ] Ripple directive mirrors the Svelte action / React hook.
- [ ] Optional `app.use()` install export; safelist `./styles.css`; `publint` clean.
- [ ] Shared contract test now green for Svelte, React, and Vue.

Next: [06-docs-site.md](06-docs-site.md).
