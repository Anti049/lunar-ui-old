# 7. The documentation site

A SvelteKit app that consumes the plugin and the Svelte bindings the way a real
consumer would, plus a live-reload loop that makes editing the plugin's CSS feel like
editing a stylesheet again.

Use whatever framework you like for the site itself. SvelteKit is assumed here
because it gives you SSR, file-based routing and a Vite config you can reach into
— and the debugging setup in [guide 11](11-debugging.md) depends on that Vite
config.

Thirteen steps. Steps 1–4 give you a working site, 5–10 are the live-reload
loop, and 11–13 are the content.

Every page is an ordinary **`+page.svelte`** route — no Markdown preprocessor.
A component page is prose with live examples in it, and plain Svelte expresses
that with one fewer tool in the build, one fewer config to keep in step with
SvelteKit, and type-checked imports on every page. It deploys to **GitHub
Pages** and nowhere else, which makes `adapter-static` and a base path
non-negotiable rather than a choice.

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
bun add -d '@sveltejs/adapter-static'

# `@workspace:*` is REQUIRED. Neither package is published, so a bare
# `bun add '@anti049/test'` resolves against the registry and fails — or,
# worse, installs somebody else's package of the same name.
bun add '@anti049/test@workspace:*'
bun add '@anti049/test-svelte@workspace:*'
```

`workspace:*` means "whatever is in this repository right now", which is what a
docs site wants — it is never published, so there is no range to resolve later.
The binding packages put the workspace link in `devDependencies` and keep a real
semver range in `peerDependencies` — see [guide 3](03-bindings.md) for why.

`adapter-static` replaces the `adapter-auto` the scaffold installed. Pages
serves files, not a server, and `adapter-auto` silently picks a Node adapter
when it cannot identify the host — producing a `build/` that Pages cannot serve,
with no error until the deploy is live.

Bun resolves the two `@anti049` packages to the workspace symlinks, not the
registry. Confirm that before going further — if either one came from npm you are
about to document a published version rather than the one you are editing:

```powershell
# LinkType should read "SymbolicLink" for each. A plain directory means Bun
# fetched a published package instead of linking the local one.
Get-ChildItem ../../node_modules/@anti049 | Select-Object Name, LinkType
```

**`packages/docs/vite.config.ts`** — replace the whole file. `sv create`
wrote one; this is a minimal version that step 3 extends and step 8 replaces.

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

## 3. Configure `adapter-static` and the base path

SvelteKit 3 has no `svelte.config.js` — it refuses to start while one exists.
Its options are passed to the `sveltekit()` plugin instead, as one object.

**`packages/docs/vite.config.ts`** — replace the whole file. The `kit` object
is carried into step 8 unchanged.

```ts
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/*
	SvelteKit's options — what SvelteKit 2 read from svelte.config.js.
	`satisfies` keeps literals like 'fail' typed as literals; a plain annotation-free
	object would widen them to `string` and fail to typecheck.
*/
const kit = {
	compilerOptions: {
		// Written by the scaffold: runes mode for this project's own components,
		// the dependency's choice for anything in node_modules. Can go in Svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},

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
} satisfies Parameters<typeof sveltekit>[0];

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(kit)]
});
```

**`strict: true`** makes the build fail if any route could not be prerendered.
That is what you want for a documentation site: every page is static, and a
route that needs a server is a mistake rather than a fallback.

**No `preprocess`.** Svelte 5 strips TypeScript type annotations itself, and
nothing in this site uses `<style lang="…">`. Pass `preprocess: vitePreprocess()`
in `kit` only if you start using TypeScript that emits code, such as `enum`.

**`package.json` declares `#lib`.** SvelteKit 3 no longer generates `$lib`;
the scaffold wrote this into **`packages/docs/package.json`** instead. Keep it:

```json
"imports": {
	"#lib": "./src/lib/index.js",
	"#lib/*": "./src/lib/*"
}
```

Subpath imports take explicit extensions: `#lib/components/Example.svelte`,
never `#lib/components/Example`.

---

## 4. Write `app.css` the way a consumer would

**`packages/docs/src/app.css`** — new file.

```css
@import 'tailwindcss';

/* Fonts come from the consumer, not the plugin. */
@import '@fontsource-variable/inter/wght.css';

/* Components, tokens and themes all arrive through the plugin. */
@plugin '@anti049/test';

/*
	A custom theme goes here too, once the plugin can generate one:

	    @plugin '@anti049/test/theme' { name: brand; seed-primary: #0956aa; }

	That entry point does not exist yet — guide 15 builds it, and adds this
	block back along with the alias and the SSR entry it needs.
*/

/* Components live in another package — register them as a source. */
@source '../../svelte/src/lib/**/*.svelte';
```

**`packages/docs/src/routes/+layout.svelte`** — replace it. The scaffold's
version does not import the stylesheet, so nothing is styled until you do. Keep
its favicon import:

```svelte
<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
```

**Dogfood deliberately.** If the docs site needs a workaround that a consumer
could not use — reaching into `packages/core/src/` directly, importing an
unexported path, patching a token by hand — that is a bug in the plugin, not in
the site. Write the workaround down as an issue instead of shipping it here.

Check the site serves:

```powershell
bun run --filter '@anti049/test-docs' dev
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
		name: 'test:reload',
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
time. This supersedes steps 3 and 7, and keeps step 3's `kit` object as it was:

```ts
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const pluginEntry = fileURLToPath(new URL('../core/index.ts', import.meta.url));
const svelteLib = fileURLToPath(new URL('../svelte/src/lib/index.ts', import.meta.url));
const watcher = fileURLToPath(new URL('../core/functions/watch.ts', import.meta.url));
const appCss = fileURLToPath(new URL('./src/app.css', import.meta.url));

// … `kit` from step 3 …

// … livePlugin from step 7 …

export default defineConfig(({ command }) => ({
	plugins: [
		tailwindcss(),
		sveltekit(kit),
		...(command === 'serve' ? [livePlugin(pluginEntry)] : [])
	],
	resolve: {
		/*
			Array form with ANCHORED patterns. The object form matches by prefix,
			so a bare '@anti049/test' would also catch '@anti049/test/theme'
			and rewrite it to `index.ts/theme`, breaking every subpath export.

			One entry per exported subpath. Guide 15 adds `./theme` and `./themes`
			to the plugin, and each needs a line here — miss one and that export
			resolves to `dist/` in dev and to source in build, so you get two
			copies of the module.
		*/
		alias: [
			{ find: /^@anti049\/test-svelte$/, replacement: svelteLib },
			...(command === 'serve' ? [{ find: /^@anti049\/test$/, replacement: pluginEntry }] : [])
		]
	},
	ssr: {
		/*
			Dependencies with extensionless internal imports fail under Node's ESM
			resolver, which is what Vite SSR runs on. Listing one here makes Vite
			bundle it instead of handing it to Node.

			Empty for now. Guide 15 adds `@material/material-color-utilities`,
			which is the canonical offender — see step 9.
		*/
		noExternal: []
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
bun run --filter '@anti049/test-docs' dev
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

## 12. Write the pages

Each page is a `+page.svelte`. The prose is HTML, the live examples are the
real components, and a shared shell keeps every page's head and frame the same.

**`packages/docs/src/lib/components/DocPage.svelte`** — new file. Every
documentation page wraps its content in this, so it is where the page shell
lives.

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		children: Snippet;
	}

	let { title, description = '', children }: Props = $props();
</script>

<svelte:head>
	<title>{title} — test</title>
	{#if description}<meta name="description" content={description} />{/if}
</svelte:head>

<article class="prose mx-auto max-w-3xl p-8">
	<h1>{title}</h1>
	{#if description}<p class="lead">{description}</p>{/if}
	{@render children()}
</article>
```

**`packages/docs/src/routes/components/button/+page.svelte`** — new file.

```svelte
<script lang="ts">
	import { Button } from '@anti049/test-svelte';
	import DocPage from '#lib/components/DocPage.svelte';
	import Example from '#lib/components/Example.svelte';
</script>

<DocPage title="Button" description="Filled, tonal, outlined and text buttons.">
	<p>
		Buttons trigger an action. Use a filled button for the primary action on a screen, and at most
		one of them.
	</p>

	<Example>
		<Button variant="filled">Filled</Button>
		<Button variant="tonal">Tonal</Button>
		<Button variant="outlined">Outlined</Button>
	</Example>

	<h2>Variants</h2>

	<table>
		<thead><tr><th>Variant</th><th>Use for</th></tr></thead>
		<tbody>
			<tr><td><code>filled</code></td><td>the single most important action on screen</td></tr>
			<tr><td><code>tonal</code></td><td>a secondary action of similar weight</td></tr>
			<tr><td><code>outlined</code></td><td>an action that should not draw the eye</td></tr>
			<tr><td><code>text</code></td><td>tertiary actions, and anything in a row</td></tr>
		</tbody>
	</table>

	<h2>Classes</h2>

	<ClassTable component="button" />
</DocPage>
```

Three things about that file:

- **It is one compile unit.** The imports, the examples and the prose are all
  type-checked by `svelte-check`, so a renamed prop fails `bun run check`
  instead of rendering a broken example.
- **The shell is a component, not a convention.** `title` and `description`
  are typed props on `DocPage`, so a page that forgets its title fails to
  compile rather than shipping an untitled `<head>`.
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
bun run --filter '@anti049/test-docs' build
bun run --filter '@anti049/test-docs' preview
```

The preview server runs the **aliased-to-`dist`** path, which is the one your
dev loop never exercises. Click through a page of each kind before trusting it.
This is the build [guide 9](09-github.md) deploys, so a failure here is a failure
in CI.

---

## Files after this phase

Thirteen files, twelve of them in `packages/docs` and one in `packages/core`.
There is no `svelte.config.js`: SvelteKit 3 reads its options from
`vite.config.ts`.

| File                                                      | Status   | Written in | Next touched by             |
| --------------------------------------------------------- | -------- | ---------- | --------------------------- |
| `packages/docs/package.json`                              | replaced | step 2     | never                       |
| `packages/docs/vite.config.ts`                            | replaced | step 8     | never                       |
| `packages/docs/tsconfig.json`                             | kept     | scaffold   | never                       |
| `packages/docs/src/app.html`                              | kept     | scaffold   | never                       |
| `packages/docs/src/lib/assets/favicon.svg`                | kept     | scaffold   | when you have a real mark   |
| `packages/docs/src/app.d.ts`                              | kept     | scaffold   | never                       |
| `packages/docs/src/app.css`                               | added    | step 4     | as the plugin gains options |
| `packages/docs/src/routes/+layout.svelte`                 | replaced | step 4     | as the site grows a nav     |
| `packages/docs/src/routes/+layout.ts`                     | added    | step 3     | never                       |
| `packages/docs/src/lib/components/DocPage.svelte`         | added    | step 12    | as the page shell grows     |
| `packages/docs/src/lib/components/Example.svelte`         | added    | step 12    | never                       |
| `packages/docs/src/routes/components/button/+page.svelte` | added    | step 12    | one file per component      |
| `packages/core/functions/watch.ts`                        | added    | step 6     | [15](14-tokens.md)          |

Gitignored: `packages/docs/.svelte-kit/` and `packages/docs/build/`.

Deleted: `@sveltejs/adapter-auto` is replaced by `@sveltejs/adapter-static` in
step 2. Remove it from `devDependencies` rather than leaving both — whichever
`vite.config.ts` imports is the one that runs, but a stale adapter is a
confusing thing to find later.

---

### `packages/docs/package.json`

```json
{
	"name": "@anti049/test-docs",
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
	"imports": {
		"#lib": "./src/lib/index.js",
		"#lib/*": "./src/lib/*"
	},
	"dependencies": {
		"@anti049/test": "workspace:*",
		"@anti049/test-svelte": "workspace:*",
		"@fontsource-variable/inter": "^5.2.8"
	},
	"devDependencies": {
		"@sveltejs/adapter-static": "^4.0.0",
		"@sveltejs/kit": "^3.1.0",
		"@sveltejs/vite-plugin-svelte": "^7.3.1",
		"@tailwindcss/vite": "^4.3.3",
		"@types/node": "^22.20.3",
		"svelte": "^5.57.3",
		"svelte-check": "^4.7.7",
		"tailwindcss": "^4.3.3",
		"typescript": "~6.0.3",
		"vite": "^8.3.5"
	}
}
```

Four notes:

- **`"private": true`** — this is the one package that is never published, and
  it is also what `.changeset/config.json` ignores ([guide 8](08-conventions.md)).
  Both are needed: `private` stops an accidental publish, `ignore` stops
  Changesets asking about it on every changeset.
- **`workspace:*`** — the docs site always wants whatever is in the tree right
  now, not a version range. It is never published, so nothing ever has to
  rewrite it.
- **`imports`** — `#lib`, the subpath import that replaces SvelteKit 2's
  generated `$lib`.
- **`@types/node`** is here because `vite.config.ts` reads `process.env` and
  imports `node:` modules.

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

### `packages/docs/vite.config.ts`

Assembled across steps 2, 3, 7 and 8. This is the whole file — and, in
SvelteKit 3, the site's entire SvelteKit configuration.

```ts
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const pluginEntry = fileURLToPath(new URL('../core/index.ts', import.meta.url));
const svelteLib = fileURLToPath(new URL('../svelte/src/lib/index.ts', import.meta.url));
const watcher = fileURLToPath(new URL('../core/functions/watch.ts', import.meta.url));
const appCss = fileURLToPath(new URL('./src/app.css', import.meta.url));

/*
	SvelteKit's options — what SvelteKit 2 read from svelte.config.js. `satisfies`
	keeps literals like 'fail' typed as literals rather than widening them to string.
*/
const kit = {
	compilerOptions: {
		// Written by the scaffold: runes mode for this project's own components,
		// the dependency's choice for anything in node_modules. Can go in Svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},

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
} satisfies Parameters<typeof sveltekit>[0];

/**
 * Rebuilds the plugin when its CSS changes, and makes Tailwind notice.
 *
 * Two halves, because neither is enough alone: the watcher regenerates
 * `generated/`, and the mtime bump below is what re-runs Tailwind's CSS
 * transform. Tailwind's own hot-update hook deliberately ignores .ts and .js,
 * so a change to the plugin entry never reaches it otherwise.
 */
function livePlugin(entry: string): Plugin {
	return {
		name: 'lunar-ui:reload',
		// Keeps all of this out of production builds. Without it, `vite build`
		// spawns a watcher that never exits and CI hangs at 100% with no error.
		apply: 'serve',
		configureServer(server) {
			/*
				A child process, not a sibling workspace script: `bun run --filter`
				orders by workspace dependency, and docs depends on core, so a
				never-exiting watcher there stops the dev server from ever starting.
			*/
			const child = spawn('bun', [watcher], {
				stdio: ['ignore', 'inherit', 'inherit'],
				shell: process.platform === 'win32'
			});
			const stop = () => child.kill();
			// Both handlers are needed: `close` covers a restart, `exit` covers
			// Ctrl-C. Miss either and the watcher outlives the dev server.
			server.httpServer?.on('close', stop);
			process.on('exit', stop);

			server.watcher.add(entry);
			server.watcher.on('change', (file) => {
				if (path.resolve(file) !== path.resolve(entry)) return;
				/*
					Bumping app.css's mtime is what re-runs Tailwind's transform.
					Invalidating the module by hand still serves a cached `?direct`
					response; a synthetic watcher event runs HMR but not a fresh
					transform. Only a real mtime change does both.
				*/
				const now = new Date();
				fs.utimesSync(appCss, now, now);
			});
		}
	};
}

export default defineConfig(({ command }) => ({
	// tailwindcss() BEFORE sveltekit(), or the CSS transform runs after
	// SvelteKit has handled the file and your utilities are missing.
	plugins: [
		tailwindcss(),
		sveltekit(kit),
		...(command === 'serve' ? [livePlugin(pluginEntry)] : [])
	],

	resolve: {
		/*
			Array form with ANCHORED patterns. The object form matches by prefix,
			so a bare '@anti049/test' would also catch '@anti049/test/theme' and
			rewrite it to `index.ts/theme`, breaking every subpath export.

			One entry per exported subpath. Guide 15 adds `./theme` and `./themes`
			to the plugin, and each needs a line here.
		*/
		alias: [
			{ find: /^@anti049\/test-svelte$/, replacement: svelteLib },
			// Serve only: production builds resolve to dist/, so the site is built
			// against what consumers actually install.
			...(command === 'serve' ? [{ find: /^@anti049\/test$/, replacement: pluginEntry }] : [])
		]
	},

	ssr: {
		/*
			Dependencies with extensionless internal imports fail under Node's ESM
			resolver, which is what Vite SSR runs on. Listing one here makes Vite
			bundle it instead of handing it to Node.

			Empty until guide 15, which adds `@material/material-color-utilities`.
		*/
		noExternal: []
	},

	// Vite refuses to serve files outside the project root, and every alias
	// above points outside it.
	server: { fs: { allow: [repoRoot] } }
}));
```

---

### `packages/docs/src/app.css`

```css
@import 'tailwindcss';

/* Fonts come from the consumer, not the plugin. */
@import '@fontsource-variable/inter/wght.css';

/* Components, tokens and themes all arrive through the plugin. */
@plugin '@anti049/test';

/*
	A custom theme goes here too, once the plugin can generate one:

	    @plugin '@anti049/test/theme' { name: brand; seed-primary: #0956aa; }

	That entry point does not exist yet — guide 15 builds it, and adds this
	block back along with the alias and the SSR entry it needs.
*/

/*
	Components live in another package, so Tailwind has to be told where. This
	points at SOURCE rather than the built package because the dev alias in
	vite.config.ts resolves the package to source too — the two must agree or the
	site is styled in production and unstyled in dev.
*/
@source '../../svelte/src/lib/**/*.svelte';

/* The docs site's own components and pages. */
@source './lib/**/*.svelte';
@source './routes/**/*.svelte';
```

---

### `packages/docs/src/routes/+layout.svelte`

```svelte
<script lang="ts">
	// The only place the stylesheet is imported. Everything below inherits it.
	import '../app.css';
	// Imported, not referenced by URL, so Vite fingerprints it and the base
	// path is applied for you. The scaffold put it here.
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
```

---

### `packages/docs/src/app.html`

Written by the scaffold, unchanged. There is no favicon link here: the
scaffold imports the icon in `+layout.svelte` instead.

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="text-scale" content="scale" />
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
```

If you do link a file from `static/` here, write it as
`%sveltekit.assets%/file.ext`. A bare `/file.ext` resolves to the domain root,
which on Pages is another repository's site.

---

### `packages/docs/src/lib/assets/favicon.svg`

`sv create` writes one; replace it when you have a real mark.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
	<rect width="32" height="32" rx="7" fill="#0956aa" />
	<circle cx="16" cy="16" r="6" fill="#ffffff" />
</svg>
```

**Prefer importing assets to putting them in `static/`.** An imported file is
hashed, bundled and served under the base path automatically. `static/` is
copied verbatim to the **root** of the build output with none of that — no
hashing, no base-path rewriting.

Two things that do belong in `static/`:

- `static/.nojekyll` — an empty file. GitHub Pages ignores directories starting
  with an underscore unless it is present, and SvelteKit writes its assets to
  `_app/`. The `upload-pages-artifact` action in
  [guide 9](09-github.md) bypasses Jekyll so this is usually unnecessary, but it
  costs nothing and removes a failure mode that is very hard to diagnose.
- `static/robots.txt` — the scaffold writes one; review it once the site is
  public.

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
`.svelte` mappings and the generated route types live. `$app/tsconfig` sets no
`include` or `exclude`, so this file states them.

```jsonc
{
	"extends": "$app/tsconfig",
	"include": ["src", "vite.config.ts"],
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

`$app/tsconfig` resolves to `node_modules/$app/tsconfig.json`, which does not
exist until `svelte-kit sync` has run — which is what the `prepare` script is
for.

---

### `packages/docs/src/lib/components/DocPage.svelte`

The shell every documentation page wraps its content in.

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		children: Snippet;
	}

	let { title, description = '', children }: Props = $props();
</script>

<svelte:head>
	<title>{title} — test</title>
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

### `packages/docs/src/routes/components/button/+page.svelte`

One of these per component.

```svelte
<script lang="ts">
	import { Button } from '@anti049/test-svelte';
	import DocPage from '#lib/components/DocPage.svelte';
	import Example from '#lib/components/Example.svelte';
</script>

<DocPage title="Button" description="Filled, tonal, outlined and text buttons.">
	<p>
		Buttons trigger an action. Use a filled button for the primary action on a screen, and at most
		one of them.
	</p>

	<Example>
		<Button variant="filled">Filled</Button>
		<Button variant="tonal">Tonal</Button>
		<Button variant="outlined">Outlined</Button>
	</Example>

	<h2>Variants</h2>

	<table>
		<thead><tr><th>Variant</th><th>Use for</th></tr></thead>
		<tbody>
			<tr><td><code>filled</code></td><td>the single most important action on screen</td></tr>
			<tr><td><code>tonal</code></td><td>a secondary action of similar weight</td></tr>
			<tr><td><code>outlined</code></td><td>an action that should not draw the eye</td></tr>
			<tr><td><code>text</code></td><td>tertiary actions, and anything in a row</td></tr>
		</tbody>
	</table>
</DocPage>
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

> **The build fails on a missing asset URL.** `prerender.handleHttpError:
'fail'` in step 3 is doing its job: a reference to an asset that does not
> exist would 404 on the deployed site, so the build refuses rather than
> shipping it.
>
> **How to tell:** the message names a URL, not a file path — typically one
> written by hand into `app.html` or a page, such as `/favicon.svg`.
>
> **Fix:** import the asset from `src/lib/assets/` (as `+layout.svelte` does
> with the favicon), or put it in `static/` and reference it as
> `%sveltekit.assets%/…`.
>
> Do NOT fix this by relaxing `handleHttpError`. The same setting is what
> catches a link that ignores the base path, which is the failure you actually
> care about.

> **A `svelte.config.js` left over from SvelteKit 2.** SvelteKit 3 refuses to
> start while one exists, and a tutorial or an older scaffold will happily write
> one. Move its `kit` options into the `kit` object in `vite.config.ts` and
> delete the file. On an existing site, `npx sv migrate sveltekit-3` does this
> and the `$lib` → `#lib` rename together.

> **`bun add '@anti049/test'` goes to the registry.** Workspace packages are not
> special to `bun add` — it resolves a bare name against npm like any other, and
> your package is not published. Best case it fails with a 404. Worst case
> somebody else owns that name and you silently install their code.
>
> **How to tell:** `bun.lock` gains a `resolution` with a registry URL rather
> than a `link:` entry, and `node_modules/@anti049/test` is a real directory
> instead of a symlink.
>
> **Fix:** name the protocol — `bun add '@anti049/test@workspace:*'` — or write
> the dependency into `package.json` as `"workspace:*"` and run `bun install`.
> The same applies to pnpm and to npm's `file:` protocol.

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

> **A hard-coded `href="/components"` in a page.** It works locally,
> where `base` is empty, and 404s on Pages, where the site lives under `/<repo>/`.
> The prerenderer catches links it can see, but not ones assembled at runtime.
>
> **Fix:** `import { resolve } from '$app/paths'` and write
> `href={resolve('/components')}`. SvelteKit 3 removed the `base` export, so
> older advice to write `{base}/components` no longer compiles. Test it by
> building with `BASE_PATH` set — the checkpoint at the end does exactly that.

> **Your SSR render blanks a code block.** Highlighters like Shiki run in
> `onMount`, so the server render is an empty box — bad on a page where the code
> _is_ the deliverable, and bad for link previews. With `prerender` on, that
> empty box is what gets written to disk.
>
> **Fix:** highlight at build time. Run the highlighter in the page's
> `+page.ts` `load` and render the returned HTML with `{@html}` — every route
> is prerendered, so `load` runs during `vite build` and the highlighted markup
> is what lands on disk.

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
bun run --filter '@anti049/test-docs' build
git add -A
git commit -m "feat(docs): add documentation site with plugin live-reload"
```

Two things not to commit: `.svelte-kit/` and `packages/docs/build/`. Both are
covered by the root `.gitignore`, but the docs scaffold writes its own
`.gitignore` too — check you have not ended up with two that disagree.

---

## Checkpoint

`bun run dev` serves from `/`, and so does `vite preview` unless `BASE_PATH`
was set for the build. GitHub Pages serves from `/test/`. This builds the site
the way [guide 9](09-github.md) will, serves it from that subpath, and crawls
every link — the check that catches an href that ignores the base path before
it reaches the deployed site.

**Skeleton:** a directory in `$env:TEMP\test-checkpoint\07` laid out like a
Pages host: the site under `test/`, nothing at the root. Run from the
repository root:

```powershell
$cp = "$env:TEMP\test-checkpoint\07"
Remove-Item -Recurse -Force $cp -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $cp | Out-Null

bun run --filter '@anti049/test' build
$env:BASE_PATH = '/test'
bun run --filter '@anti049/test-docs' build
Remove-Item Env:BASE_PATH

Copy-Item -Recurse packages/docs/build "$cp\test"
Get-ChildItem "$cp\test" -Name                    # index.html, 404.html, _app, … — no index.js
```

In a **second terminal**, serve the skeleton. `serve` maps
`/test/components/button` to `button.html` the way Pages does:

```powershell
npx --yes serve@14 "$env:TEMP\test-checkpoint\07" -l 4173
```

Back in the first:

```powershell
# Every internal link and asset, followed recursively. External links are skipped.
npx --yes linkinator@6 http://localhost:4173/test/ --recurse --skip '^(?!http://localhost:4173)'
# → 0 broken links

# The built CSS carries the components — this build resolved the plugin from dist/.
$css = (Get-ChildItem "$cp\test\_app" -Recurse -Filter *.css).FullName
(Select-String -Path $css -Pattern '\.button\b').Count     # > 0
```

Then open `http://localhost:4173/test/components/button` directly — not by
clicking through — and reload it. It must render styled, with no 404 in the
browser's network panel.

Stop the server with Ctrl-C, then `Remove-Item -Recurse -Force $cp`.

**Passes when** linkinator reports no broken links, the CSS check is non-zero,
and the deep link renders.

**If it does not:** a broken link whose URL starts at `/components` rather than
`/test/components` is a hand-written href — see the base-path trap. Broken
`/_app/…` assets mean `paths.base` was empty for the build; check `BASE_PATH`
was set in the same shell. A zero CSS count with a site that looks fine in
`bun run dev` is the production path resolving to a stale or empty `dist/` —
rebuild the plugin first.

---

Next: [Conventions](08-conventions.md)
