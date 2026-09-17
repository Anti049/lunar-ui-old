import type { ThemeRules } from '../types.js';

/*
	Builds the theme catalogue the package ships for JavaScript: every usable
	`data-theme` value, and a handful of representative colours per theme so an
	app can render a picker without hard-coding names or sampling the DOM.

	Both modes are resolved, because a swatch shown next to a theme's name has to
	look like that theme whichever mode the surrounding page is in.
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
			Two shapes of theme. `catppuccin` and `dracula` declare each role
			outright, so the value is already the answer. `default` and any
			generated theme declare tone steps, and the role is whichever step
			modes.css pairs with this mode.
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
 * A theme that varies by mode carries it in the selector -- `[data-theme='x']
 * .light` and `.dark` -- so those two are read separately. A theme with a single
 * selector is a fixed palette (`catppuccin-mocha` is dark whatever the page is),
 * and reports the same colours for both modes rather than inventing a variant.
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
			// One selector list can name several themes: `[data-theme='alucard'],
			// [data-theme='dracula'].light` is alucard's palette and dracula's light mode.
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
