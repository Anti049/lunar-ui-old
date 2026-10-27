# 14. The token layer

[Guide 2](02-plugin.md) compiles component CSS into a plugin. That plugin is
useless on its own unless it also carries the **tokens** the components
reference — and carrying them correctly is subtler than copying a block of
custom properties into `addBase`.

This guide builds the layer that makes `@plugin '@anti049/test'` work with
no CSS import at all, and that turns your design tokens into real Tailwind
utilities (`text-body-medium`, `duration-medium-2`, `bg-primary`) rather than
bare custom properties.

Eleven steps.

---

## 1. Understand what "standalone" costs

A consumer writes this and nothing else — **their** stylesheet, not yours:

```css
@import 'tailwindcss';
@plugin '@anti049/test';
```

For that to render, every `var()` in every compiled component must resolve. Your
components reference `--color-primary`, which resolves to
`--theme-color-primary`, which resolves to `--theme-color-primary-40`, which is
finally a hex literal. **Token collection is a transitive closure, not a
filter.**

Two things follow, and both shape the rest of this guide:

- **Read tokens from source, not from a compile.** Tailwind emits `@theme`
  values on demand, so compiling the context in isolation reveals only whichever
  tokens something happened to use. The file is the truth.
- **You cannot just re-emit everything.** A `@theme` entry that Tailwind already
  knows about must go through the theme config, not `addBase`, or you shadow the
  consumer's own overrides. Step 7 is about that distinction.

---

## 2. Lay out the token sources

```text
packages/core/src/base/
├─ _index.css          imports the rest, in order
├─ color-scheme.css    color-scheme: light dark, and .light / .dark
├─ design-tokens.css   @theme — fonts, breakpoints, animations, easings
├─ palette.css         @theme inline — --color-* → --theme-color-*
├─ modes.css           semantic roles as light-dark() pairs
├─ semantics.css       shape tokens: --radius-field, --size-selector, …
├─ typography.css      @theme — --text-body-medium and its modifiers
├─ motion.css          @theme — --duration-*, --ease-*
├─ keyframes.css       @keyframes the animations reference
└─ plugins.css         @custom-variant declarations
```

The split is not cosmetic. Step 9 identifies themes **by source path**, and
[guide 15](15-themes.md) parses `modes.css` specifically, so one giant
`tokens.css` would cost you both.

**`src/base/` declares tokens and no classes.** A utility authored in `base/`
becomes invisible context — the build subtracts the context from the compile, so
that utility silently never ships. Utilities go in `src/utilities/`.

---

## 3. Know the difference between `@theme` and `@theme inline`

```css
/* design-tokens.css — a literal value. */
@theme {
	--breakpoint-medium: 960px;
	--font-sans: 'Plus Jakarta Sans Variable', ui-sans-serif, system-ui;
}
```

```css
/* palette.css — a reference. */
@theme inline {
	--color-primary-40: var(--theme-color-primary-40);
	--color-primary: var(--theme-color-primary);
}
```

`inline` means Tailwind substitutes the value **where the utility is used**
rather than re-declaring the custom property. That is what you want for colours:
`bg-primary` must read whatever `--theme-color-primary` resolves to _at that
element_, which is how a `[data-theme]` subtree re-colours everything inside it.
Without `inline`, the utility would bake in the value from wherever the theme
variable happened to be declared, and theming would stop working inside
subtrees.

Use plain `@theme` for anything that is genuinely a constant, and `@theme
inline` for anything that points at a themable variable.

---

## 4. Collect every declaration, tagged with its origin

**`packages/core/functions/collect-tokens.ts`** — new file.

```ts
export type DeclarationScope = 'theme' | 'rule' | 'color-scheme';

export interface CollectedDeclaration {
	scope: DeclarationScope;
	/** Source path relative to src/, so themes can be split out by file. */
	file: string;
	selector: string;
	prop: string;
	value: string;
}

export function collectDeclarations(coreSrc: string): CollectedDeclaration[] {
	const componentsDir = path.join(coreSrc, 'components');
	const declarations: CollectedDeclaration[] = [];

	const visit = (dir: string): void => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort(/* by name */)) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				// Components are compiled, not collected.
				if (full !== componentsDir) visit(full);
				continue;
			}
			if (!entry.name.endsWith('.css')) continue;
			const root = postcss.parse(fs.readFileSync(full, 'utf8'));

			root.walkAtRules('theme', (atRule) => {
				atRule.walkDecls((decl) => {
					if (!decl.prop.startsWith('--')) return;
					// Name the fields; spreading a postcss node would carry its internals.
					declarations.push({
						scope: 'theme',
						file: rel(full),
						selector: '@theme',
						prop: decl.prop,
						value: decl.value
					});
				});
			});

			root.walkRules((rule) => {
				// @theme blocks are handled above; skip their inner decls.
				for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
					if (p.type === 'atrule' && p.name === 'theme') return;
				}
				rule.each((node) => {
					if (node.type !== 'decl') return;
					if (node.prop.startsWith('--')) {
						declarations.push({
							scope: 'rule',
							file: rel(full),
							selector: rule.selector,
							prop: node.prop,
							value: node.value
						});
					} else if (node.prop === 'color-scheme') {
						// Not a custom property, but light-dark() is inert without it.
						declarations.push({ scope: 'color-scheme' /* … */ });
					}
				});
			});
		}
	};

	visit(coreSrc);
	return declarations;
}
```

Three details that are easy to get wrong:

- **Sort directory entries.** `readdirSync` order is filesystem-dependent, and
  generated output that reorders between machines produces meaningless diffs and
  breaks any hash-based caching.
- **Skip `components/`.** Those are compiled by the main pipeline; collecting
  them too would double-emit.
- **Carry `color-scheme` even though it is not a custom property.** Miss it and
  every `light-dark()` in the mode layer silently returns the light value
  forever.

---

## 5. Compute the transitive closure

**`packages/core/functions/collect-tokens.ts`** — append below
`collectDeclarations()`.

```ts
const VAR_REFERENCE = /var\(\s*(--[-\w]+)/g;

export function resolveClosure(
	seeds: Iterable<string>,
	declarations: CollectedDeclaration[]
): Set<string> {
	const byName = new Map<string, CollectedDeclaration[]>();
	for (const decl of declarations) {
		if (decl.scope === 'color-scheme') continue;
		// An array per property: the same token is declared once per theme, and
		// every one of those declarations contributes references.
		if (!byName.has(decl.prop)) byName.set(decl.prop, []);
		byName.get(decl.prop)!.push(decl);
	}

	const needed = new Set<string>();
	const queue = [...seeds].map((n) => (n.startsWith('--') ? n : '--' + n));

	while (queue.length) {
		const name = queue.pop()!;
		if (needed.has(name)) continue;
		needed.add(name);
		for (const decl of byName.get(name) ?? []) {
			for (const match of decl.value.matchAll(VAR_REFERENCE)) queue.push(match[1]);
		}
	}
	return needed;
}
```

The seeds are every variable referenced by the compiled component CSS, plus
every variable your shape tokens reference. Note the `byName` map holds an
**array** per property, not one entry: the same token is declared once per
theme, and all of those declarations contribute references.

Print the closure size in the build log. A number that jumps from 400 to 1,900
after an unrelated change is the fastest signal that something started pulling
in the whole palette.

---

## 6. Map `@theme` namespaces onto the JS theme

**`packages/core/functions/collect-tokens.ts`** — append.

This is what makes your tokens into utilities. Tailwind's CSS namespaces have JS
theme-key equivalents:

```ts
const THEME_NAMESPACES: Record<string, string> = {
	'--color-': 'colors',
	'--text-': 'fontSize',
	'--font-weight-': 'fontWeight',
	'--font-': 'fontFamily',
	'--tracking-': 'letterSpacing',
	'--leading-': 'lineHeight',
	'--breakpoint-': 'screens',
	'--container-': 'containers',
	'--spacing-': 'spacing',
	'--radius-': 'borderRadius',
	'--shadow-': 'boxShadow',
	'--inset-shadow-': 'insetBoxShadow',
	'--drop-shadow-': 'dropShadow',
	'--blur-': 'blur',
	'--perspective-': 'perspective',
	'--aspect-': 'aspectRatio',
	'--ease-': 'transitionTimingFunction',
	'--duration-': 'transitionDuration',
	'--opacity-': 'opacity',
	'--animate-': 'animation',
	'--animation-': 'animation'
};

// Longest prefix wins, so --font-weight-* is not swallowed by --font-*.
const PREFIXES = Object.keys(THEME_NAMESPACES).sort((a, b) => b.length - a.length);
```

**The sort is load-bearing.** Iterate the object in declaration order and
`--font-weight-bold` matches `--font-` first, landing in `fontFamily` as an
entry called `weight-bold`. You get a `font-weight-bold` utility that sets
`font-family: 700`. Nothing errors.

Registering these is the difference between a consumer writing
`text-[length:var(--text-body-medium)]` and writing `text-body-medium`.

---

## 7. Handle v4 modifiers as tuples

**`packages/core/functions/collect-tokens.ts`** — extends the function from
step 6; the CSS below is what it has to cope with.

Tailwind v4 lets a theme entry carry modifiers:

```css
@theme {
	--text-body-medium: 0.875rem;
	--text-body-medium--line-height: 1.25rem;
	--text-body-medium--letter-spacing: 0.016em;
}
```

In the JS theme those become the second element of a `fontSize` tuple.
**`collect-tokens.ts`**, inside `buildThemeExtend()`:

```ts
const MODIFIERS: Record<string, string> = {
	'--line-height': 'lineHeight',
	'--letter-spacing': 'letterSpacing',
	'--font-weight': 'fontWeight'
};

// Collect modifiers separately, then fold them onto their base entry.
for (const { base, modifier, value } of modifiers) {
	const prefix = namespaceOf(base);
	if (!prefix) continue;
	const key = THEME_NAMESPACES[prefix];
	const name = base.slice(prefix.length);
	const current = extend[key]?.[name];
	if (current === undefined) continue;
	const [size, options] = Array.isArray(current) ? current : [current, {}];
	extend[key][name] = [size, { ...options, [MODIFIERS[modifier]]: value }];
}
```

Two passes, not one — a modifier can appear before its base in file order, and
folding immediately would drop it.

Return the set of props you **claimed**, so the caller knows what still has to be
emitted as a plain custom property — the signature of that same function:

```ts
export function buildThemeExtend(declarations: CollectedDeclaration[]): {
	extend: ThemeExtend;
	claimed: Set<string>;
};
```

---

## 8. Inline fallbacks instead of re-emitting tokens

**`packages/core/functions/collect-tokens.ts`** — append, last function in the
file.

Here is the problem. Theme entries only materialise as CSS when a _utility_ uses
them. Your compiled component CSS references them straight from `var()`, which
Tailwind does not track — so in a standalone build those references dangle.

The obvious fix is to re-emit the tokens through `addBase`. **Do not.** `addBase`
lands in `@layer base`, which would then shadow any override the consumer makes
in their own `@theme`, and you have taken away their ability to customise.

Inline the default as a `var()` fallback instead:

```ts
export function inlineThemeFallbacks<T>(node: T, themeValues: ReadonlyMap<string, string>): T {
	const rewriteValue = (value: string): string =>
		value.replace(/var\(\s*(--[-\w]+)\s*\)/g, (match, name: string) => {
			const fallback = themeValues.get(name);
			return fallback === undefined ? match : `var(${name}, ${fallback})`;
		});
	/* walk the object tree, rewriting every string */
}
```

`var(--radius-field, 0.5rem)` — an override still wins when present, and the
component still renders when it is not. Apply it to the base rules too: those
can themselves reach into namespaced tokens, e.g.
`--default-transition-duration: var(--duration-short-4)`.

This is one of the main sources of benign diff in the parity harness
([guide 12](12-testing.md), step 2) — the CSS-first build emits `var(--x)` and
the plugin emits `var(--x, 1rem)`. Categorise it as "inlined var fallback" and
count it separately rather than failing on it.

---

## 9. Split theme palettes out of the base layer

**`packages/core/functions/build.ts`** — append, where the collected
declarations are routed.

Consumers should be able to ship three themes instead of nine. That means the
base layer and the theme palettes cannot be one blob.

```ts
/*
	A theme is identified by its source directory when it has flavours
	(catppuccin/mocha.css and its three siblings are all `catppuccin`),
	otherwise by file name.
*/
const themeIdOf = (file: string): string | null => {
	if (!file.startsWith('themes/')) return null;
	const rest = file.slice('themes/'.length);
	const slash = rest.indexOf('/');
	return slash === -1 ? rest.replace(/\.css$/, '') : rest.slice(0, slash);
};
```

Route each collected declaration by that id — `null` goes to `baseRules`,
anything else to `themeRules[id]`. Emit them as separate generated modules so
the plugin's `themes` option can pick.

This is the step that makes the `file` field in `CollectedDeclaration` worth
carrying, and it is why step 2 insists the token sources are several files.

---

## 10. Decide which shape tokens a consumer may set

**`packages/core/functions/build.ts`** — append, near the top with the other
constants.

Shape tokens are the knobs: corner radius, control sizes, border width,
animation timing.

```ts
const SHAPE_TOKENS: Record<string, string> = {
	'--radius-selector': '0.5rem',
	'--radius-field': '0.5rem',
	'--radius-box': '1rem',
	'--size-selector': '1.5rem',
	'--size-field': '2.5rem',
	'--border-width': '1px',
	'--animation-duration': '200ms',
	'--animation-easing': 'cubic-bezier(0, 0, 0.2, 1)'
};

/*
	Tokens that are deliberately NOT declared: they exist only as a fallback
	written at the point of use.
*/
const DERIVED_SHAPE_TOKENS: Record<string, string> = {
	'--radius-button': '--radius-field' // token -> what it falls back to
};

/** Every shape token a consumer may set, declared or not. */
const SETTABLE_SHAPE_TOKENS = [...Object.keys(SHAPE_TOKENS), ...Object.keys(DERIVED_SHAPE_TOKENS)];
```

The derived/settable split is the important part. A component that wants "the
button radius, or the field radius if nobody set one" must write the fallback at
the point of use:

```css
.button {
	border-radius: var(--radius-button, var(--radius-field));
}
```

(That CSS is **`packages/core/src/components/button.css`**, not a build file.)

**Not** `--radius-button: var(--radius-field)` at `:root`. A `var()` resolves
where the property is _declared_, so a root-level derived token captures the
root's value once, and a `[data-theme]` or component-level override of
`--radius-field` never reaches it. The chain looks right and silently is not.

Emit `SETTABLE_SHAPE_TOKENS` as generated data so the plugin can validate
against it ([guide 16](16-options.md), step 7).

---

## 11. Emit, then verify standalone

**`packages/core/functions/build.ts`** — append, at the very end. These are
the files `index.ts` imports.

```ts
writeGenerated('theme.ts', themeExtend, 'ThemeExtend');
writeGenerated('base.ts', inlineThemeFallbacks(baseRules, themeValues));
writeGenerated('themes.ts', inlineThemeFallbacks(themeRules, themeValues), 'ThemeRules');
writeGenerated('shape.ts', SETTABLE_SHAPE_TOKENS, 'string[]');
writeGenerated('properties.ts', properties, 'StyleObject');
```

`properties.ts` holds the `@property` registrations backing Tailwind's `--tw-*`
machinery — those must be unconditional, so they go through `addBase`, not the
theme config.

The verification that matters is **compiling with no CSS import at all**:

**`packages/core/.tmp/solo.css`** — a scratch file. Note there is no CSS
import at all — that is the whole point of the check:

```css
@import 'tailwindcss' source(none);
@plugin './dist/index.js';
@source inline('button');
```

```powershell
Set-Location packages/core

$cli = node -e "const p=require('path');console.log(p.join(p.dirname(require.resolve('@tailwindcss/cli/package.json')),'dist/index.mjs'))"
node $cli -i .tmp/solo.css -o .tmp/solo.out.css

# Every name this prints is a reference with no fallback and no declaration --
# a token a consumer would hit as an unresolved var(). The list should be empty.
(Select-String -Path .tmp/solo.out.css -Pattern 'var\(--[-a-z0-9]+\)' -AllMatches).Matches.Value |
	Sort-Object -Unique
```

Every name that comes back is a token **with no fallback and no declaration** —
an unresolved reference a consumer would hit. The list should be empty, or
contain only Tailwind's own variables. Make this an assertion in the harness;
it is the single highest-value test in the suite, because a standalone build is
exactly what your repo never exercises.

---

## Files after this phase

One new build module, and additions to files earlier guides created. The
`src/base/` stylesheets are yours to author — the shapes below are what the
build expects to find.

| File                                        | Status   | Written in | Ships? |
| ------------------------------------------- | -------- | ---------- | ------ |
| `packages/core/functions/collect-tokens.ts` | added    | steps 4–8  | no     |
| `packages/core/functions/build.ts`          | modified | steps 9–11 | no     |
| `packages/core/src/base/design-tokens.css`  | added    | step 2     | source |
| `packages/core/src/base/palette.css`        | added    | step 3     | source |
| `packages/core/src/base/semantics.css`      | added    | step 10    | source |
| `packages/core/src/base/_index.css`         | modified | step 2     | source |

New generated files, not committed: `generated/theme.ts`, `generated/base.ts`,
`generated/themes.ts`, `generated/shape.ts`.

`src/base/modes.css`, `color-scheme.css` and the theme palettes are
[guide 15](15-themes.md)'s; they are listed there.

---

### `packages/core/functions/collect-tokens.ts`

The whole module, assembled from steps 4 through 8.

```ts
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import type { ThemeExtend } from '../types.js';

/*
	Gathers the design tokens a standalone plugin has to carry.

	Read from SOURCE rather than from a compile: `@theme` values are emitted on
	demand, so compiling the context in isolation would only reveal whichever
	tokens something happened to use — a subset that changes whenever a
	component changes.

	Tokens chain. A component references `--color-primary`, which resolves to
	`--theme-color-primary`, which resolves to `--theme-color-primary-40`, which
	is finally a hex literal. So collection is a transitive closure, not a
	filter.
*/

const VAR_REFERENCE = /var\(\s*(--[-\w]+)/g;

export type DeclarationScope = 'theme' | 'rule' | 'color-scheme';

export interface CollectedDeclaration {
	scope: DeclarationScope;
	/** Source path relative to src/, so themes can be split out by file. */
	file: string;
	selector: string;
	prop: string;
	value: string;
}

/** Every custom-property declaration in the context, tagged with its selector. */
export function collectDeclarations(coreSrc: string): CollectedDeclaration[] {
	const componentsDir = path.join(coreSrc, 'components');
	const declarations: CollectedDeclaration[] = [];

	const rel = (full: string): string => path.relative(coreSrc, full).split(path.sep).join('/');

	const visit = (dir: string): void => {
		/*
			Sorted. readdirSync order is filesystem-dependent, and generated output
			that reorders between machines produces meaningless diffs and breaks
			any hash-based caching.
		*/
		for (const entry of fs
			.readdirSync(dir, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name))) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				// Components are compiled by the main pipeline, not collected here.
				// Collecting them too would double-emit.
				if (full !== componentsDir) visit(full);
				continue;
			}
			if (!entry.name.endsWith('.css')) continue;
			const root = postcss.parse(fs.readFileSync(full, 'utf8'));

			root.walkAtRules('theme', (atRule) => {
				atRule.walkDecls((decl) => {
					if (!decl.prop.startsWith('--')) return;
					// Name the fields; spreading a postcss node carries its internals.
					declarations.push({
						scope: 'theme',
						file: rel(full),
						selector: '@theme',
						prop: decl.prop,
						value: decl.value
					});
				});
			});

			root.walkRules((rule) => {
				// @theme blocks are handled above; skip their inner declarations.
				for (
					let p: postcss.Container | undefined = rule.parent as postcss.Container | undefined;
					p && p.type !== 'root';
					p = p.parent as postcss.Container | undefined
				) {
					if (p.type === 'atrule' && (p as postcss.AtRule).name === 'theme') return;
				}
				rule.each((node) => {
					if (node.type !== 'decl') return;
					if (node.prop.startsWith('--')) {
						declarations.push({
							scope: 'rule',
							file: rel(full),
							selector: rule.selector,
							prop: node.prop,
							value: node.value
						});
					} else if (node.prop === 'color-scheme') {
						/*
							Not a custom property, but light-dark() is INERT without
							it. Miss this and every role in the mode layer silently
							resolves to its light value, in both modes.
						*/
						declarations.push({
							scope: 'color-scheme',
							file: rel(full),
							selector: rule.selector,
							prop: node.prop,
							value: node.value
						});
					}
				});
			});
		}
	};

	visit(coreSrc);
	return declarations;
}

/*
	Tailwind's CSS theme namespaces mapped onto the JS theme keys a plugin
	config accepts. Registering these is what gives consumers real utilities
	(`text-body-medium`, `duration-medium-2`) rather than bare custom properties.
*/
const THEME_NAMESPACES: Record<string, string> = {
	'--color-': 'colors',
	'--text-': 'fontSize',
	'--font-weight-': 'fontWeight',
	'--font-': 'fontFamily',
	'--tracking-': 'letterSpacing',
	'--leading-': 'lineHeight',
	'--breakpoint-': 'screens',
	'--container-': 'containers',
	'--spacing-': 'spacing',
	'--radius-': 'borderRadius',
	'--shadow-': 'boxShadow',
	'--inset-shadow-': 'insetBoxShadow',
	'--drop-shadow-': 'dropShadow',
	'--blur-': 'blur',
	'--perspective-': 'perspective',
	'--aspect-': 'aspectRatio',
	'--ease-': 'transitionTimingFunction',
	'--duration-': 'transitionDuration',
	'--opacity-': 'opacity',
	'--animate-': 'animation',
	'--animation-': 'animation'
};

/*
	LONGEST PREFIX WINS, and the sort is load-bearing. Iterate the object in
	declaration order instead and `--font-weight-bold` matches `--font-` first,
	landing in fontFamily as an entry called `weight-bold` — so you ship a
	`font-weight-bold` utility that sets `font-family: 700`. Nothing errors.
*/
const PREFIXES = Object.keys(THEME_NAMESPACES).sort((a, b) => b.length - a.length);

/*
	`--text-x--line-height` and friends are v4 modifiers on a namespace entry.
	In the JS theme they become the second element of a fontSize tuple.
*/
const MODIFIERS: Record<string, string> = {
	'--line-height': 'lineHeight',
	'--letter-spacing': 'letterSpacing',
	'--font-weight': 'fontWeight'
};

const namespaceOf = (prop: string): string | null =>
	PREFIXES.find((p) => prop.startsWith(p)) ?? null;

/**
 * Turns `@theme` declarations into a plugin `theme.extend` object.
 *
 * Returns the extend object plus the props it claimed, so the caller knows what
 * still has to be emitted as a plain custom property.
 */
export function buildThemeExtend(declarations: CollectedDeclaration[]): {
	extend: ThemeExtend;
	claimed: Set<string>;
} {
	const extend: ThemeExtend = {};
	const claimed = new Set<string>();
	const modifiers: { base: string; modifier: string; value: string }[] = [];

	for (const decl of declarations) {
		if (decl.scope !== 'theme') continue;

		/*
			Two passes, not one: a modifier can appear BEFORE its base in file
			order, and folding immediately would drop it.
		*/
		const modifier = Object.keys(MODIFIERS).find((m) => decl.prop.endsWith(m));
		if (modifier) {
			modifiers.push({
				base: decl.prop.slice(0, -modifier.length),
				modifier,
				value: decl.value
			});
			claimed.add(decl.prop);
			continue;
		}

		const prefix = namespaceOf(decl.prop);
		if (!prefix) continue;
		const key = THEME_NAMESPACES[prefix];
		const name = decl.prop.slice(prefix.length);
		if (!name) continue;
		(extend[key] ??= {})[name] = decl.value;
		claimed.add(decl.prop);
	}

	// Fold modifiers back onto their base entry as a tuple.
	for (const { base, modifier, value } of modifiers) {
		const prefix = namespaceOf(base);
		if (!prefix) continue;
		const key = THEME_NAMESPACES[prefix];
		const name = base.slice(prefix.length);
		const current = extend[key]?.[name];
		if (current === undefined) continue;
		const [size, options] = Array.isArray(current) ? current : [current, {}];
		extend[key][name] = [size, { ...options, [MODIFIERS[modifier]]: value }];
	}

	return { extend, claimed };
}

/*
	Theme entries only materialise as CSS when a UTILITY uses them. Compiled
	component CSS references them straight from var(), which Tailwind does not
	track, so those references would dangle in a standalone build.

	Rather than re-emitting the tokens through addBase — which lands in
	@layer base and would then SHADOW any override a consumer makes in their own
	@theme, taking away their ability to customise — inline the default as a
	var() fallback. An override still wins when present, and the components
	still render when it is not.
*/
export function inlineThemeFallbacks<T>(node: T, themeValues: ReadonlyMap<string, string>): T {
	const rewriteValue = (value: string): string =>
		value.replace(/var\(\s*(--[-\w]+)\s*\)/g, (match, name: string) => {
			const fallback = themeValues.get(name);
			return fallback === undefined ? match : `var(${name}, ${fallback})`;
		});

	const walk = (current: unknown): unknown => {
		if (Array.isArray(current)) return current.map(walk);
		if (current === null || typeof current !== 'object') {
			return typeof current === 'string' ? rewriteValue(current) : current;
		}
		return Object.fromEntries(
			Object.entries(current as Record<string, unknown>).map(([k, v]) => [k, walk(v)])
		);
	};

	return walk(node) as T;
}

/** Transitive closure of the variables `seeds` depends on. */
export function resolveClosure(
	seeds: Iterable<string>,
	declarations: CollectedDeclaration[]
): Set<string> {
	const byName = new Map<string, CollectedDeclaration[]>();
	for (const decl of declarations) {
		if (decl.scope === 'color-scheme') continue;
		/*
			An ARRAY per property, not one entry: the same token is declared once
			per theme, and every one of those declarations contributes references.
		*/
		if (!byName.has(decl.prop)) byName.set(decl.prop, []);
		byName.get(decl.prop)!.push(decl);
	}

	const needed = new Set<string>();
	const queue = [...seeds].map((name) => (name.startsWith('--') ? name : '--' + name));

	while (queue.length) {
		const name = queue.pop()!;
		if (needed.has(name)) continue;
		needed.add(name);
		for (const decl of byName.get(name) ?? []) {
			for (const match of decl.value.matchAll(VAR_REFERENCE)) queue.push(match[1]);
		}
	}
	return needed;
}
```

---

### `packages/core/types.ts`

The whole file as it stands at the end of this phase.

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

/**
 * A `theme.extend` entry. A plain value, or a `[value, modifiers]` tuple for
 * namespaces that take them — `--text-x--line-height` becomes the second half
 * of a fontSize tuple.
 *
 * Added by THIS guide: collect-tokens.ts is the first thing to import it.
 */
export type ThemeEntry = string | [string, Record<string, string>];
export type ThemeExtend = Record<string, Record<string, ThemeEntry>>;

/**
 * Shipped theme palettes, keyed by theme id then by selector.
 *
 * Also added by THIS guide. build.ts emits `generated/themes.ts` with this
 * type, so it has to exist now — even though the file that consumes it,
 * extract-swatches.ts, does not arrive until [guide 15](15-themes.md).
 */
export type ThemeRules = Record<string, Record<string, Record<string, string>>>;

/** Options a consumer may pass in the `@plugin` body. */
export interface PluginOptions {
	/** Renames the design system's own classes and locals, e.g. `px-`. */
	prefix?: string;
	/** Bundles to register; omit for all. */
	include?: string | string[];
	/** Bundles to skip. Ignored when `include` is given. */
	exclude?: string | string[];
}
```

[Guide 15](15-themes.md) adds the `SwatchRole` re-export; [guide 16](16-options.md)
adds `Registry`, `FunctionalUtility`, and `themes` plus the shape-token index
signature on `PluginOptions`.

---

### `packages/core/functions/build.ts`

The whole file as it stands at the end of this phase — guide 2's pipeline plus
this guide's token collection.

```ts
/*
	The compiler.

	Reads src/**\/*.css, compiles it through the real Tailwind CLI, works out
	which rules each component contributed, converts those to JavaScript objects
	and writes them to generated/. Nothing here ships — tsconfig.build.json
	deliberately excludes functions/, except for the runtime modules the entry
	points import.
*/
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { extractClasses } from './extract-classes.js';
import { partition } from './partition.js';
import {
	collectDeclarations,
	buildThemeExtend,
	inlineThemeFallbacks,
	resolveClosure
} from './collect-tokens.js';
import type { Bundle } from '../types.js';

const require = createRequire(import.meta.url);
const pkgRoot = path.resolve(import.meta.dirname, '..');
const coreSrc = path.join(pkgRoot, 'src');
const componentsDir = path.join(coreSrc, 'components');
const generatedDir = path.join(pkgRoot, 'generated');
const tmpDir = path.join(pkgRoot, '.tmp');

/*
	Resolve the Tailwind CLI out of THIS package's node_modules rather than
	assuming a global install. A global copy on a different minor version
	produces output that disagrees with the test harness, subtly enough to cost
	hours.
*/
const cliEntry = path.join(
	path.dirname(require.resolve('@tailwindcss/cli/package.json')),
	'dist/index.mjs'
);

/** Forward slashes, so generated @import paths are identical on every OS. */
const toPosix = (p: string): string => p.split(path.sep).join('/');
const relFromTmp = (target: string): string => toPosix(path.relative(tmpDir, target));

/** Every `--name` a string references. */
const referencedVariables = (text: string): string[] =>
	[...text.matchAll(/var\(\s*(--[-\w]+)/g)].map((m) => m[1]);

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
	Names like `collapse`, `table` and `select-text` are Tailwind's. Claiming one
	pulls Tailwind's rule into your bundle, where it will fight the consumer's
	own utilities.

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
// 6. Collect the design tokens. (This guide.)
// ---------------------------------------------------------------------------

/*
	Shape tokens: the knobs a consumer may turn.
*/
const SHAPE_TOKENS: Record<string, string> = {
	'--radius-selector': '0.5rem',
	'--radius-field': '0.5rem',
	'--radius-box': '1rem',
	'--size-selector': '1.5rem',
	'--size-field': '2.5rem',
	'--border-width': '1px',
	'--animation-duration': '200ms',
	'--animation-easing': 'var(--ease-standard)'
};

/*
	Settable but deliberately NOT declared. `--radius-button` exists only as a
	fallback written at the point of use:

	    border-radius: var(--radius-button, var(--radius-field));

	Give it a `:root` default instead and a var() resolves WHERE IT IS DECLARED,
	so the root's --radius-field is substituted once and a [data-theme] override
	never reaches buttons. The chain looks right and silently is not.
*/
const DERIVED_SHAPE_TOKENS: Record<string, string> = {
	'--radius-button': '--radius-field' // token -> what it falls back to
};

/** Every shape token a consumer may set, declared or not. */
const SETTABLE_SHAPE_TOKENS = [...Object.keys(SHAPE_TOKENS), ...Object.keys(DERIVED_SHAPE_TOKENS)];

const declarations = collectDeclarations(coreSrc);
const { extend: themeExtend, claimed } = buildThemeExtend(declarations);

// The seeds: every variable the compiled CSS references, plus every variable
// the shape tokens reference.
const seeds = new Set(referencedVariables(compiled));
for (const v of referencedVariables(Object.values(SHAPE_TOKENS).join(' '))) seeds.add(v);
const needed = resolveClosure(seeds, declarations);

/*
	A theme is identified by its source DIRECTORY when it has flavours
	(catppuccin/mocha.css and its three siblings are all `catppuccin`), otherwise
	by file name. This is why `file` is carried on every collected declaration.
*/
const themeIdOf = (file: string): string | null => {
	if (!file.startsWith('themes/')) return null;
	const rest = file.slice('themes/'.length);
	const slash = rest.indexOf('/');
	return slash === -1 ? rest.replace(/\.css$/, '') : rest.slice(0, slash);
};

const baseRules: Record<string, Record<string, string>> = {};
const themeRules: Record<string, Record<string, Record<string, string>>> = {};

const addTo = (
	target: Record<string, Record<string, string>>,
	selector: string,
	prop: string,
	value: string
): void => {
	target[selector] ??= {};
	target[selector][prop] = value;
};

const addDecl = (file: string, selector: string, prop: string, value: string): void => {
	const themeId = themeIdOf(file);
	if (themeId === null) {
		addTo(baseRules, selector, prop, value);
		return;
	}
	themeRules[themeId] ??= {};
	addTo(themeRules[themeId], selector, prop, value);
};

for (const decl of declarations) {
	if (decl.scope === 'color-scheme') {
		addDecl(decl.file, decl.selector, decl.prop, decl.value);
		continue;
	}
	if (decl.scope === 'theme') {
		// Claimed by a theme namespace, so Tailwind emits it when used. Anything
		// unclaimed still needs carrying, but only if the bundles depend on it.
		if (claimed.has(decl.prop) || !needed.has(decl.prop)) continue;
		addDecl(decl.file, ':root', decl.prop, decl.value);
		continue;
	}
	if (!needed.has(decl.prop)) continue;
	addDecl(decl.file, decl.selector, decl.prop, decl.value);
}

// Shape tokens sit alongside the rest of the base layer, at :root.
for (const [prop, value] of Object.entries(SHAPE_TOKENS)) addTo(baseRules, ':root', prop, value);

/*
	Base declarations can themselves reach into namespaced tokens — e.g.
	`--animation-easing: var(--ease-standard)` — so they need the same fallback
	treatment as the bundle CSS.
*/
const themeValues = new Map(
	declarations.filter((d) => d.scope === 'theme').map((d) => [d.prop, d.value])
);
const resolvedBaseRules = inlineThemeFallbacks(baseRules, themeValues);
const resolvedThemeRules = inlineThemeFallbacks(themeRules, themeValues);

// ---------------------------------------------------------------------------
// 7. Emit generated/.
// ---------------------------------------------------------------------------

/*
	Written as .ts, not .js, so tsc typechecks the generated data against the
	same types the hand-written runtime uses. A shape change in the generator
	then fails the build instead of failing at a consumer's runtime.
*/
const BANNER = '/* Generated by functions/build.ts. Do not edit. */\n';

/** Writes one generated module, optionally importing a type for its value. */
function writeGenerated(file: string, value: unknown, type: string, importType?: string): void {
	const imports = importType ? `import type { ${importType} } from '../types.js';\n\n` : '';
	fs.writeFileSync(
		path.join(generatedDir, file),
		BANNER +
			imports +
			`const value: ${type} = ${JSON.stringify(value, null, '\t')};\n\n` +
			`export default value;\n`
	);
}

fs.rmSync(generatedDir, { recursive: true, force: true });
fs.mkdirSync(path.join(generatedDir, 'components'), { recursive: true });

for (const [name, bundle] of Object.entries(components) as [string, Bundle][]) {
	const dir = path.join(generatedDir, 'components', name);
	fs.mkdirSync(dir, { recursive: true });

	fs.writeFileSync(
		path.join(dir, 'object.ts'),
		BANNER +
			`import type { StyleObject } from '../../../types.js';\n\n` +
			`export const utilities: StyleObject = ${JSON.stringify(bundle.utilities, null, '\t')};\n\n` +
			`export const standalone: StyleObject = ${JSON.stringify(bundle.standalone, null, '\t')};\n\n` +
			`export const unconditional: StyleObject = ${JSON.stringify(bundle.unconditional, null, '\t')};\n`
	);

	/*
		The registrar. Generated rather than written once and reused, because each
		bundle's data is a separate module — which is what lets a consumer's
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

/** A component name as a valid JS identifier: `code-block` -> `codeBlock`. */
function ident(name: string): string {
	return name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
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

writeGenerated('properties.ts', properties, 'StyleObject', 'StyleObject');
writeGenerated('theme.ts', themeExtend, 'ThemeExtend', 'ThemeExtend');
writeGenerated('base.ts', resolvedBaseRules, 'Record<string, Record<string, string>>');
writeGenerated('themes.ts', resolvedThemeRules, 'ThemeRules', 'ThemeRules');
writeGenerated('shape.ts', SETTABLE_SHAPE_TOKENS, 'string[]');

console.log(
	`built ${names.length} bundles: ${names.join(', ')}\n` +
		`${needed.size} tokens in closure, ${Object.keys(themeRules).length} themes ` +
		`(${Object.keys(themeRules).join(', ')})`
);
```

[Guide 15](15-themes.md) adds the swatch catalogue to this file and
[guide 16](16-options.md) adds the registry and extractors; each gives it again
in full.

---

### `packages/core/src/base/design-tokens.css`

Everything that is not a colour. Plain `@theme`, because these are literals.

```css
/*
	Design tokens that are NOT colours — fonts, breakpoints, animations.

	Plain `@theme`, not `@theme inline`: these are constants, so Tailwind may
	re-declare them as custom properties. Colours are the other case; see
	palette.css.
*/
@theme {
	/* Animations */
	--animation-alert: alert 1s cubic-bezier(0, 0, 0.2, 1) infinite;

	/* Breakpoints */
	--breakpoint-compact: 620px;
	--breakpoint-medium: 960px;
	--breakpoint-expanded: 1301px;
	--breakpoint-large: 1600px;

	/* Fonts. The consumer supplies the files; this only names them. */
	--font-sans: 'Inter Variable', ui-sans-serif, system-ui;
	--font-mono: 'Fira Code Variable', ui-monospace, monospace;
}
```

---

### `packages/core/src/base/palette.css`

The Tailwind namespace layer — what turns your colours into `bg-primary`.

```css
/*
	`@theme inline` — a REFERENCE, not a literal.

	`inline` means Tailwind substitutes the value where the utility is USED
	rather than re-declaring the custom property. That is what you want for
	colours: `bg-primary` must read whatever `--theme-color-primary` resolves to
	AT THAT ELEMENT, which is how a [data-theme] subtree re-colours everything
	inside it.

	Without `inline` the utility bakes in the value from wherever the theme
	variable happened to be declared, and theming stops working inside subtrees.
*/
@theme inline {
	--color-primary: var(--theme-color-primary);
	--color-on-primary: var(--theme-color-on-primary);
	--color-surface: var(--theme-color-surface);
	--color-on-surface: var(--theme-color-on-surface);

	/* Plus every tone step, so `bg-primary-40` works. */
	--color-primary-40: var(--theme-color-primary-40);
	--color-primary-80: var(--theme-color-primary-80);
	/* … the rest of the 30 steps, for each of the 10 palettes … */
}
```

---

### `packages/core/src/base/semantics.css`

```css
/*
	Shape tokens. The build reads their DEFAULTS from SHAPE_TOKENS in build.ts,
	not from here — this file exists so the CSS-first path resolves during
	development and so the parity harness has something to compare against.

	Keep the two in sync. Guide 12 asserts that every token here has a :root
	default in the compiled plugin.
*/
:root {
	--radius-selector: 0.5rem;
	--radius-field: 0.5rem;
	--radius-box: 1rem;
	--size-selector: 1.5rem;
	--size-field: 2.5rem;
	--border-width: 1px;
	--animation-duration: 200ms;
	--animation-easing: var(--ease-standard);

	/*
		--radius-button is deliberately ABSENT. Components read it as
		`var(--radius-button, var(--radius-field))` so the fallback resolves at
		the element; a default here would resolve it once, at the root.
	*/
}
```

---

### `packages/core/src/base/_index.css`

The barrel, in dependency order.

```css
/*
	Order matters: color-scheme before modes (light-dark() is inert without it),
	and modes before palette (the namespace layer references the roles the mode
	layer defines).
*/
@import './color-scheme.css';
@import './design-tokens.css';
@import './typography.css';
@import './motion.css';
@import './keyframes.css';
@import './modes.css';
@import './palette.css';
@import './semantics.css';
```

---

## Traps

> **You iterate the namespace map in declaration order.** `--font-weight-bold`
> matches `--font-` before `--font-weight-`, so it lands in `fontFamily` and you
> ship a `font-weight-bold` utility that sets `font-family: 700`.
>
> **Fix:** sort prefixes longest-first.

> **You re-emit theme tokens through `addBase`.** They land in `@layer base` and
> shadow the consumer's own `@theme` overrides, so customising your design system
> silently stops working.
>
> **Fix:** inline the default as a `var()` fallback at the point of use.

> **You give a derived token a `:root` default.** `--radius-button:
var(--radius-field)` at the root resolves once, against the root's value, so
> any scoped override of `--radius-field` never reaches it.
>
> **How to tell:** setting `--radius-field` on `[data-theme='x']` changes inputs
> but not buttons.
>
> **Fix:** leave the derived token undeclared; write
> `var(--radius-button, var(--radius-field))` in the component.

> **You collect tokens from a compile rather than from source.** `@theme` values
> are emitted on demand, so you get whichever tokens something happened to use —
> a subset that changes whenever a component changes.

> **You forget `color-scheme` because it is not a custom property.** Every
> `light-dark()` in the mode layer then resolves to its light value forever, in
> both modes. Nothing errors.

> **`readdirSync` order leaks into generated output.** Diffs reorder between
> machines and between CI runs, and reviewing a real change becomes impossible.
>
> **Fix:** sort entries by name before visiting.

---

## Commit

Verify, then commit:

```powershell
bun run --filter '@anti049/test' check
git add -A
git commit -m "feat(core): ship design tokens so the plugin works standalone"
```

Needs a changeset: a consumer who previously had to `@import` your CSS no
longer does. That is the headline change, so say it in those words.

---

## Checkpoint

Step 11 compiled standalone against `./dist`. This does it from a packed
tarball, outside the repository, and adds the two checks a standalone compile
alone cannot make: token utilities exist, and a consumer can still override a
token.

Rebuild the plugin skeleton from
[guide 2's checkpoint](02-plugin.md#the-plugin-skeleton), then:

```powershell
@'
@import 'tailwindcss' source(none);
@plugin '@anti049/test';
@source inline('badge');
@source inline('button');
@source inline('text-body-medium');
@source inline('duration-medium-2');
@source inline('bg-primary');
'@ | Set-Content src/solo.css
node $cli -i src/solo.css -o out/solo.css

# Every var() resolves. Only Tailwind's own --tw-* may appear here.
(Select-String -Path out/solo.css -Pattern 'var\(--[-a-z0-9]+\)' -AllMatches).Matches.Value |
	Sort-Object -Unique | Where-Object { $_ -notmatch '^var\(--tw-' }   # prints nothing

# Tokens became real utilities.
(Select-String -Path out/solo.css -Pattern '\.text-body-medium\b').Count    # > 0
(Select-String -Path out/solo.css -Pattern '\.duration-medium-2\b').Count   # > 0
(Select-String -Path out/solo.css -Pattern '\.bg-primary\b').Count          # > 0

# The derived token stays undeclared, so a theme can still move it (step 10).
(Select-String -Path out/solo.css -Pattern '--radius-button\s*:').Count     # 0

# A consumer's @theme beats the plugin's value, because the token went through
# the theme config rather than addBase (step 6).
@'
@import 'tailwindcss' source(none);
@plugin '@anti049/test';
@theme { --duration-medium-2: 999ms; }
@source inline('duration-medium-2');
'@ | Set-Content src/override.css
node $cli -i src/override.css -o out/override.css
(Select-String -Path out/override.css -Pattern '999ms').Count               # > 0

Pop-Location
Remove-Item -Recurse -Force "$env:TEMP\test-checkpoint"
```

**Passes when** every line prints what its comment says. Substitute token
names from your own `src/base/` where they differ from the examples in this
guide.

**If it does not:** a name in the unresolved list is a gap in the closure
(step 5) or a namespace that never reached the JS theme (step 6). An override
that loses means that token went through `addBase`, where it shadows the
consumer's `@theme` instead of merging with it.

---

Next: [Themes](15-themes.md)
