# Handoff: monorepo split and the Tailwind plugin port

Continuation notes for work done across `9a34dba..a411600`. Written to be picked
up on a different machine without replaying the investigation.

The expensive part of this work was not the code — it was establishing what
Tailwind v4 actually does. Those findings are in **Verified Tailwind v4
behaviour** below; each one cost a real experiment, and several contradict what
seems reasonable. Read that section before changing the plugin.

---

## 1. Where things stand

```text
lunar-ui/
├─ packages/lunar-ui/   @anti049/lunar-ui         CSS→JS Tailwind plugin, published
│  ├─ functions/                                  runtime helpers + the compiler
│  └─ src/                                        the CSS the plugin is compiled from
│     ├─ base/                                    tokens, palette, layers (no classes)
│     ├─ components/                              one stylesheet per component
│     ├─ themes/                                  shipped theme palettes
│     └─ utilities/                               the `foundations` bundle
├─ packages/svelte/     @anti049/lunar-ui-svelte  Svelte 5 components, published
└─ packages/docs/       @anti049/lunar-ui-docs    SvelteKit site, private
```

Bun workspaces, Changesets for releases, shared prettier/eslint at the root.

`packages/lunar-ui` publishes `dist` only. The CSS in `src/` is what the plugin
is compiled *from*; it is not shipped and has no export path, so consumers write
`@plugin '@anti049/lunar-ui'` and never `@import`.

### Commands

```sh
bun run check                                  # every workspace
bun run --filter '@anti049/lunar-ui' check     # build + typecheck + e2e + publint
bun run dev                                    # docs site
bun run package                                # pack a tarball for external testing
```

---

## 2. Chronology

| commit | what |
| --- | --- |
| `9a34dba` | monorepo split: core CSS / Svelte / docs |
| `86c9b47` | packaging fixes found by installing tarballs into an external app |
| `867915a` | plugin POC — badge + button only |
| `64dd8d1` | standalone: plugin carries its own design tokens |
| `ab3f8c3` | all theme namespaces registered; theme switching verified |
| `221e377` | foundations ship as their own bundle |
| `fa2394a` | core fix: badge alert halo had no containing block |
| `9b55f01` | plugin converted to TypeScript |
| `575676e` | theme selection + custom themes (roles or seed) |
| `fd8dd83` | status palettes harmonized toward the seed |
| `cd3a810` | all 16 components; default-theme + comment bugs fixed |
| `8622073` | eight shape tokens as plugin/theme options |
| `86244d5` | core fix: removed dead `--depth` box-shadow |
| `a411600` | core fix: select tonal fallback → `--color-on-surface` |

---

## 3. Verified Tailwind v4 behaviour

All confirmed against **Tailwind 4.3.3** by experiment, not documentation.

### `@plugin` and options

- `@plugin` loads **JavaScript only**. There is no CSS-first path to it.
- **TypeScript works.** `@plugin './x.ts'` loads under both `@tailwindcss/cli`
  and `@tailwindcss/vite` — Tailwind bundles plugins before loading them.
- Option bodies are **flat scalars, auto-typed**: `prefix: lunar-` → string,
  `themes: a, b` → array, `logs: false` → boolean, `scale: 1.5` → number.
  No nesting.
- **Custom-property keys work as option keys.** `--theme-color-primary: #f00`
  arrives as a key. This is the only reason per-theme colour roles are
  expressible, and it is why each custom theme is its own `@plugin` call.
- `tailwindcss/plugin` ships `plugin.d.ts` but its `exports` map has **no
  `types` condition**. Types still resolve via the sibling `.d.mts` under
  `moduleResolution: "bundler"` or `"node16"`; a project on `"node"` would fail.
- `PluginWithOptions` is imported by Tailwind's own declarations but **never
  re-exported**, so the inferred type of a `withOptions` default export cannot
  be named. It is restated locally in `index.ts` to keep the emitted `.d.ts`
  portable.

### What the JS plugin API cannot do

- **`@apply` does not work** in plugin CSS-in-JS. It emits a literal
  `@apply: font-bold;` declaration — invalid, silent.
- **`addBase({'@theme': {...}})` emits a literal `@theme` block inside
  `@layer base`**, which browsers ignore entirely. It is not a route to
  registering theme values. (It *looks* like it works if you only grep for the
  variable name.)
- `addUtilities` **rejects an at-rule as a top-level key**. `@layer x` and
  `@media (...)` must be turned inside out so the selector is the key — see
  `nestCssLayers`.
- `addComponents` and `addUtilities` are **usage-gated**; `addBase` is
  unconditional.
- The plugin API has **no channel that emits into a top-level cascade layer**.
  `addBase` means `@layer base`, `addUtilities` means `@layer utilities`. This
  is the root of the one real divergence (§6).

### Compilation and emission

- **`@reference` suppresses `@utility` emission entirely**, even with
  `@source inline`. It cannot be used to isolate a component's compiled output.
  The build compiles everything at once and partitions instead.
- `@utility` output is **emitted on demand**; plain `.class` rules are
  unconditional. Any build that wants `@utility` output must safelist the names.
- **`--content` is not a v4 CLI flag** (it was v3). Passing it is silently
  ignored — a trap when writing probes. Use `@source`.
- A theme entry **only materialises as CSS when a utility uses it**. Compiled
  CSS referencing it straight from `var()` is not tracked, so such references
  dangle unless the default is inlined as a `var()` fallback.
- Tailwind **constant-folds `var(--tw-x, …)` to the literal** in its own utility
  output but passes plugin-supplied declarations through as authored. Same
  computed value, different text — the e2e test classifies this rather than
  failing.
- Tailwind **re-groups selector lists** and leaves redundant wrappers
  (`:is(:is(x), y)`, a trailing `:where(.selected)`) when re-emitting plugin
  output. Cosmetic; the test normalizes them.

### postcss-js

- **Numeric CSS values become JS numbers** (`opacity: 0`), which Tailwind's own
  `CssInJs` type does not model. One documented cast in `index.ts`.
- **A repeated declaration becomes an array**, and Tailwind does *not*
  camelCase-convert array-valued keys — `transitionDuration` reached the output
  verbatim, invalid CSS that browsers drop. The build now emits kebab-case
  throughout.
- Reversing postcss-js's encoding is **not plain camel→kebab**: vendor prefixes
  round-trip as `WebkitUserSelect`, so a leading capital must become a leading
  dash, and `-ms-` is encoded lowercase. Use its own algorithm:
  `.replace(/([A-Z])/g, '-$1').replace(/^ms-/, '-ms-').toLowerCase()`.

### material-color-utilities

- `0.4.0` **ships broken ESM** — extensionless relative imports that Node's
  resolver rejects. It works here only because Tailwind bundles plugins.
  Verified under both the CLI and `@tailwindcss/vite`.
- `SchemeVibrant` is the closest match to lunar-ui's shipped themes: for the
  default theme's `#0956AA` seed it gives `#005db9` against the committed
  `#0058ca`. **Near, not identical** — the originals came from a different
  generator, so a regenerated theme will not equal the committed one.
- `Blend.harmonize(designColor, sourceColor)` rotates hue by at most 15°, and is
  direction-aware: from a green seed, blue and magenta sources can produce the
  *same* result because both lie the same way round the wheel. Not a bug.

---

## 4. Plugin architecture

```text
functions/*.ts    runs directly under bun, no compile step
   ↓ generates
generated/*.ts   (gitignored)
   ↓ tsc
dist/             JS + .d.ts — the only thing published
```

**Generated data is emitted as `.ts`, not `.js`, on purpose.** `index.ts`
imports `./generated/registry.js`, `theme.js`, `base.js` and the rest, so `tsc`
checks the hand-written runtime against the real shape of what the build
produced. Emitting `.js` would leave every one of those seams typed `any`.

### Build pipeline (`functions/build.ts`)

1. **Enumerate** each bundle's classes — `@utility` names plus plain selectors
   in the bundle's own namespace, widened by its own `@utility` names
   (`collapsible.css` declares `collapse`; `navigation.css` declares `nav-link`).
2. **Detect Tailwind built-ins** by compiling bare Tailwind with lunar-ui's class
   list safelisted and none of lunar-ui loaded. Whatever answers is Tailwind's
   and is left unclaimed — `collapse`, `table`, `select-text` all collide.
3. **Compile once** with `functions/context.css` plus every component, feeding the
   class list back as `@source inline(…)`.
4. **Partition** by `@layer <name>.lN` and `<name>-*` keyframes, falling back to
   class-name attribution (layer names are not always file names), then to the
   classes inside an unrecognised layer.
5. **Serialize** with postcss-js into two buckets per bundle: `utilities` (from
   `@utility`, usage-gated) and `standalone` (from plain selectors).
6. **Resolve tokens** — transitive closure from the compiled output, read from
   *source* rather than a compile, with theme defaults inlined as `var()`
   fallbacks.

### Runtime

- `functions/nestCssLayers.ts` turns `{'@layer x': {'.a': …}}` into
  `{'.a': {'@layer x': …}}`, because `addUtilities` wants a selector as the key.
  Applies to every conditional group, not just `@layer`; `@keyframes`,
  `@property`, `@font-face` and `@counter-style` are left alone.
- `functions/addPrefix.ts` renames only what an **allowlist generated from
  source** says lunar-ui owns — the inverse of DaisyUI's denylist. See §5.

---

## 5. addPrefix: allowlist vs DaisyUI's denylist

DaisyUI prefixes everything except a hand-maintained denylist (13 selector names,
3 regex prefixes, 6 variable prefixes). We prefix only an allowlist generated
from the sources — currently **227 classes and 47 variables** — with **8**
hand-maintained exceptions. The denylist stays a fixed size as the library
grows; the allowlist regenerates.

Verified differentially against DaisyUI 5.7.28:

- DaisyUI renames `.w-1\/2` — a **Tailwind utility** it doesn't own. Silent
  breakage; that is the denylist's structural weakness.
- Our failure direction is safer: a missing allowlist entry leaves a class
  unprefixed, which is visible and asserted against.
- DaisyUI handled **CSS comments in selectors** and we did not — an apostrophe
  inside a comment opened a quote that never closed. Fixed in `cd3a810`.

The dependency worth remembering: our approach is only as good as the extractor.
A class the extractor misses silently stops being prefixed.

---

## 6. Known divergences from the CSS-first build

Current parity: **399 selectors present in both, 0 missing, 0 real declaration
conflicts.**

1. **Cascade position — the only real one.** 27 selectors move from a top-level
   layer into `@layer utilities`, so `.badge-disabled` stops outranking `bg-*`
   utilities. Rules authored as plain selectors land in a top-level layer that
   sorts after everything; the plugin API cannot reach there. Either accept and
   document, or restructure core so those rules come from `@utility`.
2. **20 narrower duplicates**, concentrated in `navigation` — Tailwind
   re-composing the several selector forms `.nav-link` registers
   (`.nav-link:not(:disabled):disabled` matches nothing). Verified to introduce
   **no declaration the baseline lacked**; bloat, not breakage.
3. **1 Tailwind built-in deliberately unclaimed** (`.collapse:not(td,tr,colgroup)`).
   Consumers get it from `@import 'tailwindcss'`.

Also worth knowing: `src/base/layers.css` declares sublayer order inside
`@layer components`, but the rules land under `@layer utilities` and at the top
level — different layer trees, so that declaration appears to have no effect on
either path.

---

## 7. Hand-maintained lists (these degrade silently)

| list | where | fails how |
| --- | --- | --- |
| `THEME_NAMESPACES` | `functions/collect-tokens.ts` | a new namespace falls through to a plain custom property; components render, consumers get no utility |
| `STATE_HOOKS` | `functions/extract-classes.ts` | a consumer state hook gets renamed by a prefix |
| `JS_COUPLED` | `functions/extract-classes.ts` | a class written in JS gets renamed and the action breaks |
| `RUNTIME_CLASSES` | `functions/build.ts` | a class the ripple writes at runtime is converted to `@utility` and never emitted, since no candidate exists to gate on |
| `SHAPE_TOKENS` | `functions/build.ts` | a new knob is settable nowhere, or is accepted and read by nothing |

`CUSTOM_VARIANTS` used to be on this list and shipped 1 of 3. It is now derived
by `functions/extract-variants.ts`, which is the pattern to follow for anything
else here that can be read out of the CSS.

---

## 8. Open work

### Correctness gaps

1. **Three functional utilities dropped**: `tooltip-gap-*`,
   `tooltip-tail-size-*`, `tooltip-tail-width-*`. `@utility name-*` cannot be
   safelisted by name; needs `matchUtilities`. The build warns, the consumer
   just finds them missing.
2. **Usage gating changes semantics.** Plain-selector rules are unconditional in
   a CSS-first build but usage-gated through `addUtilities`. Breaks
   `class={\`badge-${variant}\`}`. Needs a documented safelist story. The
   `unconditional` bucket handles the runtime-written classes only.

### Decisions

3. The cascade divergence (§6.1) — accept and document, or restructure the CSS.
4. Pin or vendor `@material/material-color-utilities` given its broken ESM.
5. `@tailwindcss/forms` and `typography` are devDependencies, not composed into
   the plugin: composing them throws on `Object.keys(modifiers)` because only
   the handler half is reachable, not its `config`. Consumers add them
   themselves.
6. Changesets majors any package with a peerDependency on a bumped package,
   regardless of range, so a patch to `@anti049/lunar-ui` proposes a major for
   `@anti049/lunar-ui-svelte`. The escape hatch
   (`onlyUpdatePeerDependentsWhenOutOfRange` plus a widened range) is verified
   to work but is not enabled; the default is in force.

### Resolved since this file was written

`private: true`, the missing `tailwindcss` peer dependency, the stale
description and the missing `publint` step are all fixed. The separate CSS
package is gone — one package now emits the design system, so there is nothing
left to drift. `packages/docs` consumes the plugin through
`@plugin '@anti049/lunar-ui'`, so the published path is exercised first-party.

---

## 9. Testing

`packages/lunar-ui/test/e2e.test.ts` compiles every bundle twice from the same
source — once through `@import` (today's path), once through `@plugin` — and
compares. It also covers standalone resolution, prefixing, themes and shape
tokens.

It is **not** vacuous: mutate a value in `generated/components/*/object.ts`
and it fails, naming the selector and property.

```sh
cd packages/lunar-ui
bun test/e2e.test.ts
KEEP_TMP=1 bun test/e2e.test.ts   # leaves compiled CSS in dist/.test/
```

### Verifying externally

Use **packed tarballs, not `bun link`** — a link resolves to the working tree
and hides packaging bugs. That is how the empty-`dist` bug was caught.

```sh
cd packages/lunar-ui && bun run build && npm pack --pack-destination <dir>
bunx sv@latest create --template minimal --types ts --no-add-ons --no-install app
cd app && bun add -d tailwindcss @tailwindcss/vite && bun add <dir>/anti049-lunar-ui-*.tgz
```

Then add `tailwindcss()` to `vite.config.ts`, `import '../app.css'` in
`+layout.svelte`, and:

```css
@import 'tailwindcss';
@plugin '@anti049/lunar-ui' { prefix: lunar-; }
```

**Bump the version on every repack.** Bun caches by name+version, so re-packing
the same version silently reinstalls stale content — this cost a debugging round
where the app ran a plugin without `base.js`.

---

## 10. Environment notes

- Windows. The Bash tool mangles heredocs containing backticks and backslashes —
  several patches silently lost `\\` or ate template literals. **Use the
  Write/Edit tools for any file containing backticks or escapes.**
- The repo is entirely CRLF while Prettier defaults to `endOfLine: "lf"`, so
  `bun run lint` fails on ~232 files. **Pre-existing** — verified by running
  Prettier against a file straight out of `HEAD`. Fix is `"endOfLine": "auto"`
  in `.prettierrc`, or one formatting-only commit.
- ESLint reports 5 errors, all pre-existing in untouched code: unused `data` in
  four route pages, and `{@html}` in `ThemedSVG`.
- `.vscode/settings.json` still sets `deno.enable: true` though `deno.lock` was
  removed in the split; it will fight the TS server.
