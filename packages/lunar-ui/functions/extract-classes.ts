import postcss from 'postcss';

const CLASS_IN_SELECTOR = /\.(-?[_a-zA-Z][\w-]*)/g;

/*
	Generic state hooks lunar-ui reads but does not own. They show up in
	component selectors (`.badge.disabled`) yet belong to the consumer's markup,
	so a prefix must never rename them.
*/
const STATE_HOOKS = new Set([
	'disabled',
	'selected',
	'active',
	'checked',
	'open',
	'collapsed',
	'dragged'
]);

/*
	Classes whose names are also written in JavaScript -- the ripple action
	creates elements with `class="lunar-ripple"`. Prefixing the CSS would leave
	the action pointing at a class that no longer exists, so these ship as-is.
*/
export const JS_COUPLED: ReadonlySet<string> = new Set(['lunar-ripple']);

/**
 * Class names a stylesheet defines.
 *
 * `@utility` blocks are authoritative. Plain class selectors are only counted
 * when they sit in the given namespace -- otherwise Tailwind builtins the file
 * merely references (`.sr-only`) get claimed as ours and renamed. Foundations
 * are not namespaced (`surface`, `focusable`, `elevation-1`), so they pass
 * `namespace: null`, which accepts any plain class that is not a state hook.
 *
 * Tailwind emits an `@utility` only when something references it, so this list
 * is fed back to the compile as a safelist.
 */
export function extractClasses(css: string, namespace: string | null): string[] {
	const root = postcss.parse(css);
	const classes = new Set<string>();

	root.walkAtRules('utility', (rule) => {
		const name = rule.params.trim();
		if (name.includes('*')) {
			console.warn(`  ! skipping functional utility: @utility ${name}`);
			return;
		}
		classes.add(name);
	});

	/*
		A file's own `@utility` names describe what it owns better than its file
		name does: collapsible.css declares `collapse`, navigation.css declares
		`nav-rail` and `nav-link`. Filtering plain selectors by the file name
		alone would drop those, so the declared utilities widen the namespace.
	*/
	const namespaces = namespace === null ? null : [namespace, ...classes];
	const owned = (name: string): boolean =>
		namespaces === null || namespaces.some((ns) => name === ns || name.startsWith(`${ns}-`));

	root.walkRules((rule) => {
		if (rule.parent?.type === 'atrule' && (rule.parent as postcss.AtRule).name === 'utility') {
			return;
		}
		for (const match of rule.selector.matchAll(CLASS_IN_SELECTOR)) {
			const name = match[1];
			if (STATE_HOOKS.has(name)) continue;
			if (!owned(name)) continue;
			classes.add(name);
		}
	});

	return [...classes].sort();
}

/** Custom property names declared inside `@theme` blocks. */
export function extractThemeVariables(css: string): Set<string> {
	const root = postcss.parse(css);
	const variables = new Set<string>();
	root.walkAtRules('theme', (atRule) => {
		atRule.walkDecls((decl) => {
			if (decl.prop.startsWith('--')) variables.add(decl.prop.slice(2));
		});
	});
	return variables;
}

/** Custom property names declared anywhere in a stylesheet (e.g. Tailwind's theme.css). */
export function extractRootVariables(css: string): Set<string> {
	const root = postcss.parse(css);
	const variables = new Set<string>();
	root.walkDecls((decl) => {
		if (decl.prop.startsWith('--')) variables.add(decl.prop.slice(2));
	});
	return variables;
}
