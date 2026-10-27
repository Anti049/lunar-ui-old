# Copilot instructions

Read `AGENTS.md` for the build rules, the authoring convention and the traps.
This file is a summary.

## Repository shape

- Bun workspaces monorepo. The Tailwind plugin is `packages/core`; framework
  bindings are `packages/{svelte,react,vue}`; the site is `packages/docs`.
- `packages/core/generated/` and every `dist/` are build output. Never edit them.
- The published artifact is a compiled plugin, not CSS. Consumers write
  `@plugin '@anti049/test'`, never `@import`.

## Authoring components

- One stylesheet per component in `packages/core/src/components/`.
- Layers nest: `@layer badge.l1.l2.l3` (foundation) → `.l1.l2` (variant) →
  `.l1` (state). **Deeper is weaker**, regardless of declaration order.
- `src/base/` declares tokens and no classes. `src/utilities/` holds
  non-namespaced utilities. A utility placed in `base/` silently never ships.
- Never hand-maintain a list of class names, variants or tokens — the build
  extracts them from the CSS.

## Verifying

`bun run check` runs build, typecheck, tests and publint. A green build alone is
not verification: most failure modes here are silent.

## Commits and releases

- Conventional Commits. Scopes: `core`, `svelte`, `react`, `vue`, `docs`,
  `repo`, `deps`.
- Every PR needs a changeset unless labelled `skip-changeset`.
- Below 1.0, a breaking change is a `minor` bump. Say "Breaking" in the changeset
  body anyway.
