# 5. React bindings

Read [3. The shared contract](03-bindings.md) first.

React has **no official library scaffolder** — `create-vite` and `create-next-app`
both produce applications. So the shape here is: scaffold an app for the
playground, then point the build at a library entry. `tsup` does the build
because React is the one binding where shipping CJS alongside ESM still earns its
keep.

---

## 1. Scaffold

```powershell
cd packages
bunx create-vite@latest react --template react-ts --no-interactive
```

`--no-interactive` stops it prompting; verify the template list with
`bunx create-vite@latest --help`.

```powershell
cd .. && bun install
```

---

## 2. Trim and restructure

The scaffold is an app. Turn it into a library with a playground:

```powershell
Set-Location packages/react

# The scaffold is an app; strip the demo surface. -ErrorAction SilentlyContinue
# because the template does not always contain every one of these.
Remove-Item -Recurse -Force src/App.tsx, src/App.css, src/assets, public/vite.svg `
	-ErrorAction SilentlyContinue

mkdir src/lib/components, src/lib/hooks, src/lib/utils, src/demo
Move-Item src/main.tsx src/demo/main.tsx -ErrorAction SilentlyContinue

# vite.config.ts sets `root: 'src/demo'` in step 9, so Vite looks for the
# entry HTML there rather than at the package root. Move it now; leaving
# two index.html files behind is a confusing thing to come back to.
Move-Item index.html src/demo/index.html -ErrorAction SilentlyContinue
```

`src/lib` becomes the published surface; `src/demo` is the playground and is
never packaged.

---

## 3. `package.json`

**`packages/react/package.json`** — replace the whole file.

```jsonc
{
	"name": "@anti049/test-react",
	"version": "0.0.0",
	"type": "module",
	"license": "MIT",
	"repository": {
		"type": "git",
		"url": "git+https://github.com/Anti049/test.git",
		"directory": "packages/react"
	},
	"scripts": {
		"dev": "vite",
		"build": "tsup && node -e \"require('node:fs').copyFileSync('src/lib/styles.css','dist/styles.css')\" && publint",
		"check": "tsc --noEmit"
	},
	"files": ["dist"],
	"main": "./dist/index.cjs",
	"module": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js",
			"require": "./dist/index.cjs"
		},
		"./styles.css": "./dist/styles.css",
		"./package.json": "./package.json"
	},
	"sideEffects": ["**/*.css"],
	"peerDependencies": {
		"@anti049/test": "^0.0.0",
		"react": "^18 || ^19",
		"react-dom": "^18 || ^19"
	},
	"dependencies": {
		"clsx": "^2.1.1",
		"tailwind-merge": "^3.7.0"
	},
	"devDependencies": {
		"@types/react": "^19.3.0",
		"@types/react-dom": "^19.3.0",
		"tsup": "^8.5.1",
		"typescript": "~6.0.3",
		"vite": "^8.3.0",
		"@vitejs/plugin-react": "^6.1.1",
		"publint": "^0.3.24"
	},
	"publishConfig": { "access": "public", "provenance": true },
	"keywords": ["react", "tailwindcss", "ui", "components", "design-system"]
}
```

**Why CJS at all.** Jest without ESM configuration, older Next.js setups and a
long tail of tooling still `require()`. It costs one flag in `tsup`, and dropping
it generates support issues that are tedious to diagnose. `main`/`module`/`types`
are there for resolvers that predate `exports` — harmless, and occasionally the
difference between working and not.

The peer range covers 18 **and** 19 deliberately; see the `forwardRef` trap.

---

## 4. `tsup.config.ts`

**`packages/react/tsup.config.ts`** — new file, at the package root.

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/lib/index.ts'],
	format: ['esm', 'cjs'],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	// Never bundle these — the consumer brings their own, and two copies of
	// React in one app is the classic "invalid hook call" crash.
	external: ['react', 'react-dom', '@anti049/test'],
	outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' })
});
```

`clean: true` means the build owns `dist`, so nothing else should delete it.

---

## 5. The class-merge helper

**`packages/react/src/lib/utils/cn.ts`** — new file, byte-identical to the
Svelte one.

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
```

Keep it byte-identical across the three packages. When it diverges, the three
start resolving class conflicts differently and nobody notices for months.

---

## 6. The `@source` registration

**`packages/react/src/lib/styles.css`** — new file.

```css
/*
	Registers this package's components with the consumer's Tailwind scan.
	Without this import their build never looks inside node_modules and the
	components render unstyled.
*/
@source '../**/*.{ts,tsx}';
```

`tsup` does not copy assets, which is why `build` copies it explicitly — with
a Node one-liner rather than `cp`, because package scripts run under `cmd.exe`
on Windows, where `cp` does not exist ([guide 0](00-prerequisites.md)).

---

## 7. Two components, and a hook

**`packages/react/src/lib/components/Button.tsx`** — new file.

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../utils/cn.js';

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ variant = 'filled', size = 'md', className, ...rest },
	ref
) {
	return (
		<button
			ref={ref}
			className={cn('button', `button-${variant}`, `button-${size}`, className)}
			{...rest}
		/>
	);
});
```

**Keep `forwardRef` even though React 19 makes `ref` a normal prop.** Your peer
range allows 18, where a function component silently receives `undefined` for
`ref`, and every consumer using a ref to focus or measure the button breaks. Drop
it only when you drop React 18 — which is a major.

Naming the inner function (`function Button(...)`) gives you a real name in React
DevTools and stack traces without a separate `displayName` assignment.

---

**`packages/react/src/lib/components/Badge.tsx`** — new file. Simpler on
purpose: no size, no ref forwarding, a `<span>` rather than a `<button>`.

```tsx
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn.js';

export type BadgeVariant = 'primary' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	variant?: BadgeVariant;
	children?: ReactNode;
}

/*
	No forwardRef here, unlike Button. A badge is not something a consumer
	focuses or measures, so the ref would be unused API surface — and dropping it
	makes the contrast with Button's deliberate forwardRef easier to see.
*/
export function Badge({ variant = 'primary', className, ...rest }: BadgeProps) {
	return <span className={cn('badge', `badge-${variant}`, className)} {...rest} />;
}
```

**`packages/react/src/lib/hooks/useRipple.ts`** — new file. The React
equivalent of the Svelte action from [guide 4](04-svelte.md).

```ts
import { useCallback, useRef, type PointerEvent } from 'react';

/*
	Returns a ref to attach and an onPointerDown handler:

	    const { ref, onPointerDown } = useRipple();
	    <button ref={ref} onPointerDown={onPointerDown}>…</button>

	The class name below is created by JAVASCRIPT at runtime, so Tailwind's
	scanner can never see it — which is why the plugin routes that rule through
	addBase rather than addUtilities. See guide 0, decision 3.
*/
export function useRipple() {
	const ref = useRef<HTMLElement | null>(null);

	const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
		const node = ref.current;
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

		// Self-removing, so nothing has to be cleaned up on unmount.
		circle.addEventListener('animationend', () => circle.remove());
		node.append(circle);
	}, []);

	return { ref, onPointerDown };
}
```

**`packages/react/tsconfig.json`** — replace the whole file. `create-vite` wrote
one that also referenced a `tsconfig.node.json`; this is self-contained.

```jsonc
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		// React 17+ JSX transform: no `import React` needed in every file.
		"jsx": "react-jsx",
		// The base config sets "types": [], so DOM-adjacent types are named here.
		"types": ["vite/client"],
		// `tsup` owns emission; this config is a checker only.
		"noEmit": true
	},
	"include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts", "tsup.config.ts"]
}
```

`include` covers `src/demo` as well as `src/lib` deliberately — the playground
is not published, but a type error in it is still a type error you want to see.

---

## 8. The barrel

**`packages/react/src/lib/index.ts`** — new file. This is the only entry
`tsup` reads, so anything not exported here is not published.

```ts
export { Button } from './components/Button.js';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button.js';

export { Badge } from './components/Badge.js';
export type { BadgeProps } from './components/Badge.js';

export { useRipple } from './hooks/useRipple.js';
export { cn } from './utils/cn.js';
```

The `.js` extensions on TypeScript imports are correct under
`moduleResolution: bundler` and required under `node16`. Being consistent now
saves a migration later.

---

## 9. A local playground

**`packages/react/src/demo/main.tsx`** — replace it. Step 2 moved the
scaffold's `main.tsx` here; this overwrites its contents.

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Badge } from '../lib/index.js';
import './app.css';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<div className="flex flex-wrap items-center gap-2 p-8">
			<Button variant="filled">Filled</Button>
			<Button variant="tonal">Tonal</Button>
			<Button variant="outlined" disabled>
				Disabled
			</Button>
			<Badge>3</Badge>
		</div>
	</StrictMode>
);
```

**`packages/react/src/demo/app.css`** — new file. Playground only, never
published.

```css
@import 'tailwindcss';
@plugin '@anti049/test';
@source '../lib/**/*.{ts,tsx}';
```

**`packages/react/vite.config.ts`** — replace the whole file. `create-vite`
wrote one that builds an app; this one only serves the playground, because
`tsup` owns the published build.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [react(), tailwindcss()],
	// The playground only — the published build is tsup's job.
	root: 'src/demo'
});
```

```powershell
bun run --filter '@anti049/test-react' dev
```

---

## 10. Build and verify

```powershell
cd packages/react
bun run check      # tsc --noEmit
bun run build      # tsup + publint
ls dist            # index.js, index.cjs, index.d.ts, styles.css
```

Check **both** module systems resolve, which is the whole reason for dual output:

```powershell
node --input-type=module -e "import('@anti049/test-react').then(m => console.log('esm', Object.keys(m)))"
node -e "console.log('cjs', Object.keys(require('@anti049/test-react')))"
```

Then run `attw` — it catches types that resolve for one system and not the other,
which `publint` does not:

```powershell
bunx @arethetypeswrong/cli --pack .
```

---

## Files after this phase

Thirteen files. Everything the React package contains at this point, in full.

| File                                           | Status   | Written in | Next touched by                     |
| ---------------------------------------------- | -------- | ---------- | ----------------------------------- |
| `packages/react/package.json`                  | replaced | step 3     | [8](08-conventions.md) — versioning |
| `packages/react/tsup.config.ts`                | added    | step 4     | never                               |
| `packages/react/tsconfig.json`                 | replaced | step 7     | never                               |
| `packages/react/vite.config.ts`                | replaced | step 9     | never                               |
| `packages/react/src/lib/utils/cn.ts`           | added    | step 5     | never                               |
| `packages/react/src/lib/styles.css`            | added    | step 6     | never                               |
| `packages/react/src/lib/components/Button.tsx` | added    | step 7     | you, per component                  |
| `packages/react/src/lib/components/Badge.tsx`  | added    | step 7     | you, per component                  |
| `packages/react/src/lib/hooks/useRipple.ts`    | added    | step 7     | never                               |
| `packages/react/src/lib/index.ts`              | added    | step 8     | one block per component             |
| `packages/react/src/demo/index.html`           | moved    | step 9     | never                               |
| `packages/react/src/demo/main.tsx`             | replaced | step 9     | you, as a scratchpad                |
| `packages/react/src/demo/app.css`              | added    | step 9     | never                               |

Deleted by step 2: `src/App.tsx`, `src/App.css`, `src/assets/`,
`public/vite.svg`. Delete `packages/react/tsconfig.app.json` and
`tsconfig.node.json` too — step 7 replaces all three with one.

Build output, gitignored: `packages/react/dist/`.

---

### `packages/react/package.json`

```json
{
	"name": "@anti049/test-react",
	"version": "0.0.0",
	"type": "module",
	"license": "MIT",
	"description": "React components for the test design system.",
	"keywords": ["react", "tailwindcss", "ui", "components", "design-system"],
	"repository": {
		"type": "git",
		"url": "git+https://github.com/Anti049/test.git",
		"directory": "packages/react"
	},
	"scripts": {
		"dev": "vite",
		"build": "tsup && node -e \"require('node:fs').copyFileSync('src/lib/styles.css','dist/styles.css')\" && publint",
		"check": "tsc --noEmit"
	},
	"files": ["dist"],
	"main": "./dist/index.cjs",
	"module": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js",
			"require": "./dist/index.cjs"
		},
		"./styles.css": "./dist/styles.css",
		"./package.json": "./package.json"
	},
	"sideEffects": ["**/*.css"],
	"peerDependencies": {
		"@anti049/test": "^0.0.0",
		"react": "^18 || ^19",
		"react-dom": "^18 || ^19"
	},
	"dependencies": {
		"clsx": "^2.1.1",
		"tailwind-merge": "^3.7.0"
	},
	"devDependencies": {
		"@anti049/test": "workspace:*",
		"@tailwindcss/vite": "^4.3.3",
		"@types/react": "^19.3.0",
		"@types/react-dom": "^19.3.0",
		"@vitejs/plugin-react": "^6.1.1",
		"publint": "^0.3.24",
		"react": "^19.3.0",
		"react-dom": "^19.3.0",
		"tailwindcss": "^4.3.3",
		"tsup": "^8.5.1",
		"typescript": "~6.0.3",
		"vite": "^8.3.0"
	},
	"publishConfig": { "access": "public", "provenance": true }
}
```

Three notes on this one:

- **The `cp` is a Node one-liner**, not `cp src/... dist/...`. npm and Bun run
  scripts through `cmd.exe` on Windows, where `cp` does not exist
  ([guide 0](00-prerequisites.md)). `tsup` does not copy non-TS assets, so
  without this step `dist/styles.css` is missing and the `./styles.css` export
  points at nothing.
- **`main`/`module`/`types` alongside `exports`** are for resolvers that predate
  `exports`. Harmless, and occasionally the difference between working and not.
- **`react` and `react-dom` are in both `peerDependencies` and
  `devDependencies`.** The peer entry is what consumers satisfy; the dev entry is
  what the playground and the typecheck run against. Omit the dev entry and
  `bun run check` fails on a fresh clone.

**One difference from the Svelte and Vue packages worth knowing.** Their
`index.ts` does `import './styles.css'`, so the `@source` registration takes
effect the moment a consumer imports a component. React's does not — `tsup`
would bundle it into `dist/index.css` and the exports map would disagree with
itself. So a React consumer must import the stylesheet themselves:

```ts
import '@anti049/test-react/styles.css';
```

Put that line in the package README and in the docs site's install page. It is
the one place the three bindings genuinely differ, and a consumer who misses it
gets unstyled components with no error.

---

### `packages/react/tsup.config.ts`

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
	// The only entry. Anything not reachable from here is not published.
	entry: ['src/lib/index.ts'],

	// Dual output. Jest without ESM configuration, older Next.js setups and a
	// long tail of tooling still require(). It costs one flag.
	format: ['esm', 'cjs'],

	// A separate TypeScript pass for declarations. It dominates build time on a
	// large package, but shipping without types is not an option.
	dts: true,

	sourcemap: true,

	// tsup owns dist/, so nothing else may delete it.
	clean: true,

	treeshake: true,

	/*
		Never bundle these. The consumer brings their own React, and two copies in
		one app is the classic "Invalid hook call" crash — which reads like a bug
		in your components and is not.
	*/
	external: ['react', 'react-dom', '@anti049/test'],

	// `.cjs` rather than `.js` for the CommonJS build, so `"type": "module"` in
	// package.json does not cause Node to parse it as ESM.
	outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' })
});
```

---

### `packages/react/tsconfig.json`

Replaces the scaffold's three-file setup. Delete `tsconfig.app.json` and
`tsconfig.node.json`.

```jsonc
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		// React 17+ JSX transform: no `import React` needed in every file.
		"jsx": "react-jsx",
		// The base config sets "types": [], so DOM-adjacent types are named here.
		"types": ["vite/client"],
		// `tsup` owns emission; this config is a checker only.
		"noEmit": true
	},
	"include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts", "tsup.config.ts"]
}
```

`include` covers `src/demo` as well as `src/lib` deliberately — the playground is
not published, but a type error in it is still one you want to see.

---

### `packages/react/vite.config.ts`

Replaces the scaffold's. This serves the playground only; `tsup` owns the
published build and never reads this file.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [react(), tailwindcss()],

	/*
		The playground is the root when serving, so Vite looks for
		src/demo/index.html rather than the one create-vite left at the package
		root. Move that file rather than leaving both — two index.html files is a
		confusing thing to come back to.
	*/
	root: 'src/demo'
});
```

---

### `packages/react/src/lib/utils/cn.ts`

Byte-identical to the Svelte and Vue copies. When it diverges, the three start
resolving class conflicts differently and nobody notices for months.

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

### `packages/react/src/lib/styles.css`

```css
/*
	Registers this package's components with the CONSUMER's Tailwind scan.

	Tailwind does not look inside node_modules by default, so without this their
	build never sees `className="button button-filled"` in your components and
	the classes are never emitted — the components render completely unstyled.

	Unlike Svelte and Vue, this file is NOT imported by index.ts (see the
	package.json notes). A React consumer imports it explicitly:

	    import '@anti049/test-react/styles.css';
*/
@source '../**/*.{ts,tsx}';
```

---

### `packages/react/src/lib/components/Button.tsx`

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../utils/cn.js';

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
}

/*
	Keep forwardRef even though React 19 makes `ref` a normal prop.

	The peer range allows React 18, where a plain function component silently
	receives `undefined` for ref — so every consumer using a ref to focus or
	measure the button breaks, with no error. Drop it only when you drop React
	18, which is a major.

	Naming the inner function gives a real name in React DevTools and stack
	traces without a separate displayName assignment.
*/
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ variant = 'filled', size = 'md', className, ...rest },
	ref
) {
	return (
		<button
			ref={ref}
			// className last, so the consumer's value wins the twMerge.
			className={cn('button', `button-${variant}`, `button-${size}`, className)}
			{...rest}
		/>
	);
});
```

---

### `packages/react/src/lib/components/Badge.tsx`

```tsx
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn.js';

export type BadgeVariant = 'primary' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	variant?: BadgeVariant;
	children?: ReactNode;
}

/*
	No forwardRef here, unlike Button. A badge is not something a consumer
	focuses or measures, so the ref would be unused API surface — and the
	contrast makes Button's deliberate forwardRef easier to see.
*/
export function Badge({ variant = 'primary', className, ...rest }: BadgeProps) {
	return <span className={cn('badge', `badge-${variant}`, className)} {...rest} />;
}
```

`badge` and `badge-primary` are exactly the classes
`packages/core/src/components/badge.css` defines in [guide 2](02-plugin.md)
step 3. Nothing checks the two against each other.

---

### `packages/react/src/lib/hooks/useRipple.ts`

```ts
import { useCallback, useRef, type PointerEvent } from 'react';

/*
	Returns a ref to attach and an onPointerDown handler:

	    const { ref, onPointerDown } = useRipple();
	    <button ref={ref} onPointerDown={onPointerDown}>…</button>

	The class name below is created by JAVASCRIPT at runtime, so Tailwind's
	scanner can never see it — there is no literal `project-ripple` anywhere in
	the consumer's source, and their scan skips node_modules anyway.

	That is why the plugin routes that rule through addBase rather than
	addUtilities: addBase emits unconditionally, addUtilities is usage-gated and
	would silently emit nothing. See guide 0, decision 3.
*/
export function useRipple() {
	const ref = useRef<HTMLElement | null>(null);

	const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
		const node = ref.current;
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

		// Self-removing, so nothing has to be cleaned up on unmount.
		circle.addEventListener('animationend', () => circle.remove());
		node.append(circle);
	}, []);

	return { ref, onPointerDown };
}
```

---

### `packages/react/src/lib/index.ts`

```ts
// Components, each with its types alongside. `export type` rather than `export`
// is required under isolatedModules, which the base tsconfig turns on.
export { Button } from './components/Button.js';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button.js';

export { Badge } from './components/Badge.js';
export type { BadgeProps, BadgeVariant } from './components/Badge.js';

// Behaviour.
export { useRipple } from './hooks/useRipple.js';

// The class-merge helper, so consumers composing on top of a component resolve
// conflicts the same way the component does.
export { cn } from './utils/cn.js';
```

The `.js` extensions on TypeScript imports are correct under
`moduleResolution: bundler` and required under `node16`. Being consistent now
saves a migration later.

---

### `packages/react/src/demo/index.html`

Moved from the package root, where `create-vite` left it. Vite needs it here
because `vite.config.ts` sets `root: 'src/demo'`.

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>test — React</title>
	</head>
	<body>
		<div id="root"></div>
		<script type="module" src="./main.tsx"></script>
	</body>
</html>
```

The `src` is `./main.tsx`, relative to this file — not `/src/main.tsx` as the
scaffold wrote it, because the root moved.

---

### `packages/react/src/demo/main.tsx`

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Badge } from '../lib/index.js';
import './app.css';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<div className="flex flex-wrap items-center gap-2 p-8">
			<Button variant="filled">Filled</Button>
			<Button variant="tonal">Tonal</Button>
			<Button variant="outlined" disabled>
				Disabled
			</Button>
			<Badge>3</Badge>
		</div>
	</StrictMode>
);
```

Imports from `../lib/index.js` — the source barrel, not the built package — so
the playground reflects your edits without a build.

---

### `packages/react/src/demo/app.css`

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
@source '../lib/**/*.{ts,tsx}';
```

---

## Traps

> **Two copies of React.** If `react` is missing from `external` in the tsup
> config, or a consumer's bundler resolves two versions, you get
> `Invalid hook call` — which reads like a bug in your components and is not.
>
> **How to tell:** `npm ls react` in the consumer's app shows more than one
> version.

> **Dropping `forwardRef` on React 19.** Works on 19, silently breaks refs on 18,
> and your peer range allows 18. See above.

> **`"sideEffects": false`.** Blanket-false lets a bundler drop `styles.css` in
> production builds only, so the components are styled in dev and unstyled in
> prod. List the CSS instead.

> **`dts: true` and a slow build.** `tsup` runs a separate TypeScript pass for
> declarations, which dominates build time on a large package. If it becomes
> painful, `dts: { resolve: true }` or a separate `tsc --emitDeclarationOnly` —
> but do not drop declarations.

> **`tsup` does not copy non-TS assets.** `styles.css` will be missing from
> `dist` and the exports map will point at nothing. The `cp` in `build` is not
> optional; verify `ls dist/styles.css` after building.

---

## Commit

Verify, then commit:

```powershell
bun run --filter '@anti049/test-react' check
git add -A
git commit -m "feat(react): add React bindings"
```

---

## Checkpoint

Step 10 proved both module systems resolve inside the workspace. This proves a
Vite + React app can install the tarball, type-check against it, and ship
production CSS containing the classes the components use.

**Skeleton:** a `create-vite` React app in `$env:TEMP\test-checkpoint\05-react`.
Run from the repository root:

```powershell
$cp   = "$env:TEMP\test-checkpoint"
$pkgs = "$cp\pkgs"
$app  = "$cp\05-react"
Remove-Item -Recurse -Force $pkgs, $app -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $pkgs | Out-Null

bun run --filter '@anti049/test' --filter '@anti049/test-react' build
'core', 'react' | ForEach-Object {
	Push-Location "packages/$_"
	npm pack --pack-destination $pkgs | Out-Null
	Pop-Location
}
$tgz = (Get-ChildItem $pkgs -Filter *.tgz).FullName
$react = $tgz | Where-Object { $_ -match '-react-' }

tar -xzOf $react package/package.json | Select-String 'workspace:'   # prints nothing
tar -tzf $react                                                      # dist/index.js, index.cjs, index.d.ts, styles.css

Push-Location $cp
bunx create-vite@latest 05-react --template react-ts --no-interactive
Set-Location 05-react
npm install --no-audit --no-fund
npm install --no-audit --no-fund -D tailwindcss '@tailwindcss/vite'
npm install --no-audit --no-fund $tgz

# Both module systems, from a real consumer's node_modules.
node --input-type=module -e "import('@anti049/test-react').then(m => console.log('esm', Object.keys(m).join(', ')))"
node -e "console.log('cjs', Object.keys(require('@anti049/test-react')).join(', '))"
```

**`vite.config.ts`** — replace it:

```ts
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [react(), tailwindcss()] });
```

**`src/index.css`** — replace it. `main.tsx` already imports it.

```css
@import 'tailwindcss';
@plugin '@anti049/test';
@import '@anti049/test-react/styles.css';
```

**`src/App.tsx`** — replace it:

```tsx
import { Badge, Button } from '@anti049/test-react';

export default function App() {
	return (
		<>
			<Button variant="filled">Filled</Button>
			<Badge>3</Badge>
		</>
	);
}
```

```powershell
npm run build          # tsc -b && vite build — type-checks against the published .d.ts

$css = (Get-ChildItem dist/assets -Filter *.css).FullName
(Select-String -Path $css -Pattern '\.badge\b').Count           # > 0
(Select-String -Path $css -Pattern '\.badge-primary\b').Count   # > 0
(Select-String -Path $css -Pattern '\.button-filled\b').Count   # > 0

Pop-Location
Remove-Item -Recurse -Force $cp
```

**Passes when** every line prints what its comment says, and the ESM and CJS
lines list the same exports.

**If it does not:** an empty CJS list is a `tsup` `format` problem. A class
missing from the production CSS is worth reading `styles.css` in the tarball
for: its `@source` glob is resolved relative to `dist/`, and it can only match
files the tarball actually contains.

---

Next: [Vue](06-vue.md)
