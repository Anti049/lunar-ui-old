# 1. Monorepo skeleton

The scaffolding every other guide builds on. Twelve steps, about twenty minutes.

Commands are PowerShell 7; see [guide 0](00-prerequisites.md#shells--read-this-before-running-anything)
if you are on another shell.

Every file is given in full. Where the file format allows comments they are in
the file; where it does not — `package.json` must be strict JSON or npm refuses
it — the annotation follows the block.

---

## 0. Name things once

Pick these before step 1 and never change them:

| Placeholder | Example             | Where it appears                           |
| ----------- | ------------------- | ------------------------------------------ |
| `@anti049`  | `@Anti049`          | every `package.json`, every import         |
| `test`      | `moonlight`         | the plugin's package name, `@plugin` calls |
| repo slug   | `Anti049/moonlight` | CI, Pages URL, issue links                 |

A rename after the first publish means a deprecation notice on the old name, a
redirect nobody reads, and a week of stale links.

---

## 1. Create the repository

```powershell
mkdir test; Set-Location test
git init -b main

# New-Item takes an array. PowerShell has no brace expansion, so the paths are
# listed out rather than written as packages/{core,svelte,…}.
mkdir packages/core, packages/svelte, packages/react, packages/vue, packages/docs
```

<details>
<summary>bash / zsh</summary>

```sh
mkdir test && cd test
git init -b main
mkdir -p packages/{core,svelte,react,vue,docs}
```

</details>

Directory names deliberately do not match package names — `packages/core` is
shorter than `packages/test` and the tree stays readable.

---

## 2. Root `package.json`

**`package.json`** — new file, at the repository root.

```json
{
	"name": "test-monorepo",
	"private": true,
	"type": "module",
	"workspaces": ["packages/*"],
	"scripts": {
		"dev": "bun run --filter '@anti049/test-docs' dev",
		"build": "bun run --filter '*' build",
		"build:packages": "bun run --filter '@anti049/test' --filter '@anti049/test-svelte' --filter '@anti049/test-react' --filter '@anti049/test-vue' build",
		"check": "bun run --filter '*' check",
		"lint": "prettier --check . && eslint .",
		"format": "prettier --write .",
		"changeset": "changeset",
		"release": "bun run build:packages && changeset publish"
	}
}
```

| Field / script    | What it does and why it is there                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `private: true`   | The root is never published. Without it a stray `npm publish` at the root uploads the whole monorepo, which is confusing to undo. One line, do not skip. |
| `type: "module"`  | Makes `.js` files ESM repo-wide, so `eslint.config.js` and friends can use `import`. Every package overrides nothing — they all want ESM too.            |
| `workspaces`      | The glob Bun (and npm, and pnpm via `pnpm-workspace.yaml`) uses to find packages. `packages/*` means adding a package is creating a directory.           |
| `dev`             | One entry point for local work. It starts the docs site, which in guide 7 also spawns the plugin's CSS watcher, so one command gives you the whole loop. |
| `build`           | Everything, docs site included. For local sanity checks.                                                                                                 |
| `build:packages`  | The four **publishable** packages, named explicitly. `--filter '*'` would sweep in the docs site, and a release build must never contain it.             |
| `check`           | Each package's own `check` — build, typecheck, test, publint. CI runs exactly this, so CI and local cannot drift.                                        |
| `lint` / `format` | Prettier and ESLint over the whole tree. `lint` is check-only so it can gate a merge; `format` is the writing half.                                      |
| `changeset`       | A passthrough so contributors type `bun changeset` rather than remembering `bunx`.                                                                       |
| `release`         | Build then publish. Guide 9 runs this from CI; it exists here so the same command works by hand in an emergency.                                         |

---

## 3. Install the shared toolchain

```powershell
bun add -D typescript prettier eslint '@eslint/js' typescript-eslint `
           eslint-config-prettier '@changesets/cli' publint tailwindcss
```

Two PowerShell details: the continuation character is a backtick, not a
backslash, and a bare `@eslint/js` is parsed as a splat expression — quote any
argument beginning with `@`.

| Package                  | Why                                                                       |
| ------------------------ | ------------------------------------------------------------------------- |
| `typescript`             | One version for the whole repo, so no two packages disagree about syntax. |
| `prettier`               | Formatting. Plugins are added in step 6.                                  |
| `eslint`, `@eslint/js`   | Linting, flat-config style.                                               |
| `typescript-eslint`      | TypeScript rules, and the `ts.parser` the framework overrides need.       |
| `eslint-config-prettier` | Turns off every ESLint rule that would fight the formatter.               |
| `@changesets/cli`        | Versioning and changelogs (guide 8).                                      |
| `publint`                | Validates a package's `exports` map before you publish (guide 12).        |
| `tailwindcss`            | For `prettier-tailwind.css` in step 6 — see below. Not for building.      |

Framework-specific tooling is installed per package in guides 4–6, not here. One
`eslint` and one `prettier` for the whole repository; per-package copies give you
two configs that disagree.

**`tailwindcss` is the exception, and it is here for one narrow reason.** Nothing
at the root builds CSS — that is `packages/core`'s job. But `prettier-tailwind.css`
(step 6) sits at the root and begins `@import 'tailwindcss'`, and
`prettier-plugin-tailwindcss` resolves that from the stylesheet's own directory.
A workspace package declaring it is not enough: package managers hoist to the
root only when nothing conflicts, so it may or may not be there, and "works on
my machine" is exactly the failure that produces. Declare it.

---

## 4. `tsconfig.base.json`

**`tsconfig.base.json`** — new file, at the repository root. Every package
extends it; nothing compiles against it directly.

TypeScript officially reads JSONC, so this one can carry its own comments:

```jsonc
{
	"compilerOptions": {
		// Modern output. Bun and every current browser handle ES2022; lowering
		// this only adds downlevel helpers nobody needs.
		"target": "ES2022",
		"module": "ESNext",

		// "bundler" matches how the plugin, the bindings and the docs site are
		// all actually consumed. It allows extensionless relative imports while
		// still respecting "exports" maps, which "node16" would not.
		"moduleResolution": "bundler",

		"lib": ["ES2022", "DOM", "DOM.Iterable"],

		// Deliberate. Left unset, TypeScript pulls in EVERY @types/* package it
		// can find in node_modules — so a package silently compiles against
		// types it never declared, then fails for a consumer who did not
		// install them. Each package opts in via its own "types" array.
		"types": [],

		// Emit .d.ts. Every publishable package needs them; the docs site
		// overrides this to false.
		"declaration": true,

		"esModuleInterop": true,

		// Windows and macOS have case-insensitive filesystems, Linux does not.
		// Without this, an import that works locally fails only in CI.
		"forceConsistentCasingInFileNames": true,

		// Each file must be transpilable alone — which is how esbuild, swc and
		// Bun actually process them. Catches const-enum and type-reexport
		// patterns that only break at bundle time.
		"isolatedModules": true,

		"resolveJsonModule": true,

		// Do not typecheck dependencies' .d.ts files. They are not yours to fix
		// and a single broken one would block your build.
		"skipLibCheck": true,

		// Everything on. Turning strictness on later means fixing it later,
		// across more code.
		"strict": true
	}
}
```

Each package extends this and adds only what is specific to it — `outDir`,
`include`, and its own `types` array.

---

## 5. `.gitignore`

**`.gitignore`** — new file, at the repository root.

```gitignore
# Dependencies. Bun, npm and pnpm all land here.
node_modules

# Build output — every package, every framework.
.output
.vercel
.svelte-kit
dist
build
*.tgz

# The plugin's code generator writes here (guide 2), and the build scripts
# write scratch compiles to .tmp/. Both are reproducible from source.
packages/core/generated/
.tmp/

# OS and editor noise
.DS_Store
Thumbs.db

# Secrets. The example file is committed so people know what to fill in.
.env
.env.*
!.env.example
```

Ignoring `packages/core/generated/` is correct — it is build output — but it
means **a fresh clone cannot typecheck until it has built once**. Say so in the
repository README, and consider a root `prepare` script that runs the build so
`bun install` leaves the tree in a working state.

---

## 6. Prettier

Three files. The stylesheet in the middle is the one people skip and regret.

**`.prettierrc`** — new file, at the repository root. It must be strict JSON,
so the annotation is below it rather than inside:

```json
{
	"useTabs": true,
	"singleQuote": true,
	"trailingComma": "none",
	"printWidth": 100,
	"plugins": ["prettier-plugin-svelte", "prettier-plugin-tailwindcss"],
	"overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }],
	"tailwindStylesheet": "./prettier-tailwind.css",
	"tailwindFunctions": ["clsx", "cn", "cva"]
}
```

| Option               | Why                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useTabs`            | Tabs are one character the reader can set the width of. Accessibility argument, and it shrinks the diff on deeply nested CSS.                                                                                        |
| `singleQuote`        | Matches the style of every code sample in the ecosystem you are joining.                                                                                                                                             |
| `trailingComma`      | `"none"` keeps generated output stable — the code generator in guide 2 emits JSON, and a trailing comma there is invalid.                                                                                            |
| `printWidth: 100`    | Wide enough for a CSS selector chain, narrow enough for a side-by-side diff.                                                                                                                                         |
| `plugins`            | Order matters: `prettier-plugin-tailwindcss` must be **last**, because it wraps whatever formatter ran before it. Put it before the Svelte plugin and class sorting silently stops happening inside `.svelte` files. |
| `overrides`          | Tells Prettier which parser handles `.svelte`. Without it the Svelte plugin is installed but never invoked.                                                                                                          |
| `tailwindStylesheet` | Points the class sorter at a stylesheet that loads **your** plugin, so your utilities sort correctly instead of being treated as unknown and hoisted to the front.                                                   |
| `tailwindFunctions`  | Sort classes inside `cn(...)`, `clsx(...)` and `cva(...)` calls, not only in `class` attributes.                                                                                                                     |

**`prettier-tailwind.css`** — new file, at the repository root.

```css
/*
	A stylesheet that exists solely for prettier-plugin-tailwindcss.

	WHY IT EXISTS
	The class sorter has to resolve your own utilities. Given no stylesheet it
	knows only Tailwind's built-ins, treats `.button` as unknown, and hoists
	every unknown class to the front of every class attribute — churning every
	file in the repo and making real diffs unreadable.

	WHY IT LOADS THE PLUGIN FROM SOURCE
	`@plugin './packages/core/index.ts'` — a relative path to the TypeScript
	entry, NOT the package specifier '@anti049/test'. Tailwind loads
	plugins through jiti, which reads TypeScript directly, so formatting never
	depends on the package having been compiled. Point this at the built
	`dist/` and every `prettier --check` fails on a clean checkout.
*/
@import 'tailwindcss';
@plugin './packages/core/index.ts';
```

**`.prettierignore`** — new file, at the repository root.

```gitignore
# Lockfiles: machine-generated, and reformatting one produces a diff nobody
# can review.
bun.lock
pnpm-lock.yaml
package-lock.json

# Build output. Formatting it is wasted work that reappears next build.
packages/core/generated/
dist/
.svelte-kit/

# Static assets served verbatim.
packages/docs/static/
```

`prettier-tailwind.css` will not resolve until the plugin exists (guide 2). That
is expected — Prettier reports it plainly rather than failing silently.

---

## 7. ESLint

```powershell
bun add -D eslint-plugin-svelte eslint-plugin-react eslint-plugin-vue globals
```

**`eslint.config.js`** — new file, at the repository root.

```js
/*
	Flat config, one file for the whole monorepo.

	One config rather than one per package, because two configs drift: a rule
	enabled in `packages/react` and not in `packages/svelte` becomes a rule
	nobody can explain six months later.

	Order matters throughout — later entries override earlier ones.
*/
import path from 'node:path';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import vue from 'eslint-plugin-vue';
import react from 'eslint-plugin-react';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import { defineConfig, includeIgnoreFile } from 'eslint/config';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	/*
		Reuse .gitignore rather than maintaining a second list. Everything ESLint
		should skip — node_modules, dist, .svelte-kit, packages/core/generated — is
		already in there, and the two cannot drift apart.
	*/
	includeIgnoreFile(gitignorePath),

	js.configs.recommended,
	ts.configs.recommended,

	/*
		Svelte and Vue scope themselves to their own file types. React does NOT —
		`react.configs.flat.recommended` carries no `files` key, so left as-is it
		lints every .js and .ts in the repository with React rules, including
		this config file.
	*/
	svelte.configs.recommended,
	vue.configs['flat/recommended'],
	{
		...react.configs.flat.recommended,
		files: ['**/*.{jsx,tsx}'],
		/*
			An explicit version, NOT 'detect'.

			'detect' makes the plugin locate React on disk via
			`context.getFilename()` — an API ESLint 10 removed. eslint-plugin-react
			7.x predates ESLint 10, so detection throws
			`TypeError: contextOrFilename.getFilename is not a function` before any
			rule runs. Naming the version skips that path entirely.
		*/
		settings: { react: { version: '19.0' } }
	},

	/*
		MUST come after every framework config: it disables the stylistic rules
		that would disagree with Prettier. Placed earlier, the framework configs
		re-enable them and you get lint errors that `prettier --write`
		immediately re-introduces.

		svelte.configs.prettier is a second, Svelte-specific disabler and has to
		follow the generic one.
	*/
	prettier,
	svelte.configs.prettier,

	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			/*
				typescript-eslint recommends turning this off on TypeScript
				projects: tsc already reports undefined identifiers, and the ESLint
				rule cannot see ambient or generated declarations, so it produces
				false positives on both.
			*/
			'no-undef': 'off'
		}
	},

	/*
		WITHOUT THIS BLOCK, LINTING ANY .svelte FILE CRASHES.

		svelte-eslint-parser handles the markup, but it needs to be told which
		parser to hand `<script lang="ts">` to. Left unset, the script is parsed
		by espree, and the typescript-eslint rules above then run against an AST
		carrying none of their visitor keys or parser services.

		The failure is `TypeError: getVisitorKeys is not a function or its return
		value is not iterable`, reported against the .svelte file — which points
		at the component rather than at the missing configuration.
	*/
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},

	// The same arrangement for Vue, for the same reason.
	{
		files: ['**/*.vue'],
		languageOptions: {
			parserOptions: {
				extraFileExtensions: ['.vue'],
				parser: ts.parser
			}
		}
	}
);
```

---

## 8. A LICENSE, now rather than later

**`LICENSE`** — new file, at the repository root. MIT, as the common default;
replace the year and the holder:

```text
MIT License

Copyright (c) 2026 Anti049

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**A package published without a license shows as UNLICENSED on npm, which means
nobody can legally use it**, and `publint` does not check for it, so nothing will
remind you.

---

## 9. Per-package manifests

Each package gets the same shape.

**`packages/core/package.json`** — replace the stub. This is the pattern the
other four follow:

```json
{
	"name": "@anti049/test",
	"version": "0.0.0",
	"type": "module",
	"license": "MIT",
	"repository": {
		"type": "git",
		"url": "git+https://github.com/Anti049/test.git",
		"directory": "packages/core"
	},
	"files": ["dist", "README.md"],
	"exports": {
		".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
		"./package.json": "./package.json"
	},
	"publishConfig": { "access": "public", "provenance": true },
	"peerDependencies": { "tailwindcss": "^4.3.3" }
}
```

| Field                       | Why                                                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version: "0.0.0"`          | A placeholder. Changesets owns this number from the first release onward; never edit it by hand.                                                                                                                  |
| `license`                   | Set it in **every** publishable manifest, not just the root. npm reads each package's own.                                                                                                                        |
| `repository.directory`      | Makes npm link to the package's subdirectory rather than the repo root. Small thing, but it is what makes "view source" from npm useful in a monorepo.                                                            |
| `files`                     | An allowlist of what goes into the tarball. Explicit, because `.npmignore` is a denylist and forgetting an entry ships your whole `src/`. `README.md` is listed — see below.                                      |
| `exports`                   | The public surface. Anything not listed here cannot be imported, which is the point: it lets you refactor internals without breaking anyone.                                                                      |
| `exports["./package.json"]` | Some tooling (`publint`, framework resolvers, bundler plugins) reads a dependency's manifest at runtime. Omit it and those tools fail with a confusing resolution error.                                          |
| `publishConfig.access`      | Scoped packages default to private, and a private publish on a free account simply fails. `"public"` here means you never have to remember `--access public`.                                                     |
| `publishConfig.provenance`  | Records which workflow run built the tarball. Requires GitHub Actions with `id-token: write` ([guide 9](09-github.md)). Configured halfway it **fails** the publish rather than skipping, so set both or neither. |
| `peerDependencies`          | Tailwind is the consumer's, not yours. A regular dependency would install a second copy and the plugin would register against the wrong instance.                                                                 |

The `exports` map grows as the plugin does — [guide 15](15-themes.md) adds
`./theme` and `./themes`. Every new entry needs a matching alias in the docs
site's Vite config ([guide 7](07-docs.md), step 7).

Give each package a `README.md` too — npm shows the package's own, not the root
one, and an empty package page is a bad first impression.

---

## 10. Wire up the workspace

```powershell
bun install
```

Confirm the workspace links resolved rather than fetching from the registry.
Every entry should report as a symlink pointing into `packages/`:

```powershell
Get-ChildItem node_modules/@anti049 |
	Select-Object Name, LinkType, @{n = 'Target'; e = { $_.Target } }

bun pm ls | Select-Object -First 10
```

`LinkType` empty and `Target` blank means it is a **real directory** — Bun
fetched a published package with the same name instead of linking the local one.
Check for a typo in `workspaces` or in the package's own `name`, and check that
Developer Mode is on ([guide 0](00-prerequisites.md)) — without it Windows
cannot create the symlink and Bun copies instead.

---

## 11. Verify

```powershell
bunx eslint .         # passes, or lists real findings only
```

`bunx prettier --check .` reports one expected error until guide 2: `Unable to
load plugin` naming `packages/core/index.ts`, which `prettier-tailwind.css`
loads before it exists. Anything else is a real finding. Then commit — see
[Commit](#commit) at the end.

---

## Files after this phase

Everything guide 1 created, with its status and the guide that touches it next.
The full contents follow.

| File                                       | Status | Next touched by                                                 |
| ------------------------------------------ | ------ | --------------------------------------------------------------- |
| `package.json`                             | added  | [guide 8](08-conventions.md) — `prepare` for husky              |
| `tsconfig.base.json`                       | added  | never; packages extend it                                       |
| `.gitignore`                               | added  | never                                                           |
| `.prettierrc`                              | added  | never                                                           |
| `prettier-tailwind.css`                    | added  | never                                                           |
| `.prettierignore`                          | added  | never                                                           |
| `eslint.config.js`                         | added  | never                                                           |
| `LICENSE`                                  | added  | never                                                           |
| `packages/core/package.json`               | added  | [guide 2](02-plugin.md) — scripts, [14](15-themes.md) — exports |
| `packages/{svelte,react,vue}/package.json` | added  | guides [4](04-svelte.md), [5](05-react.md), [6](06-vue.md)      |
| `packages/docs/package.json`               | added  | [guide 7](07-docs.md)                                           |
| `packages/*/README.md`                     | added  | as each package gains a surface                                 |

Directories created and still empty: `packages/{core,svelte,react,vue,docs}`.

Not yet present, and referenced by things that are: `packages/core/index.ts` —
`prettier-tailwind.css` points at it and will report that it cannot resolve
until [guide 2](02-plugin.md) step 11 creates it.

<details>
<summary><code>package.json</code></summary>

```json
{
	"name": "test-monorepo",
	"private": true,
	"type": "module",
	"workspaces": ["packages/*"],
	"scripts": {
		"dev": "bun run --filter '@anti049/test-docs' dev",
		"build": "bun run --filter '*' build",
		"build:packages": "bun run --filter '@anti049/test' --filter '@anti049/test-svelte' --filter '@anti049/test-react' --filter '@anti049/test-vue' build",
		"check": "bun run --filter '*' check",
		"lint": "prettier --check . && eslint .",
		"format": "prettier --write .",
		"changeset": "changeset",
		"release": "bun run build:packages && changeset publish"
	},
	"devDependencies": {
		"@changesets/cli": "^3.0.3",
		"@eslint/js": "^9.0.0",
		"eslint": "^9.7.0",
		"eslint-config-prettier": "^10.1.8",
		"eslint-plugin-react": "^7.37.5",
		"eslint-plugin-svelte": "^3.23.0",
		"eslint-plugin-vue": "^10.11.0",
		"globals": "^17.12.0",
		"prettier": "^3.9.7",
		"prettier-plugin-svelte": "^4.1.1",
		"prettier-plugin-tailwindcss": "^0.8.1",
		"publint": "^0.3.24",
		"tailwindcss": "^4.3.3",
		"typescript": "~6.0.3",
		"typescript-eslint": "^8.70.0"
	}
}
```

</details>

<details>
<summary><code>tsconfig.base.json</code></summary>

```jsonc
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"lib": ["ES2022", "DOM", "DOM.Iterable"],
		// Deliberate — see step 4. Each package opts in to the types it needs.
		"types": [],
		"declaration": true,
		"esModuleInterop": true,
		"forceConsistentCasingInFileNames": true,
		"isolatedModules": true,
		"resolveJsonModule": true,
		"skipLibCheck": true,
		"strict": true
	}
}
```

</details>

<details>
<summary><code>.gitignore</code></summary>

```gitignore
node_modules

.output
.vercel
.svelte-kit
dist
build
*.tgz

packages/core/generated/
.tmp/

.DS_Store
Thumbs.db

.env
.env.*
!.env.example
```

</details>

<details>
<summary><code>.prettierrc</code></summary>

```json
{
	"useTabs": true,
	"singleQuote": true,
	"trailingComma": "none",
	"printWidth": 100,
	"plugins": ["prettier-plugin-svelte", "prettier-plugin-tailwindcss"],
	"overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }],
	"tailwindStylesheet": "./prettier-tailwind.css",
	"tailwindFunctions": ["clsx", "cn", "cva"]
}
```

</details>

<details>
<summary><code>prettier-tailwind.css</code></summary>

```css
/*
	Exists solely for prettier-plugin-tailwindcss: the class sorter needs to
	resolve your own utilities, or it hoists every one of them to the front of
	every class attribute.

	Loads the plugin from SOURCE, not through the package specifier, so
	formatting never depends on the package having been compiled.
*/
@import 'tailwindcss';
@plugin './packages/core/index.ts';
```

</details>

<details>
<summary><code>.prettierignore</code></summary>

```gitignore
bun.lock
pnpm-lock.yaml
package-lock.json
packages/core/generated/
dist/
.svelte-kit/
packages/docs/static/
```

</details>

<details>
<summary><code>eslint.config.js</code></summary>

```js
/*
	Flat config, one file for the whole monorepo.

	One config rather than one per package, because two configs drift: a rule
	enabled in `packages/react` and not in `packages/svelte` becomes a rule
	nobody can explain six months later.

	Order matters throughout — later entries override earlier ones.
*/
import path from 'node:path';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import vue from 'eslint-plugin-vue';
import react from 'eslint-plugin-react';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import { defineConfig, includeIgnoreFile } from 'eslint/config';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	/*
		Reuse .gitignore rather than maintaining a second list. Everything ESLint
		should skip — node_modules, dist, .svelte-kit, packages/core/generated — is
		already in there, and the two cannot drift apart.
	*/
	includeIgnoreFile(gitignorePath),

	js.configs.recommended,
	ts.configs.recommended,

	/*
		Svelte and Vue scope themselves to their own file types. React does NOT —
		`react.configs.flat.recommended` carries no `files` key, so left as-is it
		lints every .js and .ts in the repository with React rules, including
		this config file.
	*/
	svelte.configs.recommended,
	vue.configs['flat/recommended'],
	{
		...react.configs.flat.recommended,
		files: ['**/*.{jsx,tsx}'],
		/*
			An explicit version, NOT 'detect'.

			'detect' makes the plugin locate React on disk via
			`context.getFilename()` — an API ESLint 10 removed. eslint-plugin-react
			7.x predates ESLint 10, so detection throws
			`TypeError: contextOrFilename.getFilename is not a function` before any
			rule runs. Naming the version skips that path entirely.
		*/
		settings: { react: { version: '19.0' } }
	},

	/*
		MUST come after every framework config: it disables the stylistic rules
		that would disagree with Prettier. Placed earlier, the framework configs
		re-enable them and you get lint errors that `prettier --write`
		immediately re-introduces.

		svelte.configs.prettier is a second, Svelte-specific disabler and has to
		follow the generic one.
	*/
	prettier,
	svelte.configs.prettier,

	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			/*
				typescript-eslint recommends turning this off on TypeScript
				projects: tsc already reports undefined identifiers, and the ESLint
				rule cannot see ambient or generated declarations, so it produces
				false positives on both.
			*/
			'no-undef': 'off'
		}
	},

	/*
		WITHOUT THIS BLOCK, LINTING ANY .svelte FILE CRASHES.

		svelte-eslint-parser handles the markup, but it needs to be told which
		parser to hand `<script lang="ts">` to. Left unset, the script is parsed
		by espree, and the typescript-eslint rules above then run against an AST
		carrying none of their visitor keys or parser services.

		The failure is `TypeError: getVisitorKeys is not a function or its return
		value is not iterable`, reported against the .svelte file — which points
		at the component rather than at the missing configuration.
	*/
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},

	// The same arrangement for Vue, for the same reason.
	{
		files: ['**/*.vue'],
		languageOptions: {
			parserOptions: {
				extraFileExtensions: ['.vue'],
				parser: ts.parser
			}
		}
	}
);
```

</details>

<details>
<summary><code>packages/core/package.json</code></summary>

```json
{
	"name": "@anti049/test",
	"version": "0.0.0",
	"type": "module",
	"license": "MIT",
	"description": "A Tailwind CSS v4 design system, shipped as a plugin.",
	"keywords": ["tailwindcss", "tailwind-plugin", "design-system", "css"],
	"repository": {
		"type": "git",
		"url": "git+https://github.com/Anti049/test.git",
		"directory": "packages/core"
	},
	"files": ["dist", "README.md"],
	"exports": {
		".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
		"./package.json": "./package.json"
	},
	"publishConfig": { "access": "public", "provenance": true },
	"peerDependencies": { "tailwindcss": "^4.3.3" }
}
```

</details>

The three framework manifests and the docs manifest are placeholders at this
point — name, version, `private` where relevant — and are filled in by their own
guides.

---

## Traps

> **`prettier --check` prints hundreds of stack traces from
> `prettier-plugin-tailwindcss`.** Every frame is a `node_modules` path, which
> reads exactly like Prettier is trying to format `node_modules`. It is not; it
> never does. The plugin throws **once per file** when it cannot load the
> stylesheet, so one broken configuration becomes one stack trace per file in
> the repository.
>
> **How to tell:** the summary line is `Error occurred when checking code style
in N files`, not `Code style issues found`. Scroll to the very top — the real
> message is one line, buried above the stacks. There are two of them:
>
> - `Can't resolve 'tailwindcss' in '<repo root>'` — `tailwindcss` is not a root
>   dependency. `prettier-tailwind.css` lives at the root and imports it from
>   there. **Fix:** `bun add -D tailwindcss` at the root (step 3).
> - `Unable to load plugin` naming `packages/core` — the plugin entry cannot be
>   read, usually because `generated/` does not exist yet. **Fix:** build the
>   plugin once ([guide 2](02-plugin.md)). Before that point this error is
>   expected and harmless.
>
> Neither is reported against `prettier-tailwind.css`. Prettier names whichever
> file it was formatting when the plugin threw, so the error appears to be about
> an unrelated `vite.config.ts`.

> **You point `tailwindStylesheet` at the docs app's `app.css`** → you expect the
> class sorter to know your utilities → it does, until the plugin's `dist/` is
> missing, at which point `prettier-plugin-tailwindcss` throws **once per file**
> and prints a stack trace for each. Hundreds of lines, every frame a
> `node_modules` path, which reads exactly like Prettier is trying to format
> `node_modules`. It is not; it never does.
>
> **How to tell:** the summary line says `Error occurred when checking code style
in N files`, not `Code style issues found`. Scroll to the very top — the real
> message is `Unable to load plugin`, buried above the stacks.
>
> **Fix:** the dedicated stylesheet in step 6, loading the plugin from _source_.
> Tailwind loads plugins through jiti, which reads TypeScript, so formatting
> stops depending on a build.

> **`TypeError: contextOrFilename.getFilename is not a function`, thrown while
> linting `eslint.config.js` itself.** Two things combine here. React's shared
> config has no `files` key, so it lints every file in the repository; and
> `settings.react.version: 'detect'` makes the plugin resolve React from disk
> using an ESLint API that version 10 removed.
>
> **How to tell:** the rule named in the message is a React rule
> (`react/display-name`) but the file is not a React file.
>
> **Fix:** scope the React config to `**/*.{jsx,tsx}` and name the version
> explicitly, as step 7 does. If other React rules still fail on ESLint 10, pin
> `eslint` to `^9` until eslint-plugin-react ships ESLint 10 support — nothing
> else in this toolchain needs 10.

> **Linting a `.svelte` or `.vue` file crashes with `TypeError: getVisitorKeys
is not a function or its return value is not iterable`.** The framework parser
> handles the markup, but nothing told it which parser to hand
> `<script lang="ts">` to — so the script is parsed by espree, and the
> typescript-eslint rules then run against an AST that carries none of their
> visitor keys.
>
> **How to tell:** it is reported against the component file, so it reads as a
> problem with the component. `.ts` files lint fine.
>
> **Fix:** the two `files:`-scoped `parserOptions` blocks in step 7. They are not
> optional, and neither framework's shared config includes them.

> **`prettier-plugin-tailwindcss` is not last in `plugins`.** Class sorting
> silently stops happening inside `.svelte` files, because the plugin wraps
> whichever formatter ran before it and never gets the chance.

> **You add a dev alias so the docs site resolves the plugin from source** → you
> expect only the bare specifier to be rewritten → Vite's `resolve.alias` matches
> by **prefix**, so `@anti049/test/theme` becomes `…/index.ts/theme` and
> every subpath export silently breaks.
>
> **How to tell:** `Cannot find module …/index.ts/theme`.
>
> **Fix:** the array form with anchored patterns, one entry per exported subpath.
> [Guide 7](07-docs.md) has the config.

> **A build script deletes an output directory it does not own.** If the plugin's
> code generator clears `dist/` and only `tsc` recreates it, then running the
> generator alone — which the dev watcher does on every save — leaves the package
> with no resolvable entry point. That breaks the test harness and the formatter
> at once, for reasons that look unrelated to what you changed.
>
> **Fix:** each script cleans only what it produces. Put `dist/` cleanup in the
> npm script, between the generator and `tsc`.

> **`bun install` without a root `private: true`.** A workspace root without it
> can be published by accident, which is confusing to undo. It is one line.

---

## Commit

Verify, then commit:

```powershell
bunx eslint .
git add -A
git commit -m "chore(repo): scaffold monorepo"
```

`bun run lint` cannot pass yet — its Prettier half stops on the one expected
error from step 11 — so lint with ESLint alone for this commit. `bun run check`
and `bun run build` do nothing useful yet either: no package has those scripts.

Commit directly to `main` for now. [Guide 9](09-github.md) turns on branch
protection, and from that point everything goes through a pull request.

---

## Checkpoint

Prove the commit you just made is self-sufficient: a fresh clone installs,
links and lints with nothing from your working directory helping it along.

**Skeleton:** a clone of this repository in `$env:TEMP\test-checkpoint\01`.
Cloning a local path needs no remote, and nothing here touches your own tree.

```powershell
$cp = "$env:TEMP\test-checkpoint\01"
Remove-Item -Recurse -Force $cp -ErrorAction SilentlyContinue
git clone --quiet . $cp
Push-Location $cp

# The lockfile was committed and matches the manifests.
bun install --frozen-lockfile                     # exits 0
git status --porcelain                            # prints nothing

# Every workspace package is a link, not a registry download.
Get-ChildItem node_modules/@anti049 | Select-Object Name, LinkType   # every row SymbolicLink

# ESLint is a real gate: clean on the tree, and it fails on a planted mistake.
bunx eslint .                                     # exits 0
'const unused = 1;' | Set-Content probe.ts
bunx eslint probe.ts; $LASTEXITCODE               # non-zero, naming no-unused-vars
Remove-Item probe.ts

# .gitignore covers the build output guide 2 is about to produce.
New-Item -ItemType Directory -Force packages/core/dist, packages/core/generated, packages/core/.tmp | Out-Null
'x' | Set-Content packages/core/dist/x.js, packages/core/generated/x.ts, packages/core/.tmp/x.css
git status --porcelain                            # prints nothing

Pop-Location
Remove-Item -Recurse -Force $cp
```

Run `bunx prettier --check .` in the clone too. One failure is expected at
this stage and only one: `Unable to load plugin` naming
`packages/core/index.ts`, because `prettier-tailwind.css` loads a plugin that
does not exist until guide 2. `Can't resolve 'tailwindcss'` is **not**
expected — see the first trap.

**Passes when** every line prints what its comment says.

**If it does not:** a dirty `git status` after `bun install` means the lockfile
you committed is stale — run `bun install` in the real repository and commit
`bun.lock`. A file showing up after the `.gitignore` probe is a missing ignore
rule, and fixing it now is what keeps generated files out of every later diff.

---

Next: [The Tailwind plugin](02-plugin.md)
