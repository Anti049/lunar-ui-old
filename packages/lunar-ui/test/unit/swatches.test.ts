import { test, expect, describe } from 'bun:test';
import { buildSwatches, modeMapping, SWATCH_ROLES } from '../../functions/extract-swatches.js';
import type { ThemeRules } from '../../types.js';

/*
	The catalogue the package ships for JavaScript. Both modes are resolved for
	every theme, and the two kinds of shipped theme get there differently:
	`default` declares tone steps and reads the pair modes.css names, while
	`catppuccin` and `dracula` declare each role outright.
*/

const MODES = `
	:root, [data-theme] {
		--theme-color-primary: light-dark(var(--theme-color-primary-40), var(--theme-color-primary-80));
		--theme-color-secondary: light-dark(var(--theme-color-secondary-40), var(--theme-color-secondary-80));
		--theme-color-tertiary: light-dark(var(--theme-color-tertiary-40), var(--theme-color-tertiary-80));
		--theme-color-surface: light-dark(var(--theme-color-neutral-98), var(--theme-color-neutral-6));
		--theme-color-on-surface: light-dark(var(--theme-color-neutral-10), var(--theme-color-neutral-90));
	}
`;
const mapping = modeMapping(MODES);

const toneSteps = (): Record<string, string> => ({
	'--theme-color-primary-40': '#light-p',
	'--theme-color-primary-80': '#dark-p',
	'--theme-color-secondary-40': '#light-s',
	'--theme-color-secondary-80': '#dark-s',
	'--theme-color-tertiary-40': '#light-t',
	'--theme-color-tertiary-80': '#dark-t',
	'--theme-color-neutral-98': '#light-bg',
	'--theme-color-neutral-6': '#dark-bg',
	'--theme-color-neutral-10': '#light-fg',
	'--theme-color-neutral-90': '#dark-fg'
});

const directRoles = (tag: string): Record<string, string> =>
	Object.fromEntries(SWATCH_ROLES.map((role) => [`--theme-color-${role}`, `#${tag}-${role}`]));

describe('modeMapping', () => {
	test('reads the light/dark pair for every swatch role', () => {
		expect(mapping.primary).toEqual(['--theme-color-primary-40', '--theme-color-primary-80']);
		expect(mapping.surface).toEqual(['--theme-color-neutral-98', '--theme-color-neutral-6']);
	});

	/*
		Hard-coding the table would drift the first time a role was re-pointed, so
		a role that stops being a light-dark() pair has to fail the build loudly.
	*/
	test('throws when a role is not a light-dark() pair', () => {
		expect(() => modeMapping(':root { --theme-color-primary: red; }')).toThrow(
			/does not declare --theme-color-primary as a light-dark\(\) pair/
		);
	});
});

describe('buildSwatches', () => {
	test('a tone-step theme resolves each mode from its own step', () => {
		const themes: ThemeRules = { default: { "[data-theme='default']": toneSteps() } };
		const out = buildSwatches(themes, mapping);
		expect(out.default.light).toEqual({
			primary: '#light-p',
			secondary: '#light-s',
			tertiary: '#light-t',
			surface: '#light-bg',
			'on-surface': '#light-fg'
		});
		expect(out.default.dark.surface).toBe('#dark-bg');
	});

	/*
		`[data-theme='alucard'], [data-theme='dracula'].light` names two themes at
		once: alucard's whole palette, and dracula's light mode.
	*/
	test('a selector list naming several themes is split correctly', () => {
		const themes: ThemeRules = {
			dracula: {
				"[data-theme='alucard'],\n[data-theme='dracula'].light": directRoles('lt'),
				"[data-theme='dracula'].dark": directRoles('dk')
			}
		};
		const out = buildSwatches(themes, mapping);
		expect(Object.keys(out).sort()).toEqual(['alucard', 'dracula']);
		expect(out.dracula.light.primary).toBe('#lt-primary');
		expect(out.dracula.dark.primary).toBe('#dk-primary');
	});

	/*
		A flavour is a fixed palette -- catppuccin-mocha is dark wherever it is
		used -- so it reports what it has for both modes rather than inventing one.
	*/
	test('a single-selector theme reports the same colours for both modes', () => {
		const themes: ThemeRules = {
			catppuccin: { "[data-theme='catppuccin-mocha']": directRoles('mocha') }
		};
		const out = buildSwatches(themes, mapping);
		expect(out['catppuccin-mocha'].light).toEqual(out['catppuccin-mocha'].dark);
	});

	test('a direct role wins over the tone step', () => {
		const themes: ThemeRules = {
			mixed: { "[data-theme='mixed']": { ...toneSteps(), '--theme-color-primary': '#pinned' } }
		};
		const out = buildSwatches(themes, mapping);
		expect(out.mixed.light.primary).toBe('#pinned');
		expect(out.mixed.dark.primary).toBe('#pinned');
	});

	test('a theme missing a role is skipped rather than half-filled', () => {
		const themes: ThemeRules = {
			sparse: { "[data-theme='sparse']": { '--theme-color-primary': '#only' } }
		};
		expect(buildSwatches(themes, mapping)).toEqual({});
	});

	test('names come out sorted, so a picker renders stably', () => {
		const themes: ThemeRules = {
			a: { "[data-theme='zed']": directRoles('z'), "[data-theme='amber']": directRoles('a') }
		};
		expect(Object.keys(buildSwatches(themes, mapping))).toEqual(['amber', 'zed']);
	});
});
