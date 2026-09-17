# 03 — The Svelte Component Library (`@scope/project-name-svelte`)

The first of three framework libraries. It contains **no design of its own** —
every component renders the plugin's class names from
[02-plugin-package.md](02-plugin-package.md) and adds only behavior: event
wiring, slots, accessibility, and interactive effects like ripples.

This chapter sets the pattern the React and Vue chapters mirror, so read it even
if Svelte is not your target.

## 1. What a framework library is responsible for

| Responsibility                                | Owned here? |
| --------------------------------------------- | ----------- |
| Padding, radius, color, elevation             | No — plugin |
| Which classes to emit for a given prop set    | **Yes**     |
| Event handlers, controlled/uncontrolled state | **Yes**     |
| ARIA attributes, keyboard interaction         | **Yes**     |
| Ripple / focus-visible behavior               | **Yes**     |
| Slot/children composition                     | **Yes**     |

The single most important helper is a class-merging function; every component
uses it to combine "base + variant + role + consumer-supplied" classes safely.

## 2. Scaffold

```sh
cd packages
mkdir svelte && cd svelte
```

`packages/svelte/package.json`:

```jsonc
{
	"name": "@scope/project-name-svelte",
	"version": "0.0.0",
	"description": "Svelte 5 components for project-name.",
	"type": "module",
	"repository": {
		"type": "git",
		"url": "git+https://github.com/your-org/project-name.git",
		"directory": "packages/svelte"
	},
	"scripts": {
		"build": "svelte-package && publint",
		"dev": "svelte-package --watch",
		"check": "svelte-check --tsconfig ./tsconfig.json",
		"test": "vitest run",
		"prepack": "svelte-package && publint"
	},
	"sideEffects": ["**/*.css"],
	"svelte": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"files": ["dist", "!dist/**/*.test.*", "!dist/**/*.spec.*"],
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"svelte": "./dist/index.js",
			"default": "./dist/index.js"
		},
		"./styles.css": "./dist/styles.css",
		"./package.json": "./package.json"
	},
	"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org" },
	"dependencies": { "clsx": "^2.1.0", "tailwind-merge": "^3.0.0" },
	"peerDependencies": { "@scope/project-name": "workspace:^", "svelte": "^5.0.0" },
	"devDependencies": {
		"@scope/project-name": "workspace:*",
		"@sveltejs/package": "^2.3.0",
		"@sveltejs/vite-plugin-svelte": "^4.0.0",
		"publint": "^0.3.0",
		"svelte": "^5.0.0",
		"svelte-check": "^4.0.0",
		"typescript": "^5.7.0",
		"vitest": "^2.0.0"
	},
	"keywords": ["svelte", "svelte5", "ui", "components"]
}
```

Critical fields:

- **`peerDependencies["@scope/project-name"]`** — the plugin is a peer, not a
  bundled dependency. The consumer installs both. `workspace:^` resolves locally
  in the repo and is rewritten to a real semver range at publish time by Bun.
- **`sideEffects: ["**/*.css"]`** — tells bundlers not to tree-shake the
  component CSS bridge (`styles.css`, below).
- **`svelte` + `exports[".svelte"]`** — how Svelte-aware bundlers find the source
  entry. `@sveltejs/package` (`svelte-package`) generates `dist/` with correct
  types and a preserved folder structure.
- **`files` excludes test files** so specs never ship.

`svelte.config.js`:

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default { preprocess: vitePreprocess() };
```

`tsconfig.json`:

```jsonc
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": { "types": ["svelte"], "moduleResolution": "bundler" },
	"include": ["src/**/*.ts", "src/**/*.svelte"]
}
```

## 3. The class-merging utility

`src/lib/utils/cn.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class values. `clsx` handles conditionals/arrays/objects; `twMerge`
 * resolves Tailwind conflicts so a consumer's `rounded-full` wins over the
 * component's default radius utility.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

> **Why `tailwind-merge` matters here.** It is what makes the inline-override tier
> of [the radius model](00-overview.md#5-the-design-token-layering-model) work at
> the component boundary: when a consumer passes `class="rounded-full"`, `twMerge`
> drops any conflicting radius utility the component added, leaving the
> consumer's in control.

## 4. A component: `Button.svelte`

`src/lib/components/Button.svelte`:

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '../utils/cn.js';
	import { ripple } from '../actions/ripple.js';

	type Variant = 'filled' | 'outline' | 'text';
	type Role = 'primary' | 'secondary' | 'danger';

	interface Props extends HTMLButtonAttributes {
		variant?: Variant;
		role?: Role;
		/** Disable the ripple effect. */
		rippleless?: boolean;
		children: Snippet;
	}

	let {
		variant = 'filled',
		role = 'primary',
		rippleless = false,
		class: klass,
		children,
		...rest
	}: Props = $props();
</script>

<button
	class={cn('button', `button-${variant}`, `button-${role}`, klass)}
	use:ripple={{ disabled: rippleless }}
	{...rest}
>
	{@render children()}
</button>
```

Observations that generalize to every component and every framework:

1. **Props map directly to plugin classes.** `variant="filled"` →
   `button-filled`. No styling logic; just string composition through `cn`.
2. **`class` is passed through last** so `cn`/`twMerge` lets consumers override.
3. **`...rest` spreads native attributes** (`onclick`, `disabled`, `aria-*`),
   so the component never has to re-declare the platform.
4. **Behavior is isolated in actions/hooks** (`ripple`), not mixed into markup.

## 5. Interactive behavior: the ripple action

`src/lib/actions/ripple.ts` — a Svelte action that adds a Material-style ripple
using the plugin's runtime classes (the "unconditional" bundle from
[02-plugin-package.md](02-plugin-package.md#4-the-compile-pipeline-functionsbuildts)):

```ts
export function ripple(node: HTMLElement, opts: { disabled?: boolean } = {}) {
  function onpointerdown(e: PointerEvent) {
    if (opts.disabled) return;
    const el = document.createElement('span');
    el.className = 'ripple';            // styled by the plugin, emitted via addBase
    const rect = node.getBoundingClientRect();
    el.style.left = `${e.clientX - rect.left}px`;
    el.style.top = `${e.clientY - rect.top}px`;
    node.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
  node.style.setProperty('--interactive', '1'); // marks the element for the variant
  node.addEventListener('pointerdown', onpointerdown);
  return {
    update(next: { disabled?: boolean }) { opts = next; },
    destroy() { node.removeEventListener('pointerdown', onpointerdown); }
  };
}
```

Because `.ripple` is emitted unconditionally by the plugin, Tailwind never
tree-shakes it away even though it appears only in runtime-created DOM.

## 6. The CSS bridge (`styles.css`)

Some component classes are created only at runtime (like `.ripple`) or are used
in ways Tailwind's scanner cannot see. To guarantee they survive tree-shaking in
a consumer build, the library ships a tiny stylesheet that references them, and
consumers import it once:

`src/lib/styles.css`:

```css
/* Safelist for classes this library uses imperatively. Imported by consumers
   as `@scope/project-name-svelte/styles.css` so they are never purged. */
@source inline('ripple button button-filled button-outline button-text');
```

`svelte-package` copies this to `dist/styles.css`, matching the `./styles.css`
export in the manifest.

## 7. The barrel export

`src/lib/index.ts` re-exports the public API:

```ts
export { default as Button } from './components/Button.svelte';
export { default as Card } from './components/Card.svelte';
// …
export { ripple } from './actions/ripple.js';
export { cn } from './utils/cn.js';
```

Keep this list curated — it _is_ the package's public surface, and `publint`
checks that everything it references is actually shipped.

## 8. Build, check, and test

```sh
bun run --filter '@scope/project-name-svelte' build   # svelte-package → dist/ + publint
bun run --filter '@scope/project-name-svelte' check   # svelte-check (types + a11y)
bun run --filter '@scope/project-name-svelte' test    # vitest (component behavior)
```

A representative test (component testing with `@testing-library/svelte`):

```ts
import { render, screen } from '@testing-library/svelte';
import { test, expect } from 'vitest';
import Button from '../src/lib/components/Button.svelte';

test('applies plugin classes from props', () => {
  render(Button, { variant: 'outline', role: 'danger', children: () => 'Delete' });
  const btn = screen.getByRole('button', { name: 'Delete' });
  expect(btn.className).toContain('button-outline');
  expect(btn.className).toContain('button-danger');
});
```

## 9. How the docs site consumes this in development

The docs app aliases `@scope/project-name-svelte` to
`packages/svelte/src/lib/index.ts` during `vite dev`, so editing a component
hot-reloads instantly with **no `svelte-package` rebuild**. Published consumers
resolve the same specifier to `dist/` through the export map. The alias is set up
in [06-docs-site.md](06-docs-site.md#2-aliasing-workspace-packages-to-source).

## Checklist

- [ ] `package.json` with plugin + `svelte` as **peer** deps, `svelte`/`exports`
      entries, `sideEffects` for CSS, tests excluded from `files`.
- [ ] `cn` utility built on `clsx` + `tailwind-merge`.
- [ ] Components map props → plugin classes, pass `class` through last, spread
      native attributes, isolate behavior in actions.
- [ ] Runtime-only classes safelisted via `styles.css` → `./styles.css` export.
- [ ] Curated barrel export; `publint` clean; component tests pass.

Next: [04-react-package.md](04-react-package.md).
