import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import type { ThemeExtend } from '../types.js';

/*
	Gathers the design tokens a standalone plugin has to carry.

	Read from source rather than from a compile: `@theme` values are emitted on
	demand, so compiling the context in isolation would only reveal whichever
	tokens something happened to use.

	Tokens chain -- a component references `--color-primary`, which resolves to
	`--theme-color-primary`, which resolves to `--theme-color-primary-40`, which
	is finally a hex literal. So collection is a transitive closure, not a filter.
*/

const VAR_REFERENCE = /var\(\s*(--[-\w]+)/g;

export type DeclarationScope = 'theme' | 'rule' | 'color-scheme';

export interface CollectedDeclaration {
	scope: DeclarationScope;
	/** Source path relative to core/src, so themes can be split out by file. */
	file: string;
	selector: string;
	prop: string;
	value: string;
}

/** Every custom-property declaration in the context, tagged with its selector. */
export function collectDeclarations(coreSrc: string): CollectedDeclaration[] {
	const componentsDir = path.join(coreSrc, 'components');
	const declarations: CollectedDeclaration[] = [];

	const rel = (full: string): string => path.relative(coreSrc, full).split(path.sep).join('/');

	const visit = (dir: string): void => {
		for (const entry of fs
			.readdirSync(dir, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name))) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (full !== componentsDir) visit(full);
				continue;
			}
			if (!entry.name.endsWith('.css')) continue;
			const root = postcss.parse(fs.readFileSync(full, 'utf8'));

			root.walkAtRules('theme', (atRule) => {
				atRule.walkDecls((decl) => {
					if (!decl.prop.startsWith('--')) return;
					declarations.push({
						scope: 'theme',
						file: rel(full),
						selector: '@theme',
						prop: decl.prop,
						value: decl.value
					});
				});
			});

			root.walkRules((rule) => {
				// @theme blocks are handled above; skip their inner decls.
				for (
					let p: postcss.Container | undefined = rule.parent as postcss.Container | undefined;
					p && p.type !== 'root';
					p = p.parent as postcss.Container | undefined
				) {
					if (p.type === 'atrule' && (p as postcss.AtRule).name === 'theme') return;
				}
				rule.each((node) => {
					if (node.type !== 'decl') return;
					if (node.prop.startsWith('--')) {
						declarations.push({
							scope: 'rule',
							file: rel(full),
							selector: rule.selector,
							prop: node.prop,
							value: node.value
						});
					} else if (node.prop === 'color-scheme') {
						// Not a custom property, but `light-dark()` is inert without it.
						declarations.push({
							scope: 'color-scheme',
							file: rel(full),
							selector: rule.selector,
							prop: node.prop,
							value: node.value
						});
					}
				});
			});
		}
	};

	visit(coreSrc);
	return declarations;
}

/*
	Tailwind's CSS theme namespaces mapped onto the JS theme keys a plugin config
	accepts. Longest prefix wins, so `--font-weight-*` is not swallowed by
	`--font-*`. Registering these is what gives consumers real utilities
	(`text-body-medium`, `duration-medium-2`) rather than bare custom properties.
*/
const THEME_NAMESPACES: Record<string, string> = {
	'--color-': 'colors',
	'--text-': 'fontSize',
	'--font-weight-': 'fontWeight',
	'--font-': 'fontFamily',
	'--tracking-': 'letterSpacing',
	'--leading-': 'lineHeight',
	'--breakpoint-': 'screens',
	'--container-': 'containers',
	'--spacing-': 'spacing',
	'--radius-': 'borderRadius',
	'--shadow-': 'boxShadow',
	'--inset-shadow-': 'insetBoxShadow',
	'--drop-shadow-': 'dropShadow',
	'--blur-': 'blur',
	'--perspective-': 'perspective',
	'--aspect-': 'aspectRatio',
	'--ease-': 'transitionTimingFunction',
	'--duration-': 'transitionDuration',
	'--opacity-': 'opacity',
	'--animate-': 'animation',
	'--animation-': 'animation'
};

const PREFIXES = Object.keys(THEME_NAMESPACES).sort((a, b) => b.length - a.length);

/* `--text-x--line-height` and friends are v4 modifiers on a namespace entry.
   In the JS theme they become the second element of a fontSize tuple. */
const MODIFIERS: Record<string, string> = {
	'--line-height': 'lineHeight',
	'--letter-spacing': 'letterSpacing',
	'--font-weight': 'fontWeight'
};

const namespaceOf = (prop: string): string | null =>
	PREFIXES.find((p) => prop.startsWith(p)) ?? null;

/**
 * Turns `@theme` declarations into a plugin `theme.extend` object.
 *
 * Returns the extend object plus the props it claimed, so the caller knows what
 * still has to be emitted as a plain custom property.
 */
export function buildThemeExtend(declarations: CollectedDeclaration[]): {
	extend: ThemeExtend;
	claimed: Set<string>;
} {
	const extend: ThemeExtend = {};
	const claimed = new Set<string>();
	const modifiers: { base: string; modifier: string; value: string }[] = [];

	for (const decl of declarations) {
		if (decl.scope !== 'theme') continue;

		const modifier = Object.keys(MODIFIERS).find((m) => decl.prop.endsWith(m));
		if (modifier) {
			modifiers.push({
				base: decl.prop.slice(0, -modifier.length),
				modifier,
				value: decl.value
			});
			claimed.add(decl.prop);
			continue;
		}

		const prefix = namespaceOf(decl.prop);
		if (!prefix) continue;
		const key = THEME_NAMESPACES[prefix];
		const name = decl.prop.slice(prefix.length);
		if (!name) continue;
		(extend[key] ??= {})[name] = decl.value;
		claimed.add(decl.prop);
	}

	// Fold modifiers back onto their base entry as a tuple.
	for (const { base, modifier, value } of modifiers) {
		const prefix = namespaceOf(base);
		if (!prefix) continue;
		const key = THEME_NAMESPACES[prefix];
		const name = base.slice(prefix.length);
		const current = extend[key]?.[name];
		if (current === undefined) continue;
		const [size, options] = Array.isArray(current) ? current : [current, {}];
		extend[key][name] = [size, { ...options, [MODIFIERS[modifier]]: value }];
	}

	return { extend, claimed };
}

/*
	Theme entries only materialise as CSS when a *utility* uses them. Compiled
	component CSS references them straight from var(), which Tailwind does not
	track, so those references would dangle in a standalone build.

	Rather than re-emitting the tokens through addBase -- which lands in
	@layer base and would then shadow any override a consumer makes in their own
	@theme -- inline the default as a var() fallback. An override still wins when
	present, and the components still render when it is not.
*/
export function inlineThemeFallbacks<T>(node: T, themeValues: ReadonlyMap<string, string>): T {
	const rewriteValue = (value: string): string =>
		value.replace(/var\(\s*(--[-\w]+)\s*\)/g, (match, name: string) => {
			const fallback = themeValues.get(name);
			return fallback === undefined ? match : `var(${name}, ${fallback})`;
		});

	const walk = (current: unknown): unknown => {
		if (Array.isArray(current)) return current.map(walk);
		if (current === null || typeof current !== 'object') {
			return typeof current === 'string' ? rewriteValue(current) : current;
		}
		return Object.fromEntries(
			Object.entries(current as Record<string, unknown>).map(([k, v]) => [k, walk(v)])
		);
	};

	return walk(node) as T;
}

/** Transitive closure of the variables `seeds` depends on. */
export function resolveClosure(
	seeds: Iterable<string>,
	declarations: CollectedDeclaration[]
): Set<string> {
	const byName = new Map<string, CollectedDeclaration[]>();
	for (const decl of declarations) {
		if (decl.scope === 'color-scheme') continue;
		if (!byName.has(decl.prop)) byName.set(decl.prop, []);
		byName.get(decl.prop)!.push(decl);
	}

	const needed = new Set<string>();
	const queue = [...seeds].map((name) => (name.startsWith('--') ? name : '--' + name));

	while (queue.length) {
		const name = queue.pop()!;
		if (needed.has(name)) continue;
		needed.add(name);
		for (const decl of byName.get(name) ?? []) {
			for (const match of decl.value.matchAll(VAR_REFERENCE)) queue.push(match[1]);
		}
	}
	return needed;
}
