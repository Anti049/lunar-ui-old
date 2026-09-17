# 4. Svelte bindings

Read [3. The shared contract](03-bindings.md) first — the peer dependency, the
`styles.css` export and the class-merge rule all apply here.

Svelte is the easiest of the three because `sv` has a purpose-built library
template and `svelte-package` handles the build.

---

## 1. Scaffold

```powershell
Set-Location packages
bunx sv@latest create svelte `
  --template library `
  --types ts `
  --no-add-ons `
  --no-install
```

`--template library` gives you `src/lib` as the publishable root and wires
`svelte-package` in — the other templates are applications. `--no-add-ons` skips
the Prettier/ESLint/Vitest prompts, because the monorepo already has those at the
root; adding them per package gives you two configs that disagree.

Verify the templates on your version with `bunx sv@latest create --help`.

Then install from the repository root so the workspace links resolve:

```powershell
Set-Location ..; bun install
```

---

## 2. Trim the scaffold

`sv` gives you a demo route and a placeholder component. Remove them:

```powershell
Set-Location packages/svelte

# -ErrorAction SilentlyContinue replaces `2>/dev/null`: the scaffold may not
# contain every one of these, and a missing file is not an error here.
Remove-Item -Recurse -Force src/routes/*, src/lib/index.ts, src/lib/Counter.svelte `
	-ErrorAction SilentlyContinue

mkdir src/lib/components, src/lib/actions, src/lib/utils
```

Keep `src/routes/` itself — it becomes the local playground in step 8.

---

## 3. `package.json`

**`packages/svelte/package.json`** — replace the whole file. `sv create`
wrote one; this supersedes it, keeping only the `name` you set in guide 1.

**Replacing it means re-listing what the scaffold installed.** `sv create` put
`@sveltejs/kit` and `@sveltejs/adapter-auto` in `devDependencies`, and
`svelte.config.js` imports the adapter. Drop them and every file in the package
lights up with unresolved-import errors — see the trap at the end.

```jsonc
{
	"name": "@scope/project-name-svelte",
	"version": "0.0.0",
	"type": "module",
	"license": "MIT",
	"repository": {
		"type": "git",
		"url": "git+https://github.com/acme/project-name.git",
		"directory": "packages/svelte"
	},
	"scripts": {
		"dev": "svelte-package --watch",
		"build": "svelte-package && publint",
		"check": "svelte-check --tsconfig ./tsconfig.json",
		"prepack": "svelte-package && publint"
	},
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
	"sideEffects": ["**/*.css"],
	"peerDependencies": {
		"@scope/project-name": "workspace:^",
		"svelte": "^5.57.0"
	},
	"dependencies": {
		"clsx": "^2.1.1",
		"tailwind-merge": "^3.7.0"
	},
	"devDependencies": {
		"@sveltejs/adapter-auto": "^3.3.0",
		"@sveltejs/kit": "^2.70.3",
		"@sveltejs/package": "^2.5.8",
		"svelte": "^5.57.0",
		"svelte-check": "^4.7.6",
		"publint": "^0.3.24"
	},
	"publishConfig": { "access": "public", "provenance": true },
	"keywords": ["svelte", "tailwindcss", "ui", "components", "design-system"]
}
```

The `"svelte"` export condition is what lets a bundler pick the **uncompiled**
`.svelte` file, so the consumer's Svelte compiler handles it with their own
options. Without it you ship pre-compiled output that can mismatch their version.

`prepack` matters: it guarantees `dist` is current even if someone publishes by
hand.

---

## 4. The class-merge helper

**`packages/svelte/src/lib/utils/cn.ts`** — new file.

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge classes, last wins on conflict.
 *
 * The incoming `class` always goes last, so a consumer's `rounded-full` beats
 * the component's own `rounded-sm`.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
```

`tailwind-merge` does not know about your custom classes by default. If two of
your own utilities conflict (`button-sm` and `button-lg`), teach it — same
file, replacing the simple version above:

```ts
import { extendTailwindMerge } from 'tailwind-merge';

export const cn = extendTailwindMerge({
	extend: {
		classGroups: {
			'button-size': [{ button: ['xs', 'sm', 'md', 'lg', 'xl'] }]
		}
	}
});
```

---

## 5. The `@source` registration

**`packages/svelte/src/lib/styles.css`** — new file.

```css
/*
	Registers this package's components with the consumer's Tailwind scan.
	Without this import their build never looks inside node_modules, every
	utility class used inside these components is tree-shaken away, and the
	components render unstyled.
*/
@source '../**/*.svelte';
```

`svelte-package` copies non-`.svelte` assets through, so this lands at
`dist/styles.css` and matches the exports map.

---

## 6. Two components

Two, not one. A single component tells you nothing about whether the barrel, the
export map or the parity test generalise — and the second one is where you find
out that the first was a special case.

**`packages/svelte/src/lib/components/Button.svelte`** — new file.

```svelte
<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '../utils/cn.js';

	type Variant = 'filled' | 'tonal' | 'outlined' | 'text';
	type Size = 'sm' | 'md' | 'lg';

	interface Props extends HTMLButtonAttributes {
		variant?: Variant;
		size?: Size;
		children?: Snippet;
	}

	let {
		variant = 'filled',
		size = 'md',
		class: className = '',
		children,
		...rest
	}: Props = $props();
</script>

<button class={cn('button', `button-${variant}`, `button-${size}`, className)} {...rest}>
	{@render children?.()}
</button>
```

Three things to copy every time:

- **`extends HTMLButtonAttributes`** so `onclick`, `disabled`, `aria-*` and the
  rest type-check without being listed.
- **`...rest` spread last** so a consumer can set any native attribute.
- **`className` last in `cn()`** so their class wins.

Note the variant is a **complete class name** built from a literal prefix. That
is fine _inside your package_ because the build extracts the class list, but see
[guide 0](00-prerequisites.md#what-classes-written-by-js-at-runtime-means) for
why a consumer must not do the same in their own markup.

**`packages/svelte/src/lib/components/Badge.svelte`** — new file. Simpler on
purpose: no size, no rest-props spreading, a `<span>` rather than a `<button>`.

```svelte
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '../utils/cn.js';

	export type Variant = 'primary' | 'neutral';

	interface Props extends HTMLAttributes<HTMLSpanElement> {
		variant?: Variant;
		class?: string;
	}

	let { variant = 'primary', class: className, children, ...rest }: Props = $props();
</script>

<span class={cn('badge', `badge-${variant}`, className)} {...rest}>
	{@render children?.()}
</span>
```

`badge` and `badge-primary` are exactly the classes
`packages/core/src/components/badge.css` defines in [guide 2](02-plugin.md)
step 3. Nothing checks the two against each other, so if you renamed that
component, rename these by hand.

---

## 7. The barrel

**`packages/svelte/src/lib/index.ts`** — replace it. `sv create` wrote a
placeholder here and step 2 deleted it, so this is the whole file.

```ts
// Components
export { default as Button } from './components/Button.svelte';
export { default as Badge } from './components/Badge.svelte';

// Actions
export { ripple } from './actions/ripple.js';

// Utilities
export { cn } from './utils/cn.js';
```

Export types alongside anything a consumer might annotate — same file, below
the component exports:

```ts
export type { Props as ButtonProps } from './components/Button.svelte';
```

---

## 8. A local playground

`src/routes/+page.svelte` is not published and is the fastest way to see a
component in isolation.

**`packages/svelte/src/routes/+page.svelte`** — replace it.

```svelte
<script lang="ts">
	import { Button, Badge } from '$lib/index.js';
</script>

<div class="flex flex-wrap items-center gap-2 p-8">
	<Button variant="filled">Filled</Button>
	<Button variant="tonal">Tonal</Button>
	<Button variant="outlined" disabled>Disabled</Button>
	<Badge>3</Badge>
</div>
```

It needs the plugin.

**`packages/svelte/src/app.css`** — new file, imported by the playground
layout. Never published — `files` lists only `dist`.

```css
@import 'tailwindcss';
@plugin '@scope/project-name';
@source './lib/**/*.svelte';
```

```powershell
bun run --filter '@scope/project-name-svelte' dev
```

---

## 9. Build and verify

```powershell
cd packages/svelte
bun run check      # svelte-check: 0 errors
bun run build      # svelte-package + publint
ls dist            # index.js, index.d.ts, styles.css, components/…
```

Confirm the package resolves the way a consumer would:

```powershell
# Resolve and load it the way a consumer's bundler would, then list what the
# barrel actually exports. A typo in `exports` shows up here, not at build time.
node --input-type=module -e "import('@scope/project-name-svelte').then(m => console.log(Object.keys(m)))"
```

---

## Files after this phase

Ten files. Everything the Svelte package contains at this point, in full.

| File                                               | Status   | Written in | Next touched by                     |
| -------------------------------------------------- | -------- | ---------- | ----------------------------------- |
| `packages/svelte/package.json`                     | replaced | step 3     | [8](08-conventions.md) — versioning |
| `packages/svelte/svelte.config.js`                 | modified | step 3     | never                               |
| `packages/svelte/vite.config.ts`                   | modified | step 3     | never                               |
| `packages/svelte/tsconfig.json`                    | kept     | scaffold   | never                               |
| `packages/svelte/src/app.html`                     | kept     | scaffold   | never                               |
| `packages/svelte/src/app.d.ts`                     | kept     | scaffold   | never                               |
| `packages/svelte/src/lib/utils/cn.ts`              | added    | step 4     | never                               |
| `packages/svelte/src/lib/styles.css`               | added    | step 5     | never                               |
| `packages/svelte/src/lib/components/Button.svelte` | added    | step 6     | you, per component                  |
| `packages/svelte/src/lib/components/Badge.svelte`  | added    | step 6     | you, per component                  |
| `packages/svelte/src/lib/actions/ripple.ts`        | added    | step 6     | never                               |
| `packages/svelte/src/lib/index.ts`                 | replaced | step 7     | one block per component             |
| `packages/svelte/src/routes/+page.svelte`          | replaced | step 8     | you, as a scratchpad                |
| `packages/svelte/src/routes/+layout.svelte`        | added    | step 8     | never                               |
| `packages/svelte/src/app.css`                      | added    | step 8     | never                               |

Deleted by step 2: `src/lib/Counter.svelte`, the scaffold's `src/lib/index.ts`,
and everything that was in `src/routes/`.

Build output, gitignored: `packages/svelte/dist/` and `.svelte-kit/`.

---

### `packages/svelte/package.json`

```json
{
	"name": "@scope/project-name-svelte",
	"version": "0.0.0",
	"type": "module",
	"license": "MIT",
	"description": "Svelte 5 components for the project-name design system.",
	"keywords": ["svelte", "tailwindcss", "ui", "components", "design-system"],
	"repository": {
		"type": "git",
		"url": "git+https://github.com/acme/project-name.git",
		"directory": "packages/svelte"
	},
	"scripts": {
		"dev": "vite dev",
		"build": "svelte-package && publint",
		"check": "svelte-check --tsconfig ./tsconfig.json",
		"prepare": "svelte-kit sync"
	},
	"files": ["dist"],
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"svelte": "./dist/index.js",
			"default": "./dist/index.js"
		},
		"./styles.css": "./dist/styles.css",
		"./package.json": "./package.json"
	},
	"sideEffects": ["**/*.css"],
	"peerDependencies": {
		"@scope/project-name": "workspace:^",
		"svelte": "^5.57.0"
	},
	"dependencies": {
		"clsx": "^2.1.1",
		"tailwind-merge": "^3.7.0"
	},
	"devDependencies": {
		"@sveltejs/adapter-auto": "^3.3.0",
		"@sveltejs/kit": "^2.70.3",
		"@sveltejs/package": "^2.5.8",
		"@sveltejs/vite-plugin-svelte": "^7.3.0",
		"@tailwindcss/vite": "^4.3.3",
		"publint": "^0.3.24",
		"svelte": "^5.57.0",
		"svelte-check": "^4.7.6",
		"tailwindcss": "^4.3.3",
		"typescript": "~6.0.3",
		"vite": "^8.3.0"
	},
	"publishConfig": { "access": "public", "provenance": true }
}
```

Four fields carry weight here:

- **`exports["."].svelte`** — the condition a bundler with the Svelte plugin
  looks for first. It points at the **uncompiled** component, so the consumer's
  own Svelte compiler handles it and version skew between your Svelte and theirs
  stops mattering. `default` is the fallback for anything that does not
  understand the condition.
- **`sideEffects: ["**/*.css"]`** — not `false`. `index.ts` imports
  `styles.css` purely for its side effect; blanket-false lets a bundler drop it
  in production builds only, so components are styled in dev and unstyled in
  prod.
- **`peerDependencies`** — both the plugin and Svelte come from the consumer.
  As a regular dependency you would ship a second Svelte runtime.
- **`workspace:^`** — resolved to the local package while developing, rewritten
  to a real version range by `changeset publish`.

---

### `packages/svelte/svelte.config.js`

The scaffold writes this; the only change is `package.source`.

```js
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	/*
		Strips `lang="ts"` from component <script> blocks during `svelte-package`,
		so the published .svelte files are consumable by a project that does not
		use TypeScript.
	*/
	preprocess: vitePreprocess(),

	kit: {
		/*
			For the PLAYGROUND only — `src/routes/` is a SvelteKit app that is never
			published. `files` in package.json lists `dist` alone.

			It is here because `sv create --template library` scaffolds a SvelteKit
			app around the library, which is the idiomatic Svelte setup: the app is
			how you look at your components while building them.
		*/
		adapter: adapter()
	}
};
```

There is deliberately no `package: { source: … }` here. `svelte-package` v2
defaults to `src/lib` → `dist` and takes `-i`/`-o` flags rather than config; the
`package` key was v1 and is silently ignored now, which makes it worse than
useless.

---

### `packages/svelte/tsconfig.json`

Written by the scaffold. It is worth reading rather than skipping, because it is
the one tsconfig in the repository that does **not** extend
`tsconfig.base.json`.

```jsonc
{
	/*
		SvelteKit GENERATES a tsconfig at .svelte-kit/tsconfig.json containing the
		`$lib` alias, the `.svelte` file mappings and the right module settings.
		Extending the repo base instead would lose all of that, and `$lib/index.js`
		would stop resolving.

		The base config's settings still reach here — .svelte-kit/tsconfig.json is
		generated from svelte.config.js, and the options below restate the few that
		matter for a published package.
	*/
	"extends": "./.svelte-kit/tsconfig.json",
	"compilerOptions": {
		"allowJs": true,
		"checkJs": true,
		"esModuleInterop": true,
		"forceConsistentCasingInFileNames": true,
		"resolveJsonModule": true,
		"skipLibCheck": true,
		"sourceMap": true,
		"strict": true,
		// `svelte-package` emits the declarations; tsc here is a checker only.
		"moduleResolution": "bundler"
	}
}
```

**`.svelte-kit/tsconfig.json` does not exist until `svelte-kit sync` has run.**
That is what the `prepare` script is for: it runs on `bun install`, so a fresh
clone gets it automatically. Run it by hand the first time:

```powershell
bun run --filter '@scope/project-name-svelte' prepare
```

Skip it and `bun run check` fails with `File './.svelte-kit/tsconfig.json' not
found`, which reads like a missing dependency rather than a missing build step.

---

### `packages/svelte/src/app.html`

Written by the scaffold; shown here because it is the one file with no
equivalent in the other two packages, and deleting it breaks `vite dev` with a
message that does not name it.

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
```

The two `%sveltekit.*%` placeholders are substituted at build time. This file
serves the playground only and is never published.

---

### `packages/svelte/src/app.d.ts`

Written by the scaffold. Ambient types for SvelteKit's namespaces — empty
interfaces you fill in only if the playground grows server routes, which it
will not.

```ts
// See https://svelte.dev/docs/kit/types#app
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
```

The trailing `export {}` is what makes this a module rather than a script, which
is what lets `declare global` work. Deleting it silently changes the meaning of
the file.

---

### `packages/svelte/vite.config.ts`

Written by the scaffold; it needs one addition so the playground can resolve the
plugin's utilities.

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// tailwindcss() must come BEFORE sveltekit(), or the CSS transform runs
	// after SvelteKit has already handled the file and your utilities are
	// missing from the playground with no error.
	plugins: [tailwindcss(), sveltekit()]
});
```

This file serves `vite dev` only. The published build is `svelte-package`, which
does not read it.

---

### `packages/svelte/src/lib/utils/cn.ts`

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/*
	Merge class names, letting the LAST conflicting utility win.

	clsx flattens the arguments — strings, arrays, conditional objects — into one
	string. twMerge then resolves Tailwind conflicts within it, so a consumer
	passing `rounded-full` beats the component's own `rounded-sm` instead of both
	applying and the cascade picking whichever came later in the stylesheet.

	Keep this file BYTE-IDENTICAL across the three binding packages. When it
	diverges, the three start resolving class conflicts differently and nobody
	notices for months.
*/
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
```

---

### `packages/svelte/src/lib/styles.css`

```css
/*
	Registers this package's components with the CONSUMER's Tailwind scan.

	Tailwind does not look inside node_modules by default, so without this import
	their build never sees `class="button button-filled"` in your components and
	the classes are never emitted — the components render completely unstyled.

	The path is relative to this file, and `index.ts` imports it so that
	`svelte-package` copies it into dist/ and the exports map can point at it.
*/
@source '../**/*.svelte';
```

---

### `packages/svelte/src/lib/components/Button.svelte`

```svelte
<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '../utils/cn.js';

	export type Variant = 'filled' | 'tonal' | 'outlined' | 'text';
	export type Size = 'sm' | 'md' | 'lg';

	/*
		`class` is a reserved word, so it cannot be destructured under its own
		name. Rename it to `className` and re-expose it — forgetting this is why
		a consumer's `class` silently does nothing.

		`...rest` collects every remaining button attribute (type, disabled,
		aria-*, onclick) so the component does not have to enumerate them.
	*/
	interface Props extends HTMLButtonAttributes {
		variant?: Variant;
		size?: Size;
		class?: string;
	}

	let { variant = 'filled', size = 'md', class: className, children, ...rest }: Props = $props();
</script>

<button class={cn('button', `button-${variant}`, `button-${size}`, className)} {...rest}>
	{@render children?.()}
</button>
```

Two things a reader should not have to work out:

- **The class strings are composed, not conditional.** `button-${variant}` is
  assembled at runtime, so Tailwind's scanner never sees `button-filled` as a
  literal. That is fine here because the plugin emits those classes
  unconditionally — but it is exactly the pattern that breaks for a _consumer_
  writing `class="badge-{status}"` in their own markup. Document it.
- **`children` is a snippet in Svelte 5**, not a slot. `{@render children?.()}`
  is the replacement for `<slot />`, and the `?.` allows a button with no
  content.

---

### `packages/svelte/src/lib/components/Badge.svelte`

The second component, because one is not enough to notice a pattern breaking.
It is deliberately simpler than Button — no size, no rest-props spreading — so
the barrel in step 7 has two shapes to export rather than two copies of one.

```svelte
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '../utils/cn.js';

	export type Variant = 'primary' | 'neutral';

	interface Props extends HTMLAttributes<HTMLSpanElement> {
		variant?: Variant;
		class?: string;
	}

	// Same `class: className` rename as Button — `class` is a reserved word and
	// cannot be destructured under its own name.
	let { variant = 'primary', class: className, children, ...rest }: Props = $props();
</script>

<span class={cn('badge', `badge-${variant}`, className)} {...rest}>
	{@render children?.()}
</span>
```

The classes `badge` and `badge-primary` are exactly the ones
`packages/core/src/components/badge.css` defines in
[guide 2](02-plugin.md) step 3. If you renamed that component, rename these too
— nothing checks the two against each other.

---

### `packages/svelte/src/lib/actions/ripple.ts`

```ts
/*
	A Svelte action: `<button use:ripple>`.

	The class name below is created by JAVASCRIPT at runtime, so Tailwind's
	scanner can never see it — there is no literal `project-ripple` anywhere in
	the consumer's source, and their scan skips node_modules anyway.

	That is why the plugin routes this rule through `addBase` rather than
	`addUtilities`: addBase emits unconditionally, addUtilities is usage-gated
	and would silently emit nothing. See guide 0, decision 3.
*/
export function ripple(node: HTMLElement): { destroy(): void } {
	const onPointerDown = (event: PointerEvent): void => {
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

	node.addEventListener('pointerdown', onPointerDown);

	// Svelte calls destroy() when the element is removed. Without this the
	// listener outlives the node in a long-lived SPA.
	return {
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
		}
	};
}
```

---

### `packages/svelte/src/lib/index.ts`

The published surface. Anything not exported here cannot be imported by a
consumer, which is the point — it lets you refactor internals freely.

```ts
/*
	Imported for its side effect only: it carries the `@source` registration
	that tells a consumer's Tailwind where this package's components live.
	`sideEffects` in package.json lists CSS so a bundler cannot drop it.
*/
import './styles.css';

// Components. `default as X` because a .svelte file's component is its default.
export { default as Button } from './components/Button.svelte';
export { default as Badge } from './components/Badge.svelte';

// Behaviour.
export { ripple } from './actions/ripple.js';

// The class-merge helper, exported so consumers composing on top of a component
// resolve conflicts the same way the component does.
export { cn } from './utils/cn.js';

/*
	Types, exported alongside anything a consumer might annotate. `export type`
	rather than `export` is required under isolatedModules, which the base
	tsconfig turns on.

	Svelte 5 exports a component's prop types from the component file itself, so
	these come from the .svelte, not from a separate .d.ts.
*/
export type { Variant as ButtonVariant, Size as ButtonSize } from './components/Button.svelte';
```

The `.js` extensions on TypeScript imports are correct under
`moduleResolution: bundler` and required under `node16`. `.svelte` imports
keep their real extension — it is part of the specifier.

---

### `packages/svelte/src/routes/+layout.svelte`

```svelte
<script lang="ts">
	// The playground's stylesheet. `src/routes/` is never published, so this
	// import exists only for `vite dev`.
	import '../app.css';

	let { children } = $props();
</script>

{@render children()}
```

---

### `packages/svelte/src/routes/+page.svelte`

```svelte
<script lang="ts">
	import { Button, Badge } from '$lib/index.js';
</script>

<div class="flex flex-wrap items-center gap-2 p-8">
	<Button variant="filled">Filled</Button>
	<Button variant="tonal">Tonal</Button>
	<Button variant="outlined" disabled>Disabled</Button>
	<Badge>3</Badge>
</div>
```

---

### `packages/svelte/src/app.css`

```css
/*
	The playground's stylesheet, never published — `files` lists only `dist`.

	It loads the plugin exactly as a consumer would, which is the point: if the
	playground needs something a consumer could not write, that is a bug in the
	plugin.
*/
@import 'tailwindcss';
@plugin '@scope/project-name';

/*
	Scan this package's own components. Without it the playground renders
	unstyled even though `lib/styles.css` exists — that file is for CONSUMERS,
	and this app is not consuming the built package.
*/
@source './lib/**/*.svelte';
```

---

## Traps

> **You replace `package.json` and lose the scaffold's dependencies.** `sv create`
> installs `@sveltejs/kit` and `@sveltejs/adapter-auto`; a wholesale replacement
> that does not re-list them leaves `svelte.config.js` importing a package that
> is no longer there.
>
> **How to tell:** every file in the package shows an error at once — not one
> import, all of them — because `svelte.config.js` failing to load takes the
> language server down with it. `Cannot find module '@sveltejs/adapter-auto'` is
> the real message, and it is usually the least prominent one on screen.
>
> **Fix:** `bun add -D '@sveltejs/kit' '@sveltejs/adapter-auto'`. More generally:
> diff the scaffold's `package.json` against yours before deleting it, rather
> than after.

> **`svelte-package` emits nothing for files outside `src/lib`.** Components in
> `src/components` are silently not packaged. The library root is `src/lib`, and
> the scaffold sets that up for you — do not move it.

> **A `.svelte` file with no `<script lang="ts">` gets no types.** `svelte-check`
> passes and `.d.ts` is emitted with `any` props. Always declare the lang
> attribute, even on a presentational component.

> **Svelte 5 `$props()` destructuring and `class`.** `class` is a reserved word,
> so it must be renamed in the destructure (`class: className = ''`). Forgetting
> it is a syntax error, but forgetting to _forward_ it is silent — the consumer's
> class is dropped and only shows up when someone tries to override something.

> **`{@render children?.()}` versus `<slot />`.** Snippets are the Svelte 5 form.
> A component mixing both compiles but behaves unpredictably; pick snippets and
> keep the package consistent.

> **Publishing pre-compiled components.** If you drop the `"svelte"` export
> condition, bundlers fall back to `"default"` and consume your compiled output,
> which breaks when their Svelte version differs from yours. Keep the condition
> and keep `svelte` a peer dependency.

---

## Commit

Verify, then commit:

```powershell
bun run --filter '@scope/project-name-svelte' check
git add -A
git commit -m "feat(svelte): add Svelte bindings"
```

---

Next: [React](05-react.md)
