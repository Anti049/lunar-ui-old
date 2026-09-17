import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

/*
	Turns `@custom-variant` blocks into the argument `addVariant` takes.

	This used to be a hand-written list, which silently carried only one of the
	three variants lunar-ui defines -- `collapsed` and `nav-link-active` were
	simply missing, and `collapsed` is used by the docs layout.

	A variant body marks where utilities go with `@slot`. Every rule containing
	one contributes a selector, wrapped in whatever at-rules enclose it:

	  @custom-variant collapsed {
	    @media (width < theme(--breakpoint-medium)) {
	      &:where(.nav-rail:not(:hover)) { @slot; }
	    }
	    &:where(.scaffold[data-minimized] .nav-rail) { @slot; }
	  }

	becomes two selector strings, one media-wrapped. Verified against Tailwind
	4.3.3: the plain, media-wrapped and array forms all work, and `theme()`
	survives inside the media condition -- it resolves to the breakpoint value,
	so nothing has to be baked in at build time.
*/

export type VariantSelector = string | string[];

const containsSlot = (rule: postcss.Rule): boolean => {
	let found = false;
	rule.walkAtRules('slot', () => {
		found = true;
		return false;
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

/** Every `@custom-variant` lunar-ui defines, keyed by name. */
export function extractCustomVariants(coreSrc: string): Record<string, VariantSelector> {
	const variants: Record<string, VariantSelector> = {};

	const visit = (dir: string): void => {
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
