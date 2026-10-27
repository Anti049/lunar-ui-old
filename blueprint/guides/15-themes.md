# 15. Themes — generated palettes, catalogue, generator page

[Guide 2](02-plugin.md) built a plugin that ships components. This one builds the
second half of the product: a `@plugin '.../theme'` entry that generates a whole
palette from one colour, a catalogue export so JavaScript can list themes, and
the docs page that previews both.

It builds directly on [guide 14](14-tokens.md): the mode layer, the token
closure and `collect-tokens.ts` all have to exist first. Do 14 before this one.

Fourteen steps.

---

## 1. Understand the three-layer colour architecture

Everything in this guide follows from one decision: **a theme supplies tone
steps and nothing else.**

```text
layer 1   src/themes/<name>.css       --theme-color-primary-40: #0058ca
          tone steps. One theme = one set of these. 10 palettes × 30 tones.
                    │
layer 2   src/base/modes.css          --theme-color-primary:
          semantic roles                light-dark(var(--theme-color-primary-40),
                                                   var(--theme-color-primary-80))
                    │
layer 3   src/base/palette.css        --color-primary: var(--theme-color-primary)
          Tailwind namespace          (inside @theme inline — gives you bg-primary)
```

A component references `--color-primary`. That resolves to
`--theme-color-primary`, which resolves through `light-dark()` to a tone step,
which is finally a hex literal supplied by whichever theme is active.

Why it is worth the three hops:

- **A theme is data.** Adding one means adding 300 declarations and no logic —
  which is exactly what a generator can produce.
- **Light and dark are not separate themes.** One theme covers both, because the
  mode layer picks the step. That halves the number of themes and makes
  "catppuccin in dark mode" mean something.
- **Consumers get real Tailwind utilities.** Layer 3 is what turns your colours
  into `bg-primary` and `text-on-surface` rather than bare custom properties.

The cost is that a broken link anywhere in the chain produces a colour that is
simply absent, with no error. Step 14's tests exist for that.

---

## 2. Author the mode layer

**`packages/core/src/base/modes.css`** — new file. Every semantic role, as a
`light-dark()` pair:

```css
/*
	Semantic mode tokens.

	Each role resolves to a light/dark pair via CSS light-dark(), which reads the
	element's used `color-scheme` value and returns the matching tone step.
*/
:root,
[data-theme] {
	--theme-color-primary: light-dark(var(--theme-color-primary-40), var(--theme-color-primary-80));
	--theme-color-on-primary: light-dark(
		var(--theme-color-primary-100),
		var(--theme-color-primary-20)
	);
	--theme-color-primary-container: light-dark(
		var(--theme-color-primary-90),
		var(--theme-color-primary-30)
	);
	/* … on-primary-container, secondary, tertiary, error, surface, outline … */
}
```

The selector list matters. `:root` alone would not apply inside a subtree
themed with `[data-theme]`, because the tone steps there are declared on the
subtree and `var()` resolves **where the property is declared** — so a role
declared only at `:root` would read the root's steps, not the subtree's.

`light-dark()` is inert without `color-scheme`, so declare it too —
**`packages/core/src/base/color-scheme.css`** — new file.

```css
:root {
	color-scheme: light dark;
}
.light {
	color-scheme: light;
}
.dark {
	color-scheme: dark;
}
```

`light dark` at the root means "follow the OS unless told otherwise", and the
two classes are the override. Consumers put `.dark` on `<html>` or on any
subtree.

---

## 3. Ship a default theme, and make it the fallback

**`packages/core/src/themes/default.css`** — new file. Add it to
`src/themes/_index.css` as well, or the build never reads it.

```css
:where(:root),
[data-theme='default'] {
	--theme-color-primary-0: #000000;
	--theme-color-primary-2: #00061c;
	/* … 300 more … */
}
```

`:where(:root)` is **zero specificity**, deliberately. Every other theme is
`[data-theme='x']` at (0,1,0), so any theme beats the default on every role it
declares — and inherits the default for every role it does not.

That inheritance is the whole reason hand-written themes are practical. A theme
like `dracula` declares about forty semantic roles directly and lets the default
supply the several hundred tone steps underneath. Without it, every theme would
have to be complete.

**The default theme is not optional.** When you add an `include`-style option
for themes ([guide 16](16-options.md), step 6), always add `default` back in —
**`packages/core/index.ts`**:

```ts
const selected = requested === null ? Object.keys(themes) : [...new Set(['default', ...requested])];
```

Drop it and every other theme is left with unresolved colours for whatever it
did not set — which renders as nothing at all, not as an error.

---

## 4. Add the colour-science dependency

```powershell
cd packages/core
bun add @material/material-color-utilities
```

It is the right choice here for three reasons: zero dependencies of its own, no
Node builtins (so it runs in a browser, which step 12 needs), and it implements
the Material 3 scheme algorithms rather than approximating them.

One thing to know before you build on it: **its internal imports are
extensionless** (`import { Hct } from './hct'`). That is valid to a bundler and
invalid to Node's ESM resolver, so anything server-rendering your docs site will
fail with `ERR_MODULE_NOT_FOUND` until you add it to `ssr.noExternal`
([guide 7](07-docs.md), step 8). Plan for it now rather than debugging it later.

It is also why step 11 splits the catalogue export from the generator export.

---

## 5. Write the palette generator

**`packages/core/functions/generateTheme.ts`** — new file. Steps 6 and 7
append to it.

This file is pure — no Node, no Tailwind, no filesystem — because the docs site
runs it in the browser. Keep it that way; step 12 depends on it.

```ts
import {
	Blend,
	Hct,
	TonalPalette,
	argbFromHex,
	hexFromArgb,
	SchemeContent,
	SchemeExpressive,
	SchemeFidelity,
	SchemeFruitSalad,
	SchemeMonochrome,
	SchemeNeutral,
	SchemeRainbow,
	SchemeTonalSpot,
	SchemeVibrant
} from '@material/material-color-utilities';
import type { DynamicScheme } from '@material/material-color-utilities';

/** The tone steps your themes declare. Material's standard set. */
const TONES = [
	0, 2, 4, 5, 6, 10, 12, 17, 20, 22, 24, 30, 40, 50, 60, 65, 70, 75, 80, 84, 87, 90, 92, 94, 95, 96,
	97, 98, 99, 100
] as const;

type SchemeConstructor = new (source: Hct, isDark: boolean, contrast: number) => DynamicScheme;

const VARIANTS: Record<string, SchemeConstructor> = {
	vibrant: SchemeVibrant,
	tonalspot: SchemeTonalSpot,
	content: SchemeContent,
	expressive: SchemeExpressive,
	fidelity: SchemeFidelity,
	fruitsalad: SchemeFruitSalad,
	monochrome: SchemeMonochrome,
	neutral: SchemeNeutral,
	rainbow: SchemeRainbow
};

export const VARIANT_NAMES = Object.keys(VARIANTS);

/** Normalises "Tonal Spot", "tonal-spot" and "tonalspot" to the same key. */
const normaliseVariant = (v: string): string => v.toLowerCase().replace(/[^a-z]/g, '');

const toneSteps = (palette: TonalPalette, name: string): Record<string, string> =>
	Object.fromEntries(
		TONES.map((tone) => [`--theme-color-${name}-${tone}`, hexFromArgb(palette.tone(tone))])
	);
```

Then the generator itself, appended to the same file:

```ts
export function generateThemePalette(options: GenerateThemeOptions): Record<string, string> {
	const requested = options.variant ? normaliseVariant(options.variant) : 'vibrant';
	const Scheme = VARIANTS[requested];
	if (!Scheme) {
		throw new Error(
			`test: unknown theme variant "${options.variant}". ` +
				`Expected one of: ${VARIANT_NAMES.join(', ')}.`
		);
	}

	let source: Hct;
	try {
		source = Hct.fromInt(argbFromHex(options.seeds.primary));
	} catch {
		throw new Error(`test: could not parse seed colour "${options.seeds.primary}".`);
	}

	// Light mode, always. Tone steps do not depend on light/dark — the mode
	// layer picks per mode with light-dark() — so one scheme gives both.
	const scheme = new Scheme(source, false, options.contrast ?? 0);
	// … palettes, below …
}
```

Two decisions to copy:

**Construct the scheme in light mode only.** Material's schemes take an
`isDark` flag, but you are not asking it for finished colours — you are asking
it for _palettes_, and a palette's tone 40 is tone 40 in either mode. Generating
twice would produce two sets of steps and there is nowhere to put the second.

**Pick a default variant that matches your shipped themes.** Whichever generator
produced your hand-written default theme, one of the nine will land closest to
it. Check by generating from the same seed and diffing tone 40 of each palette
against the committed file. Expect a near match, not an identical one.

---

## 6. Add per-role seeds

One seed is not enough in practice — brands have a fixed secondary, or an error
red that legal signed off on. Let any palette be pinned while the rest stay
derived.

**`packages/core/functions/generateTheme.ts`** — append the declarations below
above `generateThemePalette()`, and put the loop inside it.

```ts
/** The palettes Material derives from the scheme, and what reads each one. */
export const CORE_PALETTES = [
	{ token: 'primary', of: (s: DynamicScheme) => s.primaryPalette },
	{ token: 'secondary', of: (s: DynamicScheme) => s.secondaryPalette },
	{ token: 'tertiary', of: (s: DynamicScheme) => s.tertiaryPalette },
	{ token: 'neutral', of: (s: DynamicScheme) => s.neutralPalette },
	{ token: 'neutral-variant', of: (s: DynamicScheme) => s.neutralVariantPalette },
	{ token: 'error', of: (s: DynamicScheme) => s.errorPalette }
] as const;

export interface ThemeSeeds {
	primary: string; // required — it seeds the scheme
	secondary?: string;
	tertiary?: string;
	neutral?: string;
	'neutral-variant'?: string;
	error?: string;
	success?: string;
	warning?: string;
	alert?: string;
	info?: string;
}

export const SEED_ROLES: readonly (CorePalette | StatusPalette)[] = [
	...CORE_PALETTES.map((p) => p.token),
	...(Object.keys(STATUS_HUES) as StatusPalette[])
];

/** The `@plugin` option that seeds a role. */
export const seedOption = (role: CorePalette | StatusPalette): string => `seed-${role}`;
```

The loop goes **inside `generateThemePalette()`**, and contains the one line in
this guide most worth reading twice:

```ts
for (const palette of CORE_PALETTES) {
	/*
		`primary` is the scheme's source, not an override of it. Taking it from
		the scheme is what lets `variant` shape it — read straight from the seed
		instead and every variant returns the same primary palette, with only the
		other roles changing.
	*/
	const override = palette.token === 'primary' ? undefined : seeds[palette.token];
	if (override === undefined) {
		Object.assign(declarations, toneSteps(palette.of(scheme), palette.token));
		continue;
	}
	Object.assign(
		declarations,
		toneSteps(TonalPalette.fromInt(argbFromHex(override)), palette.token)
	);
}
```

**Why the CSS spelling is flat.** `ThemeSeeds` is a nested object and a `@plugin`
body cannot express one — Tailwind rejects `seeds: { primary: … }` with
"Unexpected `@plugin` option". So CSS names one key per role — this is what a
**consumer** writes, not a file of yours:

```css
@plugin '@anti049/test/theme' {
	name: brand;
	seed-primary: #0956aa;
	seed-secondary: #52e2ac;
}
```

`seed-primary` and the `seeds` object are **one shape with two spellings**, not
two ways to configure a theme. Step 8 folds the flat keys back into the object
before anything else reads them.

---

## 7. Add status palettes and harmonization

Material covers primary/secondary/tertiary/neutral/neutral-variant/error. A
design system generally needs success, warning, info and alert too, and those
have meanings — success is green whatever your brand is.

**`packages/core/functions/generateTheme.ts`** — append.

```ts
export const STATUS_HUES = {
	success: '#006c49',
	warning: '#88512c',
	info: '#29657d',
	alert: '#993297'
} as const;
```

Used raw, a green success against a blue-seeded theme reads as two unrelated
palettes. `Blend.harmonize` rotates a colour toward a target hue by at most 15
degrees — enough to make it belong, not enough to stop it being green. Inside
`generateThemePalette()`, after the core-palette loop:

```ts
const harmonize = options.harmonize ?? true;
for (const name of Object.keys(STATUS_HUES) as StatusPalette[]) {
	const hex = seeds[name] ?? STATUS_HUES[name];
	const argb = argbFromHex(hex);
	const resolved = harmonize ? Blend.harmonize(argb, source.toInt()) : argb;
	Object.assign(declarations, toneSteps(TonalPalette.fromInt(resolved), name));
}
```

Two rules worth stating in your own docs, because they surprise people:

- **Core seeds are exact, status seeds are harmonized.** Pinning a core palette
  means "I want this colour". Pinning a status hue means "start from here" — so
  harmonization still applies to a seed you supplied, not just to the defaults.
- **`harmonize: false` is the escape hatch** for a brand colour that must be
  reproduced exactly.

---

## 8. Write the options layer

**`packages/core/functions/buildTheme.ts`** — new file, assembled from the four
pieces in this step.

Everything between "a `@plugin` body" and "a set of declarations", split out of
the plugin entry so the docs generator can call exactly the same code.

**Normalise key spelling.** Tailwind hands the body over verbatim, so
`seedPrimary` and `seed-primary` are different strings. **`buildTheme.ts`**,
piece 1 of 4:

```ts
const kebab = (k: string): string => k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function normaliseKeys(options: ThemeOptions): ThemeOptions {
	const out: ThemeOptions = {};
	for (const [key, value] of Object.entries(options)) {
		// `--theme-color-*` are CSS property names, not option names. Case is
		// significant; leave them exactly as written.
		out[key.startsWith('--') ? key : kebab(key)] = value;
	}
	return out;
}
```

**Collect seeds, with precedence.** Three ways in, so a stylesheet written
against the single-seed version keeps working. **`buildTheme.ts`**, piece 2 of 4:

```ts
function collectSeeds(options: ThemeOptions): ThemeSeeds | null {
	const seeds: Partial<ThemeSeeds> = {};

	if (typeof options.seed === 'string') seeds.primary = options.seed; // legacy shorthand
	for (const role of SEED_ROLES) {
		const value = options[seedOption(role)]; // seed-primary, seed-error, …
		if (typeof value === 'string') seeds[role] = value;
	}
	const given = options.seeds; // the object, from JavaScript
	if (given && typeof given === 'object') {
		for (const [role, value] of Object.entries(given)) {
			if (typeof value === 'string') seeds[role as keyof ThemeSeeds] = value;
		}
	}

	if (typeof seeds.primary !== 'string') {
		const named = SEED_ROLES.filter((r) => typeof seeds[r] === 'string');
		if (named.length) {
			throw new Error(
				`test: ${named.map(seedOption).join(', ')} given without ` +
					`\`${seedOption('primary')}\`. The primary seed builds the scheme every ` +
					`other palette is derived from, so it is required.`
			);
		}
		return null; // a hand-declared theme, not a generated one
	}
	return seeds as ThemeSeeds;
}
```

Returning `null` rather than throwing is what lets one entry point serve both
generated and hand-written themes.

**Reject unknown options, with a suggestion.** Tailwind ignores an option a
plugin does not read, so a typo looks exactly like a colour that refused to
apply. **`buildTheme.ts`**, piece 3 of 4:

```ts
function rejectUnknownOptions(options: ThemeOptions, name: string): void {
	const valid = new Set([...KNOWN_OPTIONS, ...SEED_ROLES.map(seedOption)]);
	const unknown = Object.keys(options).filter((k) => !k.startsWith('--') && !valid.has(k));
	if (!unknown.length) return;

	const suggestions = unknown.map((key) => {
		const asSeed = seedOption(key as never);
		return valid.has(asSeed) ? `${key} (did you mean \`${asSeed}\`?)` : key;
	});
	throw new Error(
		`test: theme "${name}" sets unknown option${unknown.length > 1 ? 's' : ''} ` +
			`${suggestions.join(', ')}. Valid options: ${[...valid].join(', ')}, ` +
			`plus any \`--theme-color-*\` role.`
	);
}
```

The `did you mean` branch pays for itself the first time you rename `success:`
to `seed-success:`.

**Assemble, generated first** — **`buildTheme.ts`**, piece 4 of 4:

```ts
export function buildThemeDeclarations(raw: ThemeOptions): Record<string, string> {
	const options = normaliseKeys(raw);
	const name = themeName(options); // throws if absent
	rejectUnknownOptions(options, name);
	const declarations: Record<string, string> = {};

	const seeds = collectSeeds(options);
	if (seeds) {
		Object.assign(declarations, generateThemePalette({ seeds /* …variant, contrast… */ }));
	} else if (options.variant !== undefined) {
		throw new Error(`test: theme "${name}" sets \`variant\` but no \`${seedOption('primary')}\`.`);
	}

	// Hand-declared roles win over anything generated.
	for (const [key, value] of Object.entries(options)) {
		if (key.startsWith('--') && (typeof value === 'string' || typeof value === 'number')) {
			declarations[key] = String(value);
		}
	}

	if (Object.keys(declarations).length === 0) {
		throw new Error(`test: theme "${name}" defines no colours.`);
	}

	const colorScheme = options['color-scheme'];
	if (typeof colorScheme === 'string') declarations['color-scheme'] = colorScheme;

	return declarations;
}
```

Generated first, hand-declared second, so "generate a palette then override two
roles" works — which is the most common real request.

---

## 9. Get the default theme's selector right

**`packages/core/functions/buildTheme.ts`** — append, at the end.

```ts
export function themeSelectors(options: ThemeOptions): string[] {
	const selectors = [`[data-theme='${themeName(options)}']`];
	if (options.default) selectors.push(':root:not([data-theme])');
	return selectors;
}
```

`:root:not([data-theme])`, **never plain `:root`**. `:root` is specificity
(0,1,0) — identical to `[data-theme='x']` — so which one wins comes down to
emission order, and a default declared after another theme beats that theme and
makes it impossible to apply. Nothing errors; the user picks a theme and the
page does not change.

`:not([data-theme])` says what is actually meant: the default applies where no
theme has been chosen, so it never competes, whatever the order.

---

## 10. Write the theme plugin entry

**`packages/core/theme.ts`** — new file at the package root, a second entry
point alongside `index.ts`. Add it to `tsconfig.build.json`'s `include` too,
or `tsc` never emits it.

```ts
import plugin from 'tailwindcss/plugin';
import type { PluginAPI } from 'tailwindcss/plugin';
import {
	buildThemeDeclarations,
	themeSelectors,
	type ThemeOptions
} from './functions/buildTheme.js';

const projectNameTheme = plugin.withOptions((options: ThemeOptions = {}) => {
	const declarations = buildThemeDeclarations(options);
	const selectors = themeSelectors(options);

	return ({ addBase }: PluginAPI) => {
		for (const selector of selectors) addBase({ [selector]: declarations });
	};
});

export default projectNameTheme;
```

**`packages/core/package.json`** — add two entries to the `exports` map you
wrote in [guide 1](01-monorepo.md) step 9:

```jsonc
"./theme":  { "types": "./dist/theme.d.ts",  "default": "./dist/theme.js" },
"./themes": { "types": "./dist/themes.d.ts", "default": "./dist/themes.js" }
```

**One `@plugin` call per theme** is not a limitation you are working around — it
is the only shape available. Tailwind hands option bodies over as flat scalars,
so several themes cannot be nested under one call. Two themes is two calls, in
the **consumer’s** stylesheet:

```css
@plugin '@anti049/test/theme' {
	name: brand;
	seed-primary: #0956aa;
	default: true;
}
@plugin '@anti049/test/theme' {
	name: brand-dark;
	seed-primary: #0956aa;
	color-scheme: dark;
}
```

---

## 11. Build the catalogue export

An app needs to render a theme picker without hard-coding names or reading
computed styles off the DOM. That means shipping data.

Three files: a build-time extractor, and two runtime entry points that are
deliberately kept apart.

**`packages/core/functions/extract-swatches.ts`** — new file, build-time only.

```ts
/** The roles a swatch shows. Enough to recognise a theme, not a full palette. */
export const SWATCH_ROLES = ['primary', 'secondary', 'tertiary', 'surface', 'on-surface'] as const;

/**
 * Which tone step each role reads in each mode.
 *
 * Read from modes.css rather than hard-coded: the roles are declared there as
 * light-dark(var(a), var(b)), and that pairing is the only thing that says
 * which step a mode uses. A hand-copied table would drift the first time a role
 * was re-pointed.
 */
export function modeMapping(modesCss: string): Record<SwatchRole, [string, string]> {
	const flat = modesCss.replace(/\s+/g, ' ');
	const mapping = {} as Record<SwatchRole, [string, string]>;
	for (const role of SWATCH_ROLES) {
		const pattern = new RegExp(
			`--theme-color-${role}:\\s*light-dark\\(\\s*var\\((--[\\w-]+)\\)\\s*,\\s*var\\((--[\\w-]+)\\)\\s*\\)`
		);
		const found = pattern.exec(flat);
		if (!found) {
			throw new Error(
				`test: modes.css does not declare --theme-color-${role} as a ` +
					`light-dark() pair, so its swatch cannot be resolved for both modes.`
			);
		}
		mapping[role] = [found[1], found[2]];
	}
	return mapping;
}
```

Deriving the mapping instead of writing it down is the same rule as everywhere
else in this project, and here it also gives you a **build-time assertion that
the mode layer is intact** — re-point a role at a different step and either the
mapping follows or the build fails.

Resolving a theme handles two shapes — same file, inside the swatch resolver:

```ts
for (const role of SWATCH_ROLES) {
	/*
		`catppuccin` and `dracula` declare each role outright, so the value is
		already the answer. `default` and any generated theme declare tone steps,
		and the role is whichever step modes.css pairs with this mode.
	*/
	const value = decls[`--theme-color-${role}`] ?? decls[mapping[role][mode]];
	if (value === undefined) return null; // not swatchable; skip rather than half-fill
	out[role] = value;
}
```

**Report both modes for every theme.** A swatch sits next to a theme's name and
has to look like that theme whichever mode the page is in, so one value per
theme would be wrong half the time. A theme that does not vary by mode reports
the same colours twice rather than inventing a variant.

Then emit `generated/swatches.ts` and `generated/mode-map.ts` from `build.ts`,
and split the runtime surface **in two** — **`packages/core/themes.ts`** (new)
and **`packages/core/theme.ts`** (from step 10):

```ts
// themes.ts — data only. No dependencies at all.
export const THEME_NAMES: string[] = Object.keys(swatches);
export const THEME_SWATCHES: Record<string, ThemeSwatches> = swatches;

// theme.ts — needs material-color-utilities, because it generates.
export function swatchesFor(options: ThemeOptions): ThemeSwatches {
	/* buildThemeDeclarations, then pick per mode via mode-map */
}
```

That split is the point. A theme picker importing `/themes` costs nothing and
works in any runtime; only an app that generates its _own_ theme pays for the
colour-science dependency — and that is the one that would otherwise break SSR.

`THEME_NAMES` can only list what ships. A theme declared with
`@plugin '.../theme'` lives in the consumer's stylesheet and the plugin runs at
compile time, so nothing in the package can discover it at runtime. Document the
concatenation — this is consumer code, for your README:

```ts
const brand = swatchesFor({ name: 'brand', 'seed-primary': '#52e2ac' });
const names = [...THEME_NAMES, 'brand'];
```

---

## 12. Build the docs generator page

The payoff: a page where you pick a seed and get copyable CSS.

The rule that makes it worth having — **it calls the plugin's own
`buildThemeDeclarations`, not a copy of it.** What it shows is what `@plugin`
emits, rather than a reimplementation that drifts.

**`packages/docs/src/routes/themes/+page.svelte`** — new file.

```svelte
<script lang="ts">
	/*
		Straight from the plugin's source, by relative path. These modules are not
		in the plugin's `exports`, so the package name cannot reach them, and an
		alias would need configuring in both Vite and TypeScript. `server.fs.allow`
		in vite.config.ts already lets Vite serve the file.
	*/
	import { buildThemeDeclarations, themeSelectors } from '../../../../core/functions/buildTheme.js';
	import { VARIANT_NAMES } from '../../../../core/functions/generateTheme.js';

	let name = $state('brand');
	let seed = $state('#0956AA');
	let variant = $state('vibrant');
	let harmonize = $state(true);

	const options = $derived({ name, 'seed-primary': seed, variant, harmonize });

	/*
		A half-typed seed throws, and the field changes on every keystroke, so the
		failure is expected rather than exceptional. Catch it and render it.
	*/
	const attempt = $derived.by(() => {
		try {
			return { declarations: buildThemeDeclarations(options), error: null };
		} catch (error) {
			return { declarations: null, error: error instanceof Error ? error.message : String(error) };
		}
	});

	/*
		Hold the last palette that built, so an invalid seed leaves the preview
		standing rather than blanking it while you type.

		The remembering happens in an $effect, not inside the $derived above: a
		derived must stay pure, and assigning state from one throws
		`state_unsafe_mutation` at runtime. Neither SSR nor the build catches it.
	*/
	let lastGood = $state<Record<string, string>>({});
	$effect(() => {
		if (attempt.declarations) lastGood = attempt.declarations;
	});

	const declarations = $derived(attempt.declarations ?? lastGood);

	// Apply the palette by inlining it as custom properties on a wrapper.
	const previewStyle = $derived(
		Object.entries(declarations)
			.map(([property, value]) => `${property}:${value}`)
			.join(';')
	);
</script>
```

Four things that came out of building it:

- **No debouncing.** A full 300-declaration palette generates in about 2 ms,
  inside a frame. Regenerating straight from the derived keeps the preview exact
  rather than trailing the controls.
- **Preview by inline custom properties**, not by injecting a stylesheet. The
  wrapper's `style` attribute carries the whole palette, so the components
  inside pick it up through the normal cascade and nothing leaks to the rest of
  the page.
- **Offer both output formats** — the `@plugin` call (what most people want) and
  the expanded CSS (for people not using the plugin). Generate the second from
  `themeSelectors` so it carries the same `:root:not([data-theme])` logic.
- **Do not offer `seed-primary` as a per-role field.** It is the "Seed colour"
  field already; listing it among the core overrides emits it twice.

---

## 13. Wire the new exports into the docs site

[Guide 7](07-docs.md) deliberately left three holes for this guide to fill. The
docs site will not start without all three, and two of them fail in ways that
do not mention themes.

**`packages/docs/vite.config.ts`** — one more alias entry per new subpath:

```ts
const themeEntry = fileURLToPath(new URL('../core/theme.ts', import.meta.url));
const themesEntry = fileURLToPath(new URL('../core/themes.ts', import.meta.url));

// …inside resolve.alias, in the `command === 'serve'` branch:
{ find: /^@anti049\/test\/theme$/, replacement: themeEntry },
{ find: /^@anti049\/test\/themes$/, replacement: themesEntry }
```

Miss one and that export resolves to `dist/` in dev and to source in build, so
you end up with two copies of the module and a theme that applies in one and not
the other.

**`packages/docs/vite.config.ts`** — the SSR entry:

```ts
ssr: {
	// material-color-utilities imports its own files without extensions, which
	// is valid to a bundler and invalid to Node — and Vite's SSR runs on Node.
	noExternal: ['@material/material-color-utilities'];
}
```

Without it the dev server fails on the first server render with
`ERR_MODULE_NOT_FOUND` naming a path inside `node_modules` that obviously
exists, with `.js` missing from the end.

**`packages/docs/src/app.css`** — the theme block guide 7 left as a comment:

```css
@plugin '@anti049/test/theme' {
	name: brand;
	seed-primary: #0956aa;
}
```

---

## 14. Verify

Unit tests, in `test/unit/buildTheme.test.ts` and `swatches.test.ts`. These five
each pin a bug that is invisible from the outside.

**`packages/core/test/unit/buildTheme.test.ts`** — new file:

```ts
test('variant reshapes the primary palette', () => {
	const vibrant = buildThemeDeclarations({ name: 't', 'seed-primary': '#0956aa' });
	const neutral = buildThemeDeclarations({
		name: 't',
		'seed-primary': '#0956aa',
		variant: 'neutral'
	});
	// Fails if `primary` is read back as a palette override — every variant
	// would otherwise return an identical primary.
	expect(vibrant['--theme-color-primary-40']).not.toBe(neutral['--theme-color-primary-40']);
});

test('a core seed is used exactly and leaves the rest derived', () => {
	const d = buildThemeDeclarations({
		name: 't',
		'seed-primary': '#0956aa',
		'seed-secondary': '#52e2ac'
	});
	const plain = buildThemeDeclarations({ name: 't', 'seed-primary': '#0956aa' });
	expect(d['--theme-color-secondary-40']).not.toBe(plain['--theme-color-secondary-40']);
	expect(d['--theme-color-tertiary-40']).toBe(plain['--theme-color-tertiary-40']);
});

test('an unknown option names itself and suggests the seed spelling', () => {
	expect(() =>
		buildThemeDeclarations({ name: 't', 'seed-primary': '#000', success: '#0f0' })
	).toThrow(/did you mean `seed-success`/);
});

test('a role seeded without a primary explains why that cannot work', () => {
	expect(() => buildThemeDeclarations({ name: 't', 'seed-error': '#f00' })).toThrow(/seed-primary/);
});

test('the default theme does not compete with other themes', () => {
	expect(themeSelectors({ name: 'brand', default: true })).toEqual([
		"[data-theme='brand']",
		':root:not([data-theme])'
	]);
});
```

Then run the whole thing as a consumer would:

```powershell
cd packages/core && bun run check
```

and add a theme to the docs site's `app.css` ([guide 7](07-docs.md), step 3),
which is the only check that exercises the real `@plugin` option parsing.

---

## Files after this phase

Nine files. Two are pure logic shared with the browser, two are new package
entry points, and the rest are stylesheets and wiring.

| File                                          | Status   | Written in | Ships?  |
| --------------------------------------------- | -------- | ---------- | ------- |
| `packages/core/functions/generateTheme.ts`    | added    | steps 5–7  | **Yes** |
| `packages/core/functions/buildTheme.ts`       | added    | steps 8–9  | **Yes** |
| `packages/core/functions/extract-swatches.ts` | added    | step 11    | no      |
| `packages/core/theme.ts`                      | added    | step 10    | **Yes** |
| `packages/core/themes.ts`                     | added    | step 11    | **Yes** |
| `packages/core/src/base/modes.css`            | added    | step 2     | source  |
| `packages/core/src/base/color-scheme.css`     | added    | step 2     | source  |
| `packages/core/src/themes/default.css`        | added    | step 3     | source  |
| `packages/core/package.json`                  | modified | step 10    | —       |
| `packages/core/tsconfig.build.json`           | modified | step 10    | —       |
| `packages/core/types.ts`                      | modified | step 11    | **Yes** |
| `packages/core/functions/build.ts`            | modified | step 11    | no      |
| `packages/docs/…` three files                 | modified | step 13    | —       |
| `packages/core/test/unit/buildTheme.test.ts`  | added    | step 14    | no      |

**`generateTheme.ts` and `buildTheme.ts` ship**, unlike the rest of
`functions/`, because `theme.ts` imports them. Both are therefore pure: no
`node:` imports, no filesystem, no Tailwind. Step 12's docs page depends on that
— it runs the identical code in the browser.

New generated files, not committed: `generated/swatches.ts`,
`generated/mode-map.ts`.

---

### `packages/core/functions/generateTheme.ts`

The whole module, assembled from steps 5, 6 and 7.

```ts
import {
	Blend,
	Hct,
	TonalPalette,
	argbFromHex,
	hexFromArgb,
	SchemeContent,
	SchemeExpressive,
	SchemeFidelity,
	SchemeFruitSalad,
	SchemeMonochrome,
	SchemeNeutral,
	SchemeRainbow,
	SchemeTonalSpot,
	SchemeVibrant
} from '@material/material-color-utilities';
import type { DynamicScheme } from '@material/material-color-utilities';

/*
	Generates a theme palette from a seed colour: ten palettes at thirty tone
	steps each. The mode layer (src/base/modes.css) maps those steps onto
	semantic roles via light-dark(), so a generated theme only has to supply the
	steps.

	PURE. No node:, no Tailwind, no filesystem — the docs generator runs this in
	the browser, and material-color-utilities has no dependencies of its own.
*/

/** The tone steps the themes declare. Material's standard set. */
const TONES = [
	0, 2, 4, 5, 6, 10, 12, 17, 20, 22, 24, 30, 40, 50, 60, 65, 70, 75, 80, 84, 87, 90, 92, 94, 95, 96,
	97, 98, 99, 100
] as const;

type SchemeConstructor = new (source: Hct, isDark: boolean, contrast: number) => DynamicScheme;

/*
	`vibrant` is the default because it is the closest match to a hand-authored
	Material palette. Expect a near match to whatever generator produced your
	existing default theme, not an identical one.
*/
const VARIANTS: Record<string, SchemeConstructor> = {
	vibrant: SchemeVibrant,
	tonalspot: SchemeTonalSpot,
	content: SchemeContent,
	expressive: SchemeExpressive,
	fidelity: SchemeFidelity,
	fruitsalad: SchemeFruitSalad,
	monochrome: SchemeMonochrome,
	neutral: SchemeNeutral,
	rainbow: SchemeRainbow
};

export const VARIANT_NAMES = Object.keys(VARIANTS);

/*
	Material covers primary/secondary/tertiary/neutral/neutral-variant and error.
	A design system generally needs four status palettes too, so they start from
	their own hues.

	These are STARTING POINTS, not fixed outputs: by default each is harmonized
	toward the theme's seed, which is what keeps a green success and a
	blue-seeded theme looking like one palette rather than two unrelated ones.
*/
export const STATUS_HUES = {
	success: '#006c49',
	warning: '#88512c',
	info: '#29657d',
	alert: '#993297'
} as const;

export type StatusPalette = keyof typeof STATUS_HUES;

/*
	The palettes Material derives from the scheme, and the option that overrides
	each one. The seed decides the scheme, and the scheme decides all six.
	Giving a role its own seed replaces just that palette and leaves the rest
	derived — so a brand secondary can be pinned without losing the
	relationships Material found for everything else.
*/
export const CORE_PALETTES = [
	{ token: 'primary', of: (s: DynamicScheme) => s.primaryPalette },
	{ token: 'secondary', of: (s: DynamicScheme) => s.secondaryPalette },
	{ token: 'tertiary', of: (s: DynamicScheme) => s.tertiaryPalette },
	{ token: 'neutral', of: (s: DynamicScheme) => s.neutralPalette },
	{ token: 'neutral-variant', of: (s: DynamicScheme) => s.neutralVariantPalette },
	{ token: 'error', of: (s: DynamicScheme) => s.errorPalette }
] as const;

export type CorePalette = (typeof CORE_PALETTES)[number]['token'];

/**
 * The seed colours a theme is built from.
 *
 * `primary` is the only one required: it seeds the Material scheme, and the
 * scheme derives every palette left unset.
 *
 * Core seeds are taken exactly. Status seeds are harmonized toward `primary`
 * by default — see `harmonize`.
 */
export interface ThemeSeeds {
	primary: string;
	secondary?: string;
	tertiary?: string;
	neutral?: string;
	'neutral-variant'?: string;
	error?: string;
	success?: string;
	warning?: string;
	alert?: string;
	info?: string;
}

/** Every role that can be seeded, core then status. */
export const SEED_ROLES: readonly (CorePalette | StatusPalette)[] = [
	...CORE_PALETTES.map((p) => p.token),
	...(Object.keys(STATUS_HUES) as StatusPalette[])
];

/*
	The `@plugin` option that seeds a role.

	`ThemeSeeds` is a nested object, and a CSS `@plugin` body cannot express one
	— Tailwind rejects `seeds: { primary: … }` with "Unexpected `@plugin`
	option". So the CSS surface is flat, one key per role, and buildTheme folds
	those back into a `ThemeSeeds` before anything else looks at them. There is
	ONE shape internally; this is only how it is spelled in CSS.
*/
export const seedOption = (role: CorePalette | StatusPalette): string => `seed-${role}`;

/** Every `seed-*` option name, for validation and error messages. */
export const SEED_OPTIONS = SEED_ROLES.map(seedOption);

export interface GenerateThemeOptions {
	/** The colours every palette is built from. `primary` seeds the scheme. */
	seeds: ThemeSeeds;
	/** Scheme variant; see VARIANT_NAMES. Matching ignores case, spaces, dashes. */
	variant?: string;
	/** Material contrast level, -1 (low) to 1 (high). */
	contrast?: number;
	/**
	 * Rotate the status palettes toward the seed's hue so they read as part of
	 * the same palette. Material's `Blend.harmonize` shifts by at most 15
	 * degrees, which preserves what each colour means — success stays green.
	 * Defaults to true.
	 */
	harmonize?: boolean;
}

/** Normalises "Tonal Spot", "tonal-spot" and "tonalspot" to the same key. */
const normaliseVariant = (variant: string): string => variant.toLowerCase().replace(/[^a-z]/g, '');

const toneSteps = (palette: TonalPalette, name: string): Record<string, string> =>
	Object.fromEntries(
		TONES.map((tone) => [`--theme-color-${name}-${tone}`, hexFromArgb(palette.tone(tone))])
	);

/**
 * Builds the `--theme-color-<palette>-<tone>` declarations for a seed colour.
 *
 * Tone steps do not depend on light/dark — the mode layer picks per mode with
 * light-dark() — so the scheme is constructed in light mode and the palettes
 * taken from it. Generating twice would produce two sets of steps and there is
 * nowhere to put the second.
 */
export function generateThemePalette(options: GenerateThemeOptions): Record<string, string> {
	const requested = options.variant ? normaliseVariant(options.variant) : 'vibrant';
	const Scheme = VARIANTS[requested];
	if (!Scheme) {
		throw new Error(
			`lunar-ui: unknown theme variant "${options.variant}". ` +
				`Expected one of: ${VARIANT_NAMES.join(', ')}.`
		);
	}

	const seeds = options.seeds;

	let source: Hct;
	try {
		source = Hct.fromInt(argbFromHex(seeds.primary));
	} catch {
		throw new Error(
			`lunar-ui: could not parse seed colour "${seeds.primary}". Expected a hex colour.`
		);
	}

	const scheme = new Scheme(source, false, options.contrast ?? 0);

	const declarations: Record<string, string> = {};

	/*
		A core palette comes from the scheme unless it was given its own seed, in
		which case it is built straight from that colour. Core seeds are NOT
		harmonized: the point of pinning one is to get that exact colour, where a
		status seed is a starting hue that should read as part of the palette.
	*/
	for (const palette of CORE_PALETTES) {
		/*
			`primary` is the scheme's SOURCE, not an override of it.

			Taking it from the scheme is what lets `variant` shape it. Read it
			straight from the seed instead and every variant returns an identical
			primary palette, with only the other roles changing — which looks like
			the variants being subtle rather than like a bug.
		*/
		const override = palette.token === 'primary' ? undefined : seeds[palette.token];
		if (override === undefined) {
			Object.assign(declarations, toneSteps(palette.of(scheme), palette.token));
			continue;
		}
		let argb: number;
		try {
			argb = argbFromHex(override);
		} catch {
			throw new Error(
				`lunar-ui: could not parse the "${seedOption(palette.token)}" colour ` +
					`"${override}". Expected a hex colour.`
			);
		}
		Object.assign(declarations, toneSteps(TonalPalette.fromInt(argb), palette.token));
	}

	/*
		Harmonize applies to SUPPLIED seeds as well as the defaults, so `success`
		behaves the same however it was chosen. A consumer who needs an exact
		brand colour turns harmonization off.
	*/
	const harmonize = options.harmonize ?? true;
	for (const name of Object.keys(STATUS_HUES) as StatusPalette[]) {
		const hex = seeds[name] ?? STATUS_HUES[name];
		let argb: number;
		try {
			argb = argbFromHex(hex);
		} catch {
			throw new Error(
				`lunar-ui: could not parse the "${seedOption(name)}" colour "${hex}". ` +
					`Expected a hex colour.`
			);
		}
		const resolved = harmonize ? Blend.harmonize(argb, source.toInt()) : argb;
		Object.assign(declarations, toneSteps(TonalPalette.fromInt(resolved), name));
	}

	return declarations;
}
```

---

### `packages/core/functions/buildTheme.ts`

The four pieces from step 8, plus the selectors from step 9.

```ts
import {
	generateThemePalette,
	seedOption,
	SEED_ROLES,
	VARIANT_NAMES,
	type ThemeSeeds
} from './generateTheme.js';

export type { ThemeSeeds };

/*
	Turns one theme's options into the declarations it emits.

	Split out of theme.ts so the plugin is not the only thing that can produce a
	theme. The docs site's generator runs this in the browser to preview a
	palette and to show the CSS you would get — and because both call the same
	function, what it shows is what `@plugin '.../theme'` emits, rather than a
	reimplementation that drifts.

	PURE. The only dependency is material-color-utilities, via generateTheme.
*/

export interface ThemeOptions {
	/** Theme id, used as `[data-theme='<name>']`. Required. */
	name?: string;
	/** Also apply the theme at the default selector, making it the default. */
	default?: boolean;
	/**
	 * The colours the palettes are built from.
	 *
	 * From JavaScript, pass the object. From CSS, name each role on its own line
	 * — `seed-primary`, `seed-secondary`, `seed-success` — and they are folded
	 * into this before anything else reads them.
	 */
	seeds?: ThemeSeeds;
	/** Scheme variant for a generated palette. */
	variant?: string;
	/** Material contrast level, -1 to 1. */
	contrast?: number;
	/** Rotate the status palettes toward the primary seed. Defaults to true. */
	harmonize?: boolean;
	/** `color-scheme` for the theme, e.g. `dark`. */
	'color-scheme'?: string;
	/** `seed-*` roles, `--theme-color-*` roles declared directly, and `seed`. */
	[key: string]: unknown;
}

/*
	Option keys arrive however they were written. Tailwind hands an `@plugin`
	body over verbatim, so `seedPrimary` and `seed-primary` are different
	strings — and an unrecognised key is simply ignored, which would make a typo
	look like a colour that quietly refused to apply.

	`--theme-color-*` roles are left exactly as written: they are CSS custom
	property names, not option names, and their case is significant.
*/
const kebab = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function normaliseKeys(options: ThemeOptions): ThemeOptions {
	const out: ThemeOptions = {};
	for (const [key, value] of Object.entries(options)) {
		out[key.startsWith('--') ? key : kebab(key)] = value;
	}
	return out;
}

/*
	Folds the flat CSS spelling back into a `ThemeSeeds`.

	Three ways in, in increasing precedence, so a stylesheet written against the
	single-seed version keeps working:

	  seed: #0956AA            the primary seed, the original single-seed option
	  seed-primary: #0956AA    the same thing named explicitly, plus every other
	                           role — seed-secondary, seed-error, seed-success …
	  seeds: { primary: … }    the object itself, from JavaScript

	Returns null when no seed was given at all, which is a theme declaring its
	roles by hand rather than generating them.
*/
function collectSeeds(options: ThemeOptions): ThemeSeeds | null {
	const seeds: Partial<ThemeSeeds> = {};

	if (typeof options.seed === 'string') seeds.primary = options.seed;

	for (const role of SEED_ROLES) {
		const value = options[seedOption(role)];
		if (typeof value === 'string') seeds[role] = value;
	}

	const given = options.seeds;
	if (given && typeof given === 'object') {
		for (const [role, value] of Object.entries(given as unknown as Record<string, unknown>)) {
			if (typeof value === 'string') seeds[role as keyof ThemeSeeds] = value;
		}
	}

	if (typeof seeds.primary !== 'string') {
		/*
			A role seeded without a primary cannot generate anything: `primary`
			seeds the Material scheme every other palette is derived from. Say so,
			rather than silently producing a hand-declared theme missing most of
			its colours.
		*/
		const named = SEED_ROLES.filter((role) => typeof seeds[role] === 'string');
		if (named.length) {
			throw new Error(
				`lunar-ui: ${named.map(seedOption).join(', ')} given without ` +
					`\`${seedOption('primary')}\`. The primary seed builds the scheme every ` +
					`other palette is derived from, so it is required.`
			);
		}
		return null;
	}

	return seeds as ThemeSeeds;
}

/** Option names a theme understands, besides `--*` roles and `seed-*`. */
const KNOWN_OPTIONS = [
	'name',
	'default',
	'seed',
	'seeds',
	'variant',
	'contrast',
	'harmonize',
	'color-scheme'
];

/*
	Tailwind ignores an option a plugin does not read, so a misspelled one looks
	exactly like a colour that refused to apply. Rejecting unknown keys turns
	that into a build error naming the option — and the `did you mean` branch
	pays for itself the first time somebody writes `success:` instead of
	`seed-success:`.
*/
function rejectUnknownOptions(options: ThemeOptions, name: string): void {
	const valid = new Set([...KNOWN_OPTIONS, ...SEED_ROLES.map(seedOption)]);
	const unknown = Object.keys(options).filter((key) => !key.startsWith('--') && !valid.has(key));
	if (!unknown.length) return;

	const suggestions = unknown.map((key) => {
		const asSeed = seedOption(key as never);
		return valid.has(asSeed) ? `${key} (did you mean \`${asSeed}\`?)` : key;
	});
	throw new Error(
		`lunar-ui: theme "${name}" sets unknown option${unknown.length > 1 ? 's' : ''} ` +
			`${suggestions.join(', ')}. Valid options: ${[...valid].join(', ')}, ` +
			`plus any \`--theme-color-*\` role.`
	);
}

/** The trimmed `name`, or a thrown error naming what is missing. */
export function themeName(options: ThemeOptions): string {
	const name = typeof options.name === 'string' ? options.name.trim() : '';
	if (!name) {
		throw new Error(
			'lunar-ui: a custom theme needs a `name`, e.g. ' +
				"`@plugin '.../theme' { name: brand; seed-primary: #0956AA; }`."
		);
	}
	return name;
}

/**
 * Every declaration a theme contributes, seed-generated and hand-declared.
 *
 * Throws the same errors the plugin does, so a caller that surfaces them — the
 * docs generator shows them inline rather than crashing — reports exactly what
 * a consumer would hit at build time.
 */
export function buildThemeDeclarations(raw: ThemeOptions): Record<string, string> {
	const options = normaliseKeys(raw);
	const name = themeName(options);
	rejectUnknownOptions(options, name);
	const declarations: Record<string, string> = {};

	const seeds = collectSeeds(options);

	if (seeds) {
		Object.assign(
			declarations,
			generateThemePalette({
				seeds,
				variant: options.variant as string | undefined,
				contrast: typeof options.contrast === 'number' ? options.contrast : undefined,
				harmonize: typeof options.harmonize === 'boolean' ? options.harmonize : undefined
			})
		);
	} else if (options.variant !== undefined) {
		throw new Error(
			`lunar-ui: theme "${name}" sets \`variant\` but no \`${seedOption('primary')}\`. ` +
				`\`variant\` only applies to generated palettes (${VARIANT_NAMES.join(', ')}).`
		);
	}

	// Hand-declared roles win over anything generated from the seed, which is
	// what makes "generate a palette then override two roles" work.
	for (const [key, value] of Object.entries(options)) {
		if (key.startsWith('--') && (typeof value === 'string' || typeof value === 'number')) {
			declarations[key] = String(value);
		}
	}

	if (Object.keys(declarations).length === 0) {
		throw new Error(
			`lunar-ui: theme "${name}" defines no colours. Supply a \`seed-primary\`, ` +
				`or declare roles directly with \`--theme-color-*\` properties.`
		);
	}

	const colorScheme = options['color-scheme'];
	if (typeof colorScheme === 'string') declarations['color-scheme'] = colorScheme;

	return declarations;
}

/**
 * The selectors a theme is emitted under, in the order the plugin adds them.
 *
 * `:root:not([data-theme])` rather than plain `:root` for the default.
 *
 * `:root` is specificity (0,1,0) — IDENTICAL to `[data-theme='x']` — so which
 * one won came down to emission order, and a default declared after another
 * theme beat it and made that theme impossible to apply. Nothing errored; the
 * user picked a theme and the page did not change.
 *
 * `:not([data-theme])` says what is actually meant: the default applies where
 * no theme has been chosen, so it never competes, whatever the order.
 */
export function themeSelectors(options: ThemeOptions): string[] {
	const selectors = [`[data-theme='${themeName(options)}']`];
	if (options.default) selectors.push(':root:not([data-theme])');
	return selectors;
}
```

---

### `packages/core/functions/extract-swatches.ts`

Build-time only.

```ts
import type { ThemeRules } from '../types.js';

/*
	Builds the theme catalogue the package ships for JavaScript: every usable
	`data-theme` value, and a handful of representative colours per theme so an
	app can render a picker without hard-coding names or sampling the DOM.

	BOTH modes are resolved, because a swatch shown next to a theme's name has to
	look like that theme whichever mode the surrounding page is in. One value per
	theme would be wrong half the time.
*/

/** The roles a swatch shows. Enough to recognise a theme, not a full palette. */
export const SWATCH_ROLES = ['primary', 'secondary', 'tertiary', 'surface', 'on-surface'] as const;

export type SwatchRole = (typeof SWATCH_ROLES)[number];

export interface ThemeSwatches {
	light: Record<SwatchRole, string>;
	dark: Record<SwatchRole, string>;
}

/** `[data-theme='name']` occurrences in a selector list. */
const THEME_NAME = /\[data-theme=['"]?([\w-]+)['"]?\]/g;

/**
 * Which tone step each role reads in each mode.
 *
 * Read from `modes.css` rather than hard-coded: the roles are declared there as
 * `light-dark(var(a), var(b))`, and that pairing is the only thing that says
 * which step a mode uses. A hand-copied table would drift the first time a role
 * was re-pointed — producing swatches that are subtly the wrong colour, which
 * nobody notices.
 *
 * Deriving it also gives you a build-time assertion that the mode layer is
 * intact: re-point a role and either this follows or the build fails.
 */
export function modeMapping(modesCss: string): Record<SwatchRole, [string, string]> {
	const flat = modesCss.replace(/\s+/g, ' ');
	const mapping = {} as Record<SwatchRole, [string, string]>;
	for (const role of SWATCH_ROLES) {
		const pattern = new RegExp(
			`--theme-color-${role}:\\s*light-dark\\(\\s*var\\((--[\\w-]+)\\)\\s*,\\s*var\\((--[\\w-]+)\\)\\s*\\)`
		);
		const found = pattern.exec(flat);
		if (!found) {
			throw new Error(
				`lunar-ui: modes.css does not declare --theme-color-${role} as a ` +
					`light-dark() pair, so its swatch cannot be resolved for both modes.`
			);
		}
		mapping[role] = [found[1], found[2]];
	}
	return mapping;
}

type Declarations = Record<string, string>;

/** Roles a theme declares outright, rather than deriving from tone steps. */
const directRole = (decls: Declarations, role: SwatchRole): string | undefined =>
	decls[`--theme-color-${role}`];

function resolve(
	decls: Declarations,
	mapping: Record<SwatchRole, [string, string]>,
	mode: 0 | 1
): Record<SwatchRole, string> | null {
	const out = {} as Record<SwatchRole, string>;
	for (const role of SWATCH_ROLES) {
		/*
			Two shapes of theme. A hand-written one declares each role outright,
			so the value is already the answer. A generated one declares tone
			steps, and the role is whichever step modes.css pairs with this mode.
		*/
		const value = directRole(decls, role) ?? decls[mapping[role][mode]];
		if (value === undefined) return null;
		out[role] = value;
	}
	return out;
}

/**
 * Every `data-theme` value the shipped themes answer to, with its swatches.
 *
 * A theme that varies by mode carries it in the selector — `[data-theme='x']
 * .light` and `.dark` — so those two are read separately. A theme with a single
 * selector is a fixed palette and reports the same colours for both modes
 * rather than inventing a variant.
 */
export function buildSwatches(
	themes: ThemeRules,
	mapping: Record<SwatchRole, [string, string]>
): Record<string, ThemeSwatches> {
	const byName = new Map<
		string,
		{ plain?: Declarations; light?: Declarations; dark?: Declarations }
	>();

	for (const selectors of Object.values(themes)) {
		for (const [selector, decls] of Object.entries(selectors)) {
			/*
				One selector LIST can name several themes:
				`[data-theme='alucard'], [data-theme='dracula'].light` is alucard's
				palette and dracula's light mode.
			*/
			for (const part of selector.split(',')) {
				THEME_NAME.lastIndex = 0;
				const found = THEME_NAME.exec(part);
				if (!found) continue;
				const name = found[1];
				const entry = byName.get(name) ?? {};
				if (/\.light\b/.test(part)) entry.light = decls;
				else if (/\.dark\b/.test(part)) entry.dark = decls;
				else entry.plain = decls;
				byName.set(name, entry);
			}
		}
	}

	const swatches: Record<string, ThemeSwatches> = {};
	for (const [name, entry] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
		const light = resolve(entry.light ?? entry.plain ?? {}, mapping, 0);
		const dark = resolve(entry.dark ?? entry.plain ?? {}, mapping, 1);
		// A theme missing one of these roles entirely is not swatchable; skip it
		// rather than shipping a half-filled entry.
		if (light && dark) swatches[name] = { light, dark };
	}
	return swatches;
}
```

### `packages/core/types.ts`

The whole file as it stands at the end of this phase. The only addition is the
`SwatchRole` re-export — `ThemeRules` is already here from
[guide 14](14-tokens.md), which emits `generated/themes.ts` with it.

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
 * Added by guide 14.
 */
export type ThemeEntry = string | [string, Record<string, string>];
export type ThemeExtend = Record<string, Record<string, ThemeEntry>>;

/**
 * Shipped theme palettes, keyed by theme id then by selector.
 *
 * From [guide 14](14-tokens.md). `extract-swatches.ts` takes one of these and
 * produces the catalogue; `build.ts` produces it by routing collected
 * declarations through `themeIdOf`.
 */
export type ThemeRules = Record<string, Record<string, Record<string, string>>>;

/** Re-exported so generated/swatches.ts can name its own shape. */
export type { SwatchRole, ThemeSwatches } from './functions/extract-swatches.js';

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

`PluginOptions` grows again in [guide 16](16-options.md), which adds `themes`
and the shape-token index signature.

---

### `packages/core/functions/build.ts`

The whole file as it stands at the end of this phase — guide 2's pipeline, plus
guide 14's token collection, plus this guide's swatch emission.

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
		`theme catalogue: ${Object.keys(swatches).length} names`
);
```

[Guide 16](16-options.md) adds the registry, variant and functional-utility
extraction to this file, and gives it again in full.

---

### `packages/core/theme.ts`

The second plugin entry point, at the package root.

```ts
import plugin from 'tailwindcss/plugin';
import type { PluginAPI, PluginWithConfig } from 'tailwindcss/plugin';
import {
	buildThemeDeclarations,
	themeSelectors,
	type ThemeOptions
} from './functions/buildTheme.js';
import { SWATCH_ROLES, type SwatchRole, type ThemeSwatches } from './functions/extract-swatches.js';
import modeMap from './generated/mode-map.js';

export type { ThemeOptions, ThemeSwatches };

/*
	Defines one custom theme.

	Two ways to supply colours. Generate a full tonal palette from a seed:

	  @plugin '@anti049/lunar-ui/theme' {
	    name: brand;
	    seed-primary: #0956AA;
	    variant: vibrant;      -- optional, see VARIANT_NAMES
	    default: true;         -- optional, also apply where no theme is set
	  }

	Or declare the semantic roles by hand:

	  @plugin '@anti049/lunar-ui/theme' {
	    name: brand;
	    --theme-color-primary: #8be9fd;
	    --theme-color-on-primary: #282a36;
	    color-scheme: dark;
	  }

	Both may be combined: generate a palette from a seed, then override
	individual roles. Hand-written declarations always win.

	Tailwind hands option bodies over as flat scalars, which is why each theme is
	its own @plugin call rather than a nested object on the main plugin.
*/

type PluginWithOptions<T> = {
	(options?: T): PluginWithConfig;
	__isOptionsFunction: true;
};

/**
 * Swatches for a theme you generate yourself.
 *
 * `THEME_NAMES` from `/themes` can only list what SHIPS: a theme declared with
 * `@plugin '.../theme'` lives in your stylesheet, and the plugin runs at
 * compile time, so nothing in this package can discover it at runtime. Pass the
 * same options here to get the matching entry, and concatenate:
 *
 *     const brand = swatchesFor({ name: 'brand', 'seed-primary': '#52e2ac' });
 *     const names = [...THEME_NAMES, 'brand'];
 *
 * This lives here rather than next to the catalogue because it GENERATES a
 * palette, which means material-color-utilities. Keeping the catalogue free of
 * that leaves a theme picker with no runtime dependencies.
 */
export function swatchesFor(options: ThemeOptions): ThemeSwatches {
	const declarations = buildThemeDeclarations(options);
	const pick = (mode: 0 | 1): Record<SwatchRole, string> => {
		const out = {} as Record<SwatchRole, string>;
		for (const role of SWATCH_ROLES) {
			// The two shapes the build handles: a role declared outright, or the
			// tone step modes.css pairs with this mode.
			const value = declarations[`--theme-color-${role}`] ?? declarations[modeMap[role][mode]];
			if (value === undefined) {
				throw new Error(
					`lunar-ui: this theme declares neither --theme-color-${role} nor ` +
						`${modeMap[role][mode]}, so it has no ${role} swatch.`
				);
			}
			out[role] = value;
		}
		return out;
	};
	return { light: pick(0), dark: pick(1) };
}

const projectNameTheme: PluginWithOptions<ThemeOptions> = plugin.withOptions(
	(options: ThemeOptions = {}) => {
		// Computed once, outside the handler: these throw on bad input, and a
		// throw here fails the build with a useful message rather than midway
		// through emission.
		const declarations = buildThemeDeclarations(options);
		const selectors = themeSelectors(options);

		return ({ addBase }: PluginAPI) => {
			for (const selector of selectors) addBase({ [selector]: declarations });
		};
	}
);

export default projectNameTheme;
```

---

### `packages/core/themes.ts`

```ts
import swatches from './generated/swatches.js';
import { SWATCH_ROLES, type SwatchRole, type ThemeSwatches } from './functions/extract-swatches.js';

/*
	The theme catalogue, for JavaScript.

	    import { THEME_NAMES, THEME_SWATCHES } from '@anti049/lunar-ui/themes';

	Enough to build a theme picker without hard-coding names or reading computed
	styles off the DOM. DATA ONLY — importing this does not load the plugin, and
	it is not the thing you pass to `@plugin`.

	Deliberately free of runtime dependencies. Resolving a theme you generate
	yourself needs `swatchesFor` from `/theme`, which pulls in
	material-color-utilities — a package whose extensionless internal imports
	Node's ESM resolver rejects outright. Keeping that out of here means a list
	of names costs nothing and works in any runtime, including a docs site's SSR.
*/

export { SWATCH_ROLES };
export type { SwatchRole, ThemeSwatches };

/** Every `data-theme` value the shipped themes answer to, sorted. */
export const THEME_NAMES: string[] = Object.keys(swatches);

/** Representative colours per shipped theme, both modes. */
export const THEME_SWATCHES: Record<string, ThemeSwatches> = swatches;
```

---

### `packages/core/package.json` — the exports additions

```json
"exports": {
	".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
	"./theme": { "types": "./dist/theme.d.ts", "default": "./dist/theme.js" },
	"./themes": { "types": "./dist/themes.d.ts", "default": "./dist/themes.js" },
	"./package.json": "./package.json"
},
"dependencies": {
	"@material/material-color-utilities": "^0.4.0"
}
```

A **dependency**, not a devDependency: `theme.ts` imports it and it ships.

---

### `packages/core/tsconfig.build.json` — the include additions

```jsonc
// tsc follows imports from the entry points, so adding these two is what pulls
// generateTheme.ts, buildTheme.ts and generated/mode-map.ts into dist/.
"include": ["index.ts", "theme.ts", "themes.ts", "types.ts", "generated/**/*.ts"]
```

**Verify it, do not assume it.** The build succeeds either way:

```powershell
bun run --filter '@anti049/test' build
Get-ChildItem packages/core/dist -Recurse -Filter *.js |
	Select-Object -ExpandProperty FullName
```

You should see `dist/theme.js`, `dist/themes.js`,
`dist/functions/buildTheme.js`, `dist/functions/generateTheme.js` and
`dist/functions/addPrefix.js`. A missing one means an entry point is not in
`include`, and the symptom a consumer gets is
`Cannot find module '@anti049/test/theme'`.

Forget this and `bun run build` succeeds, `dist/theme.js` does not exist, and
the failure surfaces as an unresolved `exports` entry in a consumer's app.
`publint` catches it — which is why it is in the `check` script.

---

## Traps

> **You read the primary seed back as a palette override.** It looks symmetrical
> — every other role works that way — but `primary` is what the scheme is built
> _from_. Treat it as an override and `variant` stops doing anything to it, so
> every variant produces the same primary and only the other palettes change.
>
> **How to tell:** switching variants visibly changes secondary and tertiary
> while primary sits still. Easy to mistake for the variants being subtle.
>
> **Fix:** `palette.token === 'primary' ? undefined : seeds[palette.token]`.

> **You give the default theme a plain `:root` selector.** `:root` and
> `[data-theme='x']` are both (0,1,0), so whichever is emitted last wins. A
> default emitted after another theme silently makes that theme unselectable.
>
> **How to tell:** picking a theme changes `data-theme` in the DOM and nothing
> else.
>
> **Fix:** `:root:not([data-theme])` for the default, `:where(:root)` for the
> shipped fallback palette.

> **You try to nest the seeds object in a `@plugin` body.** Tailwind rejects it
> with "Unexpected `@plugin` option" — bodies are flat scalars only.
>
> **Fix:** one flat `seed-<role>` key per role, folded back into the object
> before anything reads it.

> **You let an unknown option through.** Tailwind ignores options a plugin does
> not read, so `sucess: #0f0` is indistinguishable from a colour that refused to
> apply. Throw, and suggest the nearest valid name.

> **You assign `$state` from inside a `$derived`.** Svelte 5 requires deriveds to
> be pure; this throws `state_unsafe_mutation` at runtime and neither SSR nor
> the build catches it, because the guard is client-side only.
>
> **Fix:** compute in the derived, remember in an `$effect`.

> **You hard-code the role-to-tone-step mapping.** It duplicates what `modes.css`
> already says, and drifts the first time a role is re-pointed — producing
> swatches that are subtly the wrong colour, which nobody notices.
>
> **Fix:** parse it out of `modes.css` at build time and throw if a role is not
> a `light-dark()` pair.

> **You put the colour-science dependency in the catalogue export.** Importing a
> list of theme names then pulls in `material-color-utilities`, whose
> extensionless internal imports Node's ESM resolver rejects — so a theme picker
> breaks SSR for no reason.
>
> **Fix:** data in `/themes`, generation in `/theme`.

---

## Commit

Verify, then commit:

```powershell
bun run --filter '@anti049/test' check
git add -A
git commit -m "feat(core): generate themes from seed colours"
```

This one **does** need a changeset — it adds an export (`./theme`,
`./themes`) and a whole option surface. `bun changeset`, minor, written as
release notes rather than as a commit message ([guide 8](08-conventions.md),
step 4).

---

## Checkpoint

The unit tests pin `buildThemeDeclarations`. This exercises what a consumer
touches: the `/theme` plugin through real `@plugin` option parsing, and the
`/themes` catalogue as a dependency-free import.

Rebuild the plugin skeleton from
[guide 2's checkpoint](02-plugin.md#the-plugin-skeleton), then:

```powershell
@'
@import 'tailwindcss' source(none);
@plugin '@anti049/test';

/* Generated, with one tone pinned by hand. */
@plugin '@anti049/test/theme' {
	name: brand;
	seed-primary: #0956aa;
	seed-secondary: #52e2ac;
	default: true;
	--theme-color-primary-40: #ff00ff;
}

/* Roles declared outright, no seed. */
@plugin '@anti049/test/theme' {
	name: nightfall;
	--theme-color-primary: #8be9fd;
	color-scheme: dark;
}
'@ | Set-Content src/themes.css
node $cli -i src/themes.css -o out/themes.css

(Select-String -Path out/themes.css -Pattern '--theme-color-primary-\d+:' -AllMatches).Matches.Count   # a full tone scale
(Select-String -Path out/themes.css -Pattern '--theme-color-primary-40:\s*#ff00ff').Count             # > 0
(Select-String -Path out/themes.css -Pattern ':root:not\(\[data-theme\]\)').Count                     # > 0
(Select-String -Path out/themes.css -Pattern "\[data-theme='nightfall'\]").Count                      # > 0
```

The errors must reach the consumer's build, named:

```powershell
@'
@import 'tailwindcss' source(none);
@plugin '@anti049/test/theme' { name: t; seed-primary: #000; success: #0f0; }
'@ | Set-Content src/bad.css
node $cli -i src/bad.css -o out/bad.css; $LASTEXITCODE   # non-zero; suggests `seed-success`
```

And the catalogue must import under plain Node **with the colour library
gone** — the data-only entry may not depend on it:

```powershell
Remove-Item -Recurse -Force node_modules/@material
node --input-type=module -e "import('@anti049/test/themes').then(m => console.log(m.THEME_NAMES.join(', ')))"
# → every shipped theme name

Pop-Location
Remove-Item -Recurse -Force "$env:TEMP\test-checkpoint"
```

**Passes when** every line prints what its comment says.

**If it does not:** a `/themes` import that fails once `@material` is deleted
means the catalogue imports the generator somewhere along its graph — step 11's
split has leaked. A typo'd option that compiles is the options layer's
unknown-key check not running for `/theme`.

---

Next: [The plugin option surface](16-options.md)
