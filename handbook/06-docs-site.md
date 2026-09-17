# 06 — The Documentation Site (`@scope/project-name-docs`)

A SvelteKit application that documents and demos the plugin and all three
framework libraries, explains installation and usage, and includes a **live theme
generator** that outputs copyable theme CSS. It is never published to npm; it is
deployed as a website (see [08-github-workflows.md](08-github-workflows.md)).

## 1. Scaffold

```sh
cd packages
mkdir docs && cd docs
bunx sv create .        # choose: SvelteKit minimal, TypeScript, no extra add-ons
```

Then align it with the monorepo. `packages/docs/package.json`:

```jsonc
{
  "name": "@scope/project-name-docs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "prepare": "svelte-kit sync || echo ''",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json"
  },
  "dependencies": {
    "@scope/project-name": "workspace:*",
    "@scope/project-name-svelte": "workspace:*",
    "shiki": "^1.24.0",
    "mode-watcher": "^0.5.0"
  },
  "devDependencies": {
    "@scope/project-name": "workspace:*",
    "@sveltejs/adapter-auto": "^3.3.0",
    "@sveltejs/adapter-cloudflare": "^7.0.0",
    "@sveltejs/adapter-static": "^3.0.0",
    "@sveltejs/kit": "^2.15.0",
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

The docs site depends on the workspace packages with `workspace:*` — Bun links
them from source. Note all three adapters are dev-installed: `adapter-cloudflare`
and `adapter-static` (for GitHub Pages) are chosen at build time in
[08-github-workflows.md](08-github-workflows.md).

## 2. Aliasing workspace packages to source

The key to a fast docs feedback loop: during `vite dev`, resolve the Svelte
library and the plugin to their **source**, not their built `dist/`. Editing a
component or a stylesheet then hot-reloads with no package rebuild.

`packages/docs/vite.config.ts`:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const svelteLibEntry = fileURLToPath(new URL('../svelte/src/lib/index.ts', import.meta.url));
const pluginEntry = fileURLToPath(new URL('../project-name/index.ts', import.meta.url));
const pluginWatcher = fileURLToPath(new URL('../project-name/functions/watch.ts', import.meta.url));
const appCss = fileURLToPath(new URL('./src/app.css', import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    sveltekit(),
    ...(command === 'serve' ? [pluginLiveReload()] : [])
  ],
  resolve: {
    // Array form with anchored regexes: an object alias matches by prefix and
    // would rewrite subpath exports like `@scope/project-name/theme` to a path
    // that does not exist. Anchoring each pattern keeps subpaths working.
    alias: [
      { find: /^@scope\/project-name-svelte$/, replacement: svelteLibEntry },
      ...(command === 'serve'
        ? [{ find: /^@scope\/project-name$/, replacement: pluginEntry }]
        : [])
    ]
  }
}));
```

### 3. Live-reloading the plugin

The plugin compiles CSS into `generated/`, so editing `src/**` changes nothing a
dev server can see until `build.ts` runs and Tailwind re-processes the `@plugin`.
Two things must happen, and neither does on its own:

1. **Rebuild `generated/`** — delegate to the plugin's own `watch.ts` so the
   build logic has one home; it touches `index.ts` on success.
2. **Make Tailwind notice** — its Vite plugin tracks the `@plugin` file's mtime
   but only re-checks from inside its CSS `transform`, and its hot-update hook
   ignores `.ts`/`.js` files. Bumping `app.css`'s mtime is what actually re-runs
   that transform.

`pluginLiveReload` (the `Plugin` referenced above) does both:

```ts
function pluginLiveReload(): Plugin {
  return {
    name: 'project-name:reload',
    apply: 'serve',
    configureServer(server) {
      // Run the plugin's watcher as a child so it does not block dev startup.
      const watcher = spawn('bun', [pluginWatcher], {
        stdio: ['ignore', 'inherit', 'inherit'],
        shell: process.platform === 'win32'
      });
      const stop = () => watcher.kill();
      server.httpServer?.on('close', stop);
      process.on('exit', stop);

      server.watcher.add(pluginEntry);
      server.watcher.on('change', (file) => {
        if (path.resolve(file) !== path.resolve(pluginEntry)) return;
        // A real mtime change is the only thing that re-runs Tailwind's
        // transform; invalidating the module or faking an event does not.
        const now = new Date();
        fs.utimesSync(appCss, now, now);
      });
    }
  };
}
```

Running the watcher as a child process (rather than a second workspace script) is
deliberate: `bun run --filter` orders by dependency and docs depends on the
plugin, so a long-lived watcher there would block the dev server from starting.

### 4. The app stylesheet

`src/app.css` wires Tailwind and the plugin, and imports the Svelte library's
safelist so runtime classes survive:

```css
@import 'tailwindcss';
@plugin '@scope/project-name' { themes: default, ocean, forest; }
@import '@scope/project-name-svelte/styles.css';

/* Fonts are the app's choice, not the plugin's. */
@import '@fontsource-variable/inter';
```

## 5. Site structure

```
src/routes/
├── +layout.svelte            # app shell, theme toggle (mode-watcher)
├── +page.svelte              # landing
├── docs/
│   ├── installation/+page.svelte
│   ├── usage/+page.svelte
│   └── [component]/+page.svelte   # per-component reference + live demo
├── components/+page.svelte    # gallery of every component
└── themes/
    ├── +page.svelte           # shipped themes
    └── generator/+page.svelte # the theme generator (below)
```

Use **Shiki** for syntax-highlighted, copyable code blocks and **mode-watcher**
for the light/dark toggle. A small `<CodeBlock>` component wraps Shiki output and
adds a copy button — reused by both the docs pages and the generator.

## 6. The live theme generator

This is the feature called out in the requirements: a **"Generate a Theme"** page
that takes a seed color (and options) and outputs **copyable theme CSS** a
consumer can paste into their `app.css`.

It reuses the exact palette function the plugin's build uses
([02-plugin-package.md](02-plugin-package.md#5-themes-and-material-color-utilities)),
so a generated theme is guaranteed to match a shipped one.

### 6.1 Generation logic

`src/lib/theme/generate.ts`:

```ts
import {
  argbFromHex, themeFromSourceColor, hexFromArgb
} from '@material/material-color-utilities';

export interface GenerateOptions {
  seed: string;                 // hex, e.g. '#4f46e5'
  name?: string;                // theme id, e.g. 'brand'
  selector?: string;            // where to apply, defaults to `[data-theme='name']`
  rounded?: string;             // optional --rounded-button override
}

/** Produce copyable theme CSS from a single seed color. */
export function generateThemeCss(opts: GenerateOptions): string {
  const { seed, name = 'brand', rounded } = opts;
  const selector = opts.selector ?? `[data-theme='${name}']`;
  const theme = themeFromSourceColor(argbFromHex(seed));

  const roles = (scheme: typeof theme.schemes.light) => ({
    '--color-primary': hexFromArgb(scheme.primary),
    '--color-on-primary': hexFromArgb(scheme.onPrimary),
    '--color-secondary': hexFromArgb(scheme.secondary),
    '--color-surface': hexFromArgb(scheme.surface),
    '--color-on-surface': hexFromArgb(scheme.onSurface)
    // …every role your system defines
  });

  const block = (sel: string, vars: Record<string, string>) =>
    `${sel} {\n` + Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n') + `\n}`;

  const light = { ...roles(theme.schemes.light), ...(rounded ? { '--rounded-button': rounded } : {}) };
  const dark = roles(theme.schemes.dark);

  return [
    block(selector, light),
    block(`${selector}.dark, ${selector}[data-mode='dark']`, dark)
  ].join('\n\n');
}
```

Example output the user copies:

```css
[data-theme='brand'] {
  --color-primary: #4f46e5;
  --color-on-primary: #ffffff;
  --color-secondary: #7c5cff;
  --color-surface: #fbfbff;
  --color-on-surface: #1a1b1f;
  --rounded-button: 9999px;
}

[data-theme='brand'].dark, [data-theme='brand'][data-mode='dark'] {
  --color-primary: #c4c0ff;
  /* … */
}
```

### 6.2 The page

`src/routes/themes/generator/+page.svelte`:

```svelte
<script lang="ts">
  import { generateThemeCss } from '$lib/theme/generate';
  import CodeBlock from '$lib/components/CodeBlock.svelte';
  import { Button } from '@scope/project-name-svelte';

  let seed = $state('#4f46e5');
  let name = $state('brand');
  let rounded = $state('');
  const css = $derived(generateThemeCss({ seed, name, rounded: rounded || undefined }));

  // Apply the generated theme live to a preview region by injecting a <style>.
  let styleEl: HTMLStyleElement;
  $effect(() => { styleEl.textContent = css; });

  async function copy() { await navigator.clipboard.writeText(css); }
</script>

<svelte:head><style bind:this={styleEl}></style></svelte:head>

<label>Seed <input type="color" bind:value={seed} /></label>
<label>Name <input bind:value={name} /></label>
<label>Button radius <input placeholder="e.g. 9999px" bind:value={rounded} /></label>

<section data-theme={name}>
  <!-- Live preview: components re-render with the generated palette. -->
  <Button variant="filled" role="primary">Primary</Button>
  <Button variant="outline" role="secondary">Secondary</Button>
</section>

<CodeBlock language="css" code={css} />
<Button onclick={copy}>Copy CSS</Button>
```

Because the preview `<section data-theme={name}>` uses the same selector the
generated CSS targets, editing the seed updates the preview *and* the copyable
output simultaneously — the generator is a live demo of itself.

> **Client-only.** `generateThemeCss` and clipboard access run in the browser.
> The route is fully static; no server load function is required, which keeps the
> generator deployable to GitHub Pages (static) as well as Cloudflare.

## 7. Choosing an adapter at build time

SvelteKit needs the right adapter for each target. Select it via an env var in
`svelte.config.js`:

```js
import adapterAuto from '@sveltejs/adapter-auto';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const target = process.env.DOCS_TARGET; // 'cloudflare' | 'static' | undefined
const adapter =
  target === 'cloudflare' ? adapterCloudflare()
  : target === 'static'   ? adapterStatic({ fallback: '404.html' })
  :                          adapterAuto();

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter,
    // GitHub Pages serves from a subpath; set it only for the static build.
    paths: target === 'static' ? { base: process.env.BASE_PATH ?? '' } : undefined,
    prerender: { handleHttpError: 'warn' }
  }
};
```

For GitHub Pages the whole site prerenders (add `export const prerender = true;`
to the root `+layout.ts`). For Cloudflare you may keep SSR routes. Both are wired
up in [08-github-workflows.md](08-github-workflows.md).

## 8. Running it

```sh
bun run dev            # from repo root → docs at http://localhost:5173
```

Editing a Svelte component (`packages/svelte/src/lib/**`) or the plugin's CSS
(`packages/project-name/src/**`) hot-reloads without any manual rebuild, thanks
to §2 and §3.

Debugging this site — browser and server — inside VS Code is covered in
[12-debugging.md](12-debugging.md).

## Checklist

- [ ] SvelteKit app depending on workspace packages with `workspace:*`.
- [ ] Vite aliases the Svelte lib (always) and the plugin (serve only) to source.
- [ ] `pluginLiveReload` runs the plugin watcher and bumps `app.css` mtime.
- [ ] Shiki code blocks with copy buttons; mode-watcher light/dark toggle.
- [ ] Theme generator page reuses the plugin's palette function and shows a live
      preview plus copyable CSS.
- [ ] `svelte.config.js` picks Cloudflare / static / auto adapter by env var.

Next: [07-issues-milestones.md](07-issues-milestones.md).
