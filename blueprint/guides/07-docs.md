# 7. The documentation site

A SvelteKit app that consumes all four published packages the way a real consumer
would, plus a live-reload loop that makes editing the plugin's CSS feel like
editing a stylesheet again.

Use whatever framework you like for the site itself. SvelteKit is assumed here
because it gives you SSR, file-based routing and a Vite config you can reach into
— and the debugging setup in [guide 11](11-debugging.md) depends on that Vite
config.

Thirteen steps. Steps 1–4 give you a working site, 5–10 are the live-reload
loop, and 11–13 are the content.

The site is written in **Markdown**, through `mdsvex`, so a component page is
prose with live examples embedded in it rather than a Svelte file with prose
escaped inside. It deploys to **GitHub Pages** and nowhere else, which makes
`adapter-static` and a base path non-negotiable rather than a choice.

---

## 1. Scaffold the site

```powershell
cd packages/docs
bunx sv create . --template minimal --types ts
```

`sv create` is the current SvelteKit scaffolder (`create-svelte` is the retired
name and still works, but `sv` is what gets updates). Running it with `.` as the
target fills the directory you made in [guide 1](01-monorepo.md) rather than
nesting another one.

It will ask about add-ons. Decline them all — Tailwind is added by hand in the
next step because the version `sv` installs is not necessarily the version the
plugin is built against, and a mismatch here is very confusing later.

---

## 2. Install Tailwind and the workspace packages

```powershell
bun add -d '@tailwindcss/vite' tailwindcss
bun add -d '@sveltejs/adapter-static' mdsvex
bun add '@scope/project-name' '@scope/project-name-svelte'
```

`adapter-static` replaces the `adapter-auto` the scaffold installed. Pages
serves files, not a server, and `adapter-auto` silently picks a Node adapter
when it cannot identify the host — producing a `build/` that Pages cannot serve,
with no error until the deploy is live.

Bun resolves the two `@scope` packages to the workspace symlinks, not the
registry. Confirm that before going further — if either one came from npm you are
about to document a published version rather than the one you are editing:

```powershell
# LinkType should read "SymbolicLink" for each. A plain directory means Bun
# fetched a published package instead of linking the local one.
Get-ChildItem ../../node_modules/@scope | Select-Object Name, LinkType
```

**`packages/docs/vite.config.ts`** — replace the whole file. `sv create`
wrote one; this is a minimal version that step 7 replaces again.

`@tailwindcss/vite` must come **before** `sveltekit()`:

```ts
// packages/docs/vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()]
});
```

Step 8 replaces this file wholesale. It is worth writing the small version first
and confirming the site serves, so that when the big one misbehaves you know the
difference is yours.

---

## 3. Configure `adapter-static`, the base path, and mdsvex

**`packages/docs/svelte.config.js`** — replace the whole file.

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';

/** @type {import('@sveltejs/kit').Config} */
export default {
	/*
		`.md` files become routes. The order matters: mdsvex must run before
		vitePreprocess, so that `lang="ts"` inside a fenced Svelte block in a
		Markdown file is still handled.
	*/
	extensions: ['.svelte', '.md'],
	preprocess: [
		mdsvex({
			extensions: ['.md'],
			/*
				Every .md route is wrapped in this component, which is what gives
				documentation pages a consistent shell without repeating it in each
				file. See step 5.
			*/
			layout: { _: './src/lib/layouts/doc.svelte' }
		}),
		vitePreprocess()
	],

	kit: {
		adapter: adapter({
			// upload-pages-artifact in guide 9 reads `build/`. These must agree.
			pages: 'build',
			assets: 'build',
			/*
				Pages has no server, so an unknown URL cannot be routed. Writing
				index.html as the 404 page makes it serve the app, which then routes
				client-side — the standard SPA fallback.
			*/
			fallback: '404.html',
			precompress: false,
			strict: true
		}),

		paths: {
			/*
				Pages serves from https://<user>.github.io/<repo>/, so every asset
				and link needs that prefix. It is read at BUILD time from the
				environment — guide 9's workflow sets it — and is empty locally so
				`bun run dev` serves from the root.
			*/
			base: process.env.BASE_PATH ?? ''
		},

		prerender: {
			/*
				Fail the build on a broken internal link rather than shipping it.
				This is the check that catches a hand-written href="/components"
				that ignores the base path.
			*/
			handleHttpError: 'fail'
		}
	}
};
```

**`strict: true`** makes the build fail if any route could not be prerendered.
That is what you want for a documentation site: every page is static, and a
route that needs a server is a mistake rather than a fallback.

---

## 4. Write `app.css` the way a consumer would

**`packages/docs/src/app.css`** — new file.

```css
@import 'tailwindcss';

/* Fonts come from the consumer, not the plugin. */
@import '@fontsource-variable/inter/wght.css';

/* Components, tokens and themes all arrive through the plugin. */
@plugin '@scope/project-name';

/* A custom theme, the way a consumer would declare one. */
@plugin '@scope/project-name/theme' {
	name: brand;
	seed-primary: #0956aa;
}

/* Components live in another package — register them as a source. */
@source '../../svelte/src/lib/**/*.svelte';
```

**`packages/docs/src/routes/+layout.svelte`** — replace it. The scaffold's
version does not import the stylesheet, so nothing is styled until you do:

```svelte
<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

{@render children()}
```

**Dogfood deliberately.** If the docs site needs a workaround that a consumer
could not use — reaching into `packages/core/src/` directly, importing an
unexported path, patching a token by hand — that is a bug in the plugin, not in
the site. Write the workaround down as an issue instead of shipping it here.

Check the site serves:

```powershell
bun run --filter '@scope/project-name-docs' dev
```

---

## 5. Understand what live reload actually requires

The plugin is _compiled from_ CSS. Editing `packages/core/src/**` changes nothing
a dev server can see until the generator has run again — and even then, nothing
tells Vite to recompile.

Three things must happen, and none of them happens on its own:

1. **Rebuild `generated/`** when a source stylesheet changes.
2. **Make Tailwind notice.** Its Vite plugin _does_ track the `@plugin` file's
   mtime, but only re-checks it from inside its CSS `transform`, and its
   hot-update hook deliberately ignores `.ts` and `.js` files. So nothing ever
   re-runs that transform.
3. **Skip `tsc`.** Tailwind loads a plugin through jiti, which reads TypeScript,
   so pointing `@plugin` at source means the loop only needs the generator.

Steps 6 and 7 are one piece each: a watcher that does (1), and a Vite plugin that
does (2). Step 8 does (3) with an alias.

---

## 6. Write the watcher

**`packages/core/functions/watch.ts`** — new file. It lives in the **plugin**
package, not the docs app, because it is the plugin's own build that it re-runs.

```ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const pkgRoot = path.resolve(import.meta.dirname, '..');
const entry = path.join(pkgRoot, 'index.ts');
let timer: NodeJS.Timeout | undefined;

function build(): void {
	try {
		execFileSync(process.execPath, [path.join(pkgRoot, 'functions/build.ts')], { cwd: pkgRoot });
		// Touch the entry: a consumer's Tailwind tracks the @plugin file's mtime,
		// not its imports, and `generated/` is where the change actually landed.
		const now = new Date();
		fs.utimesSync(entry, now, now);
	} catch (error) {
		// Keep watching. A syntax error mid-edit is normal, not fatal.
		console.error(String((error as { stderr?: Buffer }).stderr ?? error));
	}
}

build();
for (const dir of [path.join(pkgRoot, 'src'), import.meta.dirname]) {
	fs.watch(dir, { recursive: true }, (_event, file) => {
		if (!file || !/\.(css|ts)$/.test(file)) return;
		clearTimeout(timer);
		timer = setTimeout(build, 80); // one save should be one build
	});
}
```

The 80 ms debounce is not cosmetic. Editors write a save as several filesystem
events (truncate, write, rename), and without it one Ctrl-S triggers three
builds, the last two racing the first.

**Checkpoint** — run it alone and edit a stylesheet in another terminal:

```powershell
cd packages/core && bun functions/watch.ts
```

You should see one rebuild per save and no output at all while idle. Fix it here,
before a dev server is in the picture.

---

## 7. Write the Vite bridge plugin

**`packages/docs/vite.config.ts`** — add this function above
`export default`. Step 8 shows the finished file with it in place.

This is the half that tells Tailwind something changed:

```ts
function livePlugin(entry: string): Plugin {
	return {
		name: 'project-name:reload',
		apply: 'serve',
		configureServer(server) {
			// A child process, not a sibling workspace script: `bun run --filter`
			// orders by workspace dependency, and docs depends on core, so a
			// never-exiting watcher there stops the dev server from ever starting.
			const child = spawn('bun', [watcher], {
				stdio: ['ignore', 'inherit', 'inherit'],
				shell: process.platform === 'win32'
			});
			const stop = () => child.kill();
			server.httpServer?.on('close', stop);
			process.on('exit', stop);

			server.watcher.add(entry);
			server.watcher.on('change', (file) => {
				if (path.resolve(file) !== path.resolve(entry)) return;
				// Bumping app.css's mtime is what re-runs Tailwind's transform.
				// Invalidating the module by hand still serves a cached `?direct`
				// response; a synthetic watcher event runs HMR but not a fresh
				// transform. Only a real mtime change does both.
				const now = new Date();
				fs.utimesSync(appCss, now, now);
			});
		}
	};
}
```

`apply: 'serve'` keeps the whole thing out of production builds. Without it,
`vite build` spawns a watcher that never exits and CI hangs at 100% with no error.

---

## 8. Alias the plugin to source, carefully

**`packages/docs/vite.config.ts`** — replace the whole file, for the last
time. This supersedes both step 2 and step 6:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const pluginEntry = fileURLToPath(new URL('../core/index.ts', import.meta.url));
const themeEntry = fileURLToPath(new URL('../core/theme.ts', import.meta.url));
const svelteLib = fileURLToPath(new URL('../svelte/src/lib/index.ts', import.meta.url));
const watcher = fileURLToPath(new URL('../core/functions/watch.ts', import.meta.url));
const appCss = fileURLToPath(new URL('./src/app.css', import.meta.url));

// … livePlugin from step 6 …

export default defineConfig(({ command }) => ({
	plugins: [tailwindcss(), sveltekit(), ...(command === 'serve' ? [livePlugin(pluginEntry)] : [])],
	resolve: {
		// Array form with anchored patterns. The object form matches by PREFIX,
		// so '@scope/project-name' would also catch '@scope/project-name/theme'
		// and rewrite it to `index.ts/theme`, breaking every subpath export.
		alias: [
			{ find: /^@scope\/project-name-svelte$/, replacement: svelteLib },
			...(command === 'serve'
				? [
						{ find: /^@scope\/project-name$/, replacement: pluginEntry },
						{ find: /^@scope\/project-name\/theme$/, replacement: themeEntry }
					]
				: [])
		]
	},
	ssr: {
		// Dependencies with extensionless internal imports fail under Node's ESM
		// resolver, which is what Vite SSR runs on. Let Vite bundle them.
		noExternal: ['@material/material-color-utilities']
	},
	server: { fs: { allow: [repoRoot] } }
}));
```

Three things are load-bearing here:

- **One alias entry per exported subpath.** Add an entry every time the plugin
  gains an export, or that export resolves to `dist/` in dev and `src/` in build
  and you get two copies of the module.
- **`command === 'serve'`** — production builds still resolve to `dist/`, so the
  site is built against what consumers actually install.
- **`server.fs.allow`** — Vite refuses to serve files outside the project root by
  default, and every one of these aliases points outside it.

---

## 9. Handle SSR-hostile dependencies

`ssr.noExternal` above is not specific to one package. Any dependency that uses
extensionless internal imports (`import { Hct } from './hct'`) is valid ESM to a
bundler and invalid to Node, and Vite's SSR runs on Node. Symptom:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/hct' imported from '…/index.js'
```

Add the package to `noExternal` and Vite bundles it instead of handing it to
Node. The alternative — a per-package `resolve.alias` for every internal file —
is not maintainable.

If a dependency is only ever used in the browser, the other fix is to import it
inside `onMount` or behind `if (browser)`, so SSR never touches it.

---

## 10. Verify the loop end to end

```powershell
bun run --filter '@scope/project-name-docs' dev
```

With the site open on a page that uses a component:

1. Edit a declaration in `packages/core/src/components/button.css` — change a
   padding to something obviously wrong, like `4rem`.
2. Save. The terminal shows one rebuild line.
3. The browser restyles without a full reload, in well under a second.
4. Undo, save, and confirm it goes back.

If step 3 does not happen, check in this order: did `generated/` change
(`git status`), did `index.ts`'s mtime change (`ls -l`), did `app.css`'s mtime
change. Whichever is the first `no` is where the break is.

---

## 11. Decide what the site contains

| Section                          | Why                                                                     |
| -------------------------------- | ----------------------------------------------------------------------- |
| Install and setup, per framework | The first thing anyone needs, and the easiest to get wrong              |
| One page per component           | Live preview, the class table, copyable markup for all three frameworks |
| Theme generator                  | Pick a seed, preview live, copy the plugin call or the expanded CSS     |
| Tokens reference                 | What `--radius-field`, `--size-selector` etc. actually do               |
| Migration notes                  | Per breaking release, with before/after                                 |

The class table should be **generated from the plugin's own registry**, not
hand-written. A hand-written table is wrong within two releases. You already have
the registry — it is the same `generated/` module the plugin consumes — so import
it and render from it.

---

## 12. Write the pages in Markdown

`mdsvex` makes every `.md` file under `src/routes/` a route, and lets Svelte
components appear inside the prose. That is the whole reason for it: a component
page is mostly writing, with live examples in the middle, and expressing that as
a `.svelte` file means escaping paragraphs into markup.

**`packages/docs/src/lib/layouts/doc.svelte`** — new file. `svelte.config.js`
wraps every `.md` route in this, so it is where the page shell lives.

```svelte
<script lang="ts">
	// Frontmatter from the .md file arrives as props, one per key.
	export let title: string = '';
	export let description: string = '';

	let { children } = $props();
</script>

<svelte:head>
	<title>{title} — project-name</title>
	{#if description}<meta name="description" content={description} />{/if}
</svelte:head>

<article class="prose mx-auto max-w-3xl p-8">
	<h1>{title}</h1>
	{#if description}<p class="lead">{description}</p>{/if}
	{@render children()}
</article>
```

**`packages/docs/src/routes/components/button/+page.md`** — new file. The `.md`
extension is what routes it, because `extensions` in `svelte.config.js` lists it.

```markdown
---
title: Button
description: Filled, tonal, outlined and text buttons.
---

<script>
	import { Button } from '@scope/project-name-svelte';
	import Example from '$lib/components/Example.svelte';
</script>

Buttons trigger an action. Use a filled button for the primary action on a
screen, and at most one of them.

<Example>
	<Button variant="filled">Filled</Button>
	<Button variant="tonal">Tonal</Button>
	<Button variant="outlined">Outlined</Button>
</Example>

## Variants

| Variant    | Use for                                    |
| ---------- | ------------------------------------------ |
| `filled`   | the single most important action on screen |
| `tonal`    | a secondary action of similar weight       |
| `outlined` | an action that should not draw the eye     |
| `text`     | tertiary actions, and anything in a row    |

## Classes

<ClassTable component="button" />
```

Three things about that file:

- **The `<script>` block is ordinary Svelte.** Anything it imports can be used
  in the prose below it, which is what makes a live example possible.
- **Frontmatter becomes layout props.** `title` and `description` are read by
  `doc.svelte` above, not by the page itself.
- **`<ClassTable>` should be generated from the plugin's registry**, not
  hand-written. You already have the registry — it is the same `generated/`
  module the plugin consumes — so import it and render from it. A hand-written
  class table is wrong within two releases.

**`packages/docs/src/lib/components/Example.svelte`** — new file. A frame around
live examples, so they are visually distinct from the prose.

```svelte
<script lang="ts">
	let { children } = $props();
</script>

<div class="not-prose rounded-box my-6 flex flex-wrap items-center gap-2 border p-6">
	{@render children()}
</div>
```

`not-prose` matters if you use `@tailwindcss/typography` on the wrapper: without
it, the plugin restyles your components' own type and they stop looking like
themselves.

---

## 13. Build for production, then check the built site

```powershell
bun run --filter '@scope/project-name-docs' build
bun run --filter '@scope/project-name-docs' preview
```

The preview server runs the **aliased-to-`dist`** path, which is the one your
dev loop never exercises. Click through a page of each kind before trusting it.
This is the build [guide 9](09-github.md) deploys, so a failure here is a failure
in CI.

---

## Files after this phase

Thirteen files, twelve of them in `packages/docs` and one in `packages/core`.

| File                                                  | Status   | Written in | Next touched by             |
| ----------------------------------------------------- | -------- | ---------- | --------------------------- |
| `packages/docs/package.json`                          | replaced | step 2     | never                       |
| `packages/docs/svelte.config.js`                      | replaced | step 3     | never                       |
| `packages/docs/vite.config.ts`                        | replaced | step 8     | never                       |
| `packages/docs/tsconfig.json`                         | kept     | scaffold   | never                       |
| `packages/docs/src/app.html`                          | kept     | scaffold   | never                       |
| `packages/docs/src/app.d.ts`                          | kept     | scaffold   | never                       |
| `packages/docs/src/app.css`                           | added    | step 4     | as the plugin gains options |
| `packages/docs/src/routes/+layout.svelte`             | replaced | step 4     | as the site grows a nav     |
| `packages/docs/src/routes/+layout.ts`                 | added    | step 3     | never                       |
| `packages/docs/src/lib/layouts/doc.svelte`            | added    | step 12    | as the page shell grows     |
| `packages/docs/src/lib/components/Example.svelte`     | added    | step 12    | never                       |
| `packages/docs/src/routes/components/button/+page.md` | added    | step 12    | one file per component      |
| `packages/core/functions/watch.ts`                    | added    | step 6     | [15](15-tokens.md)          |

Gitignored: `packages/docs/.svelte-kit/` and `packages/docs/build/`.

Deleted: `@sveltejs/adapter-auto` is replaced by `@sveltejs/adapter-static` in
step 2. Remove it from `devDependencies` rather than leaving both — whichever
`svelte.config.js` imports is the one that runs, but a stale adapter is a
confusing thing to find later.

---

### `packages/docs/package.json`

```json
{
	"name": "@scope/project-name-docs",
	"version": "0.0.0",
	"private": true,
	"type": "module",
	"scripts": {
		"dev": "vite dev",
		"build": "vite build",
		"preview": "vite preview",
		"check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
		"prepare": "svelte-kit sync"
	},
	"dependencies": {
		"@scope/project-name": "workspace:*",
		"@scope/project-name-svelte": "workspace:*",
		"@fontsource-variable/inter": "^5.2.8"
	},
	"devDependencies": {
		"@sveltejs/adapter-static": "^3.0.10",
		"@sveltejs/kit": "^2.70.3",
		"@sveltejs/vite-plugin-svelte": "^7.3.0",
		"@tailwindcss/vite": "^4.3.3",
		"@types/node": "^22.20.3",
		"mdsvex": "^0.12.8",
		"svelte": "^5.57.0",
		"svelte-check": "^4.7.6",
		"tailwindcss": "^4.3.3",
		"typescript": "~6.0.3",
		"vite": "^8.3.0"
	}
}
```

Three notes:

- **`"private": true`** — this is the one package that is never published, and
  it is also what `.changeset/config.json` ignores ([guide 8](08-conventions.md)).
  Both are needed: `private` stops an accidental publish, `ignore` stops
  Changesets asking about it on every changeset.
- **`workspace:*`, not `workspace:^`** — the docs site always wants whatever is
  in the tree right now, not a version range. It is never published, so the
  range would never be rewritten anyway.
- **`@types/node`** is here because `svelte.config.js` reads `process.env`.

---

### `packages/docs/svelte.config.js`

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';

/** @type {import('@sveltejs/kit').Config} */
export default {
	/*
		`.md` files become routes. Without this they are treated as static assets
		and the route 404s.
	*/
	extensions: ['.svelte', '.md'],

	/*
		Order matters. mdsvex must run FIRST, so that vitePreprocess sees the
		Svelte it produces rather than raw Markdown — otherwise `lang="ts"` inside
		a .md file is never compiled and TypeScript reaches the browser.
	*/
	preprocess: [
		mdsvex({
			// Must match the `.md` in `extensions` above. Set one and not the
			// other and .md files either 404 or render as literal text.
			extensions: ['.md'],
			/*
				Every .md route is wrapped in this component, which is what gives
				documentation pages a consistent shell without repeating it in each
				file. `_` is the default layout; named entries scope a layout to a
				subdirectory.
			*/
			layout: { _: './src/lib/layouts/doc.svelte' }
		}),
		vitePreprocess()
	],

	kit: {
		adapter: adapter({
			// `upload-pages-artifact` in guide 9 reads `build/`. These must agree.
			pages: 'build',
			assets: 'build',
			/*
				Pages has no server, so an unknown URL cannot be routed server-side.
				Writing index.html as the 404 page makes it serve the app, which then
				routes client-side.
			*/
			fallback: '404.html',
			precompress: false,
			/*
				Fail the build if any route could not be prerendered. For a docs
				site that is what you want: every page is static, and a route that
				needs a server is a mistake rather than something to fall back on.
			*/
			strict: true
		}),

		paths: {
			/*
				Pages serves from https://<user>.github.io/<repo>/, so every asset
				and link needs that prefix. Read at BUILD time from the environment
				— guide 9's workflow sets it — and empty locally, so `vite dev`
				serves from the root.
			*/
			base: process.env.BASE_PATH ?? ''
		},

		prerender: {
			// A broken internal link fails the build rather than shipping. This is
			// what catches a hand-written href that ignores the base path.
			handleHttpError: 'fail'
		}
	}
};
```

---

### `packages/docs/src/routes/+layout.ts`

Two lines, and the build fails without them.

```ts
/*
	Prerender everything. `adapter-static` with `strict: true` refuses to build
	any route that is not prerenderable, and a route is not prerenderable unless
	something opts it in — this is that opt-in, inherited by every route below.

	Without this file the build fails with "The following routes were marked as
	prerenderable, but were not prerendered", naming every page you have.
*/
export const prerender = true;

/*
	No server, so no server-side rendering per request. SSR still happens at
	BUILD time to produce the HTML; this only disables the runtime kind, which
	Pages cannot do anyway.
*/
export const ssr = true;
```

---

### `packages/docs/src/app.css`

```css
@import 'tailwindcss';

/* Fonts come from the consumer, not the plugin. */
@import '@fontsource-variable/inter/wght.css';

/* Components, tokens and themes all arrive through the plugin. */
@plugin '@scope/project-name';

/* A custom theme, the way a consumer would declare one. */
@plugin '@scope/project-name/theme' {
	name: brand;
	seed-primary: #0956aa;
}

/*
	Components live in another package, so Tailwind has to be told where. This
	points at SOURCE rather than the built package because the dev alias in
	vite.config.ts resolves the package to source too — the two must agree or the
	site is styled in production and unstyled in dev.
*/
@source '../../svelte/src/lib/**/*.svelte';

/* The docs site's own components and Markdown pages. */
@source './lib/**/*.svelte';
@source './routes/**/*.{svelte,md}';
```

---

### `packages/docs/src/routes/+layout.svelte`

```svelte
<script lang="ts">
	// The only place the stylesheet is imported. Everything below inherits it.
	import '../app.css';

	let { children } = $props();
</script>

{@render children()}
```

---

### `packages/docs/src/app.html`

Written by the scaffold; unchanged except for the language.

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<link rel="icon" href="%sveltekit.assets%/favicon.png" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
```

`%sveltekit.assets%` on the favicon is not decoration — a bare `/favicon.png`
resolves to the domain root, which on Pages is another repository's site.

---

### `packages/docs/src/app.d.ts`

Written by the scaffold.

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

---

### `packages/docs/tsconfig.json`

Written by the scaffold. Like the Svelte package's, it extends SvelteKit's
generated config rather than `tsconfig.base.json`, because that is where the
`$lib` alias and the `.svelte` mappings live.

```jsonc
{
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
		"moduleResolution": "bundler"
	}
}
```

`.svelte-kit/tsconfig.json` does not exist until `svelte-kit sync` has run,
which is what the `prepare` script is for.

---

### `packages/docs/src/lib/layouts/doc.svelte`

The shell every `.md` route is wrapped in.

```svelte
<script lang="ts">
	// Frontmatter from the .md file arrives as props, one per key.
	export let title: string = '';
	export let description: string = '';

	let { children } = $props();
</script>

<svelte:head>
	<title>{title} — project-name</title>
	{#if description}<meta name="description" content={description} />{/if}
</svelte:head>

<article class="prose mx-auto max-w-3xl p-8">
	<h1>{title}</h1>
	{#if description}<p class="lead">{description}</p>{/if}
	{@render children()}
</article>
```

---

### `packages/docs/src/lib/components/Example.svelte`

```svelte
<script lang="ts">
	let { children } = $props();
</script>

<!--
	`not-prose` matters if you use @tailwindcss/typography on the wrapper:
	without it the plugin restyles your components' own type and they stop
	looking like themselves.
-->
<div class="not-prose rounded-box my-6 flex flex-wrap items-center gap-2 border p-6">
	{@render children()}
</div>
```

---

### `packages/docs/src/routes/components/button/+page.md`

One of these per component. The `.md` extension is what routes it.

```markdown
---
title: Button
description: Filled, tonal, outlined and text buttons.
---

<script>
	import { Button } from '@scope/project-name-svelte';
	import Example from '$lib/components/Example.svelte';
</script>

Buttons trigger an action. Use a filled button for the primary action on a
screen, and at most one of them.

<Example>
	<Button variant="filled">Filled</Button>
	<Button variant="tonal">Tonal</Button>
	<Button variant="outlined">Outlined</Button>
</Example>

## Variants

| Variant    | Use for                                    |
| ---------- | ------------------------------------------ |
| `filled`   | the single most important action on screen |
| `tonal`    | a secondary action of similar weight       |
| `outlined` | an action that should not draw the eye     |
| `text`     | tertiary actions, and anything in a row    |
```

---

### `packages/core/functions/watch.ts`

Lives in the **plugin** package, not the docs app, because it is the plugin's
own build that it re-runs.

```ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const pkgRoot = path.resolve(import.meta.dirname, '..');
const entry = path.join(pkgRoot, 'index.ts');
let timer: NodeJS.Timeout | undefined;

function build(): void {
	try {
		execFileSync(process.execPath, [path.join(pkgRoot, 'functions/build.ts')], { cwd: pkgRoot });
		/*
			Touch the entry. A consumer's Tailwind tracks the @plugin file's mtime,
			not its imports — and `generated/` is where the change actually landed,
			so without this nothing downstream notices.
		*/
		const now = new Date();
		fs.utimesSync(entry, now, now);
	} catch (error) {
		// Keep watching. A syntax error mid-edit is normal, not fatal.
		console.error(String((error as { stderr?: Buffer }).stderr ?? error));
	}
}

build();

for (const dir of [path.join(pkgRoot, 'src'), import.meta.dirname]) {
	fs.watch(dir, { recursive: true }, (_event, file) => {
		if (!file || !/\.(css|ts)$/.test(file)) return;
		/*
			80 ms debounce. Editors write a save as several filesystem events
			(truncate, write, rename), so without this one Ctrl-S triggers three
			builds, the last two racing the first.
		*/
		clearTimeout(timer);
		timer = setTimeout(build, 80);
	});
}
```

---

## Traps

> **You leave `adapter-auto` in place.** It picks an adapter by sniffing the CI
> environment, and on GitHub Actions it cannot identify a static host — so it
> falls back to a Node server build. `upload-pages-artifact` then uploads a
> directory Pages cannot serve.
>
> **How to tell:** the workflow is green and the deployed site is a blank page or
> a directory listing. `ls packages/docs/build` locally shows `index.js` and
> `handler.js` rather than `index.html`.
>
> **Fix:** `adapter-static` explicitly, as in step 3.

> **A hard-coded `href="/components"` in a Markdown page.** It works locally,
> where `base` is empty, and 404s on Pages, where the site lives under `/<repo>/`.
> The prerenderer catches links it can see, but not ones assembled at runtime.
>
> **Fix:** `import { base } from '$app/paths'` and write `href="{base}/components"`,
> or use SvelteKit's `resolve()`. Test it by building with `BASE_PATH` set
> — step 13 does exactly that.

> **mdsvex runs after `vitePreprocess`.** The preprocessors run in array order,
> and putting `vitePreprocess` first means it sees raw Markdown rather than the
> Svelte that mdsvex turns it into. Symptom: `<script lang="ts">` inside a `.md`
> file is not compiled, and TypeScript syntax reaches the browser.
>
> **Fix:** `mdsvex` first in the `preprocess` array.

> **`extensions` and mdsvex's own `extensions` disagree.** SvelteKit's
> `extensions` decides what becomes a route; mdsvex's decides what it processes.
> Set one and not the other and `.md` files either 404 or render as literal text.

> **Your SSR render blanks a code block.** Highlighters like Shiki run in
> `onMount`, so the server render is an empty box — bad on a page where the code
> _is_ the deliverable, and bad for link previews. With `prerender` on, that
> empty box is what gets written to disk.
>
> **Fix:** highlight at build time. mdsvex takes a `highlight` option that runs
> during preprocessing, which is the right place for it.

> **Writing state from inside a derived.** In Svelte 5 a `$derived` must be pure;
> assigning to `$state` inside one throws `state_unsafe_mutation` at runtime, and
> neither SSR nor the build catches it — the guard is client-side.
>
> **Fix:** compute in the derived, remember in an `$effect`.

> **A stale dev server rebuilds `generated/` under you.** If you run
> `bun run build` in another terminal while the docs watcher is running, the two
> race and you get a spurious "cannot find module `./generated/…`".
>
> **Fix:** stop the dev server before a manual build, or accept the noise.

> **The watcher survives the dev server.** If `livePlugin` misses either the
> `close` or the `exit` handler, Ctrl-C leaves a `bun` process rebuilding the
> plugin forever. You notice days later, when `generated/` changes with no dev
> server running.
>
> **How to tell:** Task Manager shows a `bun …/watch.ts` you did not start.

---

## Commit

Verify, then commit:

```powershell
bun run --filter '@scope/project-name-docs' build
git add -A
git commit -m "feat(docs): add documentation site with plugin live-reload"
```

Two things not to commit: `.svelte-kit/` and `packages/docs/build/`. Both are
covered by the root `.gitignore`, but the docs scaffold writes its own
`.gitignore` too — check you have not ended up with two that disagree.
---

Next: [Conventions](08-conventions.md)
