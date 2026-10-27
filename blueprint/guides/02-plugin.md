# 2. The Tailwind plugin

The hard part. You are writing CSS and shipping JavaScript, and the machinery
that gets from one to the other is where every expensive surprise lives.

Twelve steps. Work through them in order — several later steps only make sense
once an earlier one has produced output you can look at.

Every code block is preceded by its file path and where in that file the code
goes — **new file**, **append**, **replace**, or a named anchor. `build.ts` in
particular is assembled across five separate steps; step 12's manifest has it in
one piece if you would rather copy it whole.

---

## The shape of the problem

Tailwind v4 lets you author a design system in CSS. But a stylesheet can only be
`@import`ed, and an import takes no arguments — no prefix, no theme selection, no
per-component tree-shaking. A _plugin_ gets all three.

So you need a build that reads CSS at build time, resolves everything
Tailwind-specific inside it (`@apply`, `theme()`, `@utility`), turns the result
into plain JavaScript objects, and hands those to the plugin API at the
consumer's compile time.

```text
src/**/*.css  ──compile──▶  resolved CSS  ──objectify──▶  generated/*.ts  ──tsc──▶  dist/
```

---

## 1. Install and lay out the package

```powershell
Set-Location packages/core

# Quote every @-prefixed name: PowerShell parses a bare leading @ as a splat.
bun add -D tailwindcss '@tailwindcss/cli' postcss postcss-js '@types/postcss-js' publint
bun add -D typescript '@types/node' '@types/bun'

mkdir functions, src/base, src/utilities, src/components, src/themes, test/unit
```

Split `src/` by **what a file emits**, not by topic. The build depends on this
line:

```text
packages/core/
├─ functions/          hand-written TypeScript
│  ├─ build.ts         the compiler
│  ├─ context.css      what components compile against
│  ├─ extract-*.ts     source → registries
│  ├─ partition.ts     compiled output → per-component buckets
│  ├─ addPrefix.ts     runtime: renames classes under a prefix
│  ├─ nestCssLayers.ts runtime: inverts at-rule nesting
│  └─ watch.ts         dev loop
├─ src/
│  ├─ base/            tokens only — no classes ever
│  ├─ utilities/       non-namespaced utilities (`surface`, `elevation-2`)
│  ├─ components/      one stylesheet per component
│  └─ themes/          palettes
├─ index.ts            the plugin entry
├─ theme.ts            the custom-theme plugin
└─ types.ts            shared shapes
```

`base/ + utilities/ + themes/` is the **compile context**; components are
compiled against it and only what they _add_ is kept. A utility filed under
`base/` by mistake becomes invisible context and silently never ships.

Give every directory an `_index.css` barrel now, so adding a file is one edit:

```powershell
'base', 'utilities', 'components', 'themes' | ForEach-Object {
	New-Item -ItemType File "src/$_/_index.css" -Force
}
```

`New-Item -ItemType File -Force` is the `touch` equivalent — but note it
**truncates** an existing file, where `touch` would leave it alone. Only run it
on a fresh tree.

---

## 2. Write the compile context

**`packages/core/functions/context.css`** — new file, the whole of it.

Everything a component needs in order to resolve `@apply`, and nothing else:

```css
/*
	`source(none)` is load-bearing. Without it Tailwind scans the repository for
	candidates, so any class-like string anywhere — including one written in a
	comment — becomes a real utility baked into the shipped bundle. Every compile
	that uses this file supplies its candidates explicitly with `@source inline()`.
*/
@import 'tailwindcss' source(none);
@import '../src/base/_index.css';
@import '../src/utilities/_index.css';
@import '../src/themes/_index.css';
```

Note this is a plain `@import`, **not** `@reference`. See the traps.

---

## 3. One component, to compile against

Do not write twenty. Write one, get the pipeline working end to end, then add the
rest — otherwise you debug the build and the CSS at the same time.

**`packages/core/src/components/badge.css`** — new file.

```css
@layer badge.l1.l2.l3 {
	.badge {
		display: inline-flex;
		align-items: center;
		border-radius: var(--radius-field);
	}
}
@layer badge.l1.l2 {
	.badge-primary {
		background-color: var(--color-primary);
	}
}
```

**`packages/core/src/components/_index.css`** — add one line. The barrel is
empty from step 1, so this is its entire contents for now:

```css
@import './badge.css';
```

Every component you add later is one more line here, in the same place.

---

## 4. Choose an isolation strategy

You must separate "what this component contributes" from "everything it compiled
against". Two ways, and the choice constrains everything downstream.

_Both snippets below are illustrative sketches of the two approaches, not files.
The one you keep is written for real in step 8._

### Positional — compile each file alone

Wrap the component between sentinel layers, compile, slice the string out.

```ts
const compiled = (
	await compile(
		`@layer theme{${tailwindTheme}${yourTheme}}
		 @layer wrapperStart{${componentCss}}
		 @layer wrapperEnd`,
		{ polyfills: 1 }
	)
).build([]);

const start = compiled.indexOf('@layer wrapperStart');
const end = compiled.indexOf('@layer wrapperEnd');
// substring between the braces is exactly this component's output
```

Simple, parallelisable per file, and nothing can leak in because nothing else was
there. The cost is re-inlining and re-compiling the whole theme for every
component, and the isolation rests on a `String.indexOf` of Tailwind's own output
formatting.

**`.build([])` with an empty candidate list only works for plain selectors.**
`@utility` output is usage-gated and an empty candidate list yields nothing.

### Differential — compile everything, subtract the context

```ts
// The IDEA, not the implementation — see the note below.
const context = runTailwind(contextCss); // base + utilities + themes
const all = runTailwind(contextCss + componentCss); // …plus every component
const mine = nodesIn(all).filter((node) => !nodesIn(context).has(node)); // parsed nodes
```

Then attribute each kept rule to a bundle by its `@layer <name>.lN` marker,
falling back to class names, then to the classes inside an unknown at-rule.

In practice the subtraction needs no separate pass at all: attribute what you
can, drop what you cannot, and what you drop **is** the context. Step 8 shows
the real shape, which is one compile rather than two.

**Take differential.** It is more machinery but it scales, it is the only option
once components `@apply` shared utilities that must not be re-emitted per
component, and the attribution key falls out of the layer naming you already
chose in [guide 0](00-prerequisites.md).

The rest of this guide assumes differential.

---

## 5. The compile helper

Use the Tailwind **CLI** as a subprocess, or the programmatic `compile()`. The
CLI is easier to reason about because the input is a real file you can open when
something looks wrong.

**`packages/core/functions/build.ts`** — new file. This is the first of five
pieces; steps 7, 8, 9 and 10 each append to it.

```ts
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pkgRoot = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(pkgRoot, '.tmp');
const cliEntry = path.join(
	path.dirname(require.resolve('@tailwindcss/cli/package.json')),
	'dist/index.mjs'
);

function runTailwind(input: string, label: string): string {
	const inFile = path.join(tmpDir, `${label}.in.css`);
	const outFile = path.join(tmpDir, `${label}.out.css`);
	fs.mkdirSync(tmpDir, { recursive: true });
	fs.writeFileSync(inFile, input);
	try {
		execFileSync(process.execPath, [cliEntry, '-i', inFile, '-o', outFile], { stdio: 'pipe' });
	} catch (error) {
		const detail = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
		// eslint-disable-next-line no-control-regex
		throw new Error(`tailwind failed on ${label}:\n${detail.replace(/\x1b\[[0-9;]*m/g, '')}`);
	}
	return fs.readFileSync(outFile, 'utf8');
}
```

**Checkpoint.** Before going further, prove the compile works. Compile the
context by hand and read what came out.

**`packages/core/.tmp/probe.css`** — a scratch file; `.tmp/` is gitignored.

```css
@import 'tailwindcss' source(none);
@import '../src/base/_index.css';
```

```powershell
# Resolve the Tailwind CLI out of node_modules rather than assuming a global
# install: the build must use the exact version this package depends on, and a
# global copy on a different minor produces output the harness disagrees with.
$cli = node -e "const p=require('path');console.log(p.join(p.dirname(require.resolve('@tailwindcss/cli/package.json')),'dist/index.mjs'))"

node $cli -i .tmp/probe.css -o .tmp/probe.out.css
Get-Content .tmp/probe.out.css -TotalCount 20
```

<details>
<summary>bash / zsh</summary>

```sh
cli=$(node -e "const p=require('path');console.log(p.join(p.dirname(require.resolve('@tailwindcss/cli/package.json')),'dist/index.mjs'))")
node "$cli" -i .tmp/probe.css -o .tmp/probe.out.css
head -20 .tmp/probe.out.css
```

</details>

---

## 6. Extract the class list

`@utility` output is usage-gated, so the compile needs every class name fed back
as a candidate. Derive the list; never hand-write it.

**`packages/core/functions/extract-classes.ts`** — new file.

```ts
import postcss from 'postcss';

const CLASS_IN_SELECTOR = /\.(-?[_a-zA-Z][\w-]*)/g;

/** Generic state hooks the design system reads but does not own. */
const STATE_HOOKS = new Set(['disabled', 'selected', 'active', 'checked', 'open']);

export function extractClasses(css: string, namespace: string | null): string[] {
	const root = postcss.parse(css);
	const classes = new Set<string>();

	root.walkAtRules('utility', (rule) => {
		const name = rule.params.trim();
		if (name.includes('*')) return; // functional — no finite name to safelist
		classes.add(name);
	});

	// A file's own @utility names widen its namespace: collapsible.css may
	// declare `collapse`, and plain selectors built on that must be claimed too.
	const namespaces = namespace === null ? null : [namespace, ...classes];
	const owned = (n: string) =>
		namespaces === null || namespaces.some((ns) => n === ns || n.startsWith(`${ns}-`));

	root.walkRules((rule) => {
		if ((rule.parent as postcss.AtRule)?.name === 'utility') return;
		for (const match of rule.selector.matchAll(CLASS_IN_SELECTOR)) {
			if (!STATE_HOOKS.has(match[1]) && owned(match[1])) classes.add(match[1]);
		}
	});

	return [...classes].sort();
}
```

---

## 7. Detect Tailwind's built-ins

Names like `collapse`, `table` and `select-text` are Tailwind's own. Claiming
them pulls Tailwind's rules into your bundle.

**`packages/core/functions/build.ts`** — append below `runTailwind()`, after you
have built `allClasses` and `classOwners` from `extractClasses()`.

```ts
// Bare Tailwind, with none of your CSS loaded. Whatever answers is Tailwind's.
const builtinCss = runTailwind(
	["@import 'tailwindcss' source(none);", ...allClasses.map((c) => `@source inline("${c}");`)].join(
		'\n'
	),
	'builtins'
);

const builtins = new Set<string>();
for (const m of builtinCss.matchAll(/^\s*\.([-\w]+)\s*(?:,|\{)/gm)) {
	if (classOwners.has(m[1])) builtins.add(m[1]);
}
for (const name of builtins) classOwners.delete(name);
```

**Use bare Tailwind, not your context.** Running the probe against the full
context reports every foundation utility as a built-in — dozens of false
positives.

---

## 8. Compile once, context and components together

**`packages/core/functions/build.ts`** — append below the built-in detection
from step 7.

```ts
const compiled = runTailwind(
	[
		`@import '${relFromTmp(contextPath)}';`,
		...componentFiles.map((f) => `@import '${relFromTmp(f)}';`),
		// Without the safelist, @utility output is gated away and the compile
		// comes back with none of your components in it.
		...allClasses.map((c) => `@source inline("${c}");`)
	].join('\n'),
	'library'
);

// If @apply survived, the context did not resolve and everything downstream
// would be working on nonsense.
if (compiled.includes('@apply')) {
	throw new Error('compile left @apply in the output — the context did not resolve');
}
```

**One compile, not two.** Step 4 called this strategy "differential — compile
everything, subtract the context", and that is still what happens; the
subtraction just is not a separate pass. Step 9's partitioner attributes every
rule it can to a bundle and **drops everything it cannot**, and what it cannot
attribute is precisely the context: Tailwind's preflight, the theme layer, and
the tokens from `src/base/`.

That is worth being explicit about, because the obvious alternative does not
work. See the trap on diffing CSS as text.

---

## 9. Partition into bundles

**`packages/core/functions/partition.ts`** — new file. It attributes each rule
to a component, and is called from `build.ts` with the diff from step 8.

```ts
/*
	Tiers nest, so one or more `.lN` segments follow the name. Anchoring to a
	single `.lN` breaks the moment a tier is nested, and the symptom is a
	confusing report about Tailwind built-ins rather than a parse error.
*/
const LAYER_OWNER = /^([a-z][\w-]*)(?:\.l\d+)+$/;

const ownerOf = (node: postcss.ChildNode): string | null => {
	if (node.type === 'atrule' && node.name === 'layer') {
		const owner = LAYER_OWNER.exec(node.params.trim())?.[1];
		if (owner && owners.has(owner)) return owner;
	}
	if (node.type === 'atrule' && node.name === 'keyframes') {
		const name = node.params.trim();
		for (const c of components) if (name === c || name.startsWith(`${c}-`)) return c;
	}
	if (node.type === 'rule') {
		for (const m of node.selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
			const owner = classOwners.get(m[1]);
			if (owner) return owner;
		}
	}
	return null; // context — dropped
};
```

Report what was dropped. A rule silently lost as "context" is the failure mode
here, and a count at the end of the build makes it visible.

---

## 10. Convert CSS to JavaScript objects

**`packages/core/functions/build.ts`** — append below the partition call.

`postcss-js`'s `objectify` does the conversion, and gets two things subtly wrong
for this purpose.

```ts
import postcss from 'postcss';
import { objectify } from 'postcss-js';

const styles = objectify(postcss.parse(css));
```

The two `import`s go at the **top** of `build.ts`, with the others — not here.

**It camelCases property names.** Tailwind converts them back when it emits — but
only for scalar values. A duplicate declaration becomes an _array_, and arrays
skip that conversion, so `transitionDuration: ['1s', '2s']` reaches the browser
verbatim and is ignored. Convert to kebab yourself — **`build.ts`**, a helper
near the top of the file:

```ts
const toKebab = (p: string) =>
	p
		.replace(/([A-Z])/g, '-$1')
		.replace(/^ms-/, '-ms-')
		.toLowerCase();
```

The `^ms-` rule matters: a naive lowercase turns `WebkitUserSelect` into
`webkit-user-select`, which no browser reads. The leading capital has to become
`-webkit-`, and `msOverflowStyle` needs `-ms-`, not `ms-`.

**Numeric values come back as JS numbers.** `opacity: 0` objectifies to the
number `0`, which Tailwind's `CssInJs` type does not model. Stringify at the
boundary or carry one documented cast.

**`packages/core/functions/build.ts`** — still appending, at the end of the file.

Write the result as `.ts`, not `.js`, so `tsc` checks the hand-written runtime
against the real shape of what was generated:

```ts
fs.writeFileSync(
	path.join(generatedDir, 'components', name, 'object.ts'),
	`/* Generated by functions/build.ts. Do not edit. */\n` +
		`import type { StyleObject } from '../../../types.js';\n\n` +
		`export const utilities: StyleObject = ${JSON.stringify(bundle.utilities, null, '\t')};\n`
);
```

---

## 11. The plugin entry

This is the first file a consumer actually loads. It is hand-written and lives
at the package root, **not** in `functions/` — `functions/` is the build, and
none of it ships.

**`packages/core/index.ts`** — new file, the whole of it.
[Guide 16](16-options.md) rewrites the body of the options function; the shape
below is what the rest of this guide needs.

```ts
import plugin from 'tailwindcss/plugin';
import bundles from './generated/imports.js';
import tokens from './generated/base.js';

export default plugin.withOptions(
	(options: PluginOptions = {}) => {
		const { prefix = '', include, exclude } = options;

		// Validate here — throw, do not warn. Tailwind ignores any option a
		// plugin does not read, so a typo looks exactly like a setting that
		// quietly refused to apply.
		const unknown = Object.keys(options).filter((k) => !KNOWN.has(k));
		if (unknown.length) {
			throw new Error(
				`test: unknown option${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}. ` +
					`Valid: ${[...KNOWN].join(', ')}.`
			);
		}

		const included = (name: string) =>
			include ? include.includes(name) : exclude ? !exclude.includes(name) : true;

		return (api) => {
			api.addBase(tokens);
			for (const [name, register] of Object.entries(bundles)) {
				if (!included(name)) continue;
				register({ addUtilities: api.addUtilities, addBase: api.addBase, prefix });
			}
		};
	},
	() => ({ theme: { extend: themeExtend } })
);
```

Four channels, each for a reason:

| Channel          | For                                              | Why not another                     |
| ---------------- | ------------------------------------------------ | ----------------------------------- |
| `addUtilities`   | rules from `@utility`                            | usage-gated, which is what you want |
| `addBase`        | tokens, `@property`, **runtime-written classes** | unconditional                       |
| `addVariant`     | `@custom-variant`                                | cannot be expressed in object form  |
| `matchUtilities` | functional utilities (`badge-gap-*`)             | no other way to express them        |

---

## 12. Wire up the scripts, then verify

**`packages/core/package.json`** — add a `scripts` block. The manifest from
[guide 1](01-monorepo.md) step 9 has no scripts at all; this goes in as a
sibling of `"files"` and `"exports"`.

```json
"scripts": {
  "build": "bun functions/build.ts && node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\" && tsc -p tsconfig.build.json",
  "typecheck": "tsc -p tsconfig.json",
  "test": "bun test test/unit && bun test/e2e.test.ts",
  "check": "bun run build && bun run typecheck && bun run test && publint"
}
```

The `dist` cleanup sits in the script, **between** the generator and `tsc` —
`build.ts` owns `generated/` and must not delete an artifact it does not produce.
It is a Node one-liner rather than `rm -rf` because npm and Bun run scripts
through `cmd.exe` on Windows, where POSIX tools do not exist
([guide 0](00-prerequisites.md)).

You also need two tsconfigs. **`packages/core/tsconfig.json`** — new file, for
typechecking everything including the build scripts and tests:

```jsonc
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		/*
			The base config sets "types": [] deliberately, so everything has to be
			named here.

			"node" for the build scripts (node:fs, node:path, node:child_process).
			"bun"  for `bun:test`, which the test files import from guide 3 onward.
		*/
		"types": ["node", "bun"],
		// Typecheck only — `build` owns emission.
		"noEmit": true
	},
	"include": ["**/*.ts"],
	"exclude": ["dist", "node_modules"]
}
```

`"bun"` resolves `@types/bun`, installed in step 1. Leave `tsconfig.build.json`
on `["node"]` — `dist/` must not carry a dependency on Bun's globals, and
nothing that ships imports `bun:test`.

**`packages/core/tsconfig.build.json`** — new file, for what actually ships:

```jsonc
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"outDir": "./dist",
		"types": ["node"],
		"rootDir": "."
	},
	/*
		Entry points, plus the generated data they import.

		tsc follows imports from here, so `functions/addPrefix.ts` and the theme
		modules come along because the entries reach them — while the rest of
		`functions/` stays out of dist, because nothing shipped imports it.

		A glob like "functions/**" would ship the entire compiler, and its node:
		imports, to every consumer.

		Guides 14–16 ADD to this list. Forget to, and `bun run build` still
		succeeds while `dist/theme.js` simply does not exist — the failure
		surfaces as an unresolved `exports` entry in a consumer's app.
	*/
	"include": ["index.ts", "types.ts", "generated/**/*.ts"]
}
```

```powershell
bun run build
node --input-type=module -e "import('./dist/index.js').then(m => console.log(typeof m.default))"   # function
```

Then compile as a consumer would, which is the only check that means anything:

**`packages/core/.tmp/consumer.css`** — a scratch file.

```css
@import 'tailwindcss' source(none);
@plugin './dist/index.js';
@source inline('badge');
```

```powershell
$cli = node -e "const p=require('path');console.log(p.join(p.dirname(require.resolve('@tailwindcss/cli/package.json')),'dist/index.mjs'))"
node $cli -i .tmp/consumer.css -o .tmp/consumer.out.css

# Must be non-zero. Zero means the plugin registered nothing usable — which a
# green `bun run build` will not tell you.
(Select-String -Path .tmp/consumer.out.css -Pattern '\.badge').Count
```

<details>
<summary>bash / zsh</summary>

```sh
cli=$(node -e "const p=require('path');console.log(p.join(p.dirname(require.resolve('@tailwindcss/cli/package.json')),'dist/index.mjs'))")
node "$cli" -i .tmp/consumer.css -o .tmp/consumer.out.css
grep -c '\.badge' .tmp/consumer.out.css     # non-zero
```

</details>

Then build the real safety net, which is [guide 12](12-testing.md).

---

## Traps

> **`Cannot find module 'bun:test'`, but `bun test` runs fine.** The base
> `tsconfig` sets `"types": []` so that no package silently compiles against
> types it never declared. That is deliberate and worth keeping — but it means
> every type package has to be named, and Bun's are easy to forget because the
> runtime does not need them.
>
> **How to tell:** `bun run test` passes and `bun run typecheck` fails, on the
> same file. Nothing is actually broken.
>
> **Fix:** `bun add -D '@types/bun'` in `packages/core`, and
> `"types": ["node", "bun"]` in `tsconfig.json`. Leave `tsconfig.build.json` on
> `["node"]` alone — `dist/` must not carry a dependency on Bun's globals.

> **You subtract the context by diffing the compiled CSS as text.** It is the
> obvious reading of "compile everything, subtract the context", and it cannot
> work: CSS is not line-oriented. Dropping the lines that match a context
> selector leaves each rule's **declarations and closing brace** behind, so the
> output becomes
>
> ```css
> table {
>   border-collapse: collapse;
> }
>   outline: auto;    /* orphaned body of :focus-visible */
> }
> ```
>
> **How to tell:** `CssSyntaxError: Unexpected }` thrown from inside
> `partition.ts` at `postcss.parse`, with a `source:` blob that looks like
> Tailwind's preflight with holes in it. The line and column point at the first
> orphaned brace, which is nowhere near the actual mistake.
>
> **Fix:** do not diff. Compile once and let attribution do the subtracting —
> `partition()` drops every node it cannot attribute, and those nodes are the
> context. If you ever do need a real diff, compare **parsed nodes**, never
> strings.

> **You use `@reference` in `context.css`** to pull in your tokens without
> duplicating output → you expect `@apply` to resolve and nothing else to change
> → **`@reference` suppresses `@utility` emission entirely.** Your components
> compile to nothing, with no error.
>
> **Fix:** plain `@import`, and subtract the context by diffing.

> **You leave the compile's source scanning on.** Tailwind scans the project for
> class candidates, so a class name written _in a comment_ — in a doc block, in a
> README, anywhere — becomes a real candidate and is baked into the shipped
> bundle as a static utility.
>
> **How to tell:** rules appear in your output whose selectors you never wrote,
> often with escaped brackets (`.badge-gap-\[3px\]`). In one real case this
> shipped 13 junk rules and caused a runtime error when the same name was also
> registered through `matchUtilities`.
>
> **Fix:** `source(none)` in `context.css`, candidates fed explicitly.

> **You register a class that JavaScript creates at runtime** through
> `addUtilities` → Tailwind never finds a candidate, so the rule is never emitted
> and **the feature is silently dead for every plugin consumer**.
>
> **Fix:** route those through `addBase`, which is unconditional. Keep the list in
> one named constant so it is greppable. See
> [guide 0](00-prerequisites.md#what-classes-written-by-js-at-runtime-means).

> **You inject raw CSS at-rules through `addBase`.** `addBase({'@utility x-*': …})`
> and `addBase({'@theme': …})` both _emit_ — verbatim, into the consumer's
> stylesheet — and are **never processed**. The utility does not exist and the
> output carries a stray invalid block.
>
> **Fix:** there is no plugin-API channel for `@utility`. Port functional
> utilities with `matchUtilities`; put theme values in the config half of
> `withOptions`.

> **You port a functional utility with `matchUtilities` and expect bare numbers to
> work.** `badge-gap-2` does not resolve with `values: {}`, and adding `'number'`
> to `type` makes even the arbitrary form stop resolving.
>
> **Fix:** supply `values` explicitly. Derive them from `theme('spacing')` and map
> each step to `calc(var(--spacing) * n)` rather than the resolved rem, so the
> output matches the CSS-first build byte for byte and still responds to a
> consumer redefining `--spacing`. Accept that the ported form is bounded to the
> scale where the CSS form took any number; document the arbitrary-value escape.

> **You give a derived token a `:root` default.** `--radius-button: var(--radius-field)`
> at `:root` looks like "defaults to the field radius" — but a custom property's
> `var()` is substituted **where the property is declared**. It bakes in the
> root's value, and a `[data-theme]` override of `--radius-field` never reaches
> it.
>
> **Fix:** leave the derived token undeclared and write the fallback at the point
> of use: `var(--radius-button, var(--radius-field))`. That resolves at the
> element, so the theme's value applies. Pin it with a test — someone will "tidy
> up" by adding the default back.

> **Your build script deletes `dist/`.** See step 12. Only the script that
> _produces_ an artifact should clean it.

---

## Files after this phase

Thirteen files. Every one is given below in full — nothing is elided, and
nothing is left for you to infer.

| File                                                   | Status        | Assembled in | Next touched by                          |
| ------------------------------------------------------ | ------------- | ------------ | ---------------------------------------- |
| `packages/core/package.json`                           | modified      | step 12      | [14](15-themes.md) — `exports`           |
| `packages/core/tsconfig.json`                          | added         | step 12      | never                                    |
| `packages/core/tsconfig.build.json`                    | added         | step 12      | [14](15-themes.md) — new entry points    |
| `packages/core/types.ts`                               | added         | step 10      | [14](15-themes.md), [16](16-options.md)  |
| `packages/core/index.ts`                               | added         | step 11      | [16](16-options.md) — the option surface |
| `packages/core/functions/context.css`                  | added         | step 2       | [15](14-tokens.md) — more `src/` imports |
| `packages/core/functions/build.ts`                     | added         | steps 5–10   | [14](15-themes.md), [15](14-tokens.md)   |
| `packages/core/functions/extract-classes.ts`           | added         | step 6       | never                                    |
| `packages/core/functions/partition.ts`                 | added         | step 9       | never                                    |
| `packages/core/functions/nestCssLayers.ts`             | added         | step 10      | never                                    |
| `packages/core/src/components/badge.css`               | added         | step 3       | you, per component                       |
| `packages/core/src/components/_index.css`              | added         | step 3       | one line per component                   |
| `packages/core/src/{base,utilities,themes}/_index.css` | added (empty) | step 1       | [15](14-tokens.md)                       |

Generated, never committed: `packages/core/generated/**` and
`packages/core/.tmp/**`. Both are covered by the root `.gitignore` from
[guide 1](01-monorepo.md).

Named in step 1's tree but **not yet written**: `functions/addPrefix.ts` and
`functions/extract-*.ts` beyond `extract-classes.ts` arrive in
[guide 16](16-options.md); `functions/watch.ts` in [guide 7](07-docs.md).

---

### `packages/core/package.json`

Replaces the stub from [guide 1](01-monorepo.md) step 9. The additions are
`scripts` and `devDependencies`.

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
	"scripts": {
		"build": "bun functions/build.ts && node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\" && tsc -p tsconfig.build.json",
		"typecheck": "tsc -p tsconfig.json",
		"test": "bun test test/unit",
		"check": "bun run build && bun run typecheck && bun run test && publint"
	},
	"publishConfig": { "access": "public", "provenance": true },
	"peerDependencies": { "tailwindcss": "^4.3.3" },
	"devDependencies": {
		"@tailwindcss/cli": "^4.3.3",
		"@types/bun": "^1.4.2",
		"@types/node": "^22.20.3",
		"@types/postcss-js": "^4.1.0",
		"postcss": "^8.5.28",
		"postcss-js": "^5.1.0",
		"publint": "^0.3.24",
		"tailwindcss": "^4.3.3",
		"typescript": "~6.0.3"
	}
}
```

Reading `build` left to right: run the generator, **then** delete `dist`, then
compile. The deletion sits between the two because `build.ts` owns `generated/`
and must not remove an artifact it does not produce — see the last trap.

`test` names only `test/unit` for now; [guide 12](12-testing.md) adds the
differential harness and rewrites this line.

---

### `packages/core/tsconfig.json`

For the editor and `typecheck`. Covers everything, emits nothing.

```jsonc
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		/*
			The base config sets "types": [] deliberately, so everything has to be
			opted into by name here.

			"node" for the build scripts (node:fs, node:path, node:child_process).
			"bun"  for `bun:test`, which guide 3's first test file imports. Without
			       it, tsc reports "Cannot find module 'bun:test'" even though
			       `bun test` runs perfectly — the tests work, only the typecheck
			       fails, which makes the error read as far more alarming than it is.
		*/
		"types": ["node", "bun"],
		// `build` owns emission. This config exists to find type errors.
		"noEmit": true
	},
	// Everything, including functions/ and test/ — you want errors in those too.
	"include": ["**/*.ts"],
	"exclude": ["dist", "node_modules"]
}
```

---

### `packages/core/tsconfig.build.json`

For what actually ships.

```jsonc
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"outDir": "./dist",
		"types": ["node"],
		// Without rootDir, tsc infers it from the inputs — so adding a second
		// entry point later silently changes every output path.
		"rootDir": "."
	},
	/*
		List ENTRY POINTS, never a glob.

		tsc follows imports, so `generated/` is emitted because index.ts imports
		it, while `functions/` and `test/` stay out of dist because nothing
		shipped imports them.

		A glob like "functions/**" would ship your entire compiler — and its
		node: imports — to every consumer.
	*/
	/*
		Entry points, plus the generated data they import.

		tsc follows imports from here, so `functions/addPrefix.ts` and the theme
		modules come along because the entries reach them — while the rest of
		`functions/` stays out of dist, because nothing shipped imports it.

		A glob like "functions/**" would ship the entire compiler, and its node:
		imports, to every consumer.

		Guides 14–16 ADD to this list. Forget to, and `bun run build` still
		succeeds while `dist/theme.js` simply does not exist — the failure
		surfaces as an unresolved `exports` entry in a consumer's app.
	*/
	"include": ["index.ts", "types.ts", "generated/**/*.ts"]
}
```

---

### `packages/core/types.ts`

Shared shapes. Hand-written, and imported by both the generated modules and the
plugin entry — which is what makes `tsc` check that the generator and the
runtime still agree.

```ts
/*
	Shared shapes for the generated data and the runtime that consumes it.

	`StyleObject` is structurally Tailwind's own `CssInJs`, restated here so the
	build scripts — which never import from tailwindcss — can use it too.
*/

/*
	Note the `number`: postcss-js converts numeric CSS values to JS numbers, so
	`opacity: 0` round-trips as a number, not a string. Tailwind's own `CssInJs`
	does not allow that — see the cast in index.ts, which is the one place the
	two types meet.
*/
export type StyleObject = {
	[key: string]: string | number | string[] | StyleObject | StyleObject[];
};

/** One bundle's rules, split by the plugin channel each one needs. */
export interface Bundle {
	/** From `@utility`; Tailwind wraps these in `@layer utilities`. */
	utilities: StyleObject;
	/** From plain selectors; emitted in a top-level layer. */
	standalone: StyleObject;
	/**
	 * Rules for classes created at runtime by JavaScript, which Tailwind can
	 * never see as a candidate. They go through addBase so they are emitted
	 * unconditionally rather than being usage-gated away.
	 */
	unconditional: StyleObject;
}

/** Registers one bundle's rules. One of these is generated per bundle. */
export type BundleRegistrar = (context: {
	addUtilities: (utilities: Record<string, StyleObject>) => void;
	addBase: (base: StyleObject) => void;
	prefix?: string;
}) => void;

/** Options a consumer may pass in the `@plugin` body. */
export interface PluginOptions {
	/** Renames the plugin's own classes and locals, e.g. `px-`. */
	prefix?: string;
	/** Bundles to register; omit for all. */
	include?: string | string[];
	/** Bundles to skip. Ignored when `include` is given. */
	exclude?: string | string[];
}
```

---

### `packages/core/functions/context.css`

```css
/*
	What every component is compiled against: the tokens and shared utilities it
	needs in order to resolve `@apply` and `theme()`. The build compiles this
	alone, compiles it again with the components appended, and keeps the
	difference — so anything in here is context and is never shipped twice.

	`source(none)` is load-bearing. Without it Tailwind scans the repository for
	candidates, so any class-like string anywhere — including one written in a
	code comment — becomes a real utility baked into the shipped bundle. Every
	compile that uses this file supplies its candidates explicitly with
	`@source inline()`.

	A plain `@import`, NOT `@reference`: `@reference` suppresses `@utility`
	emission entirely, which silently empties every bundle.
*/
@import 'tailwindcss' source(none);
@import '../src/base/_index.css';
@import '../src/utilities/_index.css';
@import '../src/themes/_index.css';
```

---

### `packages/core/src/components/badge.css`

```css
/*
	Tiers NEST rather than sit side by side. Unlayered content of a layer beats
	that layer's sublayers whatever the declaration order, so deeper is weaker —
	and that holds however the files end up being concatenated.

	  badge.l1.l2.l3   foundation   weakest
	  badge.l1.l2      variant
	  badge.l1         state        strongest

	The first segment is the bundle name. partition.ts reads it to decide which
	bundle a rule belongs to, so it must match the file name.
*/
@layer badge.l1.l2.l3 {
	.badge {
		display: inline-flex;
		align-items: center;
		border-radius: var(--radius-field);
	}
}

@layer badge.l1.l2 {
	.badge-primary {
		background-color: var(--color-primary);
	}
}
```

---

### `packages/core/src/components/_index.css`

One line per component, alphabetical. This barrel is the only place a new
component has to be registered.

```css
@import './badge.css';
```

---

### `packages/core/src/base/_index.css`, `src/utilities/_index.css`, `src/themes/_index.css`

Empty files at this point. They exist so `context.css` can import them without
erroring; [guide 14](14-tokens.md) fills them.

```css
/* Empty for now — guide 14 adds the token files. */
```

---

### `packages/core/functions/extract-classes.ts`

```ts
import postcss from 'postcss';

const CLASS_IN_SELECTOR = /\.(-?[_a-zA-Z][\w-]*)/g;

/*
	Generic state hooks the design system reads but does not own. They appear in
	component selectors (`.badge.disabled`) yet belong to the consumer's markup,
	so a prefix must never rename them and they are never safelisted as ours.
*/
const STATE_HOOKS = new Set([
	'disabled',
	'selected',
	'active',
	'checked',
	'open',
	'collapsed',
	'dragged'
]);

/**
 * Class names a stylesheet defines.
 *
 * `@utility` blocks are authoritative. Plain class selectors are only counted
 * when they sit in the given namespace — otherwise Tailwind built-ins that the
 * file merely references (`.sr-only`) get claimed as ours and renamed under a
 * prefix. Shared utilities are not namespaced (`surface`, `elevation-1`), so
 * they pass `namespace: null`, which accepts any plain class that is not a
 * state hook.
 *
 * Tailwind emits an `@utility` only when something references it, so the list
 * this returns is fed back into the compile as a safelist.
 */
export function extractClasses(css: string, namespace: string | null): string[] {
	const root = postcss.parse(css);
	const classes = new Set<string>();

	root.walkAtRules('utility', (rule) => {
		const name = rule.params.trim();
		// Functional utilities (`badge-gap-*`) have no finite set of names to
		// safelist, so they are not candidates. Guide 16 reads them separately
		// and re-registers them through matchUtilities.
		if (name.includes('*')) return;
		classes.add(name);
	});

	/*
		A file's own `@utility` names describe what it owns better than its file
		name does: collapsible.css may declare `collapse`, navigation.css may
		declare `nav-rail`. Filtering plain selectors by file name alone would
		drop those, so the declared utilities widen the namespace.
	*/
	const namespaces = namespace === null ? null : [namespace, ...classes];
	const owned = (name: string): boolean =>
		namespaces === null || namespaces.some((ns) => name === ns || name.startsWith(`${ns}-`));

	root.walkRules((rule) => {
		// Selectors inside an @utility block were handled above.
		if (rule.parent?.type === 'atrule' && (rule.parent as postcss.AtRule).name === 'utility') {
			return;
		}
		for (const match of rule.selector.matchAll(CLASS_IN_SELECTOR)) {
			const name = match[1];
			if (STATE_HOOKS.has(name)) continue;
			if (!owned(name)) continue;
			classes.add(name);
		}
	});

	// Sorted, so generated output does not reorder between machines.
	return [...classes].sort();
}
```

---

### `packages/core/functions/partition.ts`

```ts
import postcss from 'postcss';
import { objectify } from 'postcss-js';
import type { Bundle, StyleObject } from '../types.js';

/*
	The bundle that owns a `@layer` block, read from its first segment.

	One or more `.lN` segments follow the name, because tiers nest. Anchoring
	this to a single `.lN` breaks the moment a tier is nested — and the symptom
	is a confusing report about Tailwind built-ins rather than a parse error.
*/
const LAYER_OWNER = /^([a-z][\w-]*)(?:\.l\d+)+$/;

export interface Partitioned {
	components: Record<string, Bundle>;
	properties: StyleObject;
	unattributed: string[];
}

/**
 * Splits a whole-library compile into per-bundle buckets.
 *
 * Attribution runs off the naming discipline chosen in guide 0: component
 * rules live in `@layer <component>.l1[.l2[.l3]]`, and keyframes are named
 * `<component>-*`. Shared utilities carry no layer marker of their own, so
 * they are attributed by class name via `classOwners`. Anything unattributed
 * is context — theme, preflight — and is dropped.
 */
export function partition(
	css: string,
	components: string[],
	classOwners: ReadonlyMap<string, string> = new Map()
): Partitioned {
	const root = postcss.parse(css);
	const owners = new Set(components);
	const extraBundles = new Set(classOwners.values());

	const buckets: Record<string, { utilities: postcss.Root; standalone: postcss.Root }> =
		Object.fromEntries(
			[...components, ...extraBundles].map((name) => [
				name,
				{ utilities: postcss.root(), standalone: postcss.root() }
			])
		);
	const properties = postcss.root();
	const unattributed: string[] = [];

	const ownerOf = (node: postcss.ChildNode): string | null => {
		// 1. The layer marker, which is the reliable signal.
		if (node.type === 'atrule' && node.name === 'layer') {
			const owner = LAYER_OWNER.exec(node.params.trim())?.[1];
			if (owner && owners.has(owner)) return owner;
		}
		// 2. Keyframes, named after the component that animates with them.
		if (node.type === 'atrule' && node.name === 'keyframes') {
			const name = node.params.trim();
			for (const c of components) if (name === c || name.startsWith(`${c}-`)) return c;
		}
		// 3. Class name. Shared utilities carry no @layer marker of their own —
		//    `@utility surface` lands as a bare `.surface` inside @layer
		//    utilities — so they are attributed by the classes they define.
		if (node.type === 'rule') {
			for (const match of node.selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
				const owner = classOwners.get(match[1]);
				if (owner) return owner;
			}
		}
		/*
			4. A layer whose name is not a bundle. Layer names are not always file
			   names — collapsible.css may emit `@layer collapse.lN` — so fall
			   back to the classes inside before giving up.
		*/
		if (node.type === 'atrule') {
			let owner: string | null = null;
			node.walkRules((rule) => {
				if (owner) return false;
				for (const match of rule.selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
					const candidate = classOwners.get(match[1]);
					if (candidate) {
						owner = candidate;
						return false;
					}
				}
				return undefined;
			});
			if (owner) return owner;
		}
		return null; // context — dropped, and reported
	};

	const take = (node: postcss.ChildNode, bucket: 'utilities' | 'standalone'): boolean => {
		const owner = ownerOf(node);
		if (owner) {
			buckets[owner][bucket].append(node.clone());
			return true;
		}
		return false;
	};

	root.each((node) => {
		if (node.type === 'comment') return;

		// Everything Tailwind emitted from an @utility lands here. It is
		// usage-gated, which is what you want, so it goes to addUtilities.
		if (node.type === 'atrule' && node.name === 'layer' && node.params === 'utilities') {
			node.each((child) => {
				if (!take(child, 'utilities')) unattributed.push(describe(child));
			});
			return;
		}
		// @property registrations back Tailwind's --tw-* machinery. They are
		// global and must be unconditional, so they go to addBase, not a bundle.
		if (node.type === 'atrule' && node.name === 'property') {
			properties.append(node.clone());
			return;
		}
		if (node.type === 'atrule' && node.name === 'layer' && node.params === 'properties') {
			node.each((child) => {
				properties.append(child.clone());
			});
			return;
		}
		if (!take(node, 'standalone')) unattributed.push(describe(node));
	});

	return {
		components: Object.fromEntries(
			Object.entries(buckets).map(([name, b]) => [
				name,
				{
					utilities: kebabCaseProperties(objectify(b.utilities)) as StyleObject,
					standalone: kebabCaseProperties(objectify(b.standalone)) as StyleObject,
					// Filled in by build.ts, which knows which classes JS creates.
					unconditional: {}
				}
			])
		),
		properties: kebabCaseProperties(objectify(properties)) as StyleObject,
		unattributed
	};
}

/** A human-readable label for a dropped node, for the build's report. */
const describe = (node: postcss.ChildNode): string =>
	node.type === 'atrule' ? `@${node.name} ${node.params}`.trim() : (node as postcss.Rule).selector;

/*
	postcss-js camelCases declaration properties, and Tailwind converts them back
	— except when the value is an ARRAY, which is how a repeated declaration is
	represented (a `transition-duration` given twice as a fallback). Those keys
	reach the browser verbatim as `transitionDuration`, which browsers drop.

	Emitting kebab-case throughout sidesteps the conversion entirely.
*/
const isDeclarationValue = (value: unknown): boolean => {
	if (Array.isArray(value)) return value.length === 0 || typeof value[0] !== 'object';
	return typeof value !== 'object' || value === null;
};

/*
	postcss-js's own encoding, reversed. Vendor prefixes are why this is not a
	plain camel-to-kebab: `-webkit-user-select` round-trips as
	`WebkitUserSelect`, so a LEADING capital has to become a leading dash, and
	`-ms-` is the odd one out that postcss-js encodes lowercase.
*/
const toKebab = (property: string): string =>
	property
		.replace(/([A-Z])/g, '-$1')
		.replace(/^ms-/, '-ms-')
		.toLowerCase();

/** Rewrites declaration keys only; selectors, at-rules and custom properties
 *  are left exactly as they are. */
export function kebabCaseProperties<T>(node: T): T {
	if (Array.isArray(node)) return node.map(kebabCaseProperties) as unknown as T;
	if (node === null || typeof node !== 'object') return node;
	return Object.fromEntries(
		Object.entries(node as Record<string, unknown>).map(([key, value]) => {
			if (key.startsWith('--') || key.startsWith('@') || !isDeclarationValue(value)) {
				return [key, kebabCaseProperties(value)];
			}
			return [toKebab(key), value];
		})
	) as T;
}
```

---

### `packages/core/functions/nestCssLayers.ts`

A **runtime** module — `generated/` imports it, so unlike the rest of
`functions/` it ships. Step 10's generated registrars call it.

```ts
import type { StyleObject } from '../types.js';

/*
	addUtilities() rejects an at-rule as a top-level key — it wants a class
	selector. Compiled output is the other way round: `@layer badge.l1.l2.l3`
	wrapping `.badge`. This inverts that nesting, so

	    { '@layer x': { '.a': {…} } }   becomes   { '.a': { '@layer x': {…} } }

	which is also how the CSS was authored by hand.
*/

type Nested = StyleObject | StyleObject[];

/** Adds a rule under a selector, turning a repeat into an array rather than
 *  overwriting — two layers can both contribute to the same selector. */
const appendRule = (styles: StyleObject, selector: string, rule: Nested): void => {
	const existing = styles[selector];
	if (existing === undefined) {
		styles[selector] = rule;
		return;
	}
	styles[selector] = (
		Array.isArray(existing) ? [...existing, rule] : [existing, rule]
	) as StyleObject[];
};

/** Re-wraps a rule in the at-rules it was found inside, innermost last. */
const wrapWithAtRules = (rule: Nested, atRules: string[]): Nested =>
	atRules.reduceRight<Nested>((wrapped, atRule) => ({ [atRule]: wrapped }) as StyleObject, rule);

const moveLayerRules = (styles: StyleObject, layerValue: Nested, atRules: string[]): void => {
	for (const block of Array.isArray(layerValue) ? layerValue : [layerValue]) {
		for (const [key, value] of Object.entries(block)) {
			// A nested at-rule: recurse, remembering it so it can be re-applied.
			if (key.startsWith('@')) {
				moveLayerRules(styles, value as Nested, [...atRules, key]);
				continue;
			}
			appendRule(styles, key, wrapWithAtRules(value as Nested, atRules));
		}
	}
};

/*
	At-rules whose children are DECLARATIONS rather than rules. There is no
	selector to hoist out of these, so they must be left exactly as they are —
	inverting them would produce nonsense.
*/
const NON_GROUPING = ['@keyframes', '@property', '@font-face', '@counter-style'];

const isGroupingAtRule = (key: string): boolean =>
	key.startsWith('@') && !NON_GROUPING.some((name) => key.startsWith(name));

export const nestCssLayers = (styles: StyleObject): Record<string, StyleObject> => {
	const nested: StyleObject = {};
	for (const [key, value] of Object.entries(styles)) {
		/*
			Every conditional group at the top level has to be turned inside out,
			not just `@layer`: addUtilities takes a class selector as its key and
			rejects `@media (width < 620px)` outright.
		*/
		if (isGroupingAtRule(key)) {
			moveLayerRules(nested, value as Nested, [key]);
			continue;
		}
		appendRule(nested, key, value as Nested);
	}
	return nested as Record<string, StyleObject>;
};
```

---

### `packages/core/functions/build.ts`

The whole generator, assembled from steps 5, 6, 7, 8, 9 and 10. Guides
[14](15-themes.md) and [15](14-tokens.md) append to it; this is its state at the
end of guide 2.

```ts
/*
	The compiler.

	Reads src/**\/*.css, compiles it through the real Tailwind CLI, works out
	which rules each component contributed, converts those to JavaScript objects
	and writes them to generated/. Nothing here ships — tsconfig.build.json
	deliberately excludes functions/.

	Run it with `bun functions/build.ts`, or `bun run build`, which also cleans
	dist/ and runs tsc afterwards.
*/
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { extractClasses } from './extract-classes.js';
import { partition } from './partition.js';
import type { Bundle } from '../types.js';

// import.meta.dirname is functions/, so the package root is one level up.
const require = createRequire(import.meta.url);
const pkgRoot = path.resolve(import.meta.dirname, '..');
const coreSrc = path.join(pkgRoot, 'src');
const componentsDir = path.join(coreSrc, 'components');
const generatedDir = path.join(pkgRoot, 'generated');
const tmpDir = path.join(pkgRoot, '.tmp');

/*
	Resolve the Tailwind CLI out of THIS package's node_modules rather than
	assuming a global install. A global copy on a different minor version
	produces output that disagrees with the test harness, and the disagreement
	is subtle enough to cost hours.
*/
const cliEntry = path.join(
	path.dirname(require.resolve('@tailwindcss/cli/package.json')),
	'dist/index.mjs'
);

/** Forward slashes, so generated @import paths are identical on every OS. */
const toPosix = (p: string): string => p.split(path.sep).join('/');
const relFromTmp = (target: string): string => toPosix(path.relative(tmpDir, target));

/**
 * Compiles one CSS string and returns the result.
 *
 * Input and output are written to .tmp/<label>.{in,out}.css, which is the whole
 * reason for using the CLI rather than the programmatic API: when something
 * looks wrong there is a real file to open.
 */
function runTailwind(input: string, label: string): string {
	const inFile = path.join(tmpDir, `${label}.in.css`);
	const outFile = path.join(tmpDir, `${label}.out.css`);
	fs.mkdirSync(tmpDir, { recursive: true });
	fs.writeFileSync(inFile, input);
	try {
		execFileSync(process.execPath, [cliEntry, '-i', inFile, '-o', outFile], { stdio: 'pipe' });
	} catch (error) {
		const detail = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
		// Strip ANSI colour codes, or the message is unreadable in a log file.
		// eslint-disable-next-line no-control-regex
		throw new Error(`tailwind failed on ${label}:\n${detail.replace(/\x1b\[[0-9;]*m/g, '')}`);
	}
	return fs.readFileSync(outFile, 'utf8');
}

// ---------------------------------------------------------------------------
// 1. Find the component stylesheets.
// ---------------------------------------------------------------------------

/*
	Sorted, because readdirSync order is filesystem-dependent. Unsorted, the
	generated output reorders between machines and every diff is noise.
*/
const componentFiles = fs
	.readdirSync(componentsDir)
	.filter((f) => f.endsWith('.css') && f !== '_index.css')
	.sort()
	.map((f) => path.join(componentsDir, f));

const componentNames = componentFiles.map((f) => path.basename(f, '.css'));

// ---------------------------------------------------------------------------
// 2. Build the safelist, and record which bundle owns each class.
// ---------------------------------------------------------------------------

/*
	`source(none)` means nothing is scanned, so every class the compile should
	emit has to be named explicitly. Deriving the list from source is the whole
	point — a hand-maintained equivalent ships incomplete and nobody notices
	until a consumer reports a missing class.
*/
const classOwners = new Map<string, string>();
const allClasses: string[] = [];

for (const file of componentFiles) {
	const name = path.basename(file, '.css');
	const css = fs.readFileSync(file, 'utf8');
	for (const className of extractClasses(css, name)) {
		classOwners.set(className, name);
		allClasses.push(className);
	}
}

// ---------------------------------------------------------------------------
// 3. Drop Tailwind's own class names.
// ---------------------------------------------------------------------------

/*
	Names like `collapse`, `table` and `select-text` are Tailwind's. Claiming
	one pulls Tailwind's rule into your bundle, where it will fight the
	consumer's own utilities.

	Probe with BARE Tailwind and none of your CSS loaded: whatever answers is
	Tailwind's. Running this against the full context instead reports every
	shared utility as a built-in — dozens of false positives.
*/
const builtinCss = runTailwind(
	["@import 'tailwindcss' source(none);", ...allClasses.map((c) => `@source inline("${c}");`)].join(
		'\n'
	),
	'builtins'
);

const builtins = new Set<string>();
for (const match of builtinCss.matchAll(/^\s*\.([-\w]+)\s*(?:,|\{)/gm)) {
	if (classOwners.has(match[1])) builtins.add(match[1]);
}
for (const name of builtins) classOwners.delete(name);

if (builtins.size) {
	console.log(`skipping ${builtins.size} Tailwind built-ins: ${[...builtins].sort().join(', ')}`);
}

const safelist = [...classOwners.keys()].sort().map((c) => `@source inline("${c}");`);

// ---------------------------------------------------------------------------
// 4. Compile the context and the components together, once.
// ---------------------------------------------------------------------------

const contextPath = path.join(import.meta.dirname, 'context.css');

const compiled = runTailwind(
	[
		`@import '${relFromTmp(contextPath)}';`,
		...componentFiles.map((f) => `@import '${relFromTmp(f)}';`),
		// @utility output is emitted on demand, so without the safelist the
		// compile comes back with none of your components in it.
		...safelist
	].join('\n'),
	'library'
);

/*
	A cheap sanity check that the compile actually resolved. If `@apply` survived
	into the output, something failed silently upstream and every downstream step
	would work on nonsense.
*/
if (compiled.includes('@apply')) {
	throw new Error('compile left @apply in the output — the context did not resolve');
}

// ---------------------------------------------------------------------------
// 5. Partition into bundles — which is also what subtracts the context.
// ---------------------------------------------------------------------------

/*
	There is no separate "subtract the context" step, and there must not be one.

	partition() attributes every top-level node to a bundle by its @layer marker,
	its keyframe name, or the classes it defines. Anything it cannot attribute —
	Tailwind's preflight, the theme layer, the tokens from src/base — is context
	by definition, and is dropped. Attribution IS the subtraction.

	Do not be tempted to diff the compiled text against a context-only compile.
	CSS is not line-oriented: removing a matched selector line leaves its
	declarations and closing brace behind, and postcss then fails with
	"Unexpected }" on the next parse.
*/
const { components, properties, unattributed } = partition(compiled, componentNames, classOwners);

/*
	Report what was dropped. A rule silently lost as "context" is the failure
	mode here: the build stays green and a component ships without one of its
	rules. A count makes it visible; read the list when it changes.
*/
if (unattributed.length) {
	console.log(`${unattributed.length} unattributed rules dropped as context:`);
	for (const item of unattributed.slice(0, 10)) console.log(`  ${item}`);
	if (unattributed.length > 10) console.log(`  … and ${unattributed.length - 10} more`);
}

// ---------------------------------------------------------------------------
// 6. Emit generated/.
// ---------------------------------------------------------------------------

/*
	Written as .ts, not .js, so tsc typechecks the generated data against the
	same `Bundle` type the hand-written runtime uses. A shape change in the
	generator then fails the build instead of failing at a consumer's runtime.
*/
const BANNER = '/* Generated by functions/build.ts. Do not edit. */\n';

fs.rmSync(generatedDir, { recursive: true, force: true });
fs.mkdirSync(path.join(generatedDir, 'components'), { recursive: true });

for (const [name, bundle] of Object.entries(components) as [string, Bundle][]) {
	const dir = path.join(generatedDir, 'components', name);
	fs.mkdirSync(dir, { recursive: true });

	// The data.
	fs.writeFileSync(
		path.join(dir, 'object.ts'),
		BANNER +
			`import type { StyleObject } from '../../../types.js';\n\n` +
			`export const utilities: StyleObject = ${JSON.stringify(bundle.utilities, null, '\t')};\n\n` +
			`export const standalone: StyleObject = ${JSON.stringify(bundle.standalone, null, '\t')};\n\n` +
			`export const unconditional: StyleObject = ${JSON.stringify(bundle.unconditional, null, '\t')};\n`
	);

	/*
		The registrar. Generated rather than written once and reused, because
		each bundle's data is a separate module — which is what lets a consumer's
		bundler drop the ones `exclude` skipped.
	*/
	fs.writeFileSync(
		path.join(dir, 'index.ts'),
		BANNER +
			`import { nestCssLayers } from '../../../functions/nestCssLayers.js';\n` +
			`import type { BundleRegistrar } from '../../../types.js';\n` +
			`import { utilities, standalone, unconditional } from './object.js';\n\n` +
			`const register: BundleRegistrar = ({ addUtilities, addBase }) => {\n` +
			`\tif (Object.keys(utilities).length) addUtilities(nestCssLayers(utilities));\n` +
			`\tif (Object.keys(standalone).length) addBase(standalone);\n` +
			`\tif (Object.keys(unconditional).length) addBase(unconditional);\n` +
			`};\n\nexport default register;\n`
	);
}

// The barrel index.ts imports: bundle name -> registrar.
const names = Object.keys(components).sort();
fs.writeFileSync(
	path.join(generatedDir, 'imports.ts'),
	BANNER +
		`import type { BundleRegistrar } from '../types.js';\n` +
		names.map((n) => `import ${ident(n)} from './components/${n}/index.js';`).join('\n') +
		`\n\nconst bundles: Record<string, BundleRegistrar> = {\n` +
		names.map((n) => `\t'${n}': ${ident(n)}`).join(',\n') +
		`\n};\n\nexport default bundles;\n`
);

// @property registrations, global and unconditional.
fs.writeFileSync(
	path.join(generatedDir, 'properties.ts'),
	BANNER +
		`import type { StyleObject } from '../types.js';\n\n` +
		`const value: StyleObject = ${JSON.stringify(properties, null, '\t')};\n\n` +
		`export default value;\n`
);

/** A component name as a valid JS identifier: `code-block` -> `codeBlock`. */
function ident(name: string): string {
	return name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

console.log(`built ${names.length} bundles: ${names.join(', ')}`);
```

---

### `packages/core/index.ts`

The plugin entry, and the only file a consumer loads. [Guide 16](16-options.md)
replaces the body of the options function; this is its state now.

```ts
import plugin from 'tailwindcss/plugin';
import type { PluginAPI, PluginWithConfig } from 'tailwindcss/plugin';

import bundles from './generated/imports.js';
import properties from './generated/properties.js';
import type { PluginOptions, StyleObject } from './types.js';

/*
	The design system as a standalone Tailwind plugin.

	    @import 'tailwindcss';
	    @plugin '@anti049/test' {
	      prefix: px-;
	      exclude: badge;
	    }

	Options arrive already typed by Tailwind: `prefix: px-` is a string,
	`exclude: a, b` an array, bare true/false booleans, numbers numbers. There
	is nothing to parse.
*/

/*
	Tailwind imports this type in its own declarations but never re-exports it,
	so the inferred type of the default export cannot be named. Restating it
	keeps the emitted .d.ts portable — without it, tsc writes a declaration that
	references a path inside node_modules and consumers get a broken type.
*/
type PluginWithOptions<T> = {
	(options?: T): PluginWithConfig;
	__isOptionsFunction: true;
};

/*
	The one place StyleObject meets Tailwind's CssInJs. They are the same shape
	except that postcss-js emits numeric CSS values as JS numbers (`opacity: 0`),
	which CssInJs does not model. Tailwind stringifies them at emit time, so the
	conversion is safe; it lives here so there is one place to revisit if that
	ever stops being true.
*/
type CssInJs = Parameters<PluginAPI['addBase']>[0];
const asCssInJs = (styles: StyleObject): CssInJs => styles as unknown as CssInJs;

/** Option names the plugin understands. Anything else throws. */
const KNOWN = new Set(['prefix', 'include', 'exclude']);

const projectName: PluginWithOptions<PluginOptions> = plugin.withOptions(
	(options: PluginOptions = {}) => {
		const { prefix = '', include, exclude } = options;

		/*
			Validate here — throw, never warn. Tailwind ignores any option a
			plugin does not read, so a typo is indistinguishable from a setting
			that quietly refused to apply. A build error naming the option is the
			only feedback a consumer will ever get.
		*/
		const unknown = Object.keys(options).filter((key) => !KNOWN.has(key));
		if (unknown.length) {
			throw new Error(
				`test: unknown option${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}. ` +
					`Valid: ${[...KNOWN].join(', ')}.`
			);
		}

		/*
			`[].concat(value)` normalises the single-string case: `exclude: badge`
			arrives as a string and `exclude: a, b` as an array, and you do not
			want two code paths. `include` wins when both are given.
		*/
		const included = (name: string): boolean => {
			if (include) return ([] as string[]).concat(include).includes(name);
			if (exclude) return !([] as string[]).concat(exclude).includes(name);
			return true;
		};

		return (api: PluginAPI) => {
			// @property registrations must be unconditional, hence addBase.
			api.addBase(asCssInJs(properties));

			const addUtilities = (utilities: Record<string, StyleObject>): void => {
				api.addUtilities(utilities as unknown as Record<string, CssInJs>);
			};
			const addBase = (styles: StyleObject): void => {
				if (Object.keys(styles).length) api.addBase(asCssInJs(styles));
			};

			for (const [name, register] of Object.entries(bundles)) {
				if (!included(name)) continue;
				register({ addUtilities, addBase, prefix });
			}
		};
	}
);

export default projectName;
```

---

## Commit

Verify, then commit:

```powershell
bun run --filter '@anti049/test' check
git add -A
git commit -m "feat(core): compile CSS components into a Tailwind plugin"
```

Check `git status` before committing: `generated/`, `dist/` and `.tmp/` must
**not** appear. If they do, the `.gitignore` from [guide 1](01-monorepo.md) is
wrong, and committing build output now means fighting merge conflicts in
generated files forever.

No changeset yet — nothing is published until [guide 13](13-release.md), and the
enforcement workflow does not exist until [guide 9](09-github.md).

---

## Checkpoint

Step 12 compiled against `./dist/index.js` from inside the package. This
compiles against a **packed tarball** from outside the repository, which is
the only way to see the package a consumer actually downloads.

### The plugin skeleton

A bare manifest plus the Tailwind CLI in `$env:TEMP\test-checkpoint\plugin`,
with the plugin installed from a tarball by `npm` — not `bun`, for the reason
in [guide 17](17-rehearsal.md)'s traps. The checkpoints in guides 14, 15 and
16 rebuild this same skeleton, so it is worth keeping the block to hand. Run it
from the repository root:

```powershell
$cp   = "$env:TEMP\test-checkpoint"
$pkgs = "$cp\pkgs"
$app  = "$cp\plugin"
Remove-Item -Recurse -Force $pkgs, $app -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $pkgs, "$app\src", "$app\out" | Out-Null

bun run --filter '@anti049/test' build
Push-Location packages/core
# npm pack prints the filename it wrote as its last line.
$core = npm pack --pack-destination $pkgs | Select-Object -Last 1
Pop-Location

Push-Location $app
'{ "name": "checkpoint", "private": true, "type": "module" }' | Set-Content package.json
npm install --no-audit --no-fund tailwindcss '@tailwindcss/cli' "$pkgs\$core"
$cli = node -e "const p=require('path');console.log(p.join(p.dirname(require.resolve('@tailwindcss/cli/package.json')),'dist/index.mjs'))"
```

It is rebuilt from scratch every time, deliberately. Reinstalling a repacked
tarball of the same version into an existing directory is how you end up
testing a fix that was never installed ([guide 12](12-testing.md), step 7).

### The checks

```powershell
# What a consumer downloads: dist/ and README.md, and none of the build.
tar -tzf "$pkgs\$core" | Select-String '^package/(src|test|functions|generated)/'   # prints nothing
tar -tzf "$pkgs\$core" | Select-String '^package/dist/index\.js$'                    # one match

# The entry loads under plain Node, not just under Bun.
node --input-type=module -e "import('@anti049/test').then(m => console.log(typeof m.default))"   # function

@'
@import 'tailwindcss' source(none);
@plugin '@anti049/test';
@source inline('badge');
@source inline('badge-primary');
'@ | Set-Content src/consumer.css
node $cli -i src/consumer.css -o out/consumer.css
(Select-String -Path out/consumer.css -Pattern '\.badge\b').Count           # > 0
(Select-String -Path out/consumer.css -Pattern '\.badge-primary\b').Count   # > 0

# A misspelt option must fail the consumer's build, naming the option.
@'
@import 'tailwindcss' source(none);
@plugin '@anti049/test' { prefx: x-; }
'@ | Set-Content src/typo.css
node $cli -i src/typo.css -o out/typo.css; $LASTEXITCODE   # non-zero; the message names `prefx`

Pop-Location
Remove-Item -Recurse -Force $cp
```

**Passes when** every line prints what its comment says.

**If it does not:** `src/` or `functions/` in the tarball means `files` in
`package.json` is wrong. A plugin that loads under Bun and not under Node is
almost always an extensionless relative import in `index.ts` or `generated/`.
A zero `.badge` count with a successful compile is the "registered nothing
usable" case from step 12 — read `out/consumer.css` before anything else. A
typo that compiles cleanly means `KNOWN` validation in `index.ts` is not
running.

---

What you have now ships components and nothing else. Three guides complete the
plugin, and it is worth doing them before the bindings — they change what the
package exports, which is what the bindings are written against:

- [14. The token layer](14-tokens.md) — make the plugin work with no CSS import
- [15. Themes](15-themes.md) — generated palettes, the catalogue, the generator
- [16. The plugin option surface](16-options.md) — `prefix`, `include`,
  `themes`, `addVariant`, `matchUtilities`

Next: [Bindings: the shared contract](03-bindings.md)
