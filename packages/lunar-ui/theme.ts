import plugin from 'tailwindcss/plugin';
import type { PluginAPI, PluginWithConfig } from 'tailwindcss/plugin';
import {
	buildThemeDeclarations,
	themeSelectors,
	type ThemeOptions
} from './functions/buildTheme.js';
import { SWATCH_ROLES, type SwatchRole, type ThemeSwatches } from './functions/extract-swatches.js';
import modeMap from './generated/mode-map.js';

export type { ThemeSwatches };

/*
	Defines one custom lunar-ui theme.

	Two ways to supply colours. Generate a full tonal palette from a seed:

	  @plugin '@anti049/lunar-ui/theme' {
	    name: brand;
	    seed: #0956AA;
	    variant: vibrant;      -- optional, see VARIANT_NAMES
	    default: true;         -- optional, also apply at :root
	  }

	Or declare the semantic roles by hand, the way the shipped catppuccin and
	dracula themes do:

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

	The options-to-declarations step lives in functions/buildTheme.ts so the docs
	site's theme generator can run exactly the same logic in the browser.
*/

type PluginWithOptions<T> = {
	(options?: T): PluginWithConfig;
	__isOptionsFunction: true;
};

export type { ThemeOptions };

/**
 * Swatches for a theme you generate yourself.
 *
 * `THEME_NAMES` from `@anti049/lunar-ui/themes` can only list what ships: a
 * theme declared with `@plugin '@anti049/lunar-ui/theme'` lives in your
 * stylesheet, and the plugin runs at compile time, so nothing in this package
 * can discover it at runtime. Pass the same options here to get the matching
 * entry, and concatenate.
 *
 *     const brand = swatchesFor({ name: 'brand', 'seed-primary': '#52e2ac' });
 *     const names = [...THEME_NAMES, 'brand'];
 *
 * This lives here rather than next to the catalogue because it generates a
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

const lunarUiTheme: PluginWithOptions<ThemeOptions> = plugin.withOptions(
	(options: ThemeOptions = {}) => {
		const declarations = buildThemeDeclarations(options);
		const selectors = themeSelectors(options);

		return ({ addBase }: PluginAPI) => {
			for (const selector of selectors) addBase({ [selector]: declarations });
		};
	}
);

export default lunarUiTheme;
