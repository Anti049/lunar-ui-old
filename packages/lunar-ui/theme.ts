import plugin from 'tailwindcss/plugin';
import type { PluginAPI, PluginWithConfig } from 'tailwindcss/plugin';
import { generateThemePalette, VARIANT_NAMES, type StatusPalette } from './functions/generateTheme.js';

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
*/

type PluginWithOptions<T> = {
	(options?: T): PluginWithConfig;
	__isOptionsFunction: true;
};

export interface ThemeOptions {
	/** Theme id, used as `[data-theme='<name>']`. Required. */
	name?: string;
	/** Also apply the theme at `:root`, making it the default. */
	default?: boolean;
	/** Seed colour to generate a full tonal palette from. */
	seed?: string;
	/** Scheme variant for a generated palette. */
	variant?: string;
	/** Material contrast level, -1 to 1. */
	contrast?: number;
	/**
	 * Rotate the status palettes toward the seed hue so they read as one
	 * palette. Defaults to true; false uses the status hues exactly.
	 */
	harmonize?: boolean;
	/** Seed overrides for the status palettes. */
	success?: string;
	warning?: string;
	info?: string;
	alert?: string;
	/** `color-scheme` for the theme, e.g. `dark`. */
	'color-scheme'?: string;
	/** Any `--theme-color-*` role declared directly. */
	[key: string]: unknown;
}

const STATUS_KEYS = ['success', 'warning', 'info', 'alert'] as const;

const lunarUiTheme: PluginWithOptions<ThemeOptions> = plugin.withOptions(
	(options: ThemeOptions = {}) => {
		const name = typeof options.name === 'string' ? options.name.trim() : '';
		if (!name) {
			throw new Error(
				"lunar-ui: a custom theme needs a `name`, e.g. `@plugin '.../theme' { name: brand; ... }`."
			);
		}

		const declarations: Record<string, string> = {};

		if (typeof options.seed === 'string') {
			const status: Partial<Record<StatusPalette, string>> = {};
			for (const key of STATUS_KEYS) {
				if (typeof options[key] === 'string') status[key] = options[key] as string;
			}
			Object.assign(
				declarations,
				generateThemePalette({
					seed: options.seed,
					variant: options.variant,
					contrast: typeof options.contrast === 'number' ? options.contrast : undefined,
					harmonize: typeof options.harmonize === 'boolean' ? options.harmonize : undefined,
					status
				})
			);
		} else if (options.variant !== undefined) {
			throw new Error(
				`lunar-ui: theme "${name}" sets \`variant\` but no \`seed\`. ` +
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

		return ({ addBase }: PluginAPI) => {
			addBase({ [`[data-theme='${name}']`]: declarations });
			/*
				`:root:not([data-theme])` rather than plain `:root`.

				`:root` is specificity (0,1,0) -- identical to `[data-theme='x']` --
				so which one won came down to emission order, and a default theme
				declared after another theme would beat it and make that theme
				impossible to apply. Shipped themes hid the problem because the ones
				with a mode suffix, `[data-theme='dracula'].dark`, are (0,2,0).

				`:not([data-theme])` says what is actually meant: the default applies
				where no theme has been chosen. It cannot match an element that
				carries a theme, so it never competes, whatever the order.
			*/
			if (options.default) addBase({ ':root:not([data-theme])': declarations });
		};
	}
);

export default lunarUiTheme;
