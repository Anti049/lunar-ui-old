# 01 — Monorepo Setup

Goal of this chapter: go from an empty directory to a working Bun workspace with
shared TypeScript, ESLint, Prettier, EditorConfig, and Git configuration, ready
for the five packages. Nothing here is package-specific; every later chapter
assumes this foundation exists.

## 1. Install the prerequisites

| Tool  | Minimum | Install                                                                 |
| ----- | ------- | ----------------------------------------------------------------------- |
| Bun   | 1.2     | `curl -fsSL https://bun.sh/install | bash` (macOS/Linux) · `powershell -c "irm bun.sh/install.ps1 | iex"` (Windows) |
| Node  | 20 LTS  | https://nodejs.org or a version manager (`fnm`, `nvm`, `volta`)          |
| Git   | 2.40    | https://git-scm.com                                                     |

Verify:

```sh
bun --version
node --version
git --version
```

> **Why both Bun and Node?** Bun is the day-to-day runtime, installer, and test
> runner. A few third-party tools and some CI actions still expect a Node binary
> on `PATH`; having both avoids surprises. Choose one and pin it via `.nvmrc` /
> `package.json#engines` so everyone matches.

## 2. Create the repository

```sh
mkdir project-name && cd project-name
git init
bun init -y            # creates a throwaway package.json we will overwrite
```

Create the root `.gitignore`:

```gitignore
# Dependencies
node_modules/

# Build output
dist/
build/
.svelte-kit/
.wrangler/
packages/*/generated/  # if you commit generated output, remove this line

# Caches
.turbo/
.tmp/
*.tsbuildinfo

# Env & local
.env
.env.*
!.env.example

# Editor / OS
.DS_Store
Thumbs.db
```

> **Committing generated output.** Some projects commit `packages/*/generated/`
> so consumers reading source on GitHub see real files, and so the plugin builds
> without a codegen step in CI. Others gitignore it and regenerate in CI. Both
> are valid; decide now and be consistent. This handbook assumes it **is**
> committed (simpler CI), so remove that `.gitignore` line if you follow suit.

## 3. Declare the workspace

Overwrite the root `package.json`. This file defines the workspace, the shared
dev tooling, and the orchestration scripts every chapter calls.

```jsonc
{
  "name": "project-name-monorepo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.2.0",
  "engines": { "node": ">=20", "bun": ">=1.2" },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/your-org/project-name.git"
  },
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "bun run --filter '@scope/project-name-docs' dev",
    "build": "bun run --filter '*' build",
    "build:packages": "bun run --filter '@scope/project-name' --filter '@scope/project-name-svelte' --filter '@scope/project-name-react' --filter '@scope/project-name-vue' build",
    "check": "bun run --filter '*' check",
    "lint": "prettier --check . && eslint .",
    "format": "prettier --write .",
    "test": "bun run --filter '*' test",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "bun run build:packages && changeset publish",
    "prepare": "husky"
  },
  "devDependencies": {
    "@changesets/cli": "^2.29.0",
    "@commitlint/cli": "^19.6.0",
    "@commitlint/config-conventional": "^19.6.0",
    "@eslint/js": "^9.17.0",
    "eslint": "^9.17.0",
    "eslint-config-prettier": "^9.1.0",
    "globals": "^15.14.0",
    "husky": "^9.1.0",
    "lint-staged": "^15.2.0",
    "prettier": "^3.4.0",
    "prettier-plugin-svelte": "^3.3.0",
    "prettier-plugin-tailwindcss": "^0.6.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.19.0"
  }
}
```

Key points:

- **`workspaces: ["packages/*"]`** — Bun links every folder under `packages/`
  and resolves `workspace:*` dependencies between them without publishing.
- **`--filter`** — runs a script in one or more workspaces by package name.
  `'*'` means "every workspace that defines this script".
- **`dev`** runs only the docs site; **`build:packages`** builds the four
  publishable packages (not docs); **`build`** builds everything.

Install to generate `bun.lock`:

```sh
bun install
```

## 4. Shared TypeScript configuration

Create a base config every package extends. This is the single place to set
strictness and module resolution.

`tsconfig.base.json`:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": [],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

Each package will have its own `tsconfig.json` that does
`"extends": "../../tsconfig.base.json"` and adds package-specific `lib`,
`types`, and `paths`.

## 5. Shared ESLint (flat config)

ESLint 9 uses "flat config" — a single `eslint.config.js` at the root.

```js
// eslint.config.js
import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },
  {
    ignores: [
      '**/dist/',
      '**/build/',
      '**/.svelte-kit/',
      '**/generated/',
      'bun.lock'
    ]
  },
  // Must be last: turns off rules that conflict with Prettier.
  prettier
);
```

> Add framework plugins per package (for example `eslint-plugin-svelte`,
> `eslint-plugin-react`, `eslint-plugin-vue`) as thin extra config objects. They
> are introduced in the relevant package chapters.

## 6. Shared Prettier

`.prettierrc.json`:

```json
{
  "useTabs": true,
  "singleQuote": true,
  "trailingComma": "none",
  "printWidth": 100,
  "plugins": ["prettier-plugin-svelte", "prettier-plugin-tailwindcss"],
  "overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
}
```

`.prettierignore`:

```gitignore
dist/
build/
.svelte-kit/
generated/
bun.lock
```

> `prettier-plugin-tailwindcss` sorts utility classes into a canonical order —
> essential when class strings are the primary API of your components. It must
> be listed **last** in `plugins`.

## 7. EditorConfig

`.editorconfig` keeps non-VS-Code editors consistent:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = tab

[*.{json,yml,yaml,md}]
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

## 8. VS Code workspace settings

Create `.vscode/settings.json` so every contributor gets format-on-save and the
right defaults:

```jsonc
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
  "eslint.useFlatConfig": true,
  "files.eol": "\n",
  "typescript.tsdk": "node_modules/typescript/lib",
  "[svelte]": { "editor.defaultFormatter": "svelte.svelte-vscode" }
}
```

And recommend the extensions everyone needs — `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "svelte.svelte-vscode",
    "bradlc.vscode-tailwindcss",
    "vue.volar",
    "editorconfig.editorconfig"
  ]
}
```

VS Code will prompt new contributors to install these on first open.

## 9. Git hooks: Husky + lint-staged + commitlint

These enforce formatting and commit conventions locally, before code ever
reaches CI. The commit-message rules themselves are covered in depth in
[11-conventions.md](11-conventions.md); wire up the plumbing now.

Initialize Husky:

```sh
bunx husky init
```

This one command does three things: it creates the `.husky/` directory (including
the internal `.husky/_/` helper scripts — commit those, never edit them), it
creates a starter `.husky/pre-commit` containing a default `bun test` line, and
it adds the `"prepare": "husky"` script to your root `package.json` (already
present from §3, so nothing changes there).

### Which files you create vs. edit

| File                    | After `husky init`?                     | Your action                                  |
| ----------------------- | --------------------------------------- | -------------------------------------------- |
| `.husky/pre-commit`     | Exists, with a placeholder `bun test`   | **Replace** its contents (below).            |
| `.husky/commit-msg`     | **Does not exist** — init never makes it | **Create** it (below).                       |
| `commitlint.config.js`  | No                                      | **Create** it (below).                       |
| `lint-staged` config    | No                                      | **Add** a block to the root `package.json`.  |
| `"prepare": "husky"`    | Added by init                           | Nothing — already in §3's manifest.          |

The one file `husky init` will *not* scaffold is `.husky/commit-msg`; without it,
commitlint never runs and malformed commit messages sail through.

### `.husky/pre-commit`

Overwrite the generated placeholder so the whole file is exactly:

```sh
bunx lint-staged
```

> Modern Husky (v9+) hook files are plain shell scripts — no shebang or sourced
> boilerplate is required. The file's entire contents are the command(s) to run.

### `.husky/commit-msg`

Create this file (it does not exist yet). Its entire contents:

```sh
bunx commitlint --edit "$1"
```

`$1` is the path Git passes to the hook pointing at the file that holds the
in-progress commit message; `--edit` tells commitlint to read and validate it.

### `commitlint.config.js`

Create this file at the repository root:

```js
export default { extends: ['@commitlint/config-conventional'] };
```

### `lint-staged` config

Add this block to the root `package.json` (it is configuration, not a new file —
though a standalone `.lintstagedrc.json` with the inner object works too):

```jsonc
{
  "lint-staged": {
    "*.{js,ts,svelte,vue,css,json,md}": ["prettier --write"],
    "*.{js,ts,svelte,vue}": ["eslint --fix"]
  }
}
```

Now a commit that is misformatted or violates Conventional Commits is rejected
locally with a clear message.

> **Make the hooks executable on macOS/Linux.** Files created by hand may need
> `chmod +x .husky/commit-msg .husky/pre-commit`. Windows/Git ignores the bit,
> but committing it keeps POSIX contributors working.

## 10. The `packages/` directory

```sh
mkdir packages
```

Each subsequent chapter creates one folder here. To keep cross-package
navigation clean, add an `AGENTS.md` at `packages/` describing the layout for
both humans and AI agents — see [10-ai-agents.md](10-ai-agents.md).

## 11. Verify the foundation

```sh
bun install
bun run lint       # prettier + eslint: should pass on the (near-empty) tree
```

Commit the scaffold:

```sh
git add -A
git commit -m "chore: initialize monorepo tooling"
```

> This is your first Conventional Commit. If the `commit-msg` hook rejects a
> message, that is the system working — see [11-conventions.md](11-conventions.md).

## Checklist

- [ ] Bun, Node, Git installed and verified.
- [ ] Root `package.json` with `workspaces` and orchestration scripts.
- [ ] `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`.
- [ ] `.editorconfig`, `.vscode/settings.json`, `.vscode/extensions.json`.
- [ ] Husky hooks for `pre-commit` and `commit-msg`; commitlint + lint-staged.
- [ ] `bun run lint` passes; first commit made.

Next: [02-plugin-package.md](02-plugin-package.md).
