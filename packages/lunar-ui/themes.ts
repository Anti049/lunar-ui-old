import swatches from './generated/swatches.js';
import { SWATCH_ROLES, type SwatchRole, type ThemeSwatches } from './functions/extract-swatches.js';

/*
	The theme catalogue, for JavaScript.

	    import { THEME_NAMES, THEME_SWATCHES } from '@anti049/lunar-ui/themes';

	Enough to build a theme picker without hard-coding names or reading computed
	styles off the DOM. Data only -- importing this does not load the plugin, and
	it is not the thing you pass to `@plugin`.

	Deliberately free of runtime dependencies. Resolving a theme you generate
	yourself needs `swatchesFor` from `@anti049/lunar-ui/theme`, which pulls in
	material-color-utilities -- a package whose extensionless internal imports
	Node's ESM resolver rejects outright. Keeping that out of here means a list
	of names costs nothing and works in any runtime.

	Every theme reports both modes. A swatch sits next to a theme's name in a
	list, and has to look like that theme whichever mode the surrounding page is
	in, so one value per theme would be wrong half the time. A theme that does
	not vary by mode -- `catppuccin-mocha` is dark wherever it is used -- reports
	the same colours for both rather than inventing a variant.
*/

export { SWATCH_ROLES };
export type { SwatchRole, ThemeSwatches };

/** Every `data-theme` value the shipped themes answer to, sorted. */
export const THEME_NAMES: string[] = Object.keys(swatches);

/** Representative colours per shipped theme, both modes. */
export const THEME_SWATCHES: Record<string, ThemeSwatches> = swatches;
