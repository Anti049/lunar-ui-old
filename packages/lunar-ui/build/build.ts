import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
	extractClasses,
	JS_COUPLED,
	extractThemeVariables,
	extractRootVariables
} from './extract-classes.js';
import { partition } from './partition.js';
import { extractCustomVariants } from './extract-variants.js';
import {
	collectDeclarations,
	resolveClosure,
	buildThemeExtend,
	inlineThemeFallbacks
} from './collect-tokens.js';
import type { Bundle, Registry, StyleObject } from '../types.js';

/*
	Compiles lunar-ui's CSS into the data the plugin ships.

	Output goes to src/generated/*.ts rather than straight to dist, so tsc
	type-checks the hand-written runtime against the real shape of what was
	generated, then emits both together.
*/

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const coreSrc = path.join(pkgRoot, 'src');
const generatedDir = path.join(pkgRoot, 'generated');
const distDir = path.join(pkgRoot, 'dist');
const tmpDir = path.join(pkgRoot, '.tmp');

/*
	Every component stylesheet that actually defines something. Most of
	components/ is still empty placeholders for planned components, and an empty
	bundle is only noise, so files that yield no classes are skipped.
*/
const componentsDir = path.join(coreSrc, 'components');
const componentFiles = fs
	.readdirSync(componentsDir)
	.filter((f) => f.endsWith('.css') && f !== '_index.css')
	.sort();

/* Foundations are part of the library's public surface, not just compile
   context: `surface` applies bg-surface + text-on-surface, `focusable` the
   focus ring, `elevation-3` the shadow. They ship as one bundle because they
   are not namespaced per component. */
const FOUNDATIONS = 'foundations';

/*
	Classes that must stay plain selectors rather than `@utility`.

	`@utility` output is usage-gated: Tailwind emits it only when it finds the
	class in scanned source. These are written by the ripple action at runtime,
	so there is no candidate to find and converting them would mean the rule is
	never emitted. They stay unconditional, and are safelisted here so the
	compile that feeds the plugin still produces them.
*/
const RUNTIME_CLASSES = ['lunar-ripple', 'interactive', 'dragged'];

/* Derived from source. Hand-listing these silently shipped 1 of 3. */
const CUSTOM_VARIANTS = extractCustomVariants(coreSrc);

/*
	Shape tokens: the knobs that decide how lunar-ui feels rather than what
	colour it is. They are emitted at :root so they always resolve, and a
	consumer can override any of them on the plugin (globally) or on a single
	theme.

	Defaults point at lunar-ui's existing scales rather than inventing numbers,
	so the knobs start out consistent with the rest of the system. Values go
	through the same var() fallback inlining as everything else, so they still
	resolve in a standalone build where the referenced token was never emitted.
*/
const SHAPE_TOKENS: Record<string, string> = {
	// Corner radii, smallest to largest surface.
	'--radius-selector': 'var(--radius-sm)',
	'--radius-field': 'var(--radius-sm)',
	'--radius-box': 'var(--radius-lg)',
	// Base sizing units; components multiply these.
	'--size-selector': 'var(--spacing)',
	'--size-field': 'var(--spacing)',
	// Border thickness for outlined variants.
	'--border-width': '1px',
	// Motion, matching the standard transition lunar-ui already uses.
	'--animation-duration': 'var(--duration-short-4)',
	'--animation-easing': 'var(--ease-standard)'
};

const cliEntry = path.join(
	path.dirname(require.resolve('@tailwindcss/cli/package.json')),
	'dist/index.mjs'
);
const toPosix = (p: string): string => p.split(path.sep).join('/');
const relFromTmp = (target: string): string => toPosix(path.relative(tmpDir, target));

function runTailwind(input: string, label: string): string {
	const inFile = path.join(tmpDir, `${label}.in.css`);
	const outFile = path.join(tmpDir, `${label}.out.css`);
	fs.writeFileSync(inFile, input);
	try {
		execFileSync(process.execPath, [cliEntry, '-i', inFile, '-o', outFile], { stdio: 'pipe' });
	} catch (error) {
		const detail = ((error as { stderr?: Buffer }).stderr?.toString() ?? '')
			.replace(/\x1b\[[0-9;]*m/g, '')
			.trim();
		throw new Error(`tailwind failed on ${label}:\n${detail}`);
	}
	return fs.readFileSync(outFile, 'utf8');
}

/* Every custom property the theme owns: Tailwind's defaults plus lunar-ui's own
   @theme blocks. Read from source, not from a compile -- theme variables are
   emitted on demand, so a compile only reveals the ones something happened to use. */
function themeVariables(): Set<string> {
	const owned = new Set<string>();
	const tailwindTheme = path.join(
		path.dirname(require.resolve('tailwindcss/package.json')),
		'theme.css'
	);
	for (const name of extractRootVariables(fs.readFileSync(tailwindTheme, 'utf8'))) owned.add(name);

	// Everything outside components/ is context: themes and token files declare
	// their variables at :root, not only inside @theme, so take every declaration
	// there. Components are excluded so their own locals stay prefixable.
	const componentsDir = path.join(coreSrc, 'components');
	const walk = (dir: string): void => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (full !== componentsDir) walk(full);
				continue;
			}
			if (!entry.name.endsWith('.css')) continue;
			const css = fs.readFileSync(full, 'utf8');
			for (const name of extractRootVariables(css)) owned.add(name);
		}
	};
	walk(coreSrc);
	// Component files may still define @theme values; those are context too.
	for (const entry of fs.readdirSync(componentsDir)) {
		if (!entry.endsWith('.css')) continue;
		for (const n of extractThemeVariables(fs.readFileSync(path.join(componentsDir, entry), 'utf8'))) {
			owned.add(n);
		}
	}
	return owned;
}

const referencedVariables = (css: string): Set<string> =>
	new Set([...css.matchAll(/--([-\w]+)/g)].map((m) => m[1]));

const BANNER = '/* Generated by build/build.ts. Do not edit. */\n';

/*
	Generated modules are annotated rather than `as const`: the runtime only ever
	reads them, and `as const` would make every array readonly, which then fails
	to satisfy the mutable shapes the plugin API expects.
*/
function writeGenerated(file: string, value: unknown, type: string, imported?: string): void {
	const target = path.join(generatedDir, file);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(
		target,
		BANNER +
			(imported ? `import type { ${imported} } from '../types.js';\n\n` : '') +
			`const value: ${type} = ${JSON.stringify(value, null, '\t')};\n\n` +
			`export default value;\n`
	);
}

function emitBundle(name: string, bundle: Bundle): void {
	const dir = path.join(generatedDir, 'components', name);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, 'object.ts'),
		BANNER +
			`import type { StyleObject } from '../../../types.js';\n\n` +
			`export const utilities: StyleObject = ${JSON.stringify(bundle.utilities, null, '\t')};\n\n` +
			`export const standalone: StyleObject = ${JSON.stringify(bundle.standalone, null, '\t')};\n\n` +
			`export const unconditional: StyleObject = ${JSON.stringify(bundle.unconditional ?? {}, null, '\t')};\n`
	);
	fs.writeFileSync(
		path.join(dir, 'index.ts'),
		BANNER +
			[
				`import { utilities, standalone, unconditional } from './object.js';`,
				`import registry from '../../registry.js';`,
				`import { addPrefix } from '../../../functions/addPrefix.js';`,
				`import { nestCssLayers } from '../../../functions/nestCssLayers.js';`,
				`import type { BundleRegistrar } from '../../../types.js';`,
				``,
				`const register: BundleRegistrar = ({ addUtilities, addBase, prefix = '' }) => {`,
				`\taddUtilities(nestCssLayers(addPrefix(utilities, prefix, registry)));`,
				`\t// Authored as plain selectors, which Tailwind emits in a top-level`,
				`\t// layer. The plugin API has no channel for that, so they land in`,
				`\t// @layer utilities instead -- see README, "Known divergences".`,
				`\taddUtilities(nestCssLayers(addPrefix(standalone, prefix, registry)));`,
				`\t// Classes written at run time: Tailwind never sees a candidate, so`,
				`\t// these must not be usage-gated.`,
				`\taddBase(nestCssLayers(addPrefix(unconditional, prefix, registry)));`,
				`};`,
				``,
				`export default register;`,
				``
			].join('\n')
	);
}

fs.rmSync(generatedDir, { recursive: true, force: true });
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(generatedDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

process.stdout.write('reading theme variables ... ');
const owned = themeVariables();
console.log(`${owned.size} owned by Tailwind + lunar-ui @theme`);

const classesByBundle: Record<string, string[]> = {};
const skipped: string[] = [];
for (const file of componentFiles) {
	const name = file.replace(/\.css$/, '');
	const classes = extractClasses(fs.readFileSync(path.join(componentsDir, file), 'utf8'), name);
	if (classes.length === 0) {
		skipped.push(name);
		continue;
	}
	classesByBundle[name] = classes;
}
const COMPONENTS = Object.keys(classesByBundle);
console.log(
	`  ${COMPONENTS.length} components with rules, ${skipped.length} empty placeholders skipped`
);

// Foundations are not namespaced, so they are read with `namespace: null`.
const foundationsDir = path.join(coreSrc, 'utilities');
const foundationClasses = [
	...new Set(
		fs
			.readdirSync(foundationsDir)
			.filter((f) => f.endsWith('.css') && f !== '_index.css')
			.flatMap((f) => extractClasses(fs.readFileSync(path.join(foundationsDir, f), 'utf8'), null))
	)
].sort();
classesByBundle[FOUNDATIONS] = foundationClasses;

const BUNDLES = [FOUNDATIONS, ...COMPONENTS];
/*
	Class-name attribution, used when a rule carries no usable @layer marker.
	Layer names do not always match file names -- collapsible.css emits into
	`@layer collapse.lN`, navigation.css into `@layer nav-link.lN` -- so without
	this those rules would be dropped as context. Components are registered
	before foundations so a component class wins if both claim it; collisions are
	reported rather than silently resolved.
*/
const classOwners = new Map<string, string>();
const collisions: string[] = [];
for (const bundle of [...COMPONENTS, FOUNDATIONS]) {
	for (const cls of classesByBundle[bundle]) {
		const existing = classOwners.get(cls);
		if (existing && existing !== bundle) {
			collisions.push(`${cls} (${existing} vs ${bundle})`);
			continue;
		}
		classOwners.set(cls, bundle);
	}
}
if (collisions.length) {
	console.log(
		`  ! ${collisions.length} class name(s) claimed by more than one bundle: ` +
			collisions.slice(0, 5).join(', ')
	);
}
const allClasses = [...new Set([...Object.values(classesByBundle).flat(), ...RUNTIME_CLASSES])].sort();

/*
	Some lunar-ui class names collide with Tailwind built-ins: `collapse`,
	`table` and `select-text` are all real Tailwind utilities. Compiling the
	context alone, with lunar-ui's class list safelisted but none of lunar-ui's
	own stylesheets loaded, says exactly which names Tailwind answers to by
	itself. Those bare rules are not ours to claim -- attributing them would pull
	`visibility: collapse` into the collapsible bundle. lunar-ui's own rules for
	the same names still arrive via their `@layer <name>.lN` wrapper.
*/
process.stdout.write('detecting Tailwind built-ins ... ');
// Bare Tailwind, with none of lunar-ui loaded -- not src/context.css, which
// pulls in the foundations and would report every one of them as a built-in.
const builtinCss = runTailwind(
	["@import 'tailwindcss' source(none);", ...allClasses.map((c) => `@source inline("${c}");`)].join(
		'\n'
	),
	'builtins'
);
const builtinClasses = new Set<string>();
for (const match of builtinCss.matchAll(/^\s*\.([-\w]+)\s*(?:,|\{)/gm)) {
	if (classOwners.has(match[1])) builtinClasses.add(match[1]);
}
for (const name of builtinClasses) classOwners.delete(name);
console.log(
	builtinClasses.size
		? `${builtinClasses.size} collide with Tailwind (${[...builtinClasses].join(', ')})`
		: 'none'
);

process.stdout.write(`compiling ${BUNDLES.length} bundles together ... `);
const input = [
	`@import '${relFromTmp(path.join(pkgRoot, 'build/context.css'))}';`,
	...COMPONENTS.map((c) => `@import '${relFromTmp(path.join(componentsDir, `${c}.css`))}';`),
	// @utility output is emitted on demand, so safelist every class the
	// bundles define or the compile comes back empty.
	...allClasses.map((c) => `@source inline("${c}");`)
].join('\n');
const compiled = runTailwind(input, 'library');
if (compiled.includes('@apply')) throw new Error('output still contains @apply');
console.log(`${compiled.split('\n').length} lines`);

const { components: buckets, properties, unattributed } = partition(compiled, COMPONENTS, classOwners);

/*
	A component-local variable is one the component *declares*, not merely one it
	mentions. Going by references would sweep up typos -- a `var()` naming a
	token that does not exist anywhere -- and then rename them under a prefix,
	which quietly breaks the "theme variables are never prefixed" guarantee for
	anything named `--color-*`.
*/
const declaredVariables = (node: unknown, into: Set<string>): Set<string> => {
	if (Array.isArray(node)) {
		for (const item of node) declaredVariables(item, into);
		return into;
	}
	if (node === null || typeof node !== 'object') return into;
	for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
		if (key.startsWith('--')) into.add(key.slice(2));
		declaredVariables(value, into);
	}
	return into;
};

/*
	Rules for runtime-created classes cannot be usage-gated. Tailwind never sees
	a candidate for a class the ripple action writes at run time, so routing them
	through addUtilities means they are never emitted at all. Split them out here
	and register them with addBase instead.
*/
const runtimePattern = new RegExp(`\\.(${RUNTIME_CLASSES.join('|')})(?![\\w-])`);
for (const name of BUNDLES) {
	const bundle = buckets[name];
	const unconditional: StyleObject = {};
	for (const [selector, value] of Object.entries(bundle.standalone)) {
		if (!runtimePattern.test(selector)) continue;
		unconditional[selector] = value;
		delete bundle.standalone[selector];
	}
	bundle.unconditional = unconditional;
}

const localVariables = new Set<string>();
const referencedInBundles = new Set<string>();
for (const name of BUNDLES) {
	for (const v of declaredVariables(buckets[name], new Set())) {
		if (!owned.has(v) && !v.startsWith('tw-')) localVariables.add(v);
	}
	for (const v of referencedVariables(JSON.stringify(buckets[name]))) referencedInBundles.add(v);
}

/* Referenced by a component, declared by nobody -- a dead var() reference. */
const undeclared = [...referencedInBundles].filter(
	(v) => !owned.has(v) && !v.startsWith('tw-') && !localVariables.has(v)
);
if (undeclared.length) {
	console.log(
		`  ! ${undeclared.length} variable(s) referenced but never declared: ${undeclared.join(', ')}`
	);
}

const registry: Registry = {
	// JS-coupled names keep their identity so the ripple action keeps working.
	classes: allClasses.filter((c) => !JS_COUPLED.has(c)),
	variables: [...localVariables].sort()
};

/* ---- Standalone tokens -------------------------------------------------- *
   Carry the design tokens the bundles depend on, so a consumer needs only
   `@plugin` and no CSS import.

   Every @theme value lunar-ui defines is registered through theme.extend --
   not just the ones the bundles reach -- so consumers get the real utilities
   (`text-body-medium`, `duration-medium-2`). Registration alone is not enough
   for the bundles themselves, though: a theme entry only materialises as CSS
   when a *utility* uses it, and compiled CSS references it straight from
   var(). So those references get the default inlined as a var() fallback.
   Tokens outside any namespace are emitted as plain custom properties. */
process.stdout.write('resolving tokens ... ');
const declarations = collectDeclarations(coreSrc);
const { extend: themeExtend, claimed } = buildThemeExtend(declarations);

const themeValues = new Map(
	declarations
		.filter((d) => d.scope === 'theme' && claimed.has(d.prop))
		.map((d) => [d.prop, d.value] as const)
);
for (const name of BUNDLES) {
	buckets[name].utilities = inlineThemeFallbacks(buckets[name].utilities, themeValues);
	buckets[name].standalone = inlineThemeFallbacks(buckets[name].standalone, themeValues);
}

const seeds = new Set<string>();
for (const name of BUNDLES) {
	for (const v of referencedVariables(JSON.stringify(buckets[name]))) seeds.add('--' + v);
}
for (const v of referencedVariables(JSON.stringify(properties))) seeds.add('--' + v);
// Shape-token defaults reference theme tokens, which have to travel with them.
for (const v of referencedVariables(Object.values(SHAPE_TOKENS).join(' '))) seeds.add('--' + v);
const needed = resolveClosure(seeds, declarations);

for (const name of BUNDLES) {
	emitBundle(name, buckets[name]);
	console.log(
		`  ${name}: ${classesByBundle[name].length} classes, ` +
			`${Object.keys(buckets[name].utilities).length} utility keys, ` +
			`${Object.keys(buckets[name].standalone).length} standalone keys`
	);
}

/*
	Theme palettes are split out from the rest of the base layer so consumers can
	choose which ones ship. A theme is identified by its source directory when it
	has flavours (`catppuccin/mocha.css` and its three siblings are all
	`catppuccin`), otherwise by file name.
*/
const themeIdOf = (file: string): string | null => {
	if (!file.startsWith('themes/')) return null;
	const rest = file.slice('themes/'.length);
	const slash = rest.indexOf('/');
	return slash === -1 ? rest.replace(/\.css$/, '') : rest.slice(0, slash);
};

const baseRules: Record<string, Record<string, string>> = {};
const themeRules: Record<string, Record<string, Record<string, string>>> = {};

const addTo = (
	target: Record<string, Record<string, string>>,
	selector: string,
	prop: string,
	value: string
): void => {
	target[selector] ??= {};
	target[selector][prop] = value;
};

const addDecl = (file: string, selector: string, prop: string, value: string): void => {
	const themeId = themeIdOf(file);
	if (themeId === null) {
		addTo(baseRules, selector, prop, value);
		return;
	}
	themeRules[themeId] ??= {};
	addTo(themeRules[themeId], selector, prop, value);
};

for (const decl of declarations) {
	if (decl.scope === 'color-scheme') {
		// light-dark() is inert without it, so always carry these.
		addDecl(decl.file, decl.selector, decl.prop, decl.value);
		continue;
	}
	if (decl.scope === 'theme') {
		// Claimed by a theme namespace; Tailwind will emit it when used.
		// Anything unclaimed (--default-transition-*, say) still needs carrying,
		// but only if the bundles actually depend on it.
		if (claimed.has(decl.prop) || !needed.has(decl.prop)) continue;
		addDecl(decl.file, ':root', decl.prop, decl.value);
		continue;
	}
	if (!needed.has(decl.prop)) continue;
	addDecl(decl.file, decl.selector, decl.prop, decl.value);
}

// Shape tokens sit alongside the rest of the base layer, at :root.
for (const [prop, value] of Object.entries(SHAPE_TOKENS)) addTo(baseRules, ':root', prop, value);

/* Base declarations can themselves reach into namespaced tokens -- e.g.
   `--default-transition-duration: var(--duration-short-4)` -- so they need the
   same fallback treatment as the bundle CSS. */
const resolvedBaseRules = inlineThemeFallbacks(baseRules, themeValues);
const resolvedThemeRules = inlineThemeFallbacks(themeRules, themeValues);

const baseDeclCount = Object.values(baseRules).reduce((n, r) => n + Object.keys(r).length, 0);
const themeEntryCount = Object.values(themeExtend).reduce((n, g) => n + Object.keys(g).length, 0);
console.log(
	`${needed.size} in closure -> ${themeEntryCount} theme entries across ` +
		`${Object.keys(themeExtend).length} namespaces (${Object.keys(themeExtend).join(', ')}), ` +
		`${baseDeclCount} base declarations across ${Object.keys(baseRules).length} selectors, ` +
		`${Object.keys(themeRules).length} themes (${Object.keys(themeRules).join(", ")})`
);

writeGenerated('registry.ts', registry, 'Registry', 'Registry');
writeGenerated('variants.ts', CUSTOM_VARIANTS, 'Record<string, string | string[]>');
writeGenerated('properties.ts', properties satisfies StyleObject, 'StyleObject', 'StyleObject');
writeGenerated('theme.ts', themeExtend, 'ThemeExtend', 'ThemeExtend');
writeGenerated('base.ts', resolvedBaseRules, 'Record<string, Record<string, string>>');
writeGenerated('shape.ts', Object.keys(SHAPE_TOKENS), 'string[]');
writeGenerated('themes.ts', resolvedThemeRules, 'ThemeRules', 'ThemeRules');
/*
	A keyed record rather than named re-exports: bundle names are file names, and
	`code-block` is not a valid JS identifier. The keys keep the real names, which
	is what `include`/`exclude` match against.
*/
const identifierFor = (name: string): string =>
	name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

fs.writeFileSync(
	path.join(generatedDir, 'imports.ts'),
	BANNER +
		`import type { BundleRegistrar } from '../types.js';\n` +
		BUNDLES.map((c) => `import ${identifierFor(c)} from './components/${c}/index.js';`).join('\n') +
		`\n\nconst bundles: Record<string, BundleRegistrar> = {\n` +
		BUNDLES.map((c) => `\t'${c}': ${identifierFor(c)}`).join(',\n') +
		`\n};\n\nexport default bundles;\n`
);

console.log(`\nlocal variables: ${registry.variables.join(', ') || '(none)'}`);
console.log(`@property registrations hoisted to addBase: ${Object.keys(properties).length}`);
if (unattributed.length) {
	console.log(`\nunattributed (dropped as context): ${unattributed.length}`);
	for (const u of unattributed.slice(0, 8)) console.log(`  ${u}`);
	if (unattributed.length > 8) console.log(`  ... and ${unattributed.length - 8} more`);
}
if (!process.env.KEEP_TMP) fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\ngenerated ${BUNDLES.length} bundles -> generated/`);
