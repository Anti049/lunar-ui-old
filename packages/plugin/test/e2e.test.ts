/*
	End-to-end check of the CSS -> JS pipeline.

	Compiles badge + button twice from the same source of truth:
	  baseline  - lunar-ui's current pure-CSS path (@import the component files)
	  candidate - the generated plugin (@plugin dist/index.js)
	then compares what each produced. A faithful port means the same selectors
	carry the same declarations under the same cascade layers.

	Also asserts the prefix option renames what lunar-ui owns and nothing else.
*/
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { extractClasses } from '../build/extract-classes.js';
import { extractCustomVariants } from '../build/extract-variants.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const coreSrc = path.resolve(pkgRoot, '../core/src');
const tmpDir = path.join(pkgRoot, 'dist', '.test');

/* Mirrors build/build.ts: every component stylesheet that defines something.
   Derived rather than hard-coded, so a component added to core is compared
   automatically instead of silently going unchecked. */
const componentsDir = path.join(coreSrc, 'components');
const COMPONENTS = fs
	.readdirSync(componentsDir)
	.filter((f) => f.endsWith('.css') && f !== '_index.css')
	.map((f) => f.replace(/\.css$/, ''))
	.filter(
		(name) =>
			extractClasses(fs.readFileSync(path.join(componentsDir, `${name}.css`), 'utf8'), name).length >
			0
	)
	.sort();
const cliEntry = path.join(
	path.dirname(require.resolve('@tailwindcss/cli/package.json')),
	'dist/index.mjs'
);
const toPosix = (p: string): string => p.split(path.sep).join('/');
const rel = (target: string): string => toPosix(path.relative(tmpDir, target));

function compile(input: string, label: string): string {
	const inFile = path.join(tmpDir, label + '.in.css');
	const outFile = path.join(tmpDir, label + '.out.css');
	fs.writeFileSync(inFile, input);
	try {
		execFileSync(process.execPath, [cliEntry, '-i', inFile, '-o', outFile], { stdio: 'pipe' });
	} catch (error) {
		const detail = ((error as { stderr?: Buffer }).stderr?.toString() || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
		throw new Error('tailwind failed on ' + label + ':\n' + detail);
	}
	return fs.readFileSync(outFile, 'utf8');
}

/* Splits a selector list on top-level commas only, so `:is(a, b)` stays intact.
   Tailwind regroups selector lists when it re-emits plugin output, so comparing
   raw selector strings would report differences that are purely cosmetic. */
function splitSelectors(selector: string): string[] {
	const parts = [];
	let depth = 0;
	let current = '';
	for (const ch of selector) {
		if (ch === '(' || ch === '[') depth++;
		else if (ch === ')' || ch === ']') depth--;
		if (ch === ',' && depth === 0) {
			parts.push(current);
			current = '';
			continue;
		}
		current += ch;
	}
	parts.push(current);
	return parts.map(normalizeSelector).filter(Boolean);
}

/* Tailwind reformats whitespace inside selectors when it re-emits plugin
   output (`:has( > svg)` vs `:has(> svg)`). Normalize so those don't read as
   different selectors. */
function normalizeSelector(selector: string): string {
	return selector
		.replace(/\s+/g, ' ')
		.replace(/\s*([(),>+~])\s*/g, '$1')
		.trim();
}

/* selector -> sorted "prop: value" list, independent of layer nesting and of
   how selector lists happen to be grouped. */
function rulesBySelector(css: string, keep: (selector: string) => boolean): Map<string, string[]> {
	const root = postcss.parse(css);
	const out = new Map<string, string[]>();
	root.walkRules((rule) => {
		const decls: string[] = [];
		rule.each((node) => {
			if (node.type === 'decl') decls.push(node.prop + ': ' + node.value);
		});
		if (!decls.length) return;
		for (const selector of splitSelectors(rule.selector)) {
			if (!keep(selector)) continue;
			out.set(selector, [...(out.get(selector) ?? []), ...decls]);
		}
	});
	for (const [k, v] of out) out.set(k, [...new Set(v)].sort());
	return out;
}

/* layer path a selector's rules sit under, e.g. "utilities > badge.l3" */
function layerPaths(css: string, keep: (selector: string) => boolean): Map<string, Set<string>> {
	const root = postcss.parse(css);
	const out = new Map<string, Set<string>>();
	root.walkRules((rule) => {
		const layers: string[] = [];
		for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
			if (p.type === 'atrule' && p.name === 'layer') layers.unshift(p.params);
		}
		for (const selector of splitSelectors(rule.selector)) {
			if (!keep(selector)) continue;
			const set = out.get(selector) ?? new Set();
			set.add(layers.join(' > ') || '(top level)');
			out.set(selector, set);
		}
	});
	return out;
}

const componentClasses = COMPONENTS.flatMap((c) =>
	extractClasses(fs.readFileSync(path.join(componentsDir, c + '.css'), 'utf8'), c)
);
// Foundations (`surface`, `focusable`, `elevation-3`) are part of the public
// surface too, and are not namespaced -- hence `namespace: null`.
const foundationsDir = path.join(coreSrc, 'foundations');
const foundationClasses = fs
	.readdirSync(foundationsDir)
	.filter((f) => f.endsWith('.css') && f !== '_index.css')
	.flatMap((f) => extractClasses(fs.readFileSync(path.join(foundationsDir, f), 'utf8'), null));

const ownedClasses = new Set([...componentClasses, ...foundationClasses]);
const safelist = [...ownedClasses].sort();
const contextImport = "@import '" + rel(path.join(pkgRoot, 'src/context.css')) + "';";
const pluginPath = rel(path.join(pkgRoot, 'dist/index.js'));
const sourceLines = safelist.map((c) => '@source inline("' + c + '");');
const prefixedSourceLines = safelist.map((c) => '@source inline("lunar-' + c + '");');

fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

const baseline = compile(
	[
		contextImport,
		...COMPONENTS.map((c) => "@import '" + rel(path.join(componentsDir, c + '.css')) + "';"),
		...sourceLines
	].join('\n'),
	'baseline'
);
const candidate = compile(
	[contextImport, "@plugin '" + pluginPath + "';", ...sourceLines].join('\n'),
	'candidate'
);
const prefixed = compile(
	[
		contextImport,
		"@plugin '" + pluginPath + "' {",
		'\tprefix: lunar-;',
		'}',
		...prefixedSourceLines
	].join('\n'),
	'prefixed'
);

/* No CSS import at all -- the plugin must carry its own tokens. */
const standalone = compile(
	["@import 'tailwindcss' source(none);", "@plugin '" + pluginPath + "';", ...sourceLines].join(
		'\n'
	),
	'standalone'
);

/* Match on whole class tokens, not substrings: foundations own generic names
   like `.error` and `.surface`, and `.button` must not claim `.button-text`
   by accident. */
const classesIn = (selector: string): string[] =>
	[...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
const owns = (selector: string): boolean => classesIn(selector).some((c) => ownedClasses.has(c));
const ownsPrefixed = (selector: string): boolean =>
	classesIn(selector).some((c) => c.startsWith('lunar-') && ownedClasses.has(c.slice(6)));

const base = rulesBySelector(baseline, owns);
const cand = rulesBySelector(candidate, owns);

const failures = [];
const notes = [];

// 1. Same set of selectors.
//
// Re-emitting through the plugin API leaves redundant wrappers behind:
// `:is(:is(x), y)` for `:is(x, y)`, and a trailing `:where(.selected)` on rules
// whose selector already carries `.selected`. Neither changes what matches --
// `:where()` contributes no specificity and `:is()` takes its most specific
// argument -- so collapse them before deciding a selector is genuinely new.
const collapseRedundant = (selector: string): string => {
	let out = selector;
	let previous;
	do {
		previous = out;
		out = out
			.replace(/:is\((:is\([^()]*\))\)/g, '$1')
			.replace(/:is\(([^(),]*)\)/g, '$1')
			// Re-emitting a nested rule can re-apply a qualifier the selector
			// already carries, giving `:not(:disabled):not(:disabled)`. It matches
			// the same elements as one copy.
			.replace(/(:not\(([^()]*)\))\1+/g, '$1');
	} while (out !== previous);
	return out;
};
const withoutWhere = (selector: string): string => collapseRedundant(selector.replace(/:where\([^()]*\)/g, ''));

/*
	A few lunar-ui names collide with Tailwind built-ins -- `collapse`, `table`,
	`select-text`. The build deliberately leaves Tailwind's own rules for those
	unclaimed, so they are absent from the plugin and present in the baseline.
	Consumers still get them, from `@import 'tailwindcss'`.
*/
const builtinProbe = compile(
	["@import 'tailwindcss' source(none);", ...sourceLines].join('\n'),
	'builtins'
);
const builtinClasses = new Set(
	[...builtinProbe.matchAll(/^\s*\.([-\w]+)\s*(?:,|\{)/gm)]
		.map((m) => m[1])
		.filter((c) => ownedClasses.has(c))
);
const isTailwindBuiltin = (selector: string): boolean =>
	classesIn(selector).every((c) => builtinClasses.has(c));

const baseCollapsed = new Set([...base.keys()].map(withoutWhere));
const missing = [...base.keys()].filter((k) => !cand.has(k) && !isTailwindBuiltin(k));
const missingBuiltins = [...base.keys()].filter((k) => !cand.has(k) && isTailwindBuiltin(k));
const extraAll = [...cand.keys()].filter((k) => !base.has(k));
const extra = extraAll.filter((k) => !baseCollapsed.has(withoutWhere(k)));
const extraRedundant = extraAll.length - extra.length;

/*
	Re-registering a component whose rules were authored as several selector
	forms (`.nav-link`, `.nav-link:disabled`, `.nav-link:not(:disabled)`) makes
	Tailwind re-compose them, so the plugin emits narrower duplicates the
	CSS-first build never wrote -- `.nav-link:not(:disabled):disabled`, which
	matches nothing at all. That is bloat, not a behaviour change, but only as
	long as such a selector carries nothing the baseline did not already say.
*/
const baselineDeclarations = new Set([...base.values()].flat());
const extraWithNewDeclarations = extra.filter((selector) =>
	(cand.get(selector) ?? []).some((decl) => !baselineDeclarations.has(decl))
);
const extraDuplicates = extra.length - extraWithNewDeclarations.length;

if (missing.length) failures.push(missing.length + ' selectors missing from plugin output');
if (extraWithNewDeclarations.length) {
	failures.push(
		extraWithNewDeclarations.length + ' selectors only in plugin output, carrying new declarations'
	);
}

// 2. Same declarations per selector.
//
// Two kinds of benign difference show up here:
//   fallback folding - Tailwind collapses `var(--tw-x, ...)` to the literal in
//     its own utility output, but leaves plugin-supplied declarations as
//     authored. Same computed value, since --tw-x is set in the same rule.
//   superset - selector-list regrouping means a plugin rule can legitimately
//     carry declarations the CSS-first build reached through a different group.
const splitDecl = (d: string): [string, string] => {
	const at = d.indexOf(': ');
	return [d.slice(0, at), d.slice(at + 2)];
};

function foldsToSame(baseDecls: string[], candDecls: string[]): boolean {
	const declared = new Map(baseDecls.concat(candDecls).map(splitDecl));
	for (const d of baseDecls) {
		if (candDecls.includes(d)) continue;
		const [prop, literal] = splitDecl(d);
		const counterpart = candDecls.find((c) => splitDecl(c)[0] === prop);
		if (!counterpart) return false;
		const variable = /^var\((--[-\w]+)/.exec(splitDecl(counterpart)[1])?.[1];
		if (!variable || declared.get(variable) !== literal) return false;
	}
	return true;
}

/* The plugin inlines each theme default as a var() fallback so standalone
   builds resolve. `var(--x)` and `var(--x, <default>)` compute the same thing
   whenever --x is defined, and the fallback only matters when it is not. */
/* Fallbacks nest -- `var(--a, var(--b, var(--c)))` -- so this walks balanced
   parens rather than pattern-matching, reducing every var() to just its name. */
function stripFallbacks(value: string): string {
	let out = '';
	for (let i = 0; i < value.length; i++) {
		if (!value.startsWith('var(', i)) {
			out += value[i];
			continue;
		}
		let depth = 0;
		let end = i;
		for (; end < value.length; end++) {
			if (value[end] === '(') depth++;
			else if (value[end] === ')' && --depth === 0) break;
		}
		const inner = value.slice(i + 4, end);
		out += 'var(' + (/^\s*(--[-\w]+)/.exec(inner)?.[1] ?? inner.trim()) + ')';
		i = end;
	}
	return out;
}
let realMismatches = 0;
let foldedCount = 0;
let supersetCount = 0;
let fallbackCount = 0;
for (const [selector, decls] of base) {
	const other = cand.get(selector);
	if (!other || JSON.stringify(decls) === JSON.stringify(other)) continue;

	// Normalize fallbacks away first, so a selector that differs by both an
	// inlined fallback and a regrouping is still recognised as benign.
	const normBase = [...new Set(decls.map(stripFallbacks))].sort();
	const normCand = [...new Set(other.map(stripFallbacks))].sort();
	const onlyBase = normBase.filter((d) => !normCand.includes(d));
	const onlyCand = normCand.filter((d) => !normBase.includes(d));

	if (!onlyBase.length && !onlyCand.length) {
		fallbackCount++;
		continue;
	}
	if (!onlyBase.length) {
		supersetCount++;
		continue;
	}
	if (foldsToSame(normBase, normCand)) {
		foldedCount++;
		continue;
	}
	realMismatches++;
	if (realMismatches <= 3) {
		notes.push(
			'  ' +
				selector +
				'\n    only in CSS-first: ' +
				(onlyBase.join('; ') || '-') +
				'\n    only in plugin:    ' +
				(onlyCand.join('; ') || '-')
		);
	}
}
if (realMismatches) failures.push(realMismatches + ' selectors differ in declarations');

// 3. Cascade position.
const baseLayers = layerPaths(baseline, owns);
const candLayers = layerPaths(candidate, owns);
const layerMoves = [];
for (const [selector, paths] of baseLayers) {
	const other = candLayers.get(selector);
	if (!other) continue;
	const a = [...paths].sort().join(',');
	const b = [...other].sort().join(',');
	if (a !== b) layerMoves.push('  ' + selector + '\n    CSS-first: ' + a + '\n    plugin:    ' + b);
}

// 4. Prefix behaviour.
const prefixedSelectors = rulesBySelector(prefixed, ownsPrefixed);
const strippedPrefixed = prefixed.replace(/\.lunar-/g, '.X-');
const prefixChecks = [
	[
		'renames library classes',
		prefixedSelectors.size > 0 && [...prefixedSelectors.keys()].every((s) => s.includes('.lunar-'))
	],
	['renames component-local vars', prefixed.includes('--lunar-button-color')],
	['leaves Tailwind/theme vars alone', !prefixed.includes('--lunar-color-')],
	[
		'leaves consumer state hooks alone',
		prefixed.includes('.disabled') && !prefixed.includes('.lunar-disabled')
	],
	['no unprefixed library class survives', !/\.badge[\s.,:[{]/.test(strippedPrefixed)]
];

console.log('selectors compared: ' + base.size + ' (CSS-first) vs ' + cand.size + ' (plugin)\n');

console.log('parity');
console.log('  present in both:        ' + [...base.keys()].filter((k) => cand.has(k)).length);
console.log('  missing from plugin:    ' + missing.length +
  (missingBuiltins.length ? '  (+' + missingBuiltins.length + ' Tailwind built-ins, deliberately unclaimed)' : ''));
console.log('  extra in plugin:        ' + extraWithNewDeclarations.length + ' with new declarations');
console.log('    also ' + extraDuplicates + ' narrower duplicates (no new declarations) and ' + extraRedundant + ' redundant wrappers');
console.log('  benign (inlined var fallback):  ' + fallbackCount);
console.log('  benign (var fallback folding): ' + foldedCount);
console.log('  benign (regrouped superset):   ' + supersetCount);
console.log('  real declaration conflicts:    ' + realMismatches);
if (missing.length) for (const m of missing.slice(0, 5)) console.log('    missing: ' + m);
if (extra.length) for (const e of extra.slice(0, 5)) console.log('    extra:   ' + e);
if (notes.length) console.log(notes.join('\n'));

console.log('\ncascade');
if (!layerMoves.length) console.log('  every selector kept its layer path');
else {
	console.log('  ' + layerMoves.length + ' selectors changed layer:');
	console.log(layerMoves.slice(0, 4).join('\n'));
	if (layerMoves.length > 4) console.log('  ... and ' + (layerMoves.length - 4) + ' more');
}

// 5. Standalone: tokens must resolve with no CSS import in play.
const declaredVars = new Set([...standalone.matchAll(/(--[-\w]+)\s*:/g)].map((m) => m[1]));
const referencedVars = new Map();
for (const m of standalone.matchAll(/var\(\s*(--[-\w]+)\s*([,)])/g)) {
	const [, name, next] = m;
	if (!referencedVars.has(name)) referencedVars.set(name, false);
	if (next === ',') referencedVars.set(name, true);
}
// Tailwind's own preflight internals are always referenced with a fallback and
// never declared; a hard reference to something undefined is a real break.
/*
	Nothing is exempt any more. Both references lunar-ui had to variables it
	never declared have been fixed at source -- `--depth` removed from
	checkbox.css, `--color-on-surface-container` corrected in select.css -- so
	any dangling reference is now a hard failure.
*/
const danglingHard = [...referencedVars]
	.filter(([name, hasFallback]) => !hasFallback && !declaredVars.has(name))
	.map(([name]) => name);

/* Theme switching: every semantic token the components read must resolve under
   each shipped theme -- either the theme sets it directly (catppuccin, dracula)
   or the mode layer derives it from tone steps the theme sets (default,
   gaziter). The default theme sits at :where(:root), zero specificity, so it
   always underlies whatever a [data-theme] selector does not override. */
const base_ = (await import('../src/generated/base.js')).default;
const themeRules = (await import('../src/generated/themes.js')).default;
const customVariants = (await import('../src/generated/variants.js')).default;
const sourceVariantNames = Object.keys(extractCustomVariants(coreSrc));
const themeExtendForTest = (await import('../src/generated/theme.js')).default;

/*
	Theme palettes live in generated/themes.ts, keyed by theme id; the mode layer
	that maps tone steps onto semantic roles stays in generated/base.ts. Flatten
	both so resolvability is checked against what a consumer actually receives.
*/
const allThemeSelectors: Record<string, Record<string, string>> = { ...base_ };
for (const perTheme of Object.values(themeRules)) {
	for (const [selector, decls] of Object.entries(perTheme)) {
		allThemeSelectors[selector] = { ...(allThemeSelectors[selector] ?? {}), ...decls };
	}
}
const componentObjects = COMPONENTS.map((c) =>
	fs.readFileSync(path.join(pkgRoot, 'src/generated/components', c, 'object.ts'), 'utf8')
).join('');
const semanticTokens = new Set(
	[...componentObjects.matchAll(/var\(\s*(--theme-color-[-\w]+)/g)].map((m) => m[1])
);
const modeSelector = Object.keys(allThemeSelectors).find(
	(s) => s.includes('[data-theme]') && s.includes(':root')
);
const modeLayer = modeSelector ? (allThemeSelectors[modeSelector] ?? {}) : {};
const defaultSelector = Object.keys(allThemeSelectors).find((s) => s.includes(':where(:root)'));
const defaultTokens = new Set(Object.keys(defaultSelector ? (allThemeSelectors[defaultSelector] ?? {}) : {}));

const unresolvableThemes: string[] = [];
for (const [selector, decls] of Object.entries(allThemeSelectors)) {
	if (selector === modeSelector || !selector.includes('data-theme')) continue;
	const defines = new Set([...Object.keys(decls), ...defaultTokens]);
	const unresolved = [...semanticTokens].filter((token) => {
		if (defines.has(token)) return false;
		const derived = modeLayer[token];
		if (!derived) return true;
		return ![...derived.matchAll(/var\(\s*(--[-\w]+)/g)]
			.map((m) => m[1])
			.every((tone) => defines.has(tone));
	});
	if (unresolved.length) unresolvableThemes.push(selector.split(',')[0] + ' (' + unresolved.length + ')');
}

const themeSelectorCount = Object.keys(allThemeSelectors).filter((s) => s.includes('data-theme')).length;

const standaloneRules = rulesBySelector(standalone, owns);
const standaloneChecks = [
	[
		'emits the same component rules as the plugin-with-context build',
		[...cand.keys()].every((selector) => standaloneRules.has(selector))
	],
	['no var() reference left dangling', danglingHard.length === 0],
	['carries the theme token chain', standalone.includes('--theme-color-primary-40:')],
	['carries color-scheme for light-dark()', standalone.includes('color-scheme')],
	['registers theme colors as utilities', /\.bg-primary\b|--color-primary\s*:/.test(standalone)],
	[
		'every shipped theme resolves (' + themeSelectorCount + ' selectors)',
		unresolvableThemes.length === 0
	],
	[
		'ships the foundation utilities (' + foundationClasses.length + ' classes)',
		/\.surface\s*\{/.test(standalone) && /\.elevation-3\s*\{/.test(standalone)
	],
	[
		'composite utilities carry both halves (surface = bg + text)',
		(() => {
			const rule = /\.surface\s*\{([^}]*)\}/.exec(standalone)?.[1] ?? '';
			return /background-color\s*:/.test(rule) && /(^|[^-])color\s*:/.test(rule);
		})()
	],
	[
		'JS-coupled class keeps its name under a prefix',
		prefixed.includes('.lunar-ripple') && !prefixed.includes('.lunar-lunar-ripple')
	],
	[
		'registers non-color namespaces too',
		['fontSize', 'transitionDuration', 'transitionTimingFunction', 'screens'].every(
			(key) => key in themeExtendForTest
		)
	]
];

console.log('\nstandalone (@plugin only, no @import of lunar-ui)');
console.log(
	'  selectors: ' + standaloneRules.size + ' | variables declared: ' + declaredVars.size
);
for (const [label, ok] of standaloneChecks) {
	console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + label);
	if (!ok) failures.push('standalone: ' + label);
}
if (danglingHard.length) for (const v of danglingHard.slice(0, 10)) console.log('    dangling: ' + v);
if (unresolvableThemes.length) for (const t of unresolvableThemes) console.log('    unresolved: ' + t);

console.log('\nprefix');
for (const [label, ok] of prefixChecks) {
	console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + label);
	if (!ok) failures.push('prefix: ' + label);
}

// 6. Theme selection and custom themes.
const themePluginPath = rel(path.join(pkgRoot, 'dist/theme.js'));
const themesOf = (css: string): Set<string> =>
	new Set([...css.matchAll(/\[data-theme='([^']+)'\]/g)].map((m) => m[1]));

/** Compiles and returns the lunar-ui error message, or null if it succeeded. */
function compileExpectingError(input: string, label: string): string | null {
	try {
		compile(input, label);
		return null;
	} catch (error) {
		return /lunar-ui: [^\n│]*/.exec(String((error as Error).message))?.[0]?.trim() ?? 'unknown error';
	}
}

const selected = compile(
	["@import 'tailwindcss' source(none);", `@plugin '${pluginPath}' { themes: dracula; }`].join('\n'),
	'themes-selected'
);
const selectedThemes = themesOf(selected);

const generated = compile(
	[
		"@import 'tailwindcss' source(none);",
		`@plugin '${pluginPath}' { themes: dracula; }`,
		`@plugin '${themePluginPath}' {`,
		'\tname: brand;',
		'\tseed: #0956AA;',
		'\tvariant: monochrome;',
		'\tdefault: true;',
		"\t--theme-color-primary-40: #ff00ff;",
		'}',
		`@plugin '${themePluginPath}' {`,
		'\tname: nightfall;',
		'\t--theme-color-primary: #8be9fd;',
		'\tcolor-scheme: dark;',
		'}'
	].join('\n'),
	'themes-custom'
);
const brandRule = /\[data-theme='brand'\]\s*\{([^}]*)\}/.exec(generated)?.[1] ?? '';

/* Same themes, but the default is declared last -- the order that used to break. */
const defaultDeclaredLast = compile(
	[
		"@import 'tailwindcss' source(none);",
		`@plugin '${themePluginPath}' { name: other; seed: #b5179e; }`,
		`@plugin '${themePluginPath}' { name: brand; seed: #0956AA; default: true; }`
	].join('\n'),
	'themes-default-last'
);

/* Status palettes should follow the seed, not sit at fixed hues -- the shipped
   default and gaziter themes have entirely different status colours. */
const statusOf = (css: string, palette: string): string | undefined =>
	new RegExp(`--theme-color-${palette}-40:\\s*(#[0-9a-f]+)`).exec(css)?.[1];

const harmonizedBlue = compile(
	[
		"@import 'tailwindcss' source(none);",
		`@plugin '${themePluginPath}' { name: t; seed: #0956AA; }`
	].join('\n'),
	'themes-harmonized-blue'
);
const harmonizedGreen = compile(
	[
		"@import 'tailwindcss' source(none);",
		`@plugin '${themePluginPath}' { name: t; seed: #006c4e; }`
	].join('\n'),
	'themes-harmonized-green'
);
const unharmonized = compile(
	[
		"@import 'tailwindcss' source(none);",
		`@plugin '${themePluginPath}' { name: t; seed: #0956AA; harmonize: false; }`
	].join('\n'),
	'themes-unharmonized'
);

/* Shape tokens: defaults at :root, overridable globally or per theme. */
const shaped = compile(
	[
		"@import 'tailwindcss' source(none);",
		`@plugin '${pluginPath}' { --radius-box: 1.5rem; --border-width: 2px; }`,
		`@plugin '${themePluginPath}' { name: sharp; seed: #0956AA; --radius-box: 0; }`
	].join('\n'),
	'shape-tokens'
);
const sharpRule = /\[data-theme='sharp'\]\s*\{([^}]*)\}/.exec(shaped)?.[1] ?? '';
const shapeDefaults = compile(
	["@import 'tailwindcss' source(none);", `@plugin '${pluginPath}';`].join('\n'),
	'shape-defaults'
);

const themeChecks: [string, boolean][] = [
	[
		'shape tokens have defaults at :root',
		['--radius-selector', '--radius-field', '--radius-box', '--size-selector', '--size-field',
			'--border-width', '--animation-duration', '--animation-easing'
		].every((token) => shapeDefaults.includes(token + ':'))
	],
	[
		'shape defaults resolve standalone (fallbacks inlined)',
		/--animation-easing:\s*var\(--ease-standard,\s*[^)]+\)/.test(shapeDefaults)
	],
	[
		'shape tokens are overridable on the plugin',
		/--radius-box:\s*1\.5rem/.test(shaped) && /--border-width:\s*2px/.test(shaped)
	],
	['shape tokens are overridable per theme', /--radius-box:\s*0/.test(sharpRule)],
	/*
		Every @custom-variant lunar-ui defines must be registered. Hand-listing
		these shipped 1 of 3 -- `collapsed` was missing while the docs layout used
		it. Derived from source now, so the count is checked against the source.
	*/
	[
		'every @custom-variant is registered (' + Object.keys(customVariants).length + ')',
		Object.keys(customVariants).length === sourceVariantNames.length
	],
	[
		'a multi-branch variant keeps every branch',
		Array.isArray(customVariants.collapsed) && customVariants.collapsed.length === 2
	],
	[
		'status palettes harmonize toward the seed',
		statusOf(harmonizedBlue, 'success') !== statusOf(unharmonized, 'success')
	],
	[
		'harmonized status differs between seeds',
		statusOf(harmonizedBlue, 'info') !== statusOf(harmonizedGreen, 'info')
	],
	[
		'harmonize: false leaves the status hues exact',
		statusOf(unharmonized, 'success') === '#006c49'
	],
	[
		'harmonizing keeps success recognisably green',
		/^#0/.test(statusOf(harmonizedBlue, 'success') ?? '')
	],
	['`themes` keeps the requested theme', selectedThemes.has('dracula')],
	['`themes` drops the rest', !selectedThemes.has('catppuccin-mocha') && !selectedThemes.has('gaziter')],
	['`default` is always kept, since others inherit from it', selectedThemes.has('default')],
	['seed generates a full tone scale', (brandRule.match(/--theme-color-primary-\d+:/g) ?? []).length === 30],
	['variant changes the generated palette', /--theme-color-secondary-40:\s*#5e5e5e/.test(brandRule)],
	['hand-declared roles beat the generated ones', /--theme-color-primary-40:\s*#ff00ff/.test(brandRule)],
	['role-only themes need no seed', themesOf(generated).has('nightfall')],
	[
		'`default: true` applies where no theme is set',
		/:root:not\(\[data-theme\]\)\s*\{[^}]*--theme-color-primary-40:\s*#ff00ff/.test(generated)
	],
	/*
		Regression: the default used to emit at plain `:root`, specificity (0,1,0)
		-- the same as `[data-theme='x']` -- so whichever came last won. A default
		theme declared after another theme made that theme impossible to apply.
		Shipped themes masked it, because `[data-theme='dracula'].dark` is (0,2,0).
	*/
	[
		'a default declared last cannot outrank other themes',
		!/(^|[^)])\s:root\s*\{/m.test(defaultDeclaredLast) &&
			/:root:not\(\[data-theme\]\)/.test(defaultDeclaredLast)
	]
];

const themeErrors: [string, string | null][] = [
	[
		'unknown theme',
		compileExpectingError(
			["@import 'tailwindcss' source(none);", `@plugin '${pluginPath}' { themes: nope; }`].join('\n'),
			'themes-err-unknown'
		)
	],
	[
		'unknown variant',
		compileExpectingError(
			[
				"@import 'tailwindcss' source(none);",
				`@plugin '${themePluginPath}' { name: x; seed: #0956AA; variant: sparkly; }`
			].join('\n'),
			'themes-err-variant'
		)
	],
	[
		'a misspelled shape token',
		compileExpectingError(
			[
				"@import 'tailwindcss' source(none);",
				`@plugin '${pluginPath}' { --radius-feild: 0; }`
			].join('\n'),
			'shape-err-typo'
		)
	],
	[
		'a colour role set on the wrong plugin',
		compileExpectingError(
			[
				"@import 'tailwindcss' source(none);",
				`@plugin '${pluginPath}' { --theme-color-primary: red; }`
			].join('\n'),
			'shape-err-misplaced'
		)
	],
	[
		'theme with no name',
		compileExpectingError(
			["@import 'tailwindcss' source(none);", `@plugin '${themePluginPath}' { seed: #0956AA; }`].join(
				'\n'
			),
			'themes-err-name'
		)
	]
];

console.log('\nthemes');
for (const [label, ok] of themeChecks) {
	console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + label);
	if (!ok) failures.push('themes: ' + label);
}
for (const [label, message] of themeErrors) {
	const ok = message !== null;
	console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' rejects ' + label);
	if (!ok) failures.push('themes: ' + label + ' was not rejected');
}

if (!process.env.KEEP_TMP) fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('');
if (failures.length) {
	console.log('RESULT: ' + failures.length + ' problem(s)');
	for (const f of failures) console.log('  - ' + f);
	process.exitCode = 1;
} else {
	console.log('RESULT: plugin output matches the CSS-first build');
}
