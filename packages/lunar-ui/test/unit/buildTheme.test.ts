import { test, expect, describe } from 'bun:test';
import { buildThemeDeclarations, themeName, themeSelectors } from '../../functions/buildTheme.js';

/*
	Shared by the plugin and by the docs theme generator, which is the point:
	what the generator shows you is what `@plugin '.../theme'` emits. These pin
	the behaviour both rely on, including the errors -- the generator surfaces
	them in the UI, so their wording is part of the contract.
*/

describe('themeName', () => {
	test('trims', () => {
		expect(themeName({ name: '  brand  ' })).toBe('brand');
	});

	test('throws on a missing or blank name', () => {
		for (const options of [{}, { name: '' }, { name: '   ' }, { name: 42 as unknown as string }]) {
			expect(() => themeName(options)).toThrow(/needs a `name`/);
		}
	});
});

describe('buildThemeDeclarations — generated palettes', () => {
	const seeded = buildThemeDeclarations({ name: 'brand', seed: '#0956AA' });

	test('generates a full tone scale for every palette', () => {
		const palettes = new Set(
			Object.keys(seeded).map((k) => k.replace(/^--theme-color-/, '').replace(/-\d+$/, ''))
		);
		expect([...palettes].sort()).toEqual([
			'alert',
			'error',
			'info',
			'neutral',
			'neutral-variant',
			'primary',
			'secondary',
			'success',
			'tertiary',
			'warning'
		]);
		expect(Object.keys(seeded)).toHaveLength(300);
	});

	test('emits hex values', () => {
		expect(seeded['--theme-color-primary-40']).toMatch(/^#[0-9a-f]{6}$/);
	});

	test('the variant changes the palette', () => {
		const mono = buildThemeDeclarations({ name: 'b', seed: '#0956AA', variant: 'monochrome' });
		expect(mono['--theme-color-primary-40']).not.toBe(seeded['--theme-color-primary-40']);
	});

	test('variant matching ignores case, spaces and dashes', () => {
		const a = buildThemeDeclarations({ name: 'b', seed: '#0956AA', variant: 'tonal spot' });
		const b = buildThemeDeclarations({ name: 'b', seed: '#0956AA', variant: 'Tonal-Spot' });
		expect(a).toEqual(b);
	});

	/*
		Harmonizing rotates the status hues toward the seed so they read as one
		palette, but by at most 15 degrees -- success has to stay green.
	*/
	test('harmonize shifts the status palettes, and can be turned off', () => {
		const exact = buildThemeDeclarations({ name: 'b', seed: '#0956AA', harmonize: false });
		expect(seeded['--theme-color-success-40']).not.toBe(exact['--theme-color-success-40']);
	});

	test('a status seed override is respected', () => {
		const base = { name: 'b', seed: '#0956AA', harmonize: false };
		const custom = buildThemeDeclarations({ ...base, 'seed-success': '#00FF00' });
		const stock = buildThemeDeclarations(base);
		expect(custom['--theme-color-success-40']).not.toBe(stock['--theme-color-success-40']);
	});
});

describe('buildThemeDeclarations — per-role seeds', () => {
	const base = { name: 'b', seed: '#0956AA' };
	const derived = buildThemeDeclarations(base);

	test('a core seed replaces only its own palette', () => {
		const pinned = buildThemeDeclarations({ ...base, 'seed-secondary': '#52e2ac' });
		expect(pinned['--theme-color-secondary-40']).not.toBe(derived['--theme-color-secondary-40']);
		// everything else stays derived from `seed`
		for (const token of ['primary', 'tertiary', 'neutral', 'neutral-variant', 'error']) {
			expect(pinned[`--theme-color-${token}-40`]).toBe(derived[`--theme-color-${token}-40`]);
		}
	});

	test('every core role can be seeded', () => {
		for (const option of [
			'seed-primary',
			'seed-secondary',
			'seed-tertiary',
			'seed-neutral',
			'seed-neutral-variant'
		]) {
			const token = option.replace(/^seed-/, '');
			const pinned = buildThemeDeclarations({ ...base, [option]: '#52e2ac' });
			expect(pinned[`--theme-color-${token}-40`]).not.toBe(derived[`--theme-color-${token}-40`]);
		}
	});

	/*
		Core seeds are taken exactly, unlike status seeds: pinning one is how you
		hold a brand colour, so rotating it toward the theme's seed would defeat
		the point.
	*/
	test('a core seed is not harmonized', () => {
		const a = buildThemeDeclarations({ ...base, 'seed-primary': '#52e2ac', harmonize: true });
		const b = buildThemeDeclarations({ ...base, 'seed-primary': '#52e2ac', harmonize: false });
		expect(a['--theme-color-primary-40']).toBe(b['--theme-color-primary-40']);
	});

	test('a core seed still yields a full tone scale', () => {
		const pinned = buildThemeDeclarations({ ...base, 'seed-primary': '#52e2ac' });
		const steps = Object.keys(pinned).filter((k) => /^--theme-color-primary-\d+$/.test(k));
		expect(steps).toHaveLength(30);
	});

	/*
		Tailwind passes an @plugin body through verbatim, and an unknown key is
		ignored rather than rejected -- so `primarySeed` would silently do nothing
		if only the kebab spelling were accepted.
	*/
	test('camelCase and kebab-case name the same option', () => {
		const kebabbed = buildThemeDeclarations({ ...base, 'seed-secondary': '#52e2ac' });
		const camelled = buildThemeDeclarations({ ...base, seedSecondary: '#52e2ac' });
		expect(camelled).toEqual(kebabbed);
	});

	test('rejects an unparseable core seed, naming the option', () => {
		expect(() => buildThemeDeclarations({ ...base, 'seed-tertiary': 'nope' })).toThrow(
			/"seed-tertiary" colour/
		);
	});
});

describe('buildThemeDeclarations — hand-declared roles', () => {
	test('roles alone need no seed', () => {
		expect(buildThemeDeclarations({ name: 'b', '--theme-color-primary': '#8be9fd' })).toEqual({
			'--theme-color-primary': '#8be9fd'
		});
	});

	test('a hand-declared role beats the generated one', () => {
		const result = buildThemeDeclarations({
			name: 'b',
			seed: '#0956AA',
			'--theme-color-primary-40': '#ff0000'
		});
		expect(result['--theme-color-primary-40']).toBe('#ff0000');
	});

	test('carries color-scheme through', () => {
		const result = buildThemeDeclarations({
			name: 'b',
			'--theme-color-primary': '#fff',
			'color-scheme': 'dark'
		});
		expect(result['color-scheme']).toBe('dark');
	});

	/*
		Tailwind ignores an option a plugin does not read, so a misspelling used to
		look exactly like a colour that refused to apply.
	*/
	test('rejects an unknown option rather than ignoring it', () => {
		expect(() =>
			buildThemeDeclarations({ name: 'b', '--theme-color-primary': '#fff', junk: 1 })
		).toThrow(/unknown option junk/);
	});

	test('suggests the seed-* spelling for a bare role name', () => {
		expect(() => buildThemeDeclarations({ name: 'b', seed: '#0956AA', success: '#fff' })).toThrow(
			/did you mean `seed-success`/
		);
	});
});

describe('buildThemeDeclarations — errors the generator surfaces', () => {
	test('rejects a variant with no seed', () => {
		expect(() => buildThemeDeclarations({ name: 'b', variant: 'vibrant' })).toThrow(
			/only applies to generated palettes/
		);
	});

	test('rejects a theme with no colours at all', () => {
		expect(() => buildThemeDeclarations({ name: 'b' })).toThrow(/defines no colours/);
	});

	test('rejects an unknown variant', () => {
		expect(() => buildThemeDeclarations({ name: 'b', seed: '#0956AA', variant: 'nope' })).toThrow(
			/unknown theme variant/
		);
	});

	/*
		The generator regenerates on every keystroke of the seed field, so a
		half-typed hex has to throw predictably rather than produce nonsense.
	*/
	test('rejects an unparseable seed', () => {
		for (const seed of ['#09', 'not-a-colour', '']) {
			expect(() => buildThemeDeclarations({ name: 'b', seed })).toThrow(
				/could not parse seed colour|defines no colours/
			);
		}
	});
});

describe('themeSelectors', () => {
	test('one selector by default', () => {
		expect(themeSelectors({ name: 'brand' })).toEqual(["[data-theme='brand']"]);
	});

	/*
		`:root:not([data-theme])`, never plain `:root`: the two have identical
		specificity, so a default declared after another theme would win and make
		that theme impossible to apply.
	*/
	test('a default theme also applies where no theme is set', () => {
		expect(themeSelectors({ name: 'brand', default: true })).toEqual([
			"[data-theme='brand']",
			':root:not([data-theme])'
		]);
	});
});
