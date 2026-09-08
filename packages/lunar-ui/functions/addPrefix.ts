import type { Registry, StyleObject } from '../types.js';

/*
	Prefixes lunar-ui's own class names and custom properties.

	Unlike DaisyUI -- which prefixes every class it encounters and keeps a
	denylist of exceptions -- this works off an allowlist generated at build time
	from the component sources (generated/registry.ts). A name is renamed only
	when lunar-ui actually defines it, so Tailwind's theme variables, consumer
	state hooks like `.disabled`, and third-party classes are left alone by
	construction rather than by remembering to exclude them.
*/

const BACKSLASH = '\\';

/** Rewrites `.foo` in a selector, skipping quoted strings and [attr=...] sections. */
const prefixSelector = (selector: string, prefix: string, classes: ReadonlySet<string>): string => {
	let out = '';
	let quote = '';
	let bracketDepth = 0;

	for (let i = 0; i < selector.length; i++) {
		const ch = selector[i];

		if (quote) {
			out += ch;
			if (ch === BACKSLASH) {
				out += selector[++i] ?? '';
			} else if (ch === quote) {
				quote = '';
			}
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			out += ch;
			continue;
		}
		// Skip comments wholesale. Their contents must not drive the state
		// machine: an apostrophe inside a comment would otherwise open a quote
		// that never closes, and a stray "[" would leave bracketDepth stuck,
		// silently skipping every class after it.
		if (ch === '/' && selector[i + 1] === '*') {
			const end = selector.indexOf('*/', i + 2);
			const stop = end === -1 ? selector.length : end + 2;
			out += selector.slice(i, stop);
			i = stop - 1;
			continue;
		}
		if (ch === BACKSLASH) {
			// Escaped character in a selector, e.g. `.w-1\/2`. Copy both through.
			out += ch + (selector[++i] ?? '');
			continue;
		}
		if (ch === '[') bracketDepth++;
		else if (ch === ']' && bracketDepth > 0) bracketDepth--;

		if (ch === '.' && bracketDepth === 0) {
			const name = /^-?[_a-zA-Z][\w-]*/.exec(selector.slice(i + 1))?.[0];
			if (name && classes.has(name)) {
				out += '.' + prefix + name;
				i += name.length;
				continue;
			}
		}
		out += ch;
	}
	return out;
};

const VAR_REFERENCE = /--([-\w]+)/g;

const prefixValue = (value: string, prefix: string, variables: ReadonlySet<string>): string =>
	value.replace(VAR_REFERENCE, (match, name: string) =>
		variables.has(name) ? '--' + prefix + name : match
	);

const prefixKey = (
	key: string,
	prefix: string,
	classes: ReadonlySet<string>,
	variables: ReadonlySet<string>
): string => {
	if (key.startsWith('--')) {
		const name = key.slice(2);
		return variables.has(name) ? '--' + prefix + name : key;
	}
	// @property names a variable; other at-rules (@layer, @media) pass through.
	if (key.startsWith('@property --')) return prefixValue(key, prefix, variables);
	if (key.startsWith('@')) return key;
	return prefixSelector(key, prefix, classes);
};

const asSet = (value: ReadonlySet<string> | readonly string[]): ReadonlySet<string> =>
	value instanceof Set ? value : new Set(value as readonly string[]);

export function addPrefix<T extends StyleObject>(styles: T, prefix: string, registry: Registry): T {
	if (!prefix) return styles;
	const classes = asSet(registry.classes);
	const variables = asSet(registry.variables);

	const walk = (node: unknown): unknown => {
		if (Array.isArray(node)) return node.map(walk);
		if (node === null || typeof node !== 'object') {
			return typeof node === 'string' ? prefixValue(node, prefix, variables) : node;
		}
		return Object.fromEntries(
			Object.entries(node as StyleObject).map(([key, value]) => [
				prefixKey(key, prefix, classes, variables),
				walk(value)
			])
		);
	};

	return walk(styles) as T;
}
