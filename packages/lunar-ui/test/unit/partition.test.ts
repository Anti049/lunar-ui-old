import { test, expect, describe } from 'bun:test';
import { partition, kebabCaseProperties } from '../../functions/partition.js';
import type { StyleObject } from '../../types.js';

/*
	Attribution is the part of the build with no compile-time safety: a rule that
	fails to find an owner is silently dropped as context, and the symptom
	surfaces much later as a missing selector in the parity report. These pin the
	rules it attributes by.
*/

describe('partition — layer attribution', () => {
	test('claims a rule from its layer, however many tiers deep', () => {
		for (const layer of ['badge.l1', 'badge.l1.l2', 'badge.l1.l2.l3']) {
			const { components } = partition(
				`@layer utilities { @layer ${layer} { .badge { color: red } } }`,
				['badge']
			);
			expect(Object.keys(components.badge.utilities)).toEqual([`@layer ${layer}`]);
		}
	});

	/*
		The regression that motivated this file. LAYER_OWNER was anchored to a
		single `.lN`, so nesting the tiers made every layer name stop matching.
		Attribution fell through to class names -- and `table` had already been
		removed from classOwners as a Tailwind built-in, so `.table` vanished
		from the plugin entirely.
	*/
	test('a nested-tier layer still resolves to its first segment', () => {
		const { components, unattributed } = partition(
			'@layer utilities { @layer table.l1.l2.l3 { .table { width: 100% } } }',
			['table'],
			new Map() // deliberately empty: no class-name fallback available
		);
		expect(unattributed).toEqual([]);
		// Object.keys, not toHaveProperty: the matcher reads '.' as a path separator.
		expect(Object.keys(components.table.utilities)).toContain('@layer table.l1.l2.l3');
	});

	test('a layer naming no known bundle falls back to the classes inside', () => {
		// collapsible.css emits `@layer collapse.*`, which is not a bundle name.
		const { components } = partition(
			'@layer utilities { @layer collapse.l1.l2 { .collapse-open { display: block } } }',
			['collapsible'],
			new Map([['collapse-open', 'collapsible']])
		);
		expect(Object.keys(components.collapsible.utilities)).toContain('@layer collapse.l1.l2');
	});

	test('keyframes are claimed by their name prefix', () => {
		const { components } = partition(
			'@layer utilities { @keyframes badge-pulse { from { opacity: 0 } } }',
			['badge']
		);
		expect(Object.keys(components.badge.utilities)).toContain('@keyframes badge-pulse');
	});

	test('context is dropped, not misattributed', () => {
		const { components, unattributed } = partition(
			'@layer theme { :root { --color-primary: red } }',
			['badge']
		);
		expect(components.badge.utilities).toEqual({});
		expect(unattributed.length).toBeGreaterThan(0);
	});

	test('splits usage-gated utilities from plain selectors', () => {
		const { components } = partition(
			[
				'@layer utilities { @layer badge.l1.l2.l3 { .badge { color: red } } }',
				'@layer badge.l1 { .badge-disabled { opacity: 0.5 } }'
			].join('\n'),
			['badge']
		);
		expect(Object.keys(components.badge.utilities)).toHaveLength(1);
		expect(Object.keys(components.badge.standalone)).toHaveLength(1);
	});
});

describe('kebabCaseProperties', () => {
	// Widen to StyleObject: the generic otherwise returns the input's literal
	// type, and the renamed keys then fail to typecheck against it.
	const kebab = (input: StyleObject): StyleObject => kebabCaseProperties(input);

	test('converts camelCase declarations', () => {
		expect(kebab({ '.a': { transitionDuration: '1s' } })).toEqual({
			'.a': { 'transition-duration': '1s' }
		});
	});

	/*
		The bug this guards: a first attempt lowercased vendor prefixes into
		`webkit-user-select`, which no browser reads. The leading capital has to
		become `-webkit-`, not `webkit-`.
	*/
	test('keeps vendor prefixes valid', () => {
		expect(kebab({ '.a': { WebkitUserSelect: 'none' } })).toEqual({
			'.a': { '-webkit-user-select': 'none' }
		});
		expect(kebab({ '.a': { msOverflowStyle: 'none' } })).toEqual({
			'.a': { '-ms-overflow-style': 'none' }
		});
	});

	test('leaves custom properties and at-rules alone', () => {
		const input: StyleObject = { '@layer x': { '.a': { '--myVar': '1px' } } };
		expect(kebab(input)).toEqual(input);
	});

	test('walks arrays, which postcss-js uses for duplicate declarations', () => {
		expect(kebab({ '.a': { backgroundColor: ['red', 'blue'] } })).toEqual({
			'.a': { 'background-color': ['red', 'blue'] }
		});
	});
});
