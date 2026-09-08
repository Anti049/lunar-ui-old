# lunar-ui

Bun-workspace monorepo. A Tailwind CSS v4 design system shipped as a plugin, its
Svelte bindings, and a docs site.

| workspace | package | notes |
| --- | --- | --- |
| `packages/lunar-ui` | `@anti049/lunar-ui` | the Tailwind plugin. Ships `dist` only |
| `packages/svelte` | `@anti049/lunar-ui-svelte` | Svelte 5 components, built by `svelte-package` |
| `packages/docs` | `@anti049/lunar-ui-docs` | SvelteKit site. Private |

## Commands

Bun workspaces — not npm or pnpm.

```sh
bun run check                                # every workspace
bun run --filter '@anti049/lunar-ui' check   # build + typecheck + e2e + publint
bun run dev                                  # docs site
```

## Things that will bite

**The package ships a plugin, not CSS.** `packages/lunar-ui/css/` is the source
the plugin is *compiled from*; it is not published and has no export path.
Consumers write `@plugin '@anti049/lunar-ui'`, never `@import`.

**Never hand-edit generated files.** `packages/lunar-ui/generated/**` is written
by `bun build/build.ts`; `packages/lunar-ui/dist/**` is `tsc` output. Both are
gitignored. Change the generator or the CSS source instead.

**Run the package's check after touching `css/`.** The plugin is compiled from
those files, and `test/e2e.test.ts` compiles every component twice — once via
`@import` of the raw CSS, once via `@plugin` — and compares. It is the guard
against the compiled plugin drifting from its source, and it has caught real
bugs in the CSS itself.

**Derive, don't hand-list.** Several registries are generated from the CSS:
component classes, custom variants, theme namespaces. Hand-maintained lists here
have silently shipped incomplete twice — most recently only 1 of 3
`@custom-variant`s, while the docs layout used one of the missing two. If you
find yourself typing a list of things that exist in the CSS, extract it instead.

**`bun run lint` already fails, on essentially every file.** The repo is CRLF
throughout and Prettier defaults to `endOfLine: "lf"`. Pre-existing, unrelated
to any change you make. Do **not** "fix" it by running `prettier --write .` —
that rewrites the whole repo and buries the real diff. If it needs fixing, that
is its own commit.

**The Bash tool mangles heredocs containing backticks or backslashes.** It has
silently eaten template literals and dropped `\\`, producing things like
`collisions.push()` with no argument. Use Write/Edit for any file containing
backticks, escapes or `${}`.

## CSS authoring convention

Components are authored as Tailwind v4 utilities with a three-level cascade
layer, and the plugin's build depends on this shape:

```css
@utility badge {
	@layer badge.l3 {   /* l3 foundation, l2 variant/size/colour, l1 state */
		@apply inline-flex items-center rounded-sm;
	}
}
```

Layer names do not always match file names (`collapsible.css` emits into
`@layer collapse.lN`), which the build handles — but keep new components
consistent.

## More

`packages/HANDOFF.md` has the deeper context: verified Tailwind v4 behaviour
that cost real experiments to establish, the plugin's architecture and why
generated data is emitted as `.ts`, known divergences, and the open work to take
the plugin from proof-of-concept to shipping. Read it before changing the
plugin.
