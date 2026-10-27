---
name: verify-plugin
description: Verify a plugin change is safe for consumers by packing a tarball and installing it into a scratch app. Use before releasing or when a change affects what consumers receive.
---

# Verify the plugin as a consumer would

A workspace link resolves to the working tree and hides packaging bugs — an empty
`files` array, a wrong `exports` map, a missing `dist`. Only a packed tarball
catches those.

## 1. The repository's own check

```sh
bun run --filter '@anti049/test' check
```

Read the parity categories. Benign differences (inlined `var()` fallbacks,
regrouped selectors) are reported separately from real ones.

## 2. Bump, pack, install

```sh
cd packages/core
# Bump the version first — package managers cache by name and version, and
# repacking the same version silently reinstalls stale content.
npm version prerelease --no-git-tag-version
bun run build
npm pack --pack-destination /tmp
```

```sh
cd /tmp
bunx sv create app --template minimal --types ts --no-add-ons
cd app
bun add -d tailwindcss @tailwindcss/vite
bun add "$TMPDIR/$(cd packages/core && npm pack --pack-destination "$TMPDIR" | tail -1)"
```

## 3. Compile against it

```css
/* src/app.css */
@import 'tailwindcss';
@plugin '@anti049/test';
```

```sh
bunx @tailwindcss/cli -i src/app.css -o /tmp/out.css
grep -c '\.button' /tmp/out.css     # non-zero
```

Then check the options a consumer would actually use: `prefix`, `include`,
a custom theme.

## 4. Revert the version bump

```sh
cd - && git checkout packages/core/package.json
```

## Report

Say what you compiled, what you grepped for, and what the counts were. "It
works" is not a report.
