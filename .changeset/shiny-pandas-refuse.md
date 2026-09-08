---
'@anti049/lunar-ui': minor
'@anti049/lunar-ui-svelte': minor
---

lunar-ui now ships as a Tailwind CSS v4 plugin rather than as raw CSS.

**Breaking.** `@import '@anti049/lunar-ui'` no longer resolves — the package has
no CSS entry point. Replace it with:

```css
@import 'tailwindcss';
@plugin '@anti049/lunar-ui';
```

The plugin is standalone: components, foundations, themes and design tokens all
arrive through it, with no companion stylesheet to import.

What the plugin adds over the old CSS:

- **`prefix`** — namespace every lunar-ui class and local custom property,
  e.g. `@plugin '@anti049/lunar-ui' { prefix: lunar-; }`.
- **`include` / `exclude`** — ship only the bundles you use.
- **`themes`** — choose which of the shipped palettes to emit. `default` is
  always included; the others fall back to it.
- **Custom themes**, via `@plugin '@anti049/lunar-ui/theme'`, either from a seed
  colour (a full Material tonal palette is generated, with the status colours
  harmonized toward the seed) or by declaring `--theme-color-*` roles by hand.
- **Shape tokens** — `--radius-selector`, `--radius-field`, `--radius-box`,
  `--size-selector`, `--size-field`, `--border-width`, `--animation-duration`
  and `--animation-easing`, settable globally or per theme.

Other changes:

- Font faces are no longer re-exported. Install the `@fontsource-variable`
  packages you want and import them directly.
- `@tailwindcss/forms` and `@tailwindcss/typography` are no longer bundled. Add
  `@plugin '@tailwindcss/forms'` yourself if you want them.
- Two silent bugs fixed in the component CSS: the badge alert halo had no
  containing block and covered the viewport, and a `select` tonal fallback named
  a token that does not exist.

`@anti049/lunar-ui-svelte` is unchanged apart from its peer range and its
documented setup, which now uses `@plugin` instead of `@import`.
