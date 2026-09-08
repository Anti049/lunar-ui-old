# Agent instructions

Working rules for this monorepo. `CLAUDE.md` alongside this file carries the
same project context in Claude Code's own format; keep the two in sync when
either changes.

## Before you change anything

- `packages/lunar-ui/css/` is the source of truth for the design system. The
  published artifact is a **compiled Tailwind plugin**, not CSS. Editing the CSS
  is how you change the library; editing `generated/` or `dist/` is never right.
- Read `packages/HANDOFF.md` before touching the plugin build. It records
  Tailwind v4 behaviour established by experiment, several bits of which are
  counter-intuitive and expensive to rediscover.

## Verifying work

Run the package's own check, not just a build:

```sh
bun run --filter '@anti049/lunar-ui' check
```

`test/e2e.test.ts` compiles every component twice — once from the raw CSS, once
through the compiled plugin — and compares selector by selector. A green run
means the plugin still faithfully represents the CSS. It reports benign
differences separately from real ones; read the categories rather than only the
final line.

The suite is not vacuous: mutating a value in `generated/components/*/object.ts`
makes it fail and names the selector and property.

For anything that changes what consumers receive, verify against a **packed
tarball** installed into a scratch app, not `bun link` — a link resolves to the
working tree and hides packaging bugs. Bump the version before repacking; bun
caches by name and version and will otherwise reinstall stale content.

## Conventions worth keeping

- **Derive lists from source.** Component classes, custom variants and theme
  namespaces are all extracted from the CSS. Hand-maintained equivalents have
  silently shipped incomplete more than once. If you are about to type out a
  list of things that already exist in the CSS, write an extractor.
- **Fail loudly on unknown input.** Options validate against the generated
  registries and throw with the valid names listed. A typo that silently does
  nothing is the failure mode to avoid.
- **State findings, not conclusions.** When something behaves unexpectedly,
  check it against the real toolchain before acting on the assumption. Most of
  the surprises recorded in HANDOFF.md were found this way, and several
  contradicted the obvious reading.

## Known-broken, leave alone

`bun run lint` fails on essentially every file: the repo is CRLF and Prettier
defaults to `endOfLine: "lf"`. It is pre-existing and unrelated to whatever you
are working on. Do not "fix" it as a side effect — reformatting the repo buries
the real diff. If it should be fixed, that is a commit of its own.
