# 14. Themes — generated palettes, catalogue, generator page

[Guide 2](02-plugin.md) built a plugin that ships components. This one builds the
second half of the product: a `@plugin '.../theme'` entry that generates a whole
palette from one colour, a catalogue export so JavaScript can list themes, and
the docs page that previews both.

It assumes the token layer from [guide 15](15-tokens.md) exists — specifically
the mode layer in step 2. If you have not built that yet, read 15 first; the two
guides are numbered in the order they were written, not the order they are done.

Thirteen steps.

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
simply absent, with no error. Step 13's tests exist for that.

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
			`project-name: unknown theme variant "${options.variant}". ` +
				`Expected one of: ${VARIANT_NAMES.join(', ')}.`
		);
	}

	let source: Hct;
	try {
		source = Hct.fromInt(argbFromHex(options.seeds.primary));
	} catch {
		throw new Error(`project-name: could not parse seed colour "${options.seeds.primary}".`);
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
@plugin '@scope/project-name/theme' {
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
				`project-name: ${named.map(seedOption).join(', ')} given without ` +
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
		`project-name: theme "${name}" sets unknown option${unknown.length > 1 ? 's' : ''} ` +
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
		throw new Error(
			`project-name: theme "${name}" sets \`variant\` but no \`${seedOption('primary')}\`.`
		);
	}

	// Hand-declared roles win over anything generated.
	for (const [key, value] of Object.entries(options)) {
		if (key.startsWith('--') && (typeof value === 'string' || typeof value === 'number')) {
			declarations[key] = String(value);
		}
	}

	if (Object.keys(declarations).length === 0) {
		throw new Error(`project-name: theme "${name}" defines no colours.`);
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
@plugin '@scope/project-name/theme' {
	name: brand;
	seed-primary: #0956aa;
	default: true;
}
@plugin '@scope/project-name/theme' {
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
				`project-name: modes.css does not declare --theme-color-${role} as a ` +
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
	import { buildThemeDeclarations, themeSelectors } from '$plugin/functions/buildTheme.js';
	import { VARIANT_NAMES } from '$plugin/functions/generateTheme.js';

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

## 13. Verify

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
bun run --filter '@scope/project-name' check
git add -A
git commit -m "feat(core): generate themes from seed colours"
```

This one **does** need a changeset — it adds an export (`./theme`,
`./themes`) and a whole option surface. `bun changeset`, minor, written as
release notes rather than as a commit message ([guide 8](08-conventions.md),
step 4).
---

Next: [The token layer](15-tokens.md)
