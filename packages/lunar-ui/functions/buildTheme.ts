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
	theme. The docs site's theme generator runs this in the browser to preview a
	palette and to show the CSS you would get -- and because both call the same
	function, what it shows is what `@plugin '@anti049/lunar-ui/theme'` emits,
	rather than a reimplementation that drifts.

	Everything here is pure and free of node and Tailwind: the only dependency is
	`@material/material-color-utilities`, which has no dependencies of its own and
	runs in a browser.
*/

export interface ThemeOptions {
	/** Theme id, used as `[data-theme='<name>']`. Required. */
	name?: string;
	/** Also apply the theme at `:root`, making it the default. */
	default?: boolean;
	/**
	 * The colours the palettes are built from.
	 *
	 * From JavaScript, pass the object. From CSS, name each role on its own
	 * line -- `seed-primary`, `seed-secondary`, `seed-success` and so on -- and
	 * they are folded into this before anything else reads them. A `@plugin`
	 * body cannot hold a nested object, so the flat keys are the CSS spelling of
	 * exactly this shape, not a second way of configuring a theme.
	 */
	seeds?: ThemeSeeds;
	/** Scheme variant for a generated palette. */
	variant?: string;
	/** Material contrast level, -1 to 1. */
	contrast?: number;
	/**
	 * Rotate the status palettes toward the primary seed so they read as one
	 * palette. Defaults to true; false uses the status hues exactly.
	 */
	harmonize?: boolean;
	/** `color-scheme` for the theme, e.g. `dark`. */
	'color-scheme'?: string;
	/** `seed-*` roles, `--theme-color-*` roles declared directly, and `seed`. */
	[key: string]: unknown;
}

/*
	Option keys arrive however they were written. Tailwind hands an `@plugin`
	body over verbatim, so `seedPrimary` and `seed-primary` are different strings
	-- and an unrecognised key is simply ignored, which would make a typo look
	like a colour that quietly refused to apply. Normalising to kebab-case makes
	both spellings work, and matches how the docs generator passes options from
	JavaScript.

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

	Three ways in, in increasing precedence, so the shorthand a stylesheet
	already uses keeps working:

	  seed: #0956AA            the primary seed, the original single-seed option
	  seed-primary: #0956AA    the same thing named explicitly, plus every other
	                           role -- seed-secondary, seed-error, seed-success …
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
			seeds the Material scheme every other palette is derived from. Say so
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
	that into a build error naming the option -- which matters most right now,
	because the status roles used to be set with bare `success:` / `info:` keys
	and are now `seed-success` / `seed-info`.
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
			"lunar-ui: a custom theme needs a `name`, e.g. `@plugin '.../theme' { name: brand; ... }`."
		);
	}
	return name;
}

/**
 * Every declaration a theme contributes, seed-generated and hand-declared.
 *
 * Throws the same errors the plugin does, so a caller that surfaces them --
 * the docs generator shows them inline rather than crashing -- reports exactly
 * what a consumer would hit at build time.
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
				variant: options.variant,
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

	// Hand-declared roles win over anything generated from the seed.
	for (const [key, value] of Object.entries(options)) {
		if (key.startsWith('--') && (typeof value === 'string' || typeof value === 'number')) {
			declarations[key] = String(value);
		}
	}

	if (Object.keys(declarations).length === 0) {
		throw new Error(
			`lunar-ui: theme "${name}" defines no colours. Supply a \`seed\`, ` +
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
 * `:root:not([data-theme])` rather than plain `:root` for the default. `:root`
 * is specificity (0,1,0) -- identical to `[data-theme='x']` -- so which one won
 * came down to emission order, and a default declared after another theme beat
 * it and made that theme impossible to apply. `:not([data-theme])` says what is
 * actually meant: the default applies where no theme has been chosen, so it
 * never competes, whatever the order.
 */
export function themeSelectors(options: ThemeOptions): string[] {
	const selectors = [`[data-theme='${themeName(options)}']`];
	if (options.default) selectors.push(':root:not([data-theme])');
	return selectors;
}
