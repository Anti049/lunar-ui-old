import { test, expect, describe } from 'bun:test';
import {
	extractClasses,
	extractThemeVariables,
	extractRootVariables
} from '../../functions/extract-classes.js';
import { extractFunctional } from '../../functions/extract-functional.js';

/*
	The extractors feed the safelist. Anything they miss is simply never compiled
	-- the build succeeds and the class is absent from the plugin -- so these
	pin what counts as "ours".
*/

describe('extractClasses', () => {
	test('takes @utility names', () => {
		expect(extractClasses('@utility badge { color: red }', 'badge')).toEqual(['badge']);
	});

	test('skips functional utilities, which have no finite name to safelist', () => {
		expect(extractClasses('@utility tooltip-gap-* { --x: 1px }', 'tooltip')).toEqual([]);
	});

	test('takes plain selectors inside the namespace', () => {
		expect(extractClasses('.badge-disabled { opacity: 0.5 }', 'badge')).toEqual(['badge-disabled']);
	});

	test('ignores plain selectors outside the namespace', () => {
		// A file merely referencing `.sr-only` must not claim it.
		expect(extractClasses('.sr-only { position: absolute }', 'badge')).toEqual([]);
	});

	/*
		A file's own @utility names widen its namespace: collapsible.css declares
		`collapse`, navigation.css declares `nav-link`. Filtering by file name
		alone would drop every plain selector built on those.
	*/
	test('a declared utility widens the namespace for plain selectors', () => {
		expect(
			extractClasses(
				'@utility nav-link { color: red } .nav-link-label { font-weight: 600 }',
				'navigation'
			)
		).toEqual(['nav-link', 'nav-link-label']);
	});

	test('never claims a consumer state hook', () => {
		expect(extractClasses('.badge.disabled { opacity: 0.5 }', 'badge')).toEqual(['badge']);
	});

	test('foundations pass namespace null and accept any owned class', () => {
		expect(extractClasses('.surface { color: red }', null)).toEqual(['surface']);
	});
});

describe('extractThemeVariables / extractRootVariables', () => {
	test('theme variables come only from @theme blocks', () => {
		const css = '@theme { --color-brand: red } :root { --not-theme: blue }';
		expect([...extractThemeVariables(css)]).toEqual(['color-brand']);
	});

	test('root variables come from anywhere', () => {
		const css = '@theme { --color-brand: red } :root { --shape: 1px }';
		expect([...extractRootVariables(css)].sort()).toEqual(['color-brand', 'shape']);
	});
});

describe('extractFunctional', () => {
	const css = (body: string): string => `@utility tooltip-gap-* { @layer tooltip.l1 { ${body} } }`;

	test('reads both value branches', () => {
		const [u] = extractFunctional(
			css('--tooltip-gap: --spacing(--value(number)); --tooltip-gap: --value([*]);'),
			'tooltip'
		);
		expect(u).toEqual({
			bundle: 'tooltip',
			name: 'tooltip-gap',
			properties: ['--tooltip-gap'],
			spacing: true,
			arbitrary: true
		});
	});

	/*
		Prettier reformats `[*]` to `[ *]` and Tailwind treats the two the same,
		so a formatter run must not silently unregister a utility.
	*/
	test('tolerates the whitespace Prettier introduces', () => {
		const [u] = extractFunctional(css('--tooltip-gap: --value([ * ]);'), 'tooltip');
		expect(u.arbitrary).toBe(true);
	});

	test('ignores a non-functional @utility', () => {
		expect(extractFunctional('@utility badge { color: red }', 'badge')).toEqual([]);
	});

	/*
		Fail loudly: a value form the plugin cannot re-register through
		matchUtilities would otherwise look fine until a consumer used it.
	*/
	test('throws on a value form it cannot port', () => {
		expect(() => extractFunctional(css('--tooltip-gap: --value(integer);'), 'tooltip')).toThrow(
			/does not know how to register/
		);
	});

	test('throws on a functional utility that declares nothing', () => {
		expect(() => extractFunctional('@utility tooltip-gap-* { }', 'tooltip')).toThrow(
			/declares nothing/
		);
	});
});
