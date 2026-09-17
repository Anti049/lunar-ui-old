# 12. Testing

Three layers, answering different questions. Each catches a class of failure the
others structurally cannot.

Ten steps. Steps 1–4 build the differential harness — the test that justifies the
whole architecture — and the rest layer on top of it.

---

## 1. Build the differential harness

**The question:** does the compiled plugin still mean what the CSS said?

Compile every component twice from the same source — once by `@import`ing the raw
CSS, once through the built plugin — and compare selector by selector.

**`packages/core/test/e2e.test.ts`** — new file. It sits in `test/`, not
`test/unit/`, because the `test` script runs the two separately.

```ts
const baseline = compile([contextImport, ...componentImports, ...safelist].join('\n'));
const candidate = compile([contextImport, `@plugin '${pluginPath}';`, ...safelist].join('\n'));

const base = rulesBySelector(baseline, owns);
const cand = rulesBySelector(candidate, owns);

const missing = [...base.keys()].filter((k) => !cand.has(k));
const extra = [...cand.keys()].filter((k) => !base.has(k));
```

Two things make or break this:

- **The safelist.** With `source(none)` nothing is scanned, so the harness must
  name every class it wants emitted. Derive that list from the plugin's own
  registry — hand-maintaining it means the harness silently stops covering
  whatever you added last.
- **`owns`.** A predicate for "is this selector ours". Without it you diff
  Tailwind's entire preflight against itself and drown.

---

## 2. Report the categories separately

A single pass/fail number is useless here — most differences are benign
(re-grouped selectors, inlined `var()` fallbacks) and you will start ignoring
failures if they are lumped in with real ones.

```text
parity
  present in both:        561
  missing from plugin:    0   (+1 Tailwind built-in, deliberately unclaimed)
  extra in plugin:        0   with new declarations
    also 9 redundant wrappers (no new declarations)
  benign (inlined var fallback):  92
  benign (regrouped superset):    45
  real declaration conflicts:     0
```

Assert on the categories that matter (`missing`, `extra with new declarations`,
`real conflicts`) and merely _print_ the rest. The printed numbers are how you
notice a refactor moved something, without failing a build over it.

---

## 3. Prove it can fail

A test that cannot fail is worse than no test, because it buys false confidence.
Verify by mutation:

```powershell
# change a value in generated/components/badge/object.ts
bun test/e2e.test.ts     # must fail, naming the selector and the property
```

The failure must name the selector **and** the property. If it says only "parity
mismatch", improve the reporting now — you will be reading this output under time
pressure later.

Do this when you write the harness, and again whenever you refactor it. A harness
that quietly became vacuous looks exactly like a harness that is passing.

---

## 4. Assert the rest of the contract in the same pass

The harness already has both compiles in hand; these cost almost nothing to add:

- **Standalone resolution** — compile with `@plugin` and _no_ CSS import at all.
  Every `var()` must resolve; the plugin ships its own tokens or it does not work.
- **Prefixing** — with `prefix: x-`, every owned class is renamed, and nothing
  else is: not Tailwind's theme variables, not consumer state hooks, not
  third-party classes.
- **Themes** — every shipped theme emits, `include`/`exclude` do what they say,
  unknown values throw.
- **Cascade layers** — where each selector landed. Divergence here is usually
  benign but you want to see it move.

The standalone check is the one that catches the most embarrassing bug class: a
plugin that works perfectly in your repo because the docs site happens to define
a token the plugin forgot to ship.

---

## 5. Add unit tests on the pure functions

**The question:** which function is broken?

The harness reports _symptoms_. When a layer-attribution regex broke in a real
case, it said "13 Tailwind built-ins, 1 conflict on `.table`" — true, and several
diagnostic steps away from the one-character cause.

**`packages/core/test/unit/partition.test.ts`** — new file:

```ts
test('a nested-tier layer still resolves to its first segment', () => {
	const { components, unattributed } = partition(
		'@layer utilities { @layer table.l1.l2.l3 { .table { width: 100% } } }',
		['table'],
		new Map() // deliberately empty: no class-name fallback available
	);
	expect(unattributed).toEqual([]);
	expect(Object.keys(components.table.utilities)).toContain('@layer table.l1.l2.l3');
});
```

Each of these is its own file under `packages/core/test/unit/`, named after the
function it covers — `partition.test.ts`, `addPrefix.test.ts`, and so on.

Worth covering:

| Function         | What the test pins                                                             |
| ---------------- | ------------------------------------------------------------------------------ |
| `partition`      | attribution by layer, by class, by keyframe name; context dropped              |
| `addPrefix`      | renames what you own, leaves everything else, survives quotes/comments/escapes |
| `nestCssLayers`  | at-rule inversion; declaration-bearing at-rules left alone                     |
| `extract-*`      | what counts as "ours"; throws on shapes it cannot port                         |
| kebab conversion | vendor prefixes (`-webkit-`, `-ms-`), arrays, custom properties                |

Write each test around a _real_ bug where you have one, and say so in a comment.
A test called "keeps vendor prefixes valid" with a note that the first attempt
produced `webkit-user-select` is worth three generic assertions.

---

## 6. Add the artifact checks

Cheap, and they catch a class the other two structurally cannot — nothing about
your CSS being right says the package is installable.

```powershell
cd packages/core
bunx publint
bunx @arethetypeswrong/cli --pack .
```

- **`publint`** — exports map resolves, types resolve, no CJS/ESM mismatch.
- **`attw`** — catches types that resolve for one module system and not the
  other, which `publint` does not.

Fix everything they report now. Both tools get noisier as a package grows, and a
baseline of "three known warnings" becomes a baseline of thirty.

---

## 7. Add the packed-tarball smoke test

The only way to catch packaging bugs. Pack, install into a scratch app, compile:

```powershell
# Pack into the temp directory, NOT into the repo: a stray .tgz inside the
# workspace gets picked up by the next `bun install` as a file: dependency.
Set-Location packages/core
bun run build
npm pack --pack-destination $env:TEMP

# A scratch consumer, outside the monorepo, so nothing resolves by workspace link.
Set-Location $env:TEMP
bunx sv create app --template minimal --types ts --no-add-ons
Set-Location app
bun add -d tailwindcss '@tailwindcss/vite'

# Resolve the tarball by glob — its name carries the version you just built.
bun add (Get-Item "$env:TEMP/scope-project-name-*.tgz").FullName
```

Then add `@plugin '@scope/project-name';` to the app's CSS, build it, and grep
the output for a class you know the plugin owns.

**Use a tarball, not `bun link`.** A link resolves to the working tree, so it
hides an empty `files` array, a wrong `exports` map, and anything else that only
manifests after packing. A real project shipped a plugin with _zero_ files in
`dist` because the root `.gitignore` excluded `dist` and `npm pack` honoured it.

**Bump the version before repacking.** Package managers cache by name and
version; repacking the same version silently reinstalls stale content and you
debug a fix that was never installed.

---

## 8. Wire it into one `check` script

**`packages/core/package.json`** — the `scripts` block from
[guide 2](02-plugin.md) step 12, now with the test steps wired in:

```jsonc
"scripts": {
  "check": "bun run build && bun run typecheck && bun run test && publint"
}
```

`build` first, and in that order — the harness compiles `dist/index.js`, so a
stale `dist` makes the whole suite meaningless.

One command means what CI runs and what you run locally cannot drift. Resist
adding steps to the CI workflow that are not in `check`.

---

## 9. Decide what runs where

|                                   | Local hook | CI on PR       | Release |
| --------------------------------- | ---------- | -------------- | ------- |
| Prettier / ESLint on staged files | ✓          |                |         |
| Lint the whole tree               |            | ✓              | ✓       |
| Typecheck                         |            | ✓              | ✓       |
| Unit tests                        |            | ✓              | ✓       |
| Differential harness              |            | ✓              | ✓       |
| `publint`                         |            | ✓              | ✓       |
| Tarball smoke test                |            | on release PRs | ✓       |
| Commit message lint               | ✓          | ✓              |         |

Keep the pre-commit hook under a couple of seconds. Anything slower gets
`--no-verify`d, and then it is not a gate at all.

---

## 10. Add visual and accessibility testing once the set stabilises

Not before. A screenshot suite written against components you are still designing
is a maintenance burden that teaches you nothing.

- **Playwright** screenshots per component × theme × mode. The matrix is large,
  so gate it on a label or run it nightly rather than on every PR.
- **axe-core** in the same run — most violations in a design system are
  systematic (one bad contrast pair, one missing label pattern), so a single
  sweep finds many at once.
- **Contrast assertions in the plugin's own tests.** If you generate themes, you
  can compute contrast ratios at build time and fail when a generated pair drops
  below 4.5:1. Cheaper and earlier than catching it in a browser, and it belongs
  in step 5 rather than here.

---

## Files after this phase

| File                                            | Status                   | Written in | Next touched by         |
| ----------------------------------------------- | ------------------------ | ---------- | ----------------------- |
| `packages/core/test/e2e.test.ts`                | added                    | steps 1–4  | every new check you add |
| `packages/core/test/unit/partition.test.ts`     | added                    | step 5     | per bug fixed           |
| `packages/core/test/unit/addPrefix.test.ts`     | added                    | step 5     | per bug fixed           |
| `packages/core/test/unit/nestCssLayers.test.ts` | added                    | step 5     | per bug fixed           |
| `packages/core/test/unit/export-parity.test.ts` | from [3](03-bindings.md) | —          | never                   |
| `packages/core/package.json`                    | modified                 | step 8     | never                   |

The harness below is the **finished** one, covering themes, the option surface
and functional utilities. Those arrive in guides [14](14-themes.md),
[15](15-tokens.md) and [16](16-options.md); each section says which guide it
depends on, so if you are working strictly in order you can add them as you go
and the rest still runs.

It is a plain script, not a `bun:test` file. It prints a report and sets
`process.exitCode`, because the useful output here is a categorised table rather
than a list of passing assertions — see step 2.

---

### `packages/core/test/e2e.test.ts`

#### Part 1 — setup and the compile helper

```ts
/*
	End-to-end check of the CSS -> JS pipeline.

	Compiles the whole library twice from the same source of truth:

	  baseline   the pure-CSS path — @import every component stylesheet
	  candidate  the generated plugin — @plugin dist/index.js

	and compares what each produced. A faithful port means the same selectors
	carry the same declarations under the same cascade layers.

	Then four more compiles cover the parts the two-way comparison cannot reach:
	a prefixed build, a standalone build with no CSS import at all, theme
	selection, and functional utilities.

	Run it with `bun test/e2e.test.ts`. It requires `dist/` to exist, so
	`bun run build` first — which is why the `check` script orders them that way.
*/
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { extractClasses } from '../functions/extract-classes.js';
import { extractCustomVariants } from '../functions/extract-variants.js';
import shapeTokenNames from '../generated/shape.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const coreSrc = path.join(pkgRoot, 'src');

/*
	Scratch compiles live under dist/, not .tmp/, so that `bun run build` —
	which deletes dist/ — also clears them. Keeping them in .tmp/ meant a stale
	compile from a previous run could be read by the next one.
*/
const tmpDir = path.join(pkgRoot, 'dist', '.test');

/*
	Every component stylesheet that defines something, derived rather than
	hard-coded. A component added to src/ is compared automatically instead of
	silently going unchecked — which is the single most valuable property this
	file has.

	The `extractClasses(...).length > 0` filter drops stylesheets that declare
	only tokens or keyframes: they have no selectors to compare, and including
	them would report an empty bundle as a missing one.
*/
const componentsDir = path.join(coreSrc, 'components');
const COMPONENTS = fs
	.readdirSync(componentsDir)
	.filter((f) => f.endsWith('.css') && f !== '_index.css')
	.map((f) => f.replace(/\.css$/, ''))
	.filter(
		(name) =>
			extractClasses(fs.readFileSync(path.join(componentsDir, `${name}.css`), 'utf8'), name)
				.length > 0
	)
	.sort();

const cliEntry = path.join(
	path.dirname(require.resolve('@tailwindcss/cli/package.json')),
	'dist/index.mjs'
);

const toPosix = (p: string): string => p.split(path.sep).join('/');
const rel = (target: string): string => toPosix(path.relative(tmpDir, target));

/** Compiles one CSS string through the real Tailwind CLI. */
function compile(input: string, label: string): string {
	const inFile = path.join(tmpDir, label + '.in.css');
	const outFile = path.join(tmpDir, label + '.out.css');
	fs.writeFileSync(inFile, input);
	try {
		execFileSync(process.execPath, [cliEntry, '-i', inFile, '-o', outFile], { stdio: 'pipe' });
	} catch (error) {
		const detail = ((error as { stderr?: Buffer }).stderr?.toString() || '')
			// Strip ANSI colour codes, or the message is unreadable in CI logs.
			// eslint-disable-next-line no-control-regex
			.replace(/\x1b\[[0-9;]*m/g, '')
			.trim();
		throw new Error('tailwind failed on ' + label + ':\n' + detail, { cause: error });
	}
	return fs.readFileSync(outFile, 'utf8');
}
```

#### Part 2 — selector normalisation

Three quarters of the difficulty in this file is here. The two paths express
identical rules differently, and without normalisation the report is thousands
of cosmetic differences with the real ones buried in them.

```ts
/*
	Splits a selector list on TOP-LEVEL commas only, so `:is(a, b)` stays intact.
	Tailwind regroups selector lists when it re-emits plugin output, so comparing
	raw selector strings would report differences that are purely cosmetic.
*/
function splitSelectors(selector: string): string[] {
	const parts = [];
	let depth = 0;
	let current = '';
	for (const ch of selector) {
		if (ch === '(' || ch === '[') depth++;
		else if (ch === ')' || ch === ']') depth--;
		if (ch === ',' && depth === 0) {
			parts.push(current);
			current = '';
			continue;
		}
		current += ch;
	}
	parts.push(current);
	return parts.map(normalizeSelector).filter(Boolean);
}

/*
	Tailwind reformats whitespace inside selectors when it re-emits plugin
	output — `:has( > svg)` against `:has(> svg)`. Normalize so those do not read
	as different selectors.
*/
function normalizeSelector(selector: string): string {
	return (
		selector
			.replace(/\s+/g, ' ')
			.replace(/\s*([(),>+~])\s*/g, '$1')
			// `*:disabled` and `:disabled` select the same elements; the two paths
			// disagree only on whether the universal selector is written out.
			.replace(/(^|[\s(,>+~])\*(?=:)/g, '$1')
			.trim()
	);
}

/*
	Resolves native CSS nesting to the flat selectors it stands for.

	The two paths express the same rule differently: the CSS-first build keeps
	`&:not(.button-text)` nested under its parent, while re-emitting through
	addUtilities flattens it to `.button.disabled:not(.button-text)`. Both are
	correct and equivalent, so the comparison has to resolve one into the other
	rather than read them as different selectors.

	Walks up the parent chain collecting each level's selector list, then takes
	the cartesian product — which is what CSS nesting means.
*/
function resolvedSelectors(rule: postcss.Rule): string[] {
	const chain: string[][] = [];
	for (let node: postcss.Node | undefined = rule; node; node = node.parent as postcss.Node) {
		if (node.type === 'rule') chain.unshift(splitSelectors((node as postcss.Rule).selector));
	}
	let resolved: string[] = [''];
	for (const level of chain) {
		const next: string[] = [];
		for (const parent of resolved) {
			for (const own of level) {
				if (!parent) next.push(own);
				// `&` is replaced by the parent wherever it appears…
				else if (own.includes('&')) next.push(own.split('&').join(parent));
				// …and an implicit descendant combinator is used when it does not.
				else next.push(`${parent} ${own}`);
			}
		}
		resolved = next;
	}
	return resolved.map(normalizeSelector).filter(Boolean);
}
```

#### Part 3 — turning compiled CSS into comparable maps

```ts
/*
	selector -> sorted "prop: value" list, independent of layer nesting and of
	how selector lists happen to be grouped.

	`keep` filters to the selectors you own, which matters enormously: without
	it you compare Tailwind's entire preflight against itself and drown.
*/
function rulesBySelector(css: string, keep: (selector: string) => boolean): Map<string, string[]> {
	const root = postcss.parse(css);
	const out = new Map<string, string[]>();
	root.walkRules((rule) => {
		const decls: string[] = [];
		// `rule.each`, not `walkDecls` — nested rules' declarations belong to the
		// nested selector, not to this one.
		rule.each((node) => {
			if (node.type === 'decl') decls.push(node.prop + ': ' + node.value);
		});
		if (!decls.length) return;
		for (const selector of resolvedSelectors(rule)) {
			if (!keep(selector)) continue;
			out.set(selector, [...(out.get(selector) ?? []), ...decls]);
		}
	});
	// Dedupe and sort, so declaration order never causes a false difference.
	for (const [k, v] of out) out.set(k, [...new Set(v)].sort());
	return out;
}

/** The layer path a selector's rules sit under, e.g. "utilities > badge.l1.l2". */
function layerPaths(css: string, keep: (selector: string) => boolean): Map<string, Set<string>> {
	const root = postcss.parse(css);
	const out = new Map<string, Set<string>>();
	root.walkRules((rule) => {
		const layers: string[] = [];
		for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
			if (p.type === 'atrule' && p.name === 'layer') layers.unshift(p.params);
		}
		for (const selector of resolvedSelectors(rule)) {
			if (!keep(selector)) continue;
			const set = out.get(selector) ?? new Set();
			set.add(layers.join(' > ') || '(top level)');
			out.set(selector, set);
		}
	});
	return out;
}
```

#### Part 4 — the safelist, and the compiles

```ts
const componentClasses = COMPONENTS.flatMap((c) =>
	extractClasses(fs.readFileSync(path.join(componentsDir, c + '.css'), 'utf8'), c)
);

/*
	Shared utilities (`surface`, `focusable`, `elevation-3`) are part of the
	public surface too, and are not namespaced — hence `namespace: null`.
*/
const utilitiesDir = path.join(coreSrc, 'utilities');
const utilityClasses = fs
	.readdirSync(utilitiesDir)
	.filter((f) => f.endsWith('.css') && f !== '_index.css')
	.flatMap((f) => extractClasses(fs.readFileSync(path.join(utilitiesDir, f), 'utf8'), null));

const ownedClasses = new Set([...componentClasses, ...utilityClasses]);
const safelist = [...ownedClasses].sort();

const contextImport = "@import '" + rel(path.join(pkgRoot, 'functions/context.css')) + "';";
const pluginPath = rel(path.join(pkgRoot, 'dist/index.js'));
const sourceLines = safelist.map((c) => '@source inline("' + c + '");');
const prefixedSourceLines = safelist.map((c) => '@source inline("px-' + c + '");');

fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

// The two halves of the comparison.
const baseline = compile(
	[
		contextImport,
		...COMPONENTS.map((c) => "@import '" + rel(path.join(componentsDir, c + '.css')) + "';"),
		...sourceLines
	].join('\n'),
	'baseline'
);
const candidate = compile(
	[contextImport, "@plugin '" + pluginPath + "';", ...sourceLines].join('\n'),
	'candidate'
);

// Guide 16: prefixing.
const prefixed = compile(
	[
		contextImport,
		"@plugin '" + pluginPath + "' {",
		'\tprefix: px-;',
		'}',
		...prefixedSourceLines
	].join('\n'),
	'prefixed'
);

/* No CSS import at all — the plugin must carry its own tokens. Guide 15. */
const standalone = compile(
	["@import 'tailwindcss' source(none);", "@plugin '" + pluginPath + "';", ...sourceLines].join(
		'\n'
	),
	'standalone'
);

/*
	Match on whole class TOKENS, not substrings: shared utilities own generic
	names like `.error`, and `.button` must not claim `.button-text` by accident.
*/
const classesIn = (selector: string): string[] =>
	[...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
const owns = (selector: string): boolean => classesIn(selector).some((c) => ownedClasses.has(c));
const ownsPrefixed = (selector: string): boolean =>
	classesIn(selector).some((c) => c.startsWith('px-') && ownedClasses.has(c.slice(3)));

const base = rulesBySelector(baseline, owns);
const cand = rulesBySelector(candidate, owns);

const failures: string[] = [];
const notes: string[] = [];
```

#### Part 5 — check 1: the same set of selectors

```ts
/*
	Re-emitting through the plugin API leaves redundant wrappers behind:
	`:is(:is(x), y)` for `:is(x, y)`, and a trailing `:where(.selected)` on rules
	whose selector already carries `.selected`. Neither changes what matches —
	`:where()` contributes no specificity and `:is()` takes its most specific
	argument — so collapse them before deciding a selector is genuinely new.
*/
const collapseRedundant = (selector: string): string => {
	let out = selector;
	let previous;
	do {
		previous = out;
		out = out
			.replace(/:is\((:is\([^()]*\))\)/g, '$1')
			.replace(/:is\(([^(),]*)\)/g, '$1')
			// Re-emitting a nested rule can re-apply a qualifier the selector
			// already carries, giving `:not(:disabled):not(:disabled)`. It matches
			// the same elements as one copy.
			.replace(/(:not\(([^()]*)\))\1+/g, '$1');
	} while (out !== previous);
	return out;
};
const withoutWhere = (selector: string): string =>
	collapseRedundant(selector.replace(/:where\([^()]*\)/g, ''));

/*
	A few of your names collide with Tailwind built-ins — `collapse`, `table`,
	`select-text`. The build deliberately leaves Tailwind's own rules for those
	unclaimed, so they are absent from the plugin and present in the baseline.
	Consumers still get them, from `@import 'tailwindcss'`.

	Probed the same way build.ts does it, so the two cannot disagree.
*/
const builtinProbe = compile(
	["@import 'tailwindcss' source(none);", ...sourceLines].join('\n'),
	'builtins'
);
const builtinClasses = new Set(
	[...builtinProbe.matchAll(/^\s*\.([-\w]+)\s*(?:,|\{)/gm)]
		.map((m) => m[1])
		.filter((c) => ownedClasses.has(c))
);
const isTailwindBuiltin = (selector: string): boolean =>
	classesIn(selector).every((c) => builtinClasses.has(c));

const baseCollapsed = new Set([...base.keys()].map(withoutWhere));
const missing = [...base.keys()].filter((k) => !cand.has(k) && !isTailwindBuiltin(k));
const missingBuiltins = [...base.keys()].filter((k) => !cand.has(k) && isTailwindBuiltin(k));
const extraAll = [...cand.keys()].filter((k) => !base.has(k));
const extra = extraAll.filter((k) => !baseCollapsed.has(withoutWhere(k)));
const extraRedundant = extraAll.length - extra.length;

/*
	Re-registering a component whose rules were authored as several selector
	forms (`.nav-link`, `.nav-link:disabled`, `.nav-link:not(:disabled)`) makes
	Tailwind re-compose them, so the plugin emits narrower duplicates the
	CSS-first build never wrote — `.nav-link:not(:disabled):disabled`, which
	matches nothing at all. That is bloat, not a behaviour change, but only as
	long as such a selector carries nothing the baseline did not already say.
*/
const baselineDeclarations = new Set([...base.values()].flat());
const extraWithNewDeclarations = extra.filter((selector) =>
	(cand.get(selector) ?? []).some((decl) => !baselineDeclarations.has(decl))
);
const extraDuplicates = extra.length - extraWithNewDeclarations.length;

if (missing.length) failures.push(missing.length + ' selectors missing from plugin output');
if (extraWithNewDeclarations.length) {
	failures.push(
		extraWithNewDeclarations.length + ' selectors only in plugin output, carrying new declarations'
	);
}
```

Note what is and is not a failure. **Missing** always fails. **Extra** fails only
when it carries a declaration the baseline never had — a narrower duplicate that
says nothing new is bloat, and worth counting but not worth blocking a merge.

#### Part 6 — check 2: the same declarations per selector

```ts
/*
	Two kinds of benign difference show up here:

	  fallback folding  Tailwind collapses `var(--tw-x, …)` to the literal in its
	    own utility output, but leaves plugin-supplied declarations as authored.
	    Same computed value, since --tw-x is set in the same rule.

	  superset  selector-list regrouping means a plugin rule can legitimately
	    carry declarations the CSS-first build reached through a different group.
*/
const splitDecl = (d: string): [string, string] => {
	const at = d.indexOf(': ');
	return [d.slice(0, at), d.slice(at + 2)];
};

function foldsToSame(baseDecls: string[], candDecls: string[]): boolean {
	const declared = new Map(baseDecls.concat(candDecls).map(splitDecl));
	for (const d of baseDecls) {
		if (candDecls.includes(d)) continue;
		const [prop, literal] = splitDecl(d);
		const counterpart = candDecls.find((c) => splitDecl(c)[0] === prop);
		if (!counterpart) return false;
		const variable = /^var\((--[-\w]+)/.exec(splitDecl(counterpart)[1])?.[1];
		// Benign only if the variable is declared in the same rule, with exactly
		// the literal the other side inlined.
		if (!variable || declared.get(variable) !== literal) return false;
	}
	return true;
}

/*
	The plugin inlines each theme default as a var() fallback so standalone
	builds resolve (guide 15, step 8). `var(--x)` and `var(--x, <default>)`
	compute the same thing whenever --x is defined, and the fallback only matters
	when it is not.

	Fallbacks nest — `var(--a, var(--b, var(--c)))` — so this walks balanced
	parens rather than pattern-matching, reducing every var() to just its name.
*/
function stripFallbacks(value: string): string {
	let out = '';
	for (let i = 0; i < value.length; i++) {
		if (!value.startsWith('var(', i)) {
			out += value[i];
			continue;
		}
		let depth = 0;
		let end = i;
		for (; end < value.length; end++) {
			if (value[end] === '(') depth++;
			else if (value[end] === ')' && --depth === 0) break;
		}
		const inner = value.slice(i + 4, end);
		out += 'var(' + (/^\s*(--[-\w]+)/.exec(inner)?.[1] ?? inner.trim()) + ')';
		i = end;
	}
	return out;
}

let realMismatches = 0;
let foldedCount = 0;
let supersetCount = 0;
let fallbackCount = 0;

for (const [selector, decls] of base) {
	const other = cand.get(selector);
	if (!other || JSON.stringify(decls) === JSON.stringify(other)) continue;

	// Normalize fallbacks away FIRST, so a selector that differs by both an
	// inlined fallback and a regrouping is still recognised as benign.
	const normBase = [...new Set(decls.map(stripFallbacks))].sort();
	const normCand = [...new Set(other.map(stripFallbacks))].sort();
	const onlyBase = normBase.filter((d) => !normCand.includes(d));
	const onlyCand = normCand.filter((d) => !normBase.includes(d));

	if (!onlyBase.length && !onlyCand.length) {
		fallbackCount++;
		continue;
	}
	if (!onlyBase.length) {
		supersetCount++;
		continue;
	}
	if (foldsToSame(normBase, normCand)) {
		foldedCount++;
		continue;
	}
	realMismatches++;
	// Print the first three in full. More than that and the useful signal is the
	// count, not the list.
	if (realMismatches <= 3) {
		notes.push(
			'  ' +
				selector +
				'\n    only in CSS-first: ' +
				(onlyBase.join('; ') || '-') +
				'\n    only in plugin:    ' +
				(onlyCand.join('; ') || '-')
		);
	}
}
if (realMismatches) failures.push(realMismatches + ' selectors differ in declarations');
```

#### Part 7 — check 3: cascade position

```ts
/*
	Reported, not asserted. A selector moving between layers is usually benign —
	the plugin API nests differently from hand-authored CSS — but it changes what
	overrides what, so you want to SEE it move rather than discover it from a
	consumer's bug report.
*/
const baseLayers = layerPaths(baseline, owns);
const candLayers = layerPaths(candidate, owns);
const layerMoves: string[] = [];
for (const [selector, paths] of baseLayers) {
	const other = candLayers.get(selector);
	if (!other) continue;
	const a = [...paths].sort().join(',');
	const b = [...other].sort().join(',');
	if (a !== b) layerMoves.push('  ' + selector + '\n    CSS-first: ' + a + '\n    plugin:    ' + b);
}
```

#### Part 8 — check 4: prefix behaviour

```ts
/*
	Three halves to assert, and people usually only write the first: your classes
	ARE renamed, Tailwind's theme variables are NOT, and the consumer's state
	hooks are NOT.
*/
const prefixedSelectors = rulesBySelector(prefixed, ownsPrefixed);
const strippedPrefixed = prefixed.replace(/\.px-/g, '.X-');
const prefixChecks: [string, boolean][] = [
	[
		'renames library classes',
		prefixedSelectors.size > 0 && [...prefixedSelectors.keys()].every((s) => s.includes('.px-'))
	],
	['renames component-local vars', prefixed.includes('--px-button-color')],
	['leaves Tailwind/theme vars alone', !prefixed.includes('--px-color-')],
	[
		'leaves consumer state hooks alone',
		prefixed.includes('.disabled') && !prefixed.includes('.px-disabled')
	],
	// Replace every prefixed class with a marker; if a bare library class name
	// still appears, something escaped the prefixer.
	['no unprefixed library class survives', !/\.badge[\s.,:[{]/.test(strippedPrefixed)]
];
```

#### Part 9 — check 5: standalone resolution

Depends on [guide 15](15-tokens.md). This is the check that catches the most
embarrassing bug class: a plugin that works perfectly in your repo because the
docs site happens to define a token the plugin forgot to ship.

```ts
const declaredVars = new Set([...standalone.matchAll(/(--[-\w]+)\s*:/g)].map((m) => m[1]));
const referencedVars = new Map<string, boolean>();
for (const m of standalone.matchAll(/var\(\s*(--[-\w]+)\s*([,)])/g)) {
	const [, name, next] = m;
	if (!referencedVars.has(name)) referencedVars.set(name, false);
	// `,` means the reference carries a fallback, so it resolves either way.
	if (next === ',') referencedVars.set(name, true);
}

/*
	A HARD reference — no fallback — to a variable nothing declares is a real
	break: the declaration is simply dropped by the browser and the component
	renders wrong, with nothing in the console.

	Nothing is exempt. If this list is ever non-empty, fix it at source rather
	than adding an allowance here.
*/
const danglingHard = [...referencedVars]
	.filter(([name, hasFallback]) => !hasFallback && !declaredVars.has(name))
	.map(([name]) => name);

/*
	Theme switching: every semantic token the components read must resolve under
	each shipped theme — either the theme sets it directly (hand-written themes
	like dracula) or the mode layer derives it from tone steps the theme sets
	(generated themes). The default theme sits at :where(:root), zero
	specificity, so it always underlies whatever a [data-theme] does not set.
*/
const base_ = (await import('../generated/base.js')).default;
const themeRules = (await import('../generated/themes.js')).default;
const customVariants = (await import('../generated/variants.js')).default;
const sourceVariantNames = Object.keys(extractCustomVariants(coreSrc));
const themeExtendForTest = (await import('../generated/theme.js')).default;

/*
	Theme palettes live in generated/themes.ts keyed by theme id; the mode layer
	that maps tone steps onto semantic roles stays in generated/base.ts. Flatten
	both, so resolvability is checked against what a consumer actually receives.
*/
const allThemeSelectors: Record<string, Record<string, string>> = { ...base_ };
for (const perTheme of Object.values(themeRules)) {
	for (const [selector, decls] of Object.entries(perTheme)) {
		allThemeSelectors[selector] = { ...(allThemeSelectors[selector] ?? {}), ...decls };
	}
}

// Which semantic tokens the components actually read. Read from the generated
// objects rather than from source, so it reflects what shipped.
const componentObjects = COMPONENTS.map((c) =>
	fs.readFileSync(path.join(pkgRoot, 'generated/components', c, 'object.ts'), 'utf8')
).join('');
const semanticTokens = new Set(
	[...componentObjects.matchAll(/var\(\s*(--theme-color-[-\w]+)/g)].map((m) => m[1])
);

const modeSelector = Object.keys(allThemeSelectors).find(
	(s) => s.includes('[data-theme]') && s.includes(':root')
);
const modeLayer = modeSelector ? (allThemeSelectors[modeSelector] ?? {}) : {};
const defaultSelector = Object.keys(allThemeSelectors).find((s) => s.includes(':where(:root)'));
const defaultTokens = new Set(
	Object.keys(defaultSelector ? (allThemeSelectors[defaultSelector] ?? {}) : {})
);

const unresolvableThemes: string[] = [];
for (const [selector, decls] of Object.entries(allThemeSelectors)) {
	if (selector === modeSelector || !selector.includes('data-theme')) continue;
	// What this theme defines, plus what it inherits from the default.
	const defines = new Set([...Object.keys(decls), ...defaultTokens]);
	const unresolved = [...semanticTokens].filter((token) => {
		if (defines.has(token)) return false;
		// Not set directly — can the mode layer derive it from tone steps?
		const derived = modeLayer[token];
		if (!derived) return true;
		return ![...derived.matchAll(/var\(\s*(--[-\w]+)/g)]
			.map((m) => m[1])
			.every((tone) => defines.has(tone));
	});
	if (unresolved.length) {
		unresolvableThemes.push(selector.split(',')[0] + ' (' + unresolved.length + ')');
	}
}

const themeSelectorCount = Object.keys(allThemeSelectors).filter((s) =>
	s.includes('data-theme')
).length;

const standaloneRules = rulesBySelector(standalone, owns);
const standaloneChecks: [string, boolean][] = [
	[
		'emits the same component rules as the plugin-with-context build',
		/*
			Compared only over rules the plugin itself owns, and only unqualified
			ones. The with-context build also carries context-derived rules —
			Tailwind variant classes that appear in no generated bundle — and those
			are the CSS layer's output, not the plugin's, so a standalone build is
			right not to have them.
		*/
		[...cand.keys()]
			.filter((selector) => !/:/.test(selector))
			.every((selector) => standaloneRules.has(selector))
	],
	['no var() reference left dangling', danglingHard.length === 0],
	['carries the theme token chain', standalone.includes('--theme-color-primary-40:')],
	['carries color-scheme for light-dark()', standalone.includes('color-scheme')],
	['registers theme colors as utilities', /\.bg-primary\b|--color-primary\s*:/.test(standalone)],
	[
		'every shipped theme resolves (' + themeSelectorCount + ' selectors)',
		unresolvableThemes.length === 0
	],
	[
		'ships the shared utilities (' + utilityClasses.length + ' classes)',
		/\.surface\s*\{/.test(standalone) && /\.elevation-3\s*\{/.test(standalone)
	],
	[
		'composite utilities carry both halves (surface = bg + text)',
		(() => {
			const rule = /\.surface\s*\{([^}]*)\}/.exec(standalone)?.[1] ?? '';
			return /background-color\s*:/.test(rule) && /(^|[^-])color\s*:/.test(rule);
		})()
	],
	[
		// The ripple class is written by JavaScript (guide 4), so a prefix must
		// NOT rename it — the action would point at a class that no longer exists.
		'JS-coupled class keeps its name under a prefix',
		prefixed.includes('.project-ripple') && !prefixed.includes('.px-project-ripple')
	],
	[
		'registers non-color namespaces too',
		['fontSize', 'transitionDuration', 'transitionTimingFunction', 'screens'].every(
			(key) => key in themeExtendForTest
		)
	]
];
```

#### Part 10 — check 6: theme selection and custom themes

Depends on [guide 14](14-themes.md).

```ts
const themePluginPath = rel(path.join(pkgRoot, 'dist/theme.js'));
const themesOf = (css: string): Set<string> =>
	new Set([...css.matchAll(/\[data-theme='([^']+)'\]/g)].map((m) => m[1]));

/** Compiles and returns the plugin's error message, or null if it succeeded. */
function compileExpectingError(input: string, label: string): string | null {
	try {
		compile(input, label);
		return null;
	} catch (error) {
		return (
			/project-name: [^\n│]*/.exec(String((error as Error).message))?.[0]?.trim() ?? 'unknown error'
		);
	}
}

const selected = compile(
	["@import 'tailwindcss' source(none);", `@plugin '${pluginPath}' { themes: dracula; }`].join(
		'\n'
	),
	'themes-selected'
);
const selectedThemes = themesOf(selected);

const generated = compile(
	[
		"@import 'tailwindcss' source(none);",
		`@plugin '${pluginPath}' { themes: dracula; }`,
		`@plugin '${themePluginPath}' {`,
		'\tname: brand;',
		'\tseed-primary: #0956AA;',
		'\tvariant: monochrome;',
		'\tdefault: true;',
		// A hand-declared role, to prove it beats the generated one.
		'\t--theme-color-primary-40: #ff00ff;',
		'}',
		`@plugin '${themePluginPath}' {`,
		'\tname: nightfall;',
		'\t--theme-color-primary: #8be9fd;',
		'\tcolor-scheme: dark;',
		'}'
	].join('\n'),
	'themes-custom'
);
const brandRule = /\[data-theme='brand'\]\s*\{([^}]*)\}/.exec(generated)?.[1] ?? '';

/* Same themes, but the default is declared LAST — the order that used to break. */
const defaultDeclaredLast = compile(
	[
		"@import 'tailwindcss' source(none);",
		`@plugin '${themePluginPath}' { name: other; seed-primary: #b5179e; }`,
		`@plugin '${themePluginPath}' { name: brand; seed-primary: #0956AA; default: true; }`
	].join('\n'),
	'themes-default-last'
);

/* Status palettes should follow the seed, not sit at fixed hues. */
const statusOf = (css: string, palette: string): string | undefined =>
	new RegExp(`--theme-color-${palette}-40:\\s*(#[0-9a-f]+)`).exec(css)?.[1];

const harmonizedBlue = compile(
	[
		"@import 'tailwindcss' source(none);",
		`@plugin '${themePluginPath}' { name: t; seed-primary: #0956AA; }`
	].join('\n'),
	'themes-harmonized-blue'
);
const harmonizedGreen = compile(
	[
		"@import 'tailwindcss' source(none);",
		`@plugin '${themePluginPath}' { name: t; seed-primary: #006c4e; }`
	].join('\n'),
	'themes-harmonized-green'
);
const unharmonized = compile(
	[
		"@import 'tailwindcss' source(none);",
		`@plugin '${themePluginPath}' { name: t; seed-primary: #0956AA; harmonize: false; }`
	].join('\n'),
	'themes-unharmonized'
);

/* Shape tokens: defaults at :root, overridable globally or per theme. */
const shaped = compile(
	[
		"@import 'tailwindcss' source(none);",
		`@plugin '${pluginPath}' { --radius-box: 1.5rem; --border-width: 2px; }`,
		`@plugin '${themePluginPath}' { name: sharp; seed-primary: #0956AA; --radius-box: 0; }`
	].join('\n'),
	'shape-tokens'
);
const sharpRule = /\[data-theme='sharp'\]\s*\{([^}]*)\}/.exec(shaped)?.[1] ?? '';
const shapeDefaults = compile(
	["@import 'tailwindcss' source(none);", `@plugin '${pluginPath}';`].join('\n'),
	'shape-defaults'
);

const themeChecks: [string, boolean][] = [
	[
		'shape tokens have defaults at :root',
		[
			'--radius-selector',
			'--radius-field',
			'--radius-box',
			'--size-selector',
			'--size-field',
			'--border-width',
			'--animation-duration',
			'--animation-easing'
		].every((token) => shapeDefaults.includes(token + ':'))
	],
	[
		'shape defaults resolve standalone (fallbacks inlined)',
		/--animation-easing:\s*var\(--ease-standard,\s*[^)]+\)/.test(shapeDefaults)
	],
	[
		'shape tokens are overridable on the plugin',
		/--radius-box:\s*1\.5rem/.test(shaped) && /--border-width:\s*2px/.test(shaped)
	],
	['shape tokens are overridable per theme', /--radius-box:\s*0/.test(sharpRule)],
	/*
		`--radius-button` is settable but deliberately has NO :root default, so
		`var(--radius-button, var(--radius-field))` on `.button` resolves the
		fallback at the element. Giving it a default here would substitute the
		root's `--radius-field` once and stop a theme's override reaching buttons.
	*/
	['--radius-button is settable', shapeTokenNames.includes('--radius-button')],
	[
		'--radius-button has no :root default, so the fallback can fire',
		!/--radius-button:/.test(shapeDefaults)
	],
	[
		'.button resolves its radius through that chain',
		/border-radius:\s*var\(--radius-button,\s*var\(--radius-field\)\)/.test(baseline)
	],
	/*
		Every @custom-variant must be registered. Hand-listing these shipped 1 of 3
		in a real project — two variants were simply missing, and one was used by
		the docs layout. Derived from source now, so the count is checked.
	*/
	[
		'every @custom-variant is registered (' + Object.keys(customVariants).length + ')',
		Object.keys(customVariants).length === sourceVariantNames.length
	],
	[
		'a multi-branch variant keeps every branch',
		Array.isArray(customVariants.collapsed) && customVariants.collapsed.length === 2
	],
	[
		'status palettes harmonize toward the seed',
		statusOf(harmonizedBlue, 'success') !== statusOf(unharmonized, 'success')
	],
	[
		'harmonized status differs between seeds',
		statusOf(harmonizedBlue, 'info') !== statusOf(harmonizedGreen, 'info')
	],
	[
		'harmonize: false leaves the status hues exact',
		statusOf(unharmonized, 'success') === '#006c49'
	],
	[
		'harmonizing keeps success recognisably green',
		/^#0/.test(statusOf(harmonizedBlue, 'success') ?? '')
	],
	['`themes` keeps the requested theme', selectedThemes.has('dracula')],
	[
		'`themes` drops the rest',
		!selectedThemes.has('catppuccin-mocha') && !selectedThemes.has('gaziter')
	],
	['`default` is always kept, since others inherit from it', selectedThemes.has('default')],
	[
		'seed generates a full tone scale',
		(brandRule.match(/--theme-color-primary-\d+:/g) ?? []).length === 30
	],
	[
		'variant changes the generated palette',
		/--theme-color-secondary-40:\s*#5e5e5e/.test(brandRule)
	],
	[
		'hand-declared roles beat the generated ones',
		/--theme-color-primary-40:\s*#ff00ff/.test(brandRule)
	],
	['role-only themes need no seed', themesOf(generated).has('nightfall')],
	[
		'`default: true` applies where no theme is set',
		/:root:not\(\[data-theme\]\)\s*\{[^}]*--theme-color-primary-40:\s*#ff00ff/.test(generated)
	],
	/*
		Regression: the default used to emit at plain `:root`, specificity (0,1,0)
		— the same as `[data-theme='x']` — so whichever came last won. A default
		theme declared after another theme made that theme impossible to apply.
		Shipped themes masked it, because `[data-theme='dracula'].dark` is (0,2,0).
	*/
	[
		'a default declared last cannot outrank other themes',
		!/(^|[^)])\s:root\s*\{/m.test(defaultDeclaredLast) &&
			/:root:not\(\[data-theme\]\)/.test(defaultDeclaredLast)
	]
];

/*
	Every option must FAIL LOUDLY on bad input. Tailwind ignores an option a
	plugin does not read, so an unrejected typo is indistinguishable from a
	setting that quietly did nothing — which is the failure mode this whole
	project tries hardest to avoid.
*/
const themeErrors: [string, string | null][] = [
	[
		'unknown theme',
		compileExpectingError(
			["@import 'tailwindcss' source(none);", `@plugin '${pluginPath}' { themes: nope; }`].join(
				'\n'
			),
			'themes-err-unknown'
		)
	],
	[
		'unknown variant',
		compileExpectingError(
			[
				"@import 'tailwindcss' source(none);",
				`@plugin '${themePluginPath}' { name: x; seed-primary: #0956AA; variant: sparkly; }`
			].join('\n'),
			'themes-err-variant'
		)
	],
	[
		'a misspelled shape token',
		compileExpectingError(
			[
				"@import 'tailwindcss' source(none);",
				`@plugin '${pluginPath}' { --radius-feild: 0; }`
			].join('\n'),
			'shape-err-typo'
		)
	],
	[
		'a colour role set on the wrong plugin',
		compileExpectingError(
			[
				"@import 'tailwindcss' source(none);",
				`@plugin '${pluginPath}' { --theme-color-primary: red; }`
			].join('\n'),
			'shape-err-misplaced'
		)
	],
	[
		'theme with no name',
		compileExpectingError(
			[
				"@import 'tailwindcss' source(none);",
				`@plugin '${themePluginPath}' { seed-primary: #0956AA; }`
			].join('\n'),
			'themes-err-name'
		)
	]
];
```

#### Part 11 — functional utilities

Depends on [guide 16](16-options.md), step 9.

```ts
/*
	`@utility tooltip-gap-*` and friends never survive the compile the way named
	utilities do — there is no finite set of names to safelist — so the plugin
	re-registers them through matchUtilities. Both paths are compiled with the
	same candidates and their declarations compared directly.

	The candidate list deliberately covers all four shapes: an integer step, a
	fractional step, a bracketed literal, and a bracketed var().
*/
const functionalCandidates = [
	'tooltip-gap-2',
	'tooltip-gap-1.5',
	'tooltip-gap-[3px]',
	'tooltip-gap-[var(--x)]',
	'tooltip-tail-size-3',
	'tooltip-tail-width-4'
];
const functionalSource = functionalCandidates.map((c) => '@source inline("' + c + '");');

const functionalBaseline = compile(
	[
		contextImport,
		...COMPONENTS.map((c) => "@import '" + rel(path.join(componentsDir, c + '.css')) + "';"),
		...functionalSource
	].join('\n'),
	'functional-baseline'
);
const functionalPlugin = compile(
	[contextImport, "@plugin '" + pluginPath + "';", ...functionalSource].join('\n'),
	'functional-plugin'
);
const functionalPrefixed = compile(
	[
		contextImport,
		"@plugin '" + pluginPath + "' {",
		'\tprefix: px-;',
		'}',
		...functionalCandidates.map((c) => '@source inline("px-' + c + '");')
	].join('\n'),
	'functional-prefixed'
);

/** The declarations a candidate's own rule emits, or null when it is missing. */
function functionalRule(css: string, candidate: string): string[] | null {
	const rules = rulesBySelector(css, () => true);
	for (const [selector, declarations] of rules) {
		// Selectors arrive escaped (`.tooltip-gap-\[3px\]`); compare on the
		// unescaped text so the candidate can be written the way an author would.
		if (selector.replace(/\\/g, '') === '.' + candidate) return declarations;
	}
	return null;
}

const functionalChecks: [string, boolean][] = [
	[
		'every candidate resolves in the CSS-first build',
		functionalCandidates.every((c) => functionalRule(functionalBaseline, c) !== null)
	],
	[
		'every candidate resolves through the plugin',
		functionalCandidates.every((c) => functionalRule(functionalPlugin, c) !== null)
	],
	[
		'declarations are identical in both paths',
		functionalCandidates.every((c) => {
			const a = functionalRule(functionalBaseline, c);
			const b = functionalRule(functionalPlugin, c);
			return a !== null && b !== null && a.join(';') === b.join(';');
		})
	],
	[
		// Mapping back to calc(var(--spacing) * n) rather than the resolved rem is
		// what keeps the two paths byte-identical AND keeps working if a consumer
		// redefines --spacing.
		'a spacing step keeps the var(--spacing) link',
		(functionalRule(functionalPlugin, 'tooltip-gap-2') ?? []).some((d) =>
			d.includes('calc(var(--spacing) * 2)')
		)
	],
	[
		'an arbitrary value passes through verbatim',
		(functionalRule(functionalPlugin, 'tooltip-gap-[3px]') ?? []).some((d) => d.includes('3px'))
	],
	[
		// `type: ['any']`, not `['length']` — the latter rejects var().
		'an arbitrary var() is accepted, which [length] would reject',
		(functionalRule(functionalPlugin, 'tooltip-gap-[var(--x)]') ?? []).some((d) =>
			d.includes('var(--x)')
		)
	],
	[
		'a prefix renames both the class and the property it sets',
		(functionalRule(functionalPrefixed, 'px-tooltip-gap-2') ?? []).some((d) =>
			d.startsWith('--px-tooltip-gap:')
		)
	],
	[
		'an unprefixed candidate is dead under a prefix',
		functionalRule(functionalPrefixed, 'tooltip-gap-2') === null
	]
];
```

#### Part 12 — the report

```ts
console.log('selectors compared: ' + base.size + ' (CSS-first) vs ' + cand.size + ' (plugin)\n');

console.log('parity');
console.log('  present in both:        ' + [...base.keys()].filter((k) => cand.has(k)).length);
console.log(
	'  missing from plugin:    ' +
		missing.length +
		(missingBuiltins.length
			? '  (+' + missingBuiltins.length + ' Tailwind built-ins, deliberately unclaimed)'
			: '')
);
console.log(
	'  extra in plugin:        ' + extraWithNewDeclarations.length + ' with new declarations'
);
console.log(
	'    also ' +
		extraDuplicates +
		' narrower duplicates (no new declarations) and ' +
		extraRedundant +
		' redundant wrappers'
);
console.log('  benign (inlined var fallback): ' + fallbackCount);
console.log('  benign (var fallback folding): ' + foldedCount);
console.log('  benign (regrouped superset):   ' + supersetCount);
console.log('  real declaration conflicts:    ' + realMismatches);
if (missing.length) for (const m of missing.slice(0, 5)) console.log('    missing: ' + m);
if (extra.length) for (const e of extra.slice(0, 5)) console.log('    extra:   ' + e);
if (notes.length) console.log(notes.join('\n'));

console.log('\ncascade');
if (!layerMoves.length) console.log('  every selector kept its layer path');
else {
	console.log('  ' + layerMoves.length + ' selectors changed layer:');
	console.log(layerMoves.slice(0, 4).join('\n'));
	if (layerMoves.length > 4) console.log('  ... and ' + (layerMoves.length - 4) + ' more');
}

console.log('\nstandalone (@plugin only, no @import of the design system)');
console.log('  selectors: ' + standaloneRules.size + ' | variables declared: ' + declaredVars.size);
for (const [label, ok] of standaloneChecks) {
	console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + label);
	if (!ok) failures.push('standalone: ' + label);
}
if (danglingHard.length) {
	for (const v of danglingHard.slice(0, 10)) console.log('    dangling: ' + v);
}
if (unresolvableThemes.length) {
	for (const t of unresolvableThemes) console.log('    unresolved: ' + t);
}

console.log('\nprefix');
for (const [label, ok] of prefixChecks) {
	console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + label);
	if (!ok) failures.push('prefix: ' + label);
}

console.log('\nthemes');
for (const [label, ok] of themeChecks) {
	console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + label);
	if (!ok) failures.push('themes: ' + label);
}
for (const [label, message] of themeErrors) {
	const ok = message !== null;
	console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' rejects ' + label);
	if (!ok) failures.push('themes: ' + label + ' was not rejected');
}

console.log('\nfunctional utilities');
for (const [label, ok] of functionalChecks) {
	console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + label);
	if (!ok) failures.push('functional: ' + label);
}

// KEEP_TMP=1 leaves the compiles behind for inspection (guide 11, step 7).
if (!process.env.KEEP_TMP) fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('');
if (failures.length) {
	console.log('RESULT: ' + failures.length + ' problem(s)');
	for (const f of failures) console.log('  - ' + f);
	// Sets the exit code rather than throwing, so the whole report prints first.
	process.exitCode = 1;
} else {
	console.log('RESULT: plugin output matches the CSS-first build');
}
```

---

## Traps

> **A test suite that passes against stale build output.** The e2e harness
> compiles `dist/index.js`. If `dist` is missing or stale, the test either fails
> confusingly or — worse — passes against yesterday's plugin. Make `check` build
> first, in that order.

> **Testing the plugin only under Bun.** Bun is forgiving about malformed ESM in
> dependencies. Add one check that imports your public entry points under plain
> `node`; it is the runtime a consumer's SSR will use.

> **Asserting on formatted CSS.** Tailwind's output formatting is not a stable
> contract. Compare parsed selectors and declarations, never raw strings.

> **`toHaveProperty` with a dotted key.** Jest-style matchers read `.` as a path
> separator, so `toHaveProperty('@layer badge.l1.l2')` looks for nested objects
> and fails confusingly. Use `Object.keys(x)` and `toContain`.

> **A hand-maintained safelist.** The harness only covers classes it names. A
> component added without a safelist entry is untested and the parity count still
> reads green — it just counts one fewer selector than it should.
>
> **Fix:** derive the safelist from the registry, and print the count.

---

## Commit

Verify, then commit:

```powershell
bun run --filter '@scope/project-name' check
git add -A
git commit -m "test(core): add the differential harness and unit tests"
```

Before committing, **prove the harness can fail** (step 3): change a value in
`generated/components/badge/object.ts`, confirm the run fails and names the
selector, then rebuild to restore it. A harness committed without that check
may be vacuous, and it will not become less vacuous later.

Label the PR `skip-changeset`.
---

Next: [Release and operations](13-release.md)
