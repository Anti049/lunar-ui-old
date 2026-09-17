import { test, expect, describe } from 'bun:test';
import { nestCssLayers } from '../../functions/nestCssLayers.js';

/*
	`addUtilities` rejects an at-rule as a top-level key, but compiled CSS is
	exactly that shape. This turns it inside out. Getting it wrong throws at
	consumer-compile time with a message that names the selector, not this
	function, so the cases below pin the inversion itself.
*/

describe('nestCssLayers', () => {
	test('hoists the selector out of a layer', () => {
		expect(nestCssLayers({ '@layer badge.l1.l2.l3': { '.badge': { color: 'red' } } })).toEqual({
			'.badge': { '@layer badge.l1.l2.l3': { color: 'red' } }
		});
	});

	test('hoists out of every conditional group, not just @layer', () => {
		// addUtilities rejects `@media (...)` as a key just as firmly as @layer.
		expect(nestCssLayers({ '@media (width < 40rem)': { '.badge': { color: 'red' } } })).toEqual({
			'.badge': { '@media (width < 40rem)': { color: 'red' } }
		});
	});

	test('preserves nesting order when groups are stacked', () => {
		const input = {
			'@media (width < 40rem)': { '@layer badge.l1': { '.badge': { color: 'red' } } }
		};
		expect(nestCssLayers(input)).toEqual({
			'.badge': { '@media (width < 40rem)': { '@layer badge.l1': { color: 'red' } } }
		});
	});

	/*
		Left alone on purpose: their children are declarations, so there is no
		selector to hoist and inverting them would produce nonsense.
	*/
	test('leaves declaration-bearing at-rules exactly as they are', () => {
		for (const key of [
			'@keyframes badge-pulse',
			'@property --badge-color',
			'@font-face',
			'@counter-style thumbs'
		]) {
			const input = { [key]: { from: { opacity: '0' } } };
			expect(nestCssLayers(input)).toEqual(input);
		}
	});

	test('collects a selector that appears in more than one layer', () => {
		const result = nestCssLayers({
			'@layer badge.l1.l2.l3': { '.badge': { color: 'red' } },
			'@layer badge.l1': { '.badge': { color: 'blue' } }
		});
		expect(result['.badge']).toEqual([
			{ '@layer badge.l1.l2.l3': { color: 'red' } },
			{ '@layer badge.l1': { color: 'blue' } }
		] as never);
	});

	test('passes a bare selector through untouched', () => {
		expect(nestCssLayers({ '.badge': { color: 'red' } })).toEqual({ '.badge': { color: 'red' } });
	});
});
