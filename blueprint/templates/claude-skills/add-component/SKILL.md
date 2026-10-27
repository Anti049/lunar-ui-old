---
name: add-component
description: Add a component across the Tailwind plugin and all three framework bindings, with docs and a changeset. Use when asked to add, create or scaffold a new component.
---

# Add a component

A component lands in the plugin **and** all three bindings, or it does not land.
Divergence is how a design system becomes three products.

## 1. The CSS

`packages/core/src/components/<name>.css`. Tiers nest, deeper is weaker:

```css
@utility <name> {
	@layer <name>.l1.l2.l3 {   /* foundation — every instance has this */
		@apply …;
	}
}
@utility <name>-outlined {
	@layer <name>.l1.l2 { … }  /* variant, size, colour */
}
@utility <name>-disabled {
	@layer <name>.l1 { … }     /* state */
}
```

Read colours from the semantic roles (`--color-primary`), never from
`--theme-color-*` directly. Read shape from the tokens (`--radius-field`), never
a hardcoded `rounded-*`.

## 2. Register it

Add the import to `src/components/_index.css`.

## 3. Build and confirm

```sh
bun run --filter '@anti049/test' build
```

The component must appear in the bundle list. If it does not, it produced no
classes — usually a layer name that does not match, or a file not added to the
barrel.

## 4. Bindings

`packages/{svelte,react,vue}` — identical props, identical defaults, identical
export names. Forward rest props and merge an incoming `class`. No inline styles.

## 5. Docs

A page under `packages/docs/src/routes/components/<name>/`, with the class table
generated from the plugin's registry rather than hand-written.

## 6. Changeset

```sh
bun changeset      # minor
```

Write it as release notes, not a commit message. Show the markup.

## 7. Verify

```sh
bun run check
```

Read the parity categories, not just the final line. Report what you ran and
what it said.
