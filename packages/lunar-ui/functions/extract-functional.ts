import postcss from 'postcss';
import type { FunctionalUtility } from '../types.js';

/*
	Functional utilities -- `@utility tooltip-gap-*` and friends.

	These cannot go through the compile-and-partition path the rest of the build
	uses. That path works by safelisting every class name and keeping whatever
	Tailwind emits, and a functional utility has no finite set of names to
	safelist. So they are read straight from source here and re-registered at
	runtime through `matchUtilities`.

	Only the two value forms lunar-ui actually authors are understood:

	    --tooltip-gap: --spacing(--value(number));   a number off the spacing scale
	    --tooltip-gap: --value([*]);                 an arbitrary value

	Anything else throws. A functional utility that silently failed to port
	would look exactly like one that works until a consumer tried to use it,
	which is the failure mode this build tries hardest to avoid.
*/

/** `--spacing(--value(number))`, ignoring incidental whitespace. */
const SPACING_NUMBER = /^--spacing\(\s*--value\(\s*number\s*\)\s*\)$/;

/*
	`--value([*])` -- any arbitrary value, including `calc()` and `var()`.

	Whitespace is tolerated inside the brackets: Prettier reformats `[*]` to
	`[ *]`, Tailwind treats the two identically, and a formatter run should not
	be able to silently unregister a utility.
*/
const ARBITRARY = /^--value\(\s*\[\s*\*\s*\]\s*\)$/;

/**
 * Functional utilities a stylesheet declares.
 *
 * `bundle` is the owning bundle so the plugin can honour `include`/`exclude`
 * the same way it does for everything else.
 */
export function extractFunctional(css: string, bundle: string): FunctionalUtility[] {
	const root = postcss.parse(css);
	const found: FunctionalUtility[] = [];

	root.walkAtRules('utility', (rule) => {
		const params = rule.params.trim();
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
					`${bundle}: @utility ${params} declares ${decl.prop}: ${value}, which the build ` +
						`does not know how to register through matchUtilities. Supported forms are ` +
						`--spacing(--value(number)) and --value([*]).`
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
