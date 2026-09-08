# @anti049/lunar-ui-docs

The lunar-ui documentation and demo site. Private — never published to npm.

```sh
bun run dev     # from the repo root, or `bun run --filter '@anti049/lunar-ui-docs' dev`
```

## Layout

- `src/routes` — one page per component.
- `src/lib/docs` — component doc JSON, validated by `component-doc.schema.json`
  and loaded eagerly by `src/lib/docs/index.ts`.
- `src/lib/demo` — `ComponentPreview` and `ComponentClassTable`, the two widgets
  the docs pages are built from.
- `src/lib/components` — site chrome (`NavBar`, `NavLinks`, `CodeBlock`). These
  live here rather than in the library because they depend on SvelteKit
  (`$app/*`) and on this site's own route list.

`@anti049/lunar-ui-svelte` is aliased to its source in
[vite.config.ts](vite.config.ts), so editing a component hot-reloads here
without running `svelte-package` first.
