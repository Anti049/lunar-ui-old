# 11. Debugging in VS Code

Breakpoints in server code, client code, the plugin build and the tests —
without leaving the editor.

Copy [`../templates/.vscode/launch.json`](../templates/.vscode/launch.json) and
[`tasks.json`](../templates/.vscode/tasks.json), or build them up through the ten
steps below.

---

## 1. Understand why a SvelteKit app needs two debuggers

A SvelteKit route runs in two places. `+page.server.ts`, `+layout.server.ts`,
`hooks.server.ts` and the SSR pass of every component run in **Node**, inside the
Vite dev server process. Everything after hydration runs in the **browser**.

They are different runtimes with different debug protocols, so one configuration
cannot cover both. What you want is a compound launch that attaches to each.

```text
┌─ Vite dev server (Node) ────────┐      ┌─ Chrome ──────────────────┐
│  hooks.server.ts                │      │  +page.svelte (hydrated)  │
│  +page.server.ts                │ ───▶ │  onMount, event handlers  │
│  SSR render of +page.svelte     │      │  stores, $effect          │
│  vite.config.ts, your plugins   │      │                           │
└─────────────────────────────────┘      └───────────────────────────┘
      "Debug: docs (server)"                 "Debug: docs (client)"
                    └──────── compound ────────┘
```

Knowing which side a breakpoint lives on is most of the skill. If a breakpoint
never binds, the first question is always "is this code running where I think it
is?"

---

## 2. Add the server configuration

**`.vscode/launch.json`** — new file, beside the `settings.json` and
`extensions.json` from [guide 8](08-conventions.md).

```jsonc
{
	"version": "0.2.0",
	"configurations": [
		{
			// Server: launches Vite itself under the Node debugger.
			"type": "node",
			"request": "launch",
			"name": "Debug: docs (server)",
			"cwd": "${workspaceFolder}/packages/docs",
			"runtimeExecutable": "bun",
			"runtimeArgs": ["--bun", "run", "dev", "--", "--port", "5173"],
			"console": "integratedTerminal",
			"skipFiles": ["<node_internals>/**", "**/node_modules/vite/**"],
			"serverReadyAction": {
				"pattern": "Local:\\s+(https?://\\S+)",
				"uriFormat": "%s",
				"action": "debugWithChrome"
			}
		}
	]
}
```

`serverReadyAction` watches the terminal for Vite's `Local:` line and opens
Chrome against it, so nothing races the server's startup.

The explicit `--port 5173` is worth keeping. Vite picks the next free port when
5173 is taken, and then the client configuration in step 3 attaches to a server
that is not yours.

**Checkpoint:** run it, set a breakpoint in `vite.config.ts` inside
`configureServer`, and relaunch. It should hit before the server is ready.

---

## 3. Add the client configuration

**`.vscode/launch.json`** — a second entry in the `configurations` array,
after the server one.

```jsonc
{
	// Client: attaches to the browser the server config opened.
	"type": "chrome",
	"request": "launch",
	"name": "Debug: docs (client)",
	"url": "http://localhost:5173",
	"webRoot": "${workspaceFolder}/packages/docs",
	"sourceMapPathOverrides": {
		"webpack://_N_E/*": "${webRoot}/*",
		"/@fs/*": "/*"
	},
	"skipFiles": ["**/node_modules/**", "**/.svelte-kit/**"]
}
```

`webRoot` must point at the **docs package**, not the repository root. And
`/@fs/*` is not optional in a monorepo: Vite serves any file outside the project
root through that prefix, which in a workspace is most of your own code.

---

## 4. Add the compound

**`.vscode/launch.json`** — a new top-level key, sibling to `version` and
`configurations`.

```jsonc
"compounds": [
	{
		"name": "Debug: docs (full stack)",
		"configurations": ["Debug: docs (server)", "Debug: docs (client)"],
		"stopAll": true
	}
]
```

`stopAll: true` means stopping one stops both — without it you leave orphaned
Vite processes holding the port, and the next launch fails with `EADDRINUSE`.

---

## 5. Add configurations for the build and the tests

**`.vscode/launch.json`** — three more entries in the `configurations` array.
These are the ones you will actually use most.

```jsonc
{
	// The plugin build — where most of the interesting bugs are.
	"type": "node",
	"request": "launch",
	"name": "Debug: plugin build",
	"cwd": "${workspaceFolder}/packages/core",
	"runtimeExecutable": "bun",
	"runtimeArgs": ["functions/build.ts"],
	"console": "integratedTerminal"
},
{
	// Unit tests, all of them.
	"type": "node",
	"request": "launch",
	"name": "Debug: unit tests",
	"cwd": "${workspaceFolder}/packages/core",
	"runtimeExecutable": "bun",
	"runtimeArgs": ["test", "test/unit"],
	"console": "integratedTerminal"
},
{
	// Just the test under the cursor's file.
	"type": "node",
	"request": "launch",
	"name": "Debug: current test file",
	"cwd": "${workspaceFolder}/packages/core",
	"runtimeExecutable": "bun",
	"runtimeArgs": ["test", "${relativeFile}"],
	"console": "integratedTerminal"
}
```

Each runs the entry file **directly**, not through an npm script. That is
deliberate — see the traps.

---

## 6. Set breakpoints on the right side

**Server-side.** Run _Debug: docs (server)_, set a breakpoint in
`+page.server.ts` or in a component's `<script>` (it runs during SSR too), and
load the page. The first request hits it.

**Client-side.** Run the compound. Breakpoints in `onMount`, event handlers and
`$effect` bind once the page hydrates.

**Distinguishing the two** — a component's script body runs in both. If you only
want one — **in the component itself**, temporarily:

```ts
import { browser } from '$app/environment';
if (browser) debugger; // client only
```

**The plugin build.** _Debug: plugin build_ is where the real value is. Put a
breakpoint in `partition.ts` and inspect what a rule's `@layer` marker actually
says when attribution goes wrong — far faster than reasoning about it.

---

## 7. Keep and read the compiled intermediates

The build writes intermediates to `.tmp/`. Keep them:

```powershell
Set-Location packages/core

# PowerShell has no inline `VAR=1 cmd` prefix form: set it, then run.
$env:KEEP_TMP = 1
bun functions/build.ts
```

Unset it again with `Remove-Item Env:KEEP_TMP` — unlike the POSIX prefix form,
this one persists for the rest of the session.

Then open `.tmp/*.out.css` and read exactly what Tailwind produced. Most
"impossible" plugin bugs become obvious at this step — a selector you expected is
simply not there, or is there twice, or is in the wrong layer.

Build this in from the start. Retrofitting an intermediate dump into a build
script while you are already debugging it is the wrong time to do it.

---

## 8. Probe Tailwind's resolution directly

When a class is not emitted and you cannot see why, compile a minimal case
directly rather than through the app:

**`packages/core/.tmp/probe.css`** — a scratch file. `.tmp/` is gitignored,
so this is never committed.

```css
@import 'tailwindcss' source(none);
@plugin '../dist/index.js';
@source inline('badge');
@source inline('md:badge');
```

```powershell
Set-Location packages/core

$cli = node -e "const p=require('path');console.log(p.join(p.dirname(require.resolve('@tailwindcss/cli/package.json')),'dist/index.mjs'))"
node $cli -i .tmp/probe.css -o .tmp/probe.out.css

Select-String -Path .tmp/probe.out.css -Pattern 'badge'
```

Two minutes, and it answers definitively. Reasoning about Tailwind's emission
rules from memory is how people lose afternoons.

`source(none)` is what makes it a probe rather than a whole-project compile — the
only classes considered are the ones you named with `@source inline()`.

---

## 9. Stub the plugin API to see what it receives

One level lower than step 8: not what Tailwind emits, but what your plugin hands
it.

**`packages/core/.tmp/stub.ts`** — a scratch file; run it with `bun .tmp/stub.ts`.

```ts
import plugin from './dist/index.js';
plugin().handler({
	addBase: (x) => console.log('addBase', Object.keys(x)),
	addUtilities: (x) => console.log('addUtilities', Object.keys(x)),
	addVariant: (n, v) => console.log('addVariant', n, v),
	matchUtilities: (u, o) => console.log('matchUtilities', Object.keys(u), o),
	theme: () => ({})
});
```

This separates "the plugin never registered it" from "Tailwind registered it and
declined to emit it", which look identical from the outside and have completely
different fixes.

---

## 10. Add `tasks.json`

**`.vscode/tasks.json`** — new file.

```jsonc
{
	"version": "2.0.0",
	"tasks": [
		{
			"label": "check",
			"type": "shell",
			"command": "bun run check",
			"problemMatcher": ["$tsc"],
			"group": { "kind": "test", "isDefault": true }
		},
		{
			"label": "build plugin",
			"type": "shell",
			"command": "bun run --filter '@scope/project-name' build",
			"problemMatcher": ["$tsc"]
		},
		{
			"label": "dev",
			"type": "shell",
			"command": "bun run dev",
			"isBackground": true,
			"problemMatcher": []
		}
	]
}
```

`problemMatcher: ["$tsc"]` puts TypeScript errors in the Problems panel with
clickable locations. `isDefault` on the `check` task binds it to the
run-test-task keybinding, which is worth having on one key.

---

## Files after this phase

Two files, both in `.vscode/`, both committed deliberately.

| File                  | Status | Written in | Next touched by         |
| --------------------- | ------ | ---------- | ----------------------- |
| `.vscode/launch.json` | added  | steps 2–5  | as you add entry points |
| `.vscode/tasks.json`  | added  | step 10    | rarely                  |

They join `settings.json` and `extensions.json` from
[guide 8](08-conventions.md) in the same folder.

It is tempting to gitignore `.vscode/` as personal configuration. Do not: these
three are shared setup, and the point is that a new contributor gets working
breakpoints without being told how. Personal preferences belong in the user
settings file, which is outside the repository anyway.

Both files are given in full across steps 2–5 and step 10. `launch.json` is
assembled from four separate blocks, so here it is in one piece.

---

### `.vscode/launch.json`

```jsonc
{
	"version": "0.2.0",
	"configurations": [
		{
			// Server: launches Vite itself under the Node debugger.
			"type": "node",
			"request": "launch",
			"name": "Debug: docs (server)",
			"cwd": "${workspaceFolder}/packages/docs",
			"runtimeExecutable": "bun",
			// The explicit port matters: Vite picks the next free one when 5173 is
			// taken, and the client config below would then attach to a server
			// that is not yours.
			"runtimeArgs": ["--bun", "run", "dev", "--", "--port", "5173"],
			"console": "integratedTerminal",
			"skipFiles": ["<node_internals>/**", "**/node_modules/vite/**"],
			// Watches the terminal for Vite's `Local:` line and opens Chrome
			// against it, so nothing races the server's startup.
			"serverReadyAction": {
				"pattern": "Local:\s+(https?://\S+)",
				"uriFormat": "%s",
				"action": "debugWithChrome"
			}
		},
		{
			// Client: attaches to the browser the server config opened.
			"type": "chrome",
			"request": "launch",
			"name": "Debug: docs (client)",
			"url": "http://localhost:5173",
			// The DOCS PACKAGE, not the repository root. Wrong here and no
			// breakpoint in a .svelte file will ever bind.
			"webRoot": "${workspaceFolder}/packages/docs",
			"sourceMapPathOverrides": {
				"webpack://_N_E/*": "${webRoot}/*",
				// Not optional in a monorepo: Vite serves any file outside the
				// project root through this prefix, which here is most of your code.
				"/@fs/*": "/*"
			},
			"skipFiles": ["**/node_modules/**", "**/.svelte-kit/**"]
		},
		{
			// The plugin build — where most of the interesting bugs are.
			// Runs the entry file DIRECTLY, not through an npm script: Bun's
			// inspector needs the file to be the entry or breakpoints never bind.
			"type": "node",
			"request": "launch",
			"name": "Debug: plugin build",
			"cwd": "${workspaceFolder}/packages/core",
			"runtimeExecutable": "bun",
			"runtimeArgs": ["functions/build.ts"],
			"console": "integratedTerminal"
		},
		{
			"type": "node",
			"request": "launch",
			"name": "Debug: unit tests",
			"cwd": "${workspaceFolder}/packages/core",
			"runtimeExecutable": "bun",
			"runtimeArgs": ["test", "test/unit"],
			"console": "integratedTerminal"
		},
		{
			// Whatever file is focused in the editor.
			"type": "node",
			"request": "launch",
			"name": "Debug: current test file",
			"cwd": "${workspaceFolder}/packages/core",
			"runtimeExecutable": "bun",
			"runtimeArgs": ["test", "${relativeFile}"],
			"console": "integratedTerminal"
		}
	],
	"compounds": [
		{
			"name": "Debug: docs (full stack)",
			"configurations": ["Debug: docs (server)", "Debug: docs (client)"],
			// Stopping one stops both. Without it you leave orphaned Vite
			// processes holding the port, and the next launch fails EADDRINUSE.
			"stopAll": true
		}
	]
}
```

---

### `.vscode/tasks.json`

```jsonc
{
	"version": "2.0.0",
	"tasks": [
		{
			"label": "check",
			"type": "shell",
			"command": "bun run check",
			// Puts TypeScript errors in the Problems panel with clickable
			// locations, rather than leaving them as terminal text.
			"problemMatcher": ["$tsc"],
			// Binds this to the run-test-task keybinding, which is worth having
			// on one key.
			"group": { "kind": "test", "isDefault": true }
		},
		{
			"label": "build plugin",
			"type": "shell",
			"command": "bun run --filter '@scope/project-name' build",
			"problemMatcher": ["$tsc"]
		},
		{
			"label": "dev",
			"type": "shell",
			"command": "bun run dev",
			// Long-running: VS Code should not wait for it to exit.
			"isBackground": true,
			"problemMatcher": []
		}
	]
}
```

---

## Traps

> **Breakpoints in `.svelte` files never bind on the client.** Almost always a
> source-map path mismatch. Check `webRoot` points at the _docs package_, not the
> repository root, and that `/@fs/*` is in `sourceMapPathOverrides` — Vite serves
> files outside the root through that prefix, which is exactly what a monorepo
> does constantly.

> **`EADDRINUSE` on every second launch.** A previous debug session left Vite
> running. `stopAll: true` prevents it; to recover, kill whatever holds the port.

> **The debugger steps into framework internals.** Extend `skipFiles` —
> `**/node_modules/**`, `**/.svelte-kit/**`, `<node_internals>/**`.

> **Breakpoints in the plugin build do not bind.** Bun's inspector needs the file
> to be the entry, not a dynamic import. Debug `functions/build.ts` directly
> rather than through the npm script — which is why step 5 spells out
> `runtimeArgs` instead of using `run build`.

> **You debug the docs site and your plugin changes never appear.** The dev alias
> points at source, but `generated/` still has to be rebuilt — that is the
> watcher's job. If you launched Vite through the debugger rather than through
> `bun run dev`, confirm the watcher child actually started.

---

## Commit

```powershell
git add -A
git commit -m "chore(repo): add VS Code debug and task configuration"
```

`.vscode/` is committed deliberately. It is tempting to gitignore it as
personal configuration, but `launch.json`, `tasks.json` and
`extensions.json` are shared setup — the point is that a new contributor
gets working breakpoints without being told how.

Label the PR `skip-changeset`.
---

Next: [Testing](12-testing.md)
