# 04 — The React Component Library (`@scope/project-name-react`)

A brand-new package that mirrors the Svelte library from
[03-svelte-package.md](03-svelte-package.md) one-for-one, but for React 19. Same
principle: **no design lives here**; components emit the plugin's class names and
add behavior. The differences are all mechanical — build tool, JSX, hooks instead
of actions, and the `"use client"` boundary.

## 1. Scaffold

```sh
cd packages
mkdir react && cd react
```

React components need a bundler that emits ESM (and optionally CJS) plus type
declarations. Use **`tsup`** (esbuild under the hood) for JS and `tsc` for types
— fast and zero-config.

`packages/react/package.json`:

```jsonc
{
	"name": "@scope/project-name-react",
	"version": "0.0.0",
	"description": "React 19 components for project-name.",
	"type": "module",
	"repository": {
		"type": "git",
		"url": "git+https://github.com/your-org/project-name.git",
		"directory": "packages/react"
	},
	"scripts": {
		"build": "tsup && publint",
		"dev": "tsup --watch",
		"check": "tsc --noEmit",
		"test": "vitest run",
		"prepack": "tsup && publint"
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
	"peerDependencies": {
		"@scope/project-name": "workspace:^",
		"react": "^18.3.0 || ^19.0.0",
		"react-dom": "^18.3.0 || ^19.0.0"
	},
	"devDependencies": {
		"@scope/project-name": "workspace:*",
		"@testing-library/react": "^16.0.0",
		"@types/react": "^19.0.0",
		"@types/react-dom": "^19.0.0",
		"jsdom": "^25.0.0",
		"publint": "^0.3.0",
		"react": "^19.0.0",
		"react-dom": "^19.0.0",
		"tsup": "^8.3.0",
		"typescript": "^5.7.0",
		"vitest": "^2.0.0"
	},
	"keywords": ["react", "ui", "components"]
}
```

`react` and `react-dom` are **peer** dependencies with a wide range so the
library works in both React 18 and 19 apps.

`tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,                 // emit .d.ts via tsc
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', '@scope/project-name'],
  // Copy the safelist stylesheet next to the JS output.
  onSuccess: 'cp src/styles.css dist/styles.css',
  // Preserve the "use client" banner in the output.
  banner: { js: '"use client";' }
});
```

`tsconfig.json`:

```jsonc
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"jsx": "react-jsx",
		"lib": ["ES2023", "DOM", "DOM.Iterable"],
		"types": ["react", "react-dom"]
	},
	"include": ["src"]
}
```

## 2. The `cn` utility (identical intent)

`src/utils/cn.ts` is byte-for-byte the same as the Svelte version — keep them in
sync deliberately (an AI skill in [10-ai-agents.md](10-ai-agents.md) can enforce
this):

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

## 3. A component: `Button.tsx`

`src/components/Button.tsx`:

```tsx
'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../utils/cn.js';
import { useRipple } from '../hooks/useRipple.js';

type Variant = 'filled' | 'outline' | 'text';
type Role = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  role?: Role;
  rippleless?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'filled', role = 'primary', rippleless = false, className, children, ...rest },
  ref
) {
  const ripple = useRipple({ disabled: rippleless });
  return (
    <button
      ref={ref}
      className={cn('button', `button-${variant}`, `button-${role}`, className)}
      {...ripple}
      {...rest}
    >
      {children}
    </button>
  );
});
```

Note the exact parallels to Svelte: props map to the same plugin classes,
`className` is merged last, native attributes spread through `...rest`, behavior
lives in a hook. Because these components have interactivity, they carry the
`"use client"` directive so they work in React Server Components / Next.js App
Router.

## 4. Behavior: the `useRipple` hook

`src/hooks/useRipple.ts` returns the props to spread onto the host element:

```ts
import { useCallback, type PointerEvent } from 'react';

export function useRipple({ disabled = false }: { disabled?: boolean }) {
  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    if (disabled) return;
    const node = e.currentTarget;
    const el = document.createElement('span');
    el.className = 'ripple';
    const rect = node.getBoundingClientRect();
    el.style.left = `${e.clientX - rect.left}px`;
    el.style.top = `${e.clientY - rect.top}px`;
    node.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }, [disabled]);

  return { onPointerDown, style: { ['--interactive' as string]: 1 } };
}
```

Same runtime `.ripple` class from the plugin; same `--interactive` marker. The
only difference from Svelte is the delivery mechanism (a hook returning props vs.
an action attaching listeners).

## 5. Safelist stylesheet and barrel export

`src/styles.css` (identical purpose to the Svelte bridge):

```css
@source inline('ripple button button-filled button-outline button-text');
```

`src/index.ts`:

```ts
export { Button, type ButtonProps } from './components/Button.js';
export { cn } from './utils/cn.js';
```

## 6. Build, check, test

```sh
bun run --filter '@scope/project-name-react' build   # tsup → dist/ + .d.ts + publint
bun run --filter '@scope/project-name-react' check   # tsc --noEmit
bun run --filter '@scope/project-name-react' test    # vitest + @testing-library/react
```

`vitest.config.ts` uses the jsdom environment:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom' } });
```

Representative test:

```tsx
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { Button } from '../src/components/Button.js';

test('applies plugin classes from props', () => {
  render(<Button variant="outline" role="danger">Delete</Button>);
  const btn = screen.getByRole('button', { name: 'Delete' });
  expect(btn.className).toContain('button-outline');
  expect(btn.className).toContain('button-danger');
});
```

## 7. Consuming from a React app

```sh
npm install @scope/project-name @scope/project-name-react
```

```css
/* app.css */
@import 'tailwindcss';
@plugin '@scope/project-name';
@import '@scope/project-name-react/styles.css';
```

```tsx
import { Button } from '@scope/project-name-react';

export default function App() {
  return <Button variant="filled" role="primary" className="rounded-full">Save</Button>;
}
```

The `rounded-full` override flows through `cn`/`twMerge` exactly as in Svelte —
the cross-framework parity is structural, not copied.

## 8. Keeping the three libraries in lockstep

Because the React, Svelte, and Vue components share the _same_ prop → class
contract, drift is the main risk. Two safeguards:

1. **A shared contract test.** A small JSON fixture (`variant`/`role` → expected
   class list) lives at the repo root; each library has a test that asserts its
   `Button` produces those classes. One fixture, three consumers.
2. **An AI skill** (`add-component`, [10-ai-agents.md](10-ai-agents.md)) that,
   given a component spec, scaffolds all three implementations at once so they
   never diverge in the first place.

## Checklist

- [ ] `tsup` build emitting ESM + `.d.ts`, `"use client"` banner, `styles.css`
      copied to `dist/`.
- [ ] `react`/`react-dom`/plugin as **peer** deps.
- [ ] `cn` identical to Svelte; `Button` maps the same props to the same classes.
- [ ] `useRipple` hook mirrors the Svelte ripple action.
- [ ] Safelist stylesheet exported as `./styles.css`; `publint` clean.
- [ ] Contract test asserts prop → class parity with the other libraries.

Next: [05-vue-package.md](05-vue-package.md).
