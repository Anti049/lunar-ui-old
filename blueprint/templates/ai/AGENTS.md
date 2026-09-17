# Agent instructions

The canonical instructions for this repository. `CLAUDE.md`,
`.github/copilot-instructions.md` and `.cursor/rules/` are thin pointers here —
if you find yourself explaining the build in two places, fix that instead.

---

## Before you change anything

- **`packages/core/src/` is the source of truth for the design system.** The
  published artifact is a **compiled Tailwind plugin**, not CSS. Editing the CSS
  is how you change the library; editing `generated/` or `dist/` is never right.
- **Read `docs/ARCHITECTURE.md` before touching the plugin build.** It records
  toolchain behaviour established by experiment, several bits of which are
  counter-intuitive and expensive to rediscover.
- A fresh clone cannot typecheck until it has built once — `generated/` is
  gitignored build output. Run `bun run build:packages` first.

---

## Verifying work

Run the package's own check, not just a build:

```sh
bun run --filter '@scope/project-name' check
```

`test/e2e.test.ts` compiles every component twice — once from the raw CSS, once
through the compiled plugin — and compares selector by selector. A green run
means the plugin still faithfully represents the CSS. It reports benign
differences separately from real ones; **read the categories, not the final
line.**

The suite is not vacuous: mutating a value in `generated/components/*/object.ts`
makes it fail and names the selector and property. If you change the harness,
re-confirm that.

For anything that changes what consumers receive, verify against a **packed
tarball** installed into a scratch app, not a workspace link — a link resolves to
the working tree and hides packaging bugs. Bump the version before repacking;
package managers cache by name and version and will otherwise reinstall stale
content.

**A green build is not verification.** Most failure modes in this repository are
silent: the build succeeds, the output looks plausible, and the breakage appears
in a consumer's app later.

---

## Source layout

`packages/core/src/` is split by what a file **emits**, not by topic:

| Directory     | Contains                                                 | Emits                    |
| ------------- | -------------------------------------------------------- | ------------------------ |
| `base/`       | layers, colour scheme, palette, tokens, fonts, keyframes | tokens only, no classes  |
| `utilities/`  | colour roles, elevation, accessibility helpers           | non-namespaced utilities |
| `components/` | one stylesheet per component                             | namespaced utilities     |
| `themes/`     | shipped palettes                                         | `[data-theme]` blocks    |

The build treats `base/ + utilities/ + themes/` as the compile **context** and
keeps only what components add on top. A new non-namespaced utility goes in
`utilities/` — put it in `base/` and it becomes invisible context that never
ships. Every new file must be added to its directory's `_index.css`.

`functions/` holds every hand-written `.ts`: the runtime that ships in `dist`
and the compiler that does not. `tsconfig.build.json` keeps them apart by
listing entry points and letting `tsc` follow imports.

---

## CSS authoring convention

Components use a three-tier cascade layer, and **the tiers nest**:

```css
@utility badge {
	@layer badge.l1.l2.l3 {   /* foundation */
		@apply inline-flex items-center;
	}
}
@utility badge-outline {
	@layer badge.l1.l2 { … }  /* variant, size, colour */
}
@utility badge-disabled {
	@layer badge.l1 { … }     /* state */
}
```

**Deeper is weaker.** Unlayered content of a layer beats that layer's sublayers,
so `badge.l1` wins over `badge.l1.l2`, which wins over `badge.l1.l2.l3` —
whatever order the blocks appear in. Do not flatten these into siblings
(`badge.l1`, `badge.l2`, `badge.l3`): sibling layers order by first appearance,
so moving a block would silently change what wins.

The first segment is the bundle name, which is how `functions/partition.ts`
attributes a rule. Layer names do not always match file names — keep new
components consistent.

---

## Conventions

- **Derive lists from source.** Component classes, custom variants, theme
  namespaces and functional utilities are all extracted from the CSS.
  Hand-maintained equivalents have shipped incomplete more than once — most
  recently 1 of 3 custom variants, while the docs site used one of the missing
  two. If you are about to type a list of things that exist in the CSS, write an
  extractor.
- **Fail loudly on unknown input.** Options validate against generated registries
  and throw with the valid names listed. Tailwind ignores any option a plugin
  does not read, so a typo looks exactly like a setting that quietly refused to
  apply. Where a wrong key is a near-miss, suggest the right one.
- **State findings, not conclusions.** When something behaves unexpectedly, check
  it against the real toolchain before acting on the assumption. Most of the
  surprises in `ARCHITECTURE.md` were found that way, and several contradicted
  the obvious reading.
- **Do not reformat files unrelated to your change.** It buries the real diff.

---

## Traps that fail silently

These have all cost real time. They do not produce errors.

- **`@reference` suppresses `@utility` emission entirely.** Use a plain `@import`
  in the compile context and subtract by diffing.
- **The compile must be `source(none)`.** Otherwise Tailwind scans the repository
  for candidates and a class name written _in a comment_ becomes a real utility
  baked into the shipped bundle.
- **`addBase({'@utility x-*': …})` and `addBase({'@theme': …})` are inert.** The
  at-rule is emitted verbatim into the consumer's stylesheet and never processed.
- **A class written by JavaScript at runtime is never emitted** through
  `addUtilities` — there is no candidate to gate on. Route it through `addBase`.
- **`matchUtilities` has no bare-value support.** `x-2` needs `'2'` in `values`.
  Adding `'number'` to `type` makes even the arbitrary form stop resolving.
- **A custom property's `var()` resolves where it is declared.** Giving a derived
  token a `:root` default bakes in the root's value, and a `[data-theme]`
  override never reaches it. Write the fallback at the point of use.
- **`resolve.alias` in Vite matches by prefix.** An alias for a package name also
  catches its subpath exports. Use anchored patterns.

---

## Known-broken, leave alone

_Keep this section current. A repository always has something broken on purpose;
without a note, everyone rediscovers it._

- (nothing at present)
