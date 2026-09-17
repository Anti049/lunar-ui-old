import { test, expect, describe } from 'bun:test';
import { addPrefix } from '../../functions/addPrefix.js';
import type { Registry, StyleObject } from '../../types.js';

/*
	The allowlist prefixer. Its whole value over a denylist is that a name we
	never defined can never be renamed, so most of these assert what it leaves
	alone rather than what it changes.
*/

const registry: Registry = {
	classes: ['badge', 'badge-outline', 'tooltip-gap'],
	variables: ['badge-color', 'tooltip-gap']
};

const prefixed = (styles: StyleObject): StyleObject => addPrefix(styles, 'lunar-', registry);

describe('addPrefix', () => {
	test('is a no-op without a prefix', () => {
		const input = { '.badge': { color: 'red' } };
		expect(addPrefix(input, '', registry)).toBe(input);
	});

	test('renames classes it owns', () => {
		expect(Object.keys(prefixed({ '.badge': { color: 'red' } }))).toEqual(['.lunar-badge']);
	});

	test('leaves classes it does not own', () => {
		// Tailwind's own utility, a consumer state hook, and a third-party class.
		for (const selector of ['.sr-only', '.disabled', '.rdp-day']) {
			expect(Object.keys(prefixed({ [selector]: { color: 'red' } }))).toEqual([selector]);
		}
	});

	test('renames component-local variables, in keys and in values', () => {
		expect(prefixed({ '.badge': { '--badge-color': 'red', color: 'var(--badge-color)' } })).toEqual(
			{
				'.lunar-badge': { '--lunar-badge-color': 'red', color: 'var(--lunar-badge-color)' }
			}
		);
	});

	test('leaves theme and Tailwind-internal variables', () => {
		const input = { '.badge': { color: 'var(--color-primary)', '--tw-ring-color': 'red' } };
		expect(prefixed(input)).toEqual({
			'.lunar-badge': { color: 'var(--color-primary)', '--tw-ring-color': 'red' }
		});
	});

	test('renames only the owned class in a compound selector', () => {
		expect(Object.keys(prefixed({ '.badge.disabled > .sr-only': {} }))).toEqual([
			'.lunar-badge.disabled > .sr-only'
		]);
	});

	/*
		A quoted string or a comment must not drive the selector scanner: an
		apostrophe inside a comment once opened a quote that never closed, which
		silently stopped prefixing every class after it in the file.
	*/
	test('does not treat content inside quotes or comments as a selector', () => {
		const input = { '[data-x=".badge"] /* it\'s .badge */ .badge': {} };
		const key = Object.keys(prefixed(input))[0];
		expect(key).toContain('[data-x=".badge"]');
		expect(key).toContain("/* it's .badge */");
		expect(key.endsWith('.lunar-badge')).toBe(true);
	});

	test('does not rename a class named inside an attribute selector', () => {
		expect(Object.keys(prefixed({ '[class~="badge"]': {} }))).toEqual(['[class~="badge"]']);
	});

	test('passes at-rules through but still prefixes inside them', () => {
		expect(prefixed({ '@media (width >= 40rem)': { '.badge': { color: 'red' } } })).toEqual({
			'@media (width >= 40rem)': { '.lunar-badge': { color: 'red' } }
		});
	});

	test('prefixes the variable an @property names', () => {
		expect(Object.keys(prefixed({ '@property --badge-color': { syntax: '"<color>"' } }))).toEqual([
			'@property --lunar-badge-color'
		]);
	});

	test('walks arrays, which postcss-js uses for duplicate declarations', () => {
		expect(prefixed({ '.badge': { color: ['var(--badge-color)', 'red'] } })).toEqual({
			'.lunar-badge': { color: ['var(--lunar-badge-color)', 'red'] }
		});
	});
});
