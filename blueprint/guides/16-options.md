# 16. The plugin option surface

[Guide 2](02-plugin.md) ends with a plugin that registers everything it has.
This guide builds the surface a consumer actually configures — prefixing,
bundle selection, theme selection, shape overrides — plus the two registration
channels that guide 2 only listed in a table: `addVariant` and `matchUtilities`.

The option names here become public API the moment you publish
([guide 13](13-release.md), step 6), so this is worth getting right before the
first release rather than after.

Ten steps.

---

## 1. Decide the surface, and write down the rule

This is what a consumer writes in their own stylesheet — not a file in your
repository. It is the contract the rest of this guide implements.

```css
@import 'tailwindcss';
@plugin '@anti049/test' {
	prefix: px-;
	exclude: badge, tooltip;
	themes: default, dracula;
	--radius-field: 0.75rem;
}
```

| Option      | Type             | Does                                   |
| ----------- | ---------------- | -------------------------------------- |
| `prefix`    | string           | renames the classes and locals you own |
| `include`   | string or list   | register only these bundles            |
| `exclude`   | string or list   | register everything except these       |
| `themes`    | string or list   | which shipped palettes to ship         |
| `--<token>` | string or number | override a shape token globally        |

Tailwind types option bodies for you: `prefix: px-` arrives as a string,
`exclude: a, b` as an array, bare `true`/`false` as booleans, numbers as
numbers. You do not parse anything.

**The rule, for every option on this page: throw, never warn.** Tailwind ignores
any option a plugin does not read, so a misspelling is indistinguishable from a
setting that quietly refused to apply. A build error naming the option is the
only feedback a consumer will ever get.

---

## 2. Generate the registry of names you own

**`packages/core/types.ts`** — append the interface.

Prefixing needs an answer to "is this name mine?". Derive it at build time from
the component sources:

```ts
export interface Registry {
	classes: string[]; // every class name your CSS defines
	variables: string[]; // every custom property, without the leading --
}
```

```ts
writeGenerated('registry.ts', registry, 'Registry');
```

This is an **allowlist**, and that choice is the whole design. The alternative —
prefix every class you encounter and keep a denylist of exceptions, which is what
several popular plugins do — means Tailwind's own theme variables, consumer
state hooks like `.disabled`, and third-party classes are left alone only for as
long as somebody remembers to exclude them. With an allowlist they are left
alone by construction.

---

## 3. Write the escape-aware prefixer

**`packages/core/functions/addPrefix.ts`** — new file. Note it lives in
`functions/` but is a **runtime** module: `index.ts` imports it, so it ships.

A naive `selector.replace(/\.(\w+)/g, …)` is wrong in four separate ways, and
each one produces broken CSS rather than an error.

```ts
const BACKSLASH = '\\';

const prefixSelector = (selector: string, prefix: string, classes: ReadonlySet<string>): string => {
	let out = '';
	let quote = '';
	let bracketDepth = 0;

	for (let i = 0; i < selector.length; i++) {
		const ch = selector[i];

		if (quote) {
			out += ch;
			if (ch === BACKSLASH) out += selector[++i] ?? '';
			else if (ch === quote) quote = '';
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			out += ch;
			continue;
		}
		// Skip comments wholesale. Their contents must not drive the state
		// machine: an apostrophe inside a comment would otherwise open a quote
		// that never closes, and a stray "[" would leave bracketDepth stuck,
		// silently skipping every class after it.
		if (ch === '/' && selector[i + 1] === '*') {
			const end = selector.indexOf('*/', i + 2);
			const stop = end === -1 ? selector.length : end + 2;
			out += selector.slice(i, stop);
			i = stop - 1;
			continue;
		}
		if (ch === BACKSLASH) {
			// Escaped character in a selector, e.g. `.w-1\/2`. Copy both through.
			out += ch + (selector[++i] ?? '');
			continue;
		}
		if (ch === '[') bracketDepth++;
		else if (ch === ']' && bracketDepth > 0) bracketDepth--;

		if (ch === '.' && bracketDepth === 0) {
			const name = /^-?[_a-zA-Z][\w-]*/.exec(selector.slice(i + 1))?.[0];
			if (name && classes.has(name)) {
				out += '.' + prefix + name;
				i += name.length;
				continue;
			}
		}
		out += ch;
	}
	return out;
};
```

The four cases, all of which occur in real compiled output:

| Input                              | Naive result                       | Why it matters                                   |
| ---------------------------------- | ---------------------------------- | ------------------------------------------------ |
| `[data-state='x.y']`               | renames inside the attribute value | breaks the selector                              |
| `.w-1\/2`                          | treats `/2` as a new class         | corrupts escaped utilities                       |
| `/* .button is … */`               | renames inside a comment           | usually harmless, until the comment contains `'` |
| `.button` where `button` is theirs | renames a class you do not own     | breaks the consumer's markup                     |

Then the keys and values — same file, below `prefixSelector`:

```ts
const prefixKey = (key, prefix, classes, variables): string => {
	if (key.startsWith('--')) {
		const name = key.slice(2);
		return variables.has(name) ? '--' + prefix + name : key;
	}
	// @property names a variable; other at-rules (@layer, @media) pass through.
	if (key.startsWith('@property --')) return prefixValue(key, prefix, variables);
	if (key.startsWith('@')) return key;
	return prefixSelector(key, prefix, classes);
};
```

`@property` is the one at-rule whose _params_ are a variable name. Treat it like
every other at-rule and a prefixed build registers `--px-ripple-scale` while the
`@property` declaration still says `--ripple-scale`, so the registration
silently does not apply.

---

## 4. Do not prefix theme values

**`packages/core/index.ts`** — the second argument to `plugin.withOptions`,
from [guide 2](02-plugin.md) step 11.

```ts
plugin.withOptions(
	(options) => {
		/* … */
	},
	// Theme values are shared Tailwind namespaces, so they are deliberately not
	// prefixed — `--color-primary` stays `--color-primary` whatever the prefix.
	() => ({ theme: { extend: themeExtend } })
);
```

A prefix renames **your** surface, not Tailwind's. `--color-primary` is the
`colors` namespace; prefixing it to `--px-color-primary` would mean `bg-primary`
stops working and `bg-px-primary` is not a thing. Consumers expect `prefix` to
change class names, not to fork Tailwind's theme.

State this in your README. It is the first question anyone asks about the
option.

---

## 5. Implement `include` / `exclude`

**`packages/core/index.ts`** — inside the options function, at the top.

```ts
const { prefix = '', include, exclude } = options;

const included = (name: string): boolean => {
	if (include) return ([] as string[]).concat(include).includes(name);
	if (exclude) return !([] as string[]).concat(exclude).includes(name);
	return true;
};
```

`include` wins when both are given — a rule to document rather than an error to
throw, because the combination is usually a leftover rather than a mistake.

`[].concat(value)` normalises the single-string case: `exclude: badge` arrives as
a string, `exclude: badge, tooltip` as an array, and you do not want two code
paths.

Apply the same predicate to functional utilities (step 9), or `exclude: tooltip`
removes the tooltip's static classes and leaves `tooltip-gap-*` registered.

---

## 6. Implement `themes`, and always keep the default

**`packages/core/index.ts`** — inside the options function, below `included`.

```ts
const requested = options.themes === undefined ? null : ([] as string[]).concat(options.themes);
const unknown = requested?.filter((name) => !(name in themes)) ?? [];
if (unknown.length) {
	throw new Error(
		`test: unknown theme${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}. ` +
			`Shipped themes: ${Object.keys(themes).join(', ')}. ` +
			`Define your own with @plugin '@anti049/test/theme'.`
	);
}
const selectedThemes =
	requested === null ? Object.keys(themes) : [...new Set(['default', ...requested])];
```

`default` is added back unconditionally. It sits at `:where(:root)` with zero
specificity and supplies the tone steps every other theme falls back to for
roles it does not set, so dropping it leaves the others with unresolved colours
— which renders as nothing, not as an error. See [guide 15](15-themes.md),
step 3.

The error message does three things worth copying: it names what was wrong, it
lists what is valid, and it points at the other entry point for the thing the
consumer was probably trying to do.

---

## 7. Implement shape-token overrides

**`packages/core/index.ts`** — inside the options function, below the theme
selection.

```ts
const shapeOverrides: Record<string, string> = {};
const unknownTokens: string[] = [];
for (const [key, value] of Object.entries(options)) {
	if (!key.startsWith('--')) continue;
	if (!shapeTokens.includes(key)) {
		unknownTokens.push(key);
		continue;
	}
	if (typeof value === 'string' || typeof value === 'number') {
		shapeOverrides[key] = String(value);
	}
}
if (unknownTokens.length) {
	throw new Error(
		`test: unknown token${unknownTokens.length > 1 ? 's' : ''} ` +
			`${unknownTokens.join(', ')}. Settable here: ${shapeTokens.join(', ')}. ` +
			`Colour roles belong on a theme, via @plugin '@anti049/test/theme'.`
	);
}
```

`shapeTokens` is the generated `SETTABLE_SHAPE_TOKENS` from
[guide 14](14-tokens.md), step 10 — including the _derived_ tokens that have no
declaration of their own. A consumer may set `--radius-button` even though
nothing declares it; the component reads it as a fallback.

Emitted as one rule at `:root`, after the base layer — in the returned handler
(step 10 shows it in place):

```ts
if (Object.keys(shapeOverrides).length) api.addBase({ ':root': shapeOverrides });
```

---

## 8. Register custom variants

**`packages/core/functions/extract-variants.ts`** — new file, build-time.

`@custom-variant` cannot be expressed in object form, so it needs its own
extractor and `addVariant`.

```ts
export function extractCustomVariants(coreSrc: string): Record<string, VariantSelector> {
	/* walk .css, postcss.parse, walkAtRules('custom-variant') */
}
```

A variant body marks where utilities go with `@slot`. This is what you author in
**`packages/core/src/base/plugins.css`**; every rule containing a `@slot`
contributes a selector, wrapped in whatever at-rules enclose it:

```css
@custom-variant collapsed {
	@media (width < theme(--breakpoint-medium)) {
		&:where(.nav-rail:not(:hover)) {
			@slot;
		}
	}
	&:where(.scaffold[data-minimized] .nav-rail) {
		@slot;
	}
}
```

becomes two selector strings, one media-wrapped. All three forms — plain,
media-wrapped, and an array of both — are accepted by `addVariant`, and
`theme()` survives inside the media condition, so nothing has to be baked in at
build time.

**`packages/core/index.ts`** — in the returned handler:

```ts
for (const [name, selector] of Object.entries(variants)) {
	api.addVariant(`${prefix}${name}`, selector);
}
```

**Warn loudly on a variant with no `@slot`.** It contributes nothing and is
almost always a typo — back in **`extract-variants.ts`**:

```ts
if (!selectors.length) {
	console.warn(`  ! @custom-variant ${name} has no @slot; skipping`);
	return;
}
```

A hand-written variant list is the failure this extractor exists to prevent —
ours silently carried one of three variants for months, and the missing one was
used by the docs layout.

---

## 9. Register functional utilities

**`packages/core/functions/extract-functional.ts`** — new file, build-time.

`@utility name-*` has no finite set of class names, so it cannot go through the
safelist-and-partition path. Read it from source and re-register at runtime.

The extractor accepts exactly two value forms and throws on anything else —
**`extract-functional.ts`**:

```ts
/** `--spacing(--value(number))`, ignoring incidental whitespace. */
const SPACING_NUMBER = /^--spacing\(\s*--value\(\s*number\s*\)\s*\)$/;

/*
	`--value([*])` — any arbitrary value, including calc() and var().

	Whitespace is tolerated inside the brackets: Prettier reformats `[*]` to
	`[ *]`, Tailwind treats the two identically, and a formatter run should not
	be able to silently unregister a utility.
*/
const ARBITRARY = /^--value\(\s*\[\s*\*\s*\]\s*\)$/;
```

Throwing on an unrecognised form is deliberate. A functional utility that
silently failed to port looks exactly like one that works, until a consumer
tries to use it.

Registration — **`packages/core/index.ts`**, at the end of the returned handler:

```ts
for (const utility of functional) {
	if (!included(utility.bundle)) continue;

	// Run the names through the same allowlist prefixer everything else uses,
	// so `px-tooltip-gap-2` sets `--px-tooltip-gap`.
	const probe = addPrefix(
		{ [`.${utility.name}`]: Object.fromEntries(utility.properties.map((p) => [p, ''])) },
		prefix,
		registry
	);
	const [selector, declarations] = Object.entries(probe)[0];
	const properties = Object.keys(declarations);

	const values: Record<string, string> = {};
	if (utility.spacing) {
		const spacing = api.theme('spacing') as Record<string, string> | undefined;
		for (const step of Object.keys(spacing ?? {})) {
			// `px` and friends are not numbers; --value(number) rejects them too.
			if (!/^\d+(\.\d+)?$/.test(step)) continue;
			values[step] = `calc(var(--spacing) * ${step})`;
		}
	}

	api.matchUtilities(
		{
			[selector.slice(1)]: (value: string) => Object.fromEntries(properties.map((p) => [p, value]))
		},
		{ values, type: utility.arbitrary ? ['any'] : [] }
	);
}
```

Two things here are not obvious:

- **`matchUtilities` does not accept bare numbers unless you supply `values`.**
  `tooltip-gap-2` simply does not match without it. Derive the scale from
  `theme('spacing')` rather than hand-listing it.
- **Map back to `calc(var(--spacing) * n)`, not to the resolved rem.** That keeps
  the output byte-identical to the CSS-first build — so the parity harness stays
  clean — and keeps working if a consumer redefines `--spacing`.

---

## 10. Assemble, then verify every option

**`packages/core/index.ts`** — the returned handler, replacing the stub from
[guide 2](02-plugin.md) step 11.

```ts
return (api: PluginAPI) => {
	api.addBase(base); // tokens
	if (Object.keys(shapeOverrides).length) api.addBase({ ':root': shapeOverrides });
	for (const name of selectedThemes) {
		for (const [selector, decls] of Object.entries(themes[name] ?? {})) {
			api.addBase({ [selector]: decls });
		}
	}
	api.addBase(addPrefix(properties, prefix, registry)); // @property registrations

	for (const [name, selector] of Object.entries(variants)) {
		api.addVariant(`${prefix}${name}`, selector);
	}

	for (const [name, register] of Object.entries(bundles)) {
		if (!included(name)) continue;
		register({ addUtilities, addBase: addBundleBase, prefix });
	}

	/* functional utilities, as above */
};
```

Order matters: tokens before themes before overrides, so each can be beaten by
the next.

Every option needs a test, because **every one of them fails silently when
wrong.** Add these to the differential harness ([guide 12](12-testing.md),
step 4):

```powershell
# prefix: every owned class renamed, nothing else touched
# include: only the named bundles present
# exclude: named bundles absent, everything else unchanged
# themes:  named palettes present, `default` always present
# --token: the override reaches :root and beats the base value
# unknown anything: throws, and the message names the option
```

The prefix test is the one to write first and most carefully. Assert on all
three halves: your classes **are** renamed, Tailwind's theme variables are
**not**, and a consumer-ish class like `.disabled` is **not**.

---

## Files after this phase

Seven files. Three are new build-time extractors, one is a new **runtime**
module, and three are additions to files earlier guides created.

| File                                            | Status   | Written in    | Ships?  |
| ----------------------------------------------- | -------- | ------------- | ------- |
| `packages/core/functions/addPrefix.ts`          | added    | step 3        | **Yes** |
| `packages/core/functions/extract-variants.ts`   | added    | step 8        | no      |
| `packages/core/functions/extract-functional.ts` | added    | step 9        | no      |
| `packages/core/types.ts`                        | modified | steps 2, 9    | **Yes** |
| `packages/core/index.ts`                        | replaced | step 10       | **Yes** |
| `packages/core/functions/build.ts`              | modified | steps 2, 8, 9 | no      |
| `packages/core/test/unit/addPrefix.test.ts`     | added    | step 10       | no      |

**`addPrefix.ts` is the odd one.** Everything else in `functions/` is the
compiler and is kept out of `dist/` by `tsconfig.build.json`. This one is
imported by `index.ts`, so `tsc` follows it and it ships. That is intentional —
prefixing happens at the consumer's compile time, not at yours — but it means
the file must never import `node:` anything.

New generated files, not committed: `generated/registry.ts`,
`generated/variants.ts`, `generated/functional.ts`, `generated/shape.ts`.

---

### `packages/core/functions/addPrefix.ts`

```ts
import type { Registry, StyleObject } from '../types.js';

/*
	Prefixes the design system's own class names and custom properties.

	This works off an ALLOWLIST generated at build time from the component
	sources (generated/registry.ts). A name is renamed only when the design
	system actually defines it, so Tailwind's theme variables, consumer state
	hooks like `.disabled`, and third-party classes are left alone by
	construction rather than by remembering to exclude them.

	The alternative — prefix everything and keep a denylist of exceptions, which
	is what several popular plugins do — fails the first time a consumer has a
	class whose name collides with one of yours. The failure is a renamed class
	in THEIR markup, which looks like their bug.

	RUNTIME MODULE: index.ts imports this, so it ships in dist/. No node: imports.
*/

const BACKSLASH = '\\';

/**
 * Rewrites `.foo` in a selector, skipping quoted strings, comments and the
 * insides of `[attr=...]`.
 *
 * A regex cannot do this. Each of the four cases handled below produces
 * plausible-looking CSS rather than an error, which is the worst way to fail.
 */
const prefixSelector = (selector: string, prefix: string, classes: ReadonlySet<string>): string => {
	let out = '';
	let quote = '';
	let bracketDepth = 0;

	for (let i = 0; i < selector.length; i++) {
		const ch = selector[i];

		// 1. Inside a quoted string: copy through, honouring escapes.
		if (quote) {
			out += ch;
			if (ch === BACKSLASH) {
				out += selector[++i] ?? '';
			} else if (ch === quote) {
				quote = '';
			}
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			out += ch;
			continue;
		}

		/*
			2. Comments, skipped wholesale. Their contents must not drive the
			state machine: an apostrophe inside a comment would otherwise open a
			quote that never closes, and a stray "[" would leave bracketDepth
			stuck, silently skipping every class after it.
		*/
		if (ch === '/' && selector[i + 1] === '*') {
			const end = selector.indexOf('*/', i + 2);
			const stop = end === -1 ? selector.length : end + 2;
			out += selector.slice(i, stop);
			i = stop - 1;
			continue;
		}

		/*
			3. An escaped character, e.g. `.w-1\/2`. Copy both through, so the
			`/2` is never mistaken for the start of a new class.
		*/
		if (ch === BACKSLASH) {
			out += ch + (selector[++i] ?? '');
			continue;
		}

		// 4. Attribute selectors: `[data-state='x.y']` holds a dot that is not
		//    a class.
		if (ch === '[') bracketDepth++;
		else if (ch === ']' && bracketDepth > 0) bracketDepth--;

		if (ch === '.' && bracketDepth === 0) {
			const name = /^-?[_a-zA-Z][\w-]*/.exec(selector.slice(i + 1))?.[0];
			if (name && classes.has(name)) {
				out += '.' + prefix + name;
				i += name.length;
				continue;
			}
		}
		out += ch;
	}
	return out;
};

const VAR_REFERENCE = /--([-\w]+)/g;

/** Renames `var(--x)` references, but only for variables in the registry. */
const prefixValue = (value: string, prefix: string, variables: ReadonlySet<string>): string =>
	value.replace(VAR_REFERENCE, (match, name: string) =>
		variables.has(name) ? '--' + prefix + name : match
	);

const prefixKey = (
	key: string,
	prefix: string,
	classes: ReadonlySet<string>,
	variables: ReadonlySet<string>
): string => {
	// A custom property declaration.
	if (key.startsWith('--')) {
		const name = key.slice(2);
		return variables.has(name) ? '--' + prefix + name : key;
	}
	/*
		@property is the ONE at-rule whose params are a variable name. Treat it
		like every other at-rule and a prefixed build registers
		`--px-ripple-scale` while the @property declaration still says
		`--ripple-scale` — so the registration silently does not apply and the
		animation stops working.
	*/
	if (key.startsWith('@property --')) return prefixValue(key, prefix, variables);
	// Every other at-rule (@layer, @media, @supports) passes through untouched.
	if (key.startsWith('@')) return key;
	return prefixSelector(key, prefix, classes);
};

const asSet = (value: ReadonlySet<string> | readonly string[]): ReadonlySet<string> =>
	value instanceof Set ? value : new Set(value as readonly string[]);

export function addPrefix<T extends StyleObject>(styles: T, prefix: string, registry: Registry): T {
	// No prefix is the common case: do no work, allocate nothing.
	if (!prefix) return styles;

	const classes = asSet(registry.classes);
	const variables = asSet(registry.variables);

	const walk = (node: unknown): unknown => {
		if (Array.isArray(node)) return node.map(walk);
		if (node === null || typeof node !== 'object') {
			return typeof node === 'string' ? prefixValue(node, prefix, variables) : node;
		}
		return Object.fromEntries(
			Object.entries(node as StyleObject).map(([key, value]) => [
				prefixKey(key, prefix, classes, variables),
				walk(value)
			])
		);
	};

	return walk(styles) as T;
}
```

---

### `packages/core/functions/extract-variants.ts`

```ts
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

/*
	Turns `@custom-variant` blocks into the argument `addVariant` takes.

	This was a hand-written list once, and it silently carried ONE of the three
	variants the system defined. Two were simply missing, and one of those was
	used by the docs layout. Derived from source now, and guide 12 asserts the
	count against the source so it cannot drift again.

	A variant body marks where utilities go with `@slot`:

	  @custom-variant collapsed {
	    @media (width < theme(--breakpoint-medium)) {
	      &:where(.nav-rail:not(:hover)) { @slot; }
	    }
	    &:where(.scaffold[data-minimized] .nav-rail) { @slot; }
	  }

	becomes two selector strings, one media-wrapped. All three forms — plain,
	media-wrapped and an array of both — are accepted by addVariant, and
	`theme()` survives inside the media condition, so nothing has to be baked in
	at build time.
*/

export type VariantSelector = string | string[];

const containsSlot = (rule: postcss.Rule): boolean => {
	let found = false;
	rule.walkAtRules('slot', () => {
		found = true;
		return false; // stop walking
	});
	return found;
};

/** Wraps a selector in the at-rules enclosing it, innermost last. */
const wrap = (selector: string, node: postcss.Node, stopAt: postcss.AtRule): string => {
	let out = selector;
	for (
		let parent = node.parent as postcss.Container | undefined;
		parent && parent !== stopAt;
		parent = parent.parent as postcss.Container | undefined
	) {
		if (parent.type === 'atrule') {
			const at = parent as postcss.AtRule;
			out = `@${at.name} ${at.params} { ${out} }`;
		}
	}
	return out;
};

/** Every `@custom-variant` the design system defines, keyed by name. */
export function extractCustomVariants(coreSrc: string): Record<string, VariantSelector> {
	const variants: Record<string, VariantSelector> = {};

	const visit = (dir: string): void => {
		// Sorted, so generated output does not reorder between machines.
		for (const entry of fs
			.readdirSync(dir, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name))) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				visit(full);
				continue;
			}
			if (!entry.name.endsWith('.css')) continue;

			postcss.parse(fs.readFileSync(full, 'utf8')).walkAtRules('custom-variant', (atRule) => {
				const name = atRule.params.trim();
				if (!name) return;

				const selectors: string[] = [];
				atRule.walkRules((rule) => {
					if (!containsSlot(rule)) return;
					selectors.push(wrap(rule.selector.replace(/\s+/g, ' ').trim(), rule, atRule));
				});

				/*
					A variant with no @slot contributes nothing and is almost
					always a typo. Warn rather than throw: it does not break
					anything, and failing the build over it would be worse than
					the bug.
				*/
				if (!selectors.length) {
					console.warn(`  ! @custom-variant ${name} has no @slot; skipping`);
					return;
				}
				variants[name] = selectors.length === 1 ? selectors[0] : selectors;
			});
		}
	};

	visit(coreSrc);
	return variants;
}
```

---

### `packages/core/functions/extract-functional.ts`

```ts
import postcss from 'postcss';
import type { FunctionalUtility } from '../types.js';

/*
	Functional utilities — `@utility tooltip-gap-*` and friends.

	These cannot go through the compile-and-partition path the rest of the build
	uses. That path works by safelisting every class name and keeping whatever
	Tailwind emits, and a functional utility has no finite set of names to
	safelist. So they are read straight from source here and re-registered at
	runtime through matchUtilities.

	Only the two value forms the system actually authors are understood:

	    --tooltip-gap: --spacing(--value(number));   a number off the spacing scale
	    --tooltip-gap: --value([*]);                 an arbitrary value

	Anything else throws. A functional utility that silently failed to port
	would look exactly like one that works, until a consumer tried to use it —
	which is the failure mode this build tries hardest to avoid.
*/

/** `--spacing(--value(number))`, ignoring incidental whitespace. */
const SPACING_NUMBER = /^--spacing\(\s*--value\(\s*number\s*\)\s*\)$/;

/*
	`--value([*])` — any arbitrary value, including calc() and var().

	Whitespace is tolerated inside the brackets: Prettier reformats `[*]` to
	`[ *]`, Tailwind treats the two identically, and a formatter run must not be
	able to silently unregister a utility.
*/
const ARBITRARY = /^--value\(\s*\[\s*\*\s*\]\s*\)$/;

/**
 * Functional utilities a stylesheet declares.
 *
 * `bundle` is the owning bundle, so the plugin can honour `include`/`exclude`
 * for these the same way it does for everything else.
 */
export function extractFunctional(css: string, bundle: string): FunctionalUtility[] {
	const root = postcss.parse(css);
	const found: FunctionalUtility[] = [];

	root.walkAtRules('utility', (rule) => {
		const params = rule.params.trim();
		// Only the functional ones. Named utilities go through the safelist.
		if (!params.endsWith('-*')) return;
		const name = params.slice(0, -2);

		const properties: string[] = [];
		let spacing = false;
		let arbitrary = false;

		rule.walkDecls((decl) => {
			const value = decl.value.trim();
			if (SPACING_NUMBER.test(value)) {
				spacing = true;
			} else if (ARBITRARY.test(value)) {
				arbitrary = true;
			} else {
				throw new Error(
					`${bundle}: @utility ${params} declares ${decl.prop}: ${value}, which the ` +
						`build does not know how to register through matchUtilities. Supported ` +
						`forms are --spacing(--value(number)) and --value([*]).`
				);
			}
			if (!properties.includes(decl.prop)) properties.push(decl.prop);
		});

		if (properties.length === 0) {
			throw new Error(`${bundle}: @utility ${params} declares nothing.`);
		}

		found.push({ bundle, name, properties, spacing, arbitrary });
	});

	return found.sort((a, b) => a.name.localeCompare(b.name));
}
```

---

### `packages/core/types.ts`

The whole file as it stands at the end of this phase, and of the blueprint.

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
 * namespaces that take them. Added by guide 14.
 */
export type ThemeEntry = string | [string, Record<string, string>];
export type ThemeExtend = Record<string, Record<string, ThemeEntry>>;

/** Shipped theme palettes, keyed by theme id then by selector. Guide 15. */
export type ThemeRules = Record<string, Record<string, Record<string, string>>>;

/** Re-exported so generated/swatches.ts can name its own shape. Guide 15. */
export type { SwatchRole, ThemeSwatches } from './functions/extract-swatches.js';

/**
 * Names the design system owns, used to decide what a `prefix` may rename.
 * Added by THIS guide.
 */
export interface Registry {
	classes: string[];
	/** Custom property names, WITHOUT the leading `--`. */
	variables: string[];
}

/**
 * A functional utility — `@utility tooltip-gap-*`, registered at runtime with
 * matchUtilities because its class names cannot be enumerated at build time.
 * Added by THIS guide.
 */
export interface FunctionalUtility {
	/** Owning bundle, so include/exclude applies to these too. */
	bundle: string;
	/** Class stem without the trailing `-*`, e.g. `tooltip-gap`. */
	name: string;
	/** Properties the resolved value is written to. */
	properties: string[];
	/** Accepts a number off the spacing scale (`tooltip-gap-2`). */
	spacing: boolean;
	/** Accepts an arbitrary value (`tooltip-gap-[3px]`). */
	arbitrary: boolean;
}

/** Options a consumer may pass in the `@plugin` body. */
export interface PluginOptions {
	/** Renames the design system's own classes and locals, e.g. `px-`. */
	prefix?: string;
	/** Bundles to register; omit for all. */
	include?: string | string[];
	/** Bundles to skip. Ignored when `include` is given. */
	exclude?: string | string[];
	/**
	 * Shipped theme palettes to include. Omit for all. The `default` theme is
	 * always added: other themes inherit from it for roles they do not set.
	 */
	themes?: string | string[];
	/**
	 * Shape tokens, set as CSS custom properties. Anything else beginning with
	 * `--` is rejected — a typo would otherwise define a variable nothing reads
	 * and silently change nothing.
	 */
	[token: `--${string}`]: string | number | undefined;
}
```

That index signature is why the `KNOWN` set from [guide 2](02-plugin.md) had to
be replaced by the explicit `--` handling in step 7: with it present, TypeScript
will not complain about any `--`-prefixed key, so the check has to happen at
runtime.

---

### `packages/core/functions/build.ts`

The whole file as it stands at the end of this phase, and of the blueprint.

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
import { buildSwatches, modeMapping } from './extract-swatches.js';
import { extractCustomVariants } from './extract-variants.js';
import { extractFunctional } from './extract-functional.js';
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

/*
	The allowlist a `prefix` renames against. Classes come from what survived
	built-in detection; variables are collected in section 6 once the
	declarations have been read, and merged in before emission.

	An ALLOWLIST rather than a denylist: a name is renamed only when this design
	system actually defines it, so Tailwind's own theme variables and a
	consumer's state hooks are left alone by construction.
*/
const registryClasses = [...classOwners.keys()].sort();

/*
	Functional utilities — `@utility name-*`. These have no finite set of class
	names, so they cannot be safelisted and cannot survive the compile. Read
	from source instead, and re-registered at runtime by index.ts through
	matchUtilities.
*/
const FUNCTIONAL = componentFiles.flatMap((file) =>
	extractFunctional(fs.readFileSync(file, 'utf8'), path.basename(file, '.css'))
);

/*
	`@custom-variant` blocks. Hand-listing these once shipped one of three, and
	the two that were missing went unnoticed for months — guide 12 now asserts
	the count against the source.
*/
const CUSTOM_VARIANTS = extractCustomVariants(coreSrc);

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
// 6. Collect the design tokens. (Guide 14.)
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
// 7. Build the theme catalogue. (This guide.)
// ---------------------------------------------------------------------------

/*
	Read the role-to-tone-step mapping out of modes.css rather than hard-coding
	it. That both avoids drift and gives you a build-time assertion that the mode
	layer is intact: re-point a role and either the mapping follows or the build
	fails with a message naming the role.
*/
const swatchModeMap = modeMapping(fs.readFileSync(path.join(coreSrc, 'base/modes.css'), 'utf8'));
const swatches = buildSwatches(resolvedThemeRules, swatchModeMap);

// ---------------------------------------------------------------------------
// 8. Emit generated/.
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

/*
	A component-local variable is one the component DECLARES, not merely one it
	mentions. Going by references would sweep up typos — a var() naming a token
	that does not exist anywhere — and then rename them under a prefix, which
	quietly breaks the "theme variables are never prefixed" guarantee for
	anything named `--color-*`.
*/
const registryVariables = [
	...new Set(
		declarations
			.filter((d) => d.scope === 'rule' && themeIdOf(d.file) === null)
			.map((d) => d.prop.slice(2))
	)
].sort();

const registry = { classes: registryClasses, variables: registryVariables };

writeGenerated('registry.ts', registry, 'Registry', 'Registry');
writeGenerated('variants.ts', CUSTOM_VARIANTS, 'Record<string, string | string[]>');
writeGenerated('functional.ts', FUNCTIONAL, 'FunctionalUtility[]', 'FunctionalUtility');
writeGenerated('properties.ts', properties, 'StyleObject', 'StyleObject');
writeGenerated('theme.ts', themeExtend, 'ThemeExtend', 'ThemeExtend');
writeGenerated('base.ts', resolvedBaseRules, 'Record<string, Record<string, string>>');
writeGenerated('themes.ts', resolvedThemeRules, 'ThemeRules', 'ThemeRules');
writeGenerated('shape.ts', SETTABLE_SHAPE_TOKENS, 'string[]');
writeGenerated('swatches.ts', swatches, 'Record<string, ThemeSwatches>', 'ThemeSwatches');
writeGenerated('mode-map.ts', swatchModeMap, 'Record<SwatchRole, [string, string]>', 'SwatchRole');

console.log(
	`built ${names.length} bundles: ${names.join(', ')}\n` +
		`${needed.size} tokens in closure, ${Object.keys(themeRules).length} themes ` +
		`(${Object.keys(themeRules).join(', ')})\n` +
		`theme catalogue: ${Object.keys(swatches).length} names, ` +
		`${Object.keys(CUSTOM_VARIANTS).length} variants, ${FUNCTIONAL.length} functional utilities`
);
```

---

### `packages/core/index.ts`

The finished plugin entry, replacing guide 2 step 11 entirely.

```ts
import plugin from 'tailwindcss/plugin';
import type { PluginAPI, PluginWithConfig } from 'tailwindcss/plugin';

import bundles from './generated/imports.js';
import variants from './generated/variants.js';
import properties from './generated/properties.js';
import registry from './generated/registry.js';
import theme from './generated/theme.js';
import base from './generated/base.js';
import shapeTokens from './generated/shape.js';
import themes from './generated/themes.js';
import functional from './generated/functional.js';
import { addPrefix } from './functions/addPrefix.js';
import type { PluginOptions, StyleObject } from './types.js';

/*
	The design system as a standalone Tailwind plugin.

	    @import 'tailwindcss';
	    @plugin '@anti049/lunar-ui' {
	      prefix: px-;
	      exclude: badge;
	    }

	No CSS import is needed: the design tokens the bundles depend on ship with
	the plugin (guide 14). Colours are registered through theme.extend so
	Tailwind also generates `bg-primary` and friends; the remaining tokens are
	emitted as plain custom properties.

	Options arrive already typed by Tailwind: `prefix: px-` is a string,
	`exclude: a, b` an array, bare true/false booleans, numbers numbers.
*/

/*
	Tailwind imports this type in its own declarations but never re-exports it,
	so the inferred type of the default export cannot be named. Restating it
	keeps the emitted .d.ts portable — without it, tsc writes a declaration
	referencing a path inside node_modules and consumers get a broken type.
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

const projectName: PluginWithOptions<PluginOptions> = plugin.withOptions(
	(options: PluginOptions = {}) => {
		const { prefix = '', include, exclude } = options;

		/*
			`[].concat(value)` normalises the single-string case: `exclude: badge`
			arrives as a string and `exclude: a, b` as an array, and you do not
			want two code paths. `include` wins when both are given — a rule to
			document rather than an error, because the combination is usually a
			leftover rather than a mistake.
		*/
		const included = (name: string): boolean => {
			if (include) return ([] as string[]).concat(include).includes(name);
			if (exclude) return !([] as string[]).concat(exclude).includes(name);
			return true;
		};

		/*
			Which theme palettes to ship. `default` is ALWAYS included: it sits at
			`:where(:root)` with zero specificity and supplies the tone steps every
			other theme falls back to for roles it does not set itself. Dropping it
			leaves the others with unresolved colours, which renders as nothing at
			all rather than as an error.
		*/
		const requested = options.themes === undefined ? null : ([] as string[]).concat(options.themes);
		const unknown = requested?.filter((name) => !(name in themes)) ?? [];
		if (unknown.length) {
			throw new Error(
				`lunar-ui: unknown theme${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}. ` +
					`Shipped themes: ${Object.keys(themes).join(', ')}. ` +
					`Define your own with @plugin '@anti049/lunar-ui/theme'.`
			);
		}
		const selectedThemes =
			requested === null ? Object.keys(themes) : [...new Set(['default', ...requested])];

		/*
			Shape tokens given on the plugin override the defaults globally. Only
			the known names are accepted: a typo would otherwise define a variable
			nothing reads, and silently change nothing — which is exactly the
			failure this whole project tries hardest to avoid.
		*/
		const shapeOverrides: Record<string, string> = {};
		const unknownTokens: string[] = [];
		for (const [key, value] of Object.entries(options)) {
			if (!key.startsWith('--')) continue;
			if (!shapeTokens.includes(key)) {
				unknownTokens.push(key);
				continue;
			}
			if (typeof value === 'string' || typeof value === 'number') {
				shapeOverrides[key] = String(value);
			}
		}
		if (unknownTokens.length) {
			throw new Error(
				`lunar-ui: unknown token${unknownTokens.length > 1 ? 's' : ''} ` +
					`${unknownTokens.join(', ')}. Settable here: ${shapeTokens.join(', ')}. ` +
					`Colour roles belong on a theme, via @plugin '@anti049/lunar-ui/theme'.`
			);
		}

		return (api: PluginAPI) => {
			/*
				ORDER MATTERS: tokens, then themes, then overrides, so each can be
				beaten by the next.
			*/

			// Design tokens, plus the @property registrations backing Tailwind's
			// --tw-* machinery. Both must be unconditional, hence addBase.
			api.addBase(asCssInJs(base));

			for (const name of selectedThemes) {
				for (const [selector, decls] of Object.entries(themes[name] ?? {})) {
					api.addBase({ [selector]: decls });
				}
			}

			if (Object.keys(shapeOverrides).length) api.addBase({ ':root': shapeOverrides });

			api.addBase(asCssInJs(addPrefix(properties, prefix, registry)));

			for (const [name, selector] of Object.entries(variants)) {
				api.addVariant(`${prefix}${name}`, selector);
			}

			const addUtilities = (utilities: Record<string, StyleObject>): void => {
				api.addUtilities(utilities as unknown as Record<string, CssInJs>);
			};

			const addBundleBase = (styles: StyleObject): void => {
				if (Object.keys(styles).length) api.addBase(asCssInJs(styles));
			};

			for (const [name, register] of Object.entries(bundles)) {
				if (!included(name)) continue;
				register({ addUtilities, addBase: addBundleBase, prefix });
			}

			/*
				Functional utilities (`tooltip-gap-*`). Authored in CSS as
				`@utility name-*`, which the plugin API cannot express — injecting
				the at-rule through addBase emits it verbatim and Tailwind never
				processes it — so they are re-registered here instead.
			*/
			for (const utility of functional) {
				if (!included(utility.bundle)) continue;

				/*
					Run the names through the same allowlist prefixer everything
					else uses, so `px-tooltip-gap-2` sets `--px-tooltip-gap`. The
					probe object exists only to be rewritten; its empty values are
					discarded.
				*/
				const probe = addPrefix(
					{ [`.${utility.name}`]: Object.fromEntries(utility.properties.map((p) => [p, ''])) },
					prefix,
					registry
				);
				const [selector, declarations] = Object.entries(probe)[0];
				const properties = Object.keys(declarations as StyleObject);

				/*
					matchUtilities does NOT accept bare numbers unless `values` is
					supplied — `tooltip-gap-2` simply does not match without it.

					Map back to `calc(var(--spacing) * n)` rather than the resolved
					rem: that keeps the output byte-identical to the CSS-first
					build, so the parity harness stays clean, and it keeps working
					if a consumer redefines --spacing.
				*/
				const values: Record<string, string> = {};
				if (utility.spacing) {
					const spacing = api.theme('spacing') as Record<string, string> | undefined;
					for (const step of Object.keys(spacing ?? {})) {
						// `px` and friends are not numbers; --value(number) rejects
						// them too, so the two paths agree.
						if (!/^\d+(\.\d+)?$/.test(step)) continue;
						values[step] = `calc(var(--spacing) * ${step})`;
					}
				}

				api.matchUtilities(
					{
						[selector.slice(1)]: (value: string) =>
							Object.fromEntries(properties.map((p) => [p, value]))
					},
					// `['any']`, not `['length']` — the latter rejects var().
					{ values, type: utility.arbitrary ? ['any'] : [] }
				);
			}
		};
	},
	/*
		The config half. Theme values are shared Tailwind namespaces, so they are
		deliberately NOT prefixed — `--color-primary` stays `--color-primary`
		whatever the prefix, or `bg-primary` would stop working.
	*/
	() => ({ theme: { extend: theme } })
);

export default projectName;
```

---

### `packages/core/test/unit/addPrefix.test.ts`

The prefixer is the one piece here with enough edge cases to deserve unit tests
rather than only the end-to-end assertions in [guide 12](12-testing.md).

```ts
import { expect, test } from 'bun:test';
import { addPrefix } from '../../functions/addPrefix.js';
import type { StyleObject } from '../../types.js';

const registry = { classes: ['button', 'badge'], variables: ['button-color'] };

/*
	Annotated as StyleObject in BOTH directions, deliberately.

	addPrefix is generic — `<T extends StyleObject>(styles: T) => T` — so passing
	an object literal makes the return type that same literal, and `toEqual` then
	rejects the renamed keys with "Object literal may only specify known
	properties". StyleObject carries an index signature, so the renamed keys are
	assignable and the assertion compiles.
*/
const px = (styles: StyleObject): StyleObject => addPrefix(styles, 'px-', registry);

test('renames a class it owns', () => {
	expect(px({ '.button': { color: 'red' } })).toEqual({ '.px-button': { color: 'red' } });
});

test('leaves a class it does not own', () => {
	// `.disabled` is the consumer's state hook, not ours.
	expect(px({ '.button.disabled': {} })).toEqual({ '.px-button.disabled': {} });
});

test('does not rename inside an attribute value', () => {
	// The dot in 'x.button' is not a class.
	const out = px({ "[data-state='x.button']": {} });
	expect(Object.keys(out)[0]).toBe("[data-state='x.button']");
});

test('does not treat an escaped slash as a new class', () => {
	// Real compiled output contains `.w-1\/2`; naive matching sees `/2`.
	const out = px({ '.w-1\\/2 .button': {} });
	expect(Object.keys(out)[0]).toBe('.w-1\\/2 .px-button');
});

test('survives a comment containing an apostrophe', () => {
	// A regex-based prefixer opens a quote here that never closes, and every
	// class after it is silently skipped.
	const out = px({ "/* it's fine */ .button": {} });
	expect(Object.keys(out)[0]).toContain('.px-button');
});

test('renames a variable it owns, in both key and value', () => {
	expect(px({ '.button': { '--button-color': 'red', color: 'var(--button-color)' } })).toEqual({
		'.px-button': { '--px-button-color': 'red', color: 'var(--px-button-color)' }
	});
});

test('leaves Tailwind theme variables alone', () => {
	// Not in the registry, so not ours to rename.
	expect(px({ '.button': { color: 'var(--color-primary)' } })).toEqual({
		'.px-button': { color: 'var(--color-primary)' }
	});
});

test('renames the variable an @property registers', () => {
	// The one at-rule whose params are a variable name.
	const out = px({ '@property --button-color': { syntax: "'<color>'" } });
	expect(Object.keys(out)[0]).toBe('@property --px-button-color');
});

test('leaves other at-rules untouched', () => {
	const out = px({ '@media (width < 620px)': { '.button': {} } });
	expect(Object.keys(out)[0]).toBe('@media (width < 620px)');
	expect(Object.keys(out['@media (width < 620px)'] as StyleObject)[0]).toBe('.px-button');
});

test('an empty prefix returns the input unchanged', () => {
	// Identity, not a copy: addPrefix returns early so no object is allocated.
	const input: StyleObject = { '.button': { color: 'red' } };
	expect(addPrefix(input, '', registry)).toBe(input);
});
```

---

## Traps

> **You prefix by denylist rather than allowlist.** It works until a consumer
> has a class whose name collides with one of yours, or until Tailwind adds a
> utility you did not think to exclude. The failure is a renamed class in the
> consumer's own markup, which looks like their bug.

> **Your prefixer is a regex.** Quoted attribute values, escaped selectors like
> `.w-1\/2`, and comments all break it, and all produce plausible-looking CSS
> rather than an error. The character loop in step 3 is not over-engineering.

> **You prefix `@property` like any other at-rule.** Its params name a variable,
> so the registration and the usage drift apart and every `--tw-*`-style
> animation of that property stops working under a prefix.

> **You prefix theme values.** `--color-primary` becomes `--px-color-primary`,
> `bg-primary` stops working, and you have forked Tailwind's namespace rather
> than renamed your own.

> **You drop the default theme when `themes` is given.** Every other theme loses
> the tone steps it inherits, and the result renders as absent colour rather
> than as an error.

> **`matchUtilities` without `values`.** Arbitrary values (`tooltip-gap-[3px]`)
> work and bare numbers (`tooltip-gap-2`) do not, which reads as an inconsistent
> API rather than a missing option.

> **`include`/`exclude` not applied to functional utilities.** `exclude: tooltip`
> removes the static tooltip classes and leaves `tooltip-gap-*` registered, so a
> bundle you excluded still contributes CSS.

> **An option that warns instead of throwing.** Tailwind ignores unread options,
> so a warning in a build log nobody reads is the same as no feedback at all.
> Every unknown option, token and theme name throws.

---

## Commit

Verify, then commit:

```powershell
bun run --filter '@anti049/test' check
git add -A
git commit -m "feat(core): add prefix, include/exclude and theme options"
```

Needs a changeset, and this is the one to word most carefully: option names
become public API the moment they publish, and renaming one later is a
breaking change ([guide 13](13-release.md), step 6).

---

## Checkpoint

Every option fails silently when wrong, so each gets a compile of its own from
a packed tarball, plus one compile that combines them.

Rebuild the plugin skeleton from
[guide 2's checkpoint](02-plugin.md#the-plugin-skeleton), then:

```powershell
function Compile($name, $body) {
	"@import 'tailwindcss' source(none);`n$body" | Set-Content "src/$name.css"
	node $cli -i "src/$name.css" -o "out/$name.css" 2>&1 | Out-Null
	$script:code = $LASTEXITCODE
	if (Test-Path "out/$name.css") { Get-Content "out/$name.css" -Raw } else { '' }
}
function Count($css, $pattern) { ([regex]::Matches($css, $pattern)).Count }

# prefix: owned classes renamed, unprefixed ones gone, Tailwind's namespace untouched.
$css = Compile prefix "@plugin '@anti049/test' { prefix: px-; }`n@source inline('px-badge');`n@source inline('badge');"
Count $css '\.px-badge\b'        # > 0
Count $css '\.badge\b'           # 0
Count $css '--px-color-'         # 0

# include / exclude: the named bundles, and only those.
$css = Compile include "@plugin '@anti049/test' { include: badge; }`n@source inline('badge');`n@source inline('button');"
Count $css '\.badge\b'           # > 0
Count $css '\.button\b'          # 0
$css = Compile exclude "@plugin '@anti049/test' { exclude: badge; }`n@source inline('badge');`n@source inline('button');"
Count $css '\.badge\b'           # 0
Count $css '\.button\b'          # > 0

# themes: `default` is kept even when not listed.
$css = Compile themes "@plugin '@anti049/test' { themes: dracula; }"
Count $css "data-theme='dracula'"                                  # > 0
Count $css "data-theme='default'|:root:not\(\[data-theme\]\)"     # > 0 — default still there

# --token: the override reaches :root.
$css = Compile token "@plugin '@anti049/test' { --radius-field: 0.75rem; }"
Count $css '--radius-field:\s*0\.75rem'   # > 0

# Functional utilities keep the var(--spacing) link and accept arbitrary values.
$css = Compile functional "@plugin '@anti049/test';`n@source inline('tooltip-gap-2');`n@source inline('tooltip-gap-[var(--x)]');"
Count $css 'calc\(var\(--spacing\) \* 2\)'   # > 0
Count $css 'var\(--x\)'                      # > 0

# Every mistake fails the build, and the message names it.
'prefx: x-;', 'themes: nope;', '--radius-feild: 0;' | ForEach-Object {
	Compile bad "@plugin '@anti049/test' { $_ }" | Out-Null
	"$_ -> exit $code"                         # non-zero, every one
}

Pop-Location
Remove-Item -Recurse -Force "$env:TEMP\test-checkpoint"
```

Run one of the failing compiles by hand to read the message — `node $cli -i
src/bad.css -o out/bad.css` — and check it names the option and lists the
valid ones.

**Passes when** every line prints what its comment says. Substitute a theme,
a bundle and a functional utility you actually ship where these differ.

**If it does not:** a prefixed `--px-color-*` variable is the trap in step 4.
An exclude that leaves the bundle in place usually means its rules arrived
through `addBase` rather than through the bundle's registrar. An option typo
that exits zero is the one result this guide exists to make impossible.

---

The plugin is complete. Back to the bindings, which are written against what
it now exports.

Next: [Bindings: the shared contract](03-bindings.md)
