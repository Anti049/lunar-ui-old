# lunar-ui

A monorepo containing lunar-ui's CSS layer, its Svelte bindings, and the docs site.

| Workspace                                          | Package                     | Published | What it is                                                        |
| -------------------------------------------------- | --------------------------- | --------- | ----------------------------------------------------------------- |
| [`packages/lunar-ui`](packages/lunar-ui)                    | `@anti049/lunar-ui`         | yes       | Framework-agnostic Tailwind v4 styles, design tokens, and themes.  |
| [`packages/svelte`](packages/svelte)                | `@anti049/lunar-ui-svelte`  | yes       | Svelte 5 components built on top of the CSS layer.                 |
| [`packages/docs`](packages/docs)                            | `@anti049/lunar-ui-docs`    | no        | SvelteKit documentation and demo site.                             |

`packages/lunar-ui` has no build step — it ships raw CSS, because Tailwind v4 has to
process `@plugin`, `@theme`, and `@layer` in the consumer's own build. Nothing
in it depends on Svelte, so it can be used from any framework.

## Getting started

```sh
bun install
bun run dev      # docs site at http://localhost:5173
```

The docs app aliases `@anti049/lunar-ui-svelte` to its source (see
[packages/docs/vite.config.ts](packages/docs/vite.config.ts)), so component edits
hot-reload without a package rebuild.

## Common tasks

```sh
bun run build            # build every workspace
bun run build:packages   # build the publishable packages only
bun run check            # svelte-check + publint across all workspaces
bun run lint             # prettier --check and eslint
bun run format           # prettier --write
```

To run a script in one workspace: `bun run --filter '@anti049/lunar-ui-svelte' build`.

## Consuming the packages

```sh
npm install @anti049/lunar-ui @anti049/lunar-ui-svelte
```

```css
/* app.css */
@import 'tailwindcss';
@import '@anti049/lunar-ui';

/* Optional: bundled font faces. Install the @fontsource-variable packages first. */
@import '@anti049/lunar-ui/fonts.css';

/* Only if you use the Svelte components — keeps their utility classes from
   being tree-shaken out of your build. */
@import '@anti049/lunar-ui-svelte/styles.css';
```

## Releasing

Versioning and publishing run through [Changesets](https://github.com/changesets/changesets).

```sh
bun run changeset   # describe your change, then commit the generated file
```

Merging to `main` opens a "Version Packages" PR; merging that PR publishes to
npm via [.github/workflows/release.yml](.github/workflows/release.yml). The two
published packages are versioned in lockstep.
