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
@plugin '@scope/project-name' {
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
		`project-name: unknown theme${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}. ` +
			`Shipped themes: ${Object.keys(themes).join(', ')}. ` +
			`Define your own with @plugin '@scope/project-name/theme'.`
	);
}
const selectedThemes =
	requested === null ? Object.keys(themes) : [...new Set(['default', ...requested])];
```

`default` is added back unconditionally. It sits at `:where(:root)` with zero
specificity and supplies the tone steps every other theme falls back to for
roles it does not set, so dropping it leaves the others with unresolved colours
— which renders as nothing, not as an error. See [guide 14](14-themes.md),
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
		`project-name: unknown token${unknownTokens.length > 1 ? 's' : ''} ` +
			`${unknownTokens.join(', ')}. Settable here: ${shapeTokens.join(', ')}. ` +
			`Colour roles belong on a theme, via @plugin '@scope/project-name/theme'.`
	);
}
```

`shapeTokens` is the generated `SETTABLE_SHAPE_TOKENS` from
[guide 15](15-tokens.md), step 10 — including the _derived_ tokens that have no
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
bun run --filter '@scope/project-name' check
git add -A
git commit -m "feat(core): add prefix, include/exclude and theme options"
```

Needs a changeset, and this is the one to word most carefully: option names
become public API the moment they publish, and renaming one later is a
breaking change ([guide 13](13-release.md), step 6).
---

Back to the [index](../README.md)
