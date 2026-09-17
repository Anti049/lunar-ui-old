import postcss from 'postcss';
import { objectify } from 'postcss-js';
import type { Bundle, StyleObject } from '../types.js';

/*
	The bundle that owns a `@layer` block, read from its first segment.

	Tiers nest rather than sit side by side -- `badge.l1.l2.l3` for the
	foundation, `badge.l1.l2` for variants, `badge.l1` for state -- because
	unlayered content of a layer beats that layer's sublayers whatever the
	declaration order. One or more `.lN` segments therefore follow the name.
*/
const LAYER_OWNER = /^([a-z][\w-]*)(?:\.l\d+)+$/;

export interface Partitioned {
	components: Record<string, Bundle>;
	properties: StyleObject;
	unattributed: string[];
}

/**
 * Splits a whole-library compile into per-bundle buckets.
 *
 * Attribution runs off lunar-ui's own naming discipline: component rules live
 * in `@layer <component>.l1[.l2[.l3]]`, and keyframes are named
 * `<component>-*`.
 * Foundations carry no layer marker of their own, so they are attributed by
 * class name via `classOwners`. Anything unattributed is context (theme,
 * preflight) and is dropped.
 *
 * Two buckets per bundle, because they need different plugin channels:
 *   utilities - came from `@utility`, wrapped in `@layer utilities`, usage-gated
 *   standalone - came from plain selectors, emitted at the top level
 */
export function partition(
	css: string,
	components: string[],
	classOwners: ReadonlyMap<string, string> = new Map()
): Partitioned {
	const root = postcss.parse(css);
	const owners = new Set(components);
	const extraBundles = new Set(classOwners.values());

	const buckets: Record<string, { utilities: postcss.Root; standalone: postcss.Root }> =
		Object.fromEntries(
			[...components, ...extraBundles].map((name) => [
				name,
				{ utilities: postcss.root(), standalone: postcss.root() }
			])
		);
	const properties = postcss.root();
	const unattributed: string[] = [];

	const ownerOf = (node: postcss.ChildNode): string | null => {
		if (node.type === 'atrule' && node.name === 'layer') {
			const owner = LAYER_OWNER.exec(node.params.trim())?.[1];
			if (owner && owners.has(owner)) return owner;
		}
		if (node.type === 'atrule' && node.name === 'keyframes') {
			const name = node.params.trim();
			for (const c of components) if (name === c || name.startsWith(`${c}-`)) return c;
		}
		// Foundations carry no @layer marker of their own -- `@utility surface`
		// lands as a bare `.surface` inside @layer utilities -- so they are
		// attributed by class name instead.
		if (node.type === 'rule') {
			for (const match of node.selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
				const owner = classOwners.get(match[1]);
				if (owner) return owner;
			}
		}
		/*
			A layer whose name is not a bundle. Layer names are not always file
			names -- collapsible.css emits `@layer collapse.lN`, navigation.css
			emits `@layer nav-link.lN` -- so fall back to the classes inside, or
			the whole block is dropped as context.
		*/
		if (node.type === 'atrule') {
			let owner: string | null = null;
			node.walkRules((rule) => {
				if (owner) return false;
				for (const match of rule.selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
					const candidate = classOwners.get(match[1]);
					if (candidate) {
						owner = candidate;
						return false;
					}
				}
				return undefined;
			});
			if (owner) return owner;
		}
		return null;
	};

	const take = (node: postcss.ChildNode, bucket: 'utilities' | 'standalone'): boolean => {
		const owner = ownerOf(node);
		if (owner) {
			buckets[owner][bucket].append(node.clone());
			return true;
		}
		return false;
	};

	root.each((node) => {
		if (node.type === 'comment') return;

		if (node.type === 'atrule' && node.name === 'layer' && node.params === 'utilities') {
			node.each((child) => {
				if (!take(child, 'utilities')) unattributed.push(describe(child));
			});
			return;
		}
		// @property registrations back Tailwind's --tw-* machinery. They are global
		// and must be unconditional, so they go to addBase rather than a bundle.
		if (node.type === 'atrule' && node.name === 'property') {
			properties.append(node.clone());
			return;
		}
		if (node.type === 'atrule' && node.name === 'layer' && node.params === 'properties') {
			node.each((child) => {
				properties.append(child.clone());
			});
			return;
		}
		if (!take(node, 'standalone')) unattributed.push(describe(node));
	});

	return {
		components: Object.fromEntries(
			Object.entries(buckets).map(([name, b]) => [
				name,
				{
					utilities: kebabCaseProperties(objectify(b.utilities)) as StyleObject,
					standalone: kebabCaseProperties(objectify(b.standalone)) as StyleObject,
					// Filled in by the build, which knows which classes are runtime-created.
					unconditional: {}
				}
			])
		),
		properties: kebabCaseProperties(objectify(properties)) as StyleObject,
		unattributed
	};
}

const describe = (node: postcss.ChildNode): string =>
	node.type === 'atrule' ? `@${node.name} ${node.params}`.trim() : (node as postcss.Rule).selector;

/*
	postcss-js camelCases declaration properties, and Tailwind converts them back
	-- except when the value is an array, which is how a repeated declaration is
	represented (`transition-duration` given twice as a fallback). Those keys
	reach the output verbatim as `transitionDuration`, which browsers drop.

	Emitting kebab-case throughout sidesteps the conversion entirely. Only
	declaration keys are rewritten: selectors, at-rules and custom properties are
	left exactly as they are.
*/
const isDeclarationValue = (value: unknown): boolean => {
	if (Array.isArray(value)) return value.length === 0 || typeof value[0] !== 'object';
	return typeof value !== 'object' || value === null;
};

/*
	postcss-js's own encoding, reversed. Vendor prefixes are the reason this is
	not a plain camel-to-kebab: `-webkit-user-select` round-trips as
	`WebkitUserSelect`, so a leading capital has to become a leading dash, and
	`-ms-` is the odd one out that postcss-js encodes lowercase.
*/
const toKebab = (property: string): string =>
	property
		.replace(/([A-Z])/g, '-$1')
		.replace(/^ms-/, '-ms-')
		.toLowerCase();

export function kebabCaseProperties<T>(node: T): T {
	if (Array.isArray(node)) return node.map(kebabCaseProperties) as unknown as T;
	if (node === null || typeof node !== 'object') return node;
	return Object.fromEntries(
		Object.entries(node as Record<string, unknown>).map(([key, value]) => {
			if (key.startsWith('--') || key.startsWith('@') || !isDeclarationValue(value)) {
				return [key, kebabCaseProperties(value)];
			}
			return [toKebab(key), value];
		})
	) as T;
}
