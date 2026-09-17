# 15. The token layer

[Guide 2](02-plugin.md) compiles component CSS into a plugin. That plugin is
useless on its own unless it also carries the **tokens** the components
reference — and carrying them correctly is subtler than copying a block of
custom properties into `addBase`.

This guide builds the layer that makes `@plugin '@scope/project-name'` work with
no CSS import at all, and that turns your design tokens into real Tailwind
utilities (`text-body-medium`, `duration-medium-2`, `bg-primary`) rather than
bare custom properties.

Eleven steps.

---

## 1. Understand what "standalone" costs

A consumer writes this and nothing else — **their** stylesheet, not yours:

```css
@import 'tailwindcss';
@plugin '@scope/project-name';
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
[guide 14](14-themes.md) parses `modes.css` specifically, so one giant
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
bun run --filter '@scope/project-name' check
git add -A
git commit -m "feat(core): ship design tokens so the plugin works standalone"
```

Needs a changeset: a consumer who previously had to `@import` your CSS no
longer does. That is the headline change, so say it in those words.
---

Next: [The plugin option surface](16-options.md)
