# lunar-ui

Bun-workspace monorepo. A Tailwind CSS v4 design system shipped as a plugin, its
Svelte bindings, and a docs site.

| workspace           | package                    | notes                                          |
| ------------------- | -------------------------- | ---------------------------------------------- |
| `packages/lunar-ui` | `@anti049/lunar-ui`        | the Tailwind plugin. Ships `dist` only         |
| `packages/svelte`   | `@anti049/lunar-ui-svelte` | Svelte 5 components, built by `svelte-package` |
| `packages/docs`     | `@anti049/lunar-ui-docs`   | SvelteKit site. Private                        |

## Commands

Bun workspaces — not npm or pnpm.

```sh
bun run check                                # every workspace
bun run --filter '@anti049/lunar-ui' check   # build + typecheck + tests + publint
bun run dev                                  # docs site + plugin CSS watcher
```

The plugin has two test layers, and they answer different questions:

|                       | what it checks                                                  | when it earns its keep             |
| --------------------- | --------------------------------------------------------------- | ---------------------------------- |
| `test/unit/*.test.ts` | the pure build functions, in isolation                          | names the broken function directly |
| `test/e2e.test.ts`    | plugin output against a CSS-first compile, selector by selector | catches drift the units cannot see |

Run one alone with `bun run test:unit` / `bun run test:e2e`. The e2e needs a
current `dist/`, so run `bun run build` first if you invoke it directly.

## Things that will bite

**The package ships a plugin, not CSS.** `packages/lunar-ui/src/` is the source
the plugin is _compiled from_; it is not published and has no export path.
Consumers write `@plugin '@anti049/lunar-ui'`, never `@import`.

**Never hand-edit generated files.** `packages/lunar-ui/generated/**` is written
by `bun functions/build.ts`; `packages/lunar-ui/dist/**` is `tsc` output. Both are
gitignored. Change the generator or the CSS source instead.

**Run the package's check after touching `src/`.** The plugin is compiled from
those files, and `test/e2e.test.ts` compiles every component twice — once via
`@import` of the raw CSS, once via `@plugin` — and compares. It is the guard
against the compiled plugin drifting from its source, and it has caught real
bugs in the CSS itself.

**Derive, don't hand-list.** Several registries are generated from the CSS:
component classes, custom variants, theme namespaces. Hand-maintained lists here
have silently shipped incomplete twice — most recently only 1 of 3
`@custom-variant`s, while the docs layout used one of the missing two. If you
find yourself typing a list of things that exist in the CSS, extract it instead.

**`bun run lint` works; the formatting is clean.** If you have read that this
repo is CRLF and Prettier fails on every file, that was wrong — `prettier
--check .` passes, and `endOfLine` makes no difference.

What used to break it: `prettier-plugin-tailwindcss` loads the
`tailwindStylesheet` from `.prettierrc` so it can sort lunar-ui's own classes.
That pointed at the docs app, which `@plugin`s the workspace package, which
resolves to `dist/index.js` — so formatting silently depended on the package
being compiled, and the plugin throws once per file when it cannot resolve.
Hundreds of stack traces, every frame a `node_modules` path, which reads like
Prettier is checking `node_modules`. It is not, and never does.

It now points at `prettier-tailwind.css` at the repo root, which loads the
plugin from `index.ts`. Tailwind reads a plugin through jiti, so that needs only
`generated/`, not a compiled `dist`. **If you add a plugin option that changes
class names — `prefix` above all — mirror it there or the sorter will disagree
with the classes you actually write.**

ESLint is reachable now that Prettier passes, and reports a handful of real
findings. Do not assume `lint` failing means formatting.

**The Bash tool mangles heredocs containing backticks or backslashes.** It has
silently eaten template literals and dropped `\\`, producing things like
`collisions.push()` with no argument. Use Write/Edit for any file containing
backticks, escapes or `${}`.

## The dev loop

`bun run dev` starts the docs site _and_, as a child process, the plugin's CSS
watcher — editing `packages/lunar-ui/src/**` reaches the browser on its own.

It takes more machinery than it looks like it should, because the plugin is
compiled from CSS rather than importing it:

1. `functions/watch.ts` rebuilds `generated/` on change, then touches
   `index.ts`. Tailwind tracks the `@plugin` file's mtime, not its imports, and
   `generated/` is where a CSS change actually lands.
2. `lunarUiReload` in `packages/docs/vite.config.ts` watches that entry and
   bumps `app.css`'s mtime. Tailwind only re-checks the `@plugin` mtime inside
   its CSS `transform`, and its hot-update hook deliberately ignores `.ts`/`.js`
   files, so nothing re-runs that transform otherwise.
3. `vite dev` aliases `@anti049/lunar-ui` to `index.ts`. Tailwind loads a
   plugin through jiti, which reads TypeScript, so the loop skips `tsc` and
   rebuilds in ~1.4s instead of ~3.8s. Builds still resolve to `dist/`.

Two lighter-looking versions of step 2 do not work, both verified: invalidating
the module by hand still serves the cached `?direct` response, and emitting a
synthetic watcher event runs HMR but not a fresh transform.

The watcher cannot be a second workspace script — `bun run --filter` orders by
workspace dependency, and docs depends on the plugin, so a never-exiting watcher
there stops the dev server from ever starting.

## Source layout

`packages/lunar-ui/src/` is split by what a file _emits_, not by topic:

| directory     | contains                                                                                                        | emits                      |
| ------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `base/`       | layers, colour scheme, palette, semantics, design tokens, motion, typography, fonts, keyframes, bundled plugins | tokens only, no classes    |
| `utilities/`  | colour roles, elevation, accessibility, state layers, ripple                                                    | `@utility`, non-namespaced |
| `components/` | one stylesheet per component                                                                                    | `@utility`, namespaced     |
| `themes/`     | shipped theme palettes                                                                                          | `[data-theme]` blocks      |

The build depends on the split. `base/` + `utilities/` + `themes/` is the
compile _context_ (`functions/context.css`); components are compiled against it and
the difference is what gets partitioned into bundles. `utilities/` also ships as
the single `foundations` bundle, so a new non-namespaced utility goes there —
put it in `base/` and it becomes invisible context instead. Each directory has
an `_index.css` barrel; a new file must be added to it.

`functions/` holds every hand-written `.ts` in the package, of two kinds that
`tsconfig.build.json` keeps apart. `addPrefix`, `nestCssLayers` and
`generateTheme` are **runtime** and ship in `dist`; `build.ts` and its
extractors are the **compiler** and do not. The build config lists only the
entry points and lets `tsc` follow imports, so a new runtime helper ships as
soon as something imports it and a new build script stays out on its own.

## CSS authoring convention

Components are authored as Tailwind v4 utilities with a three-tier cascade
layer, and the plugin's build depends on this shape:

```css
@utility badge {
	@layer badge.l1.l2.l3 {          /* foundation */
		@apply inline-flex items-center rounded-sm;
	}
}
@utility badge-outline {
	@layer badge.l1.l2 { … }         /* variant / size / colour */
}
@utility badge-disabled {
	@layer badge.l1 { … }            /* state */
}
```

**The tiers nest, and deeper is weaker.** Unlayered content of a layer beats
that layer's own sublayers, so `badge.l1` (state) wins over `badge.l1.l2`
(variant), which wins over `badge.l1.l2.l3` (foundation) — and that holds
**whatever order the blocks appear in**. Do not flatten these into siblings
(`badge.l1`, `badge.l2`, `badge.l3`): sibling layers are ordered by first
appearance, so moving a block would silently change what wins.

The first segment is the bundle name, which is how `functions/partition.ts`
attributes a rule. Layer names do not always match file names (`collapsible.css`
emits into `@layer collapse.l1.l2.l3`), which the build handles — but keep new
components consistent.

## More

`packages/HANDOFF.md` has the deeper context: verified Tailwind v4 behaviour
that cost real experiments to establish, the plugin's architecture and why
generated data is emitted as `.ts`, known divergences, and the open work to take
the plugin from proof-of-concept to shipping. Read it before changing the
plugin.
