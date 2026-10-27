# Templates

Copy-paste files. Everything here is ready to use once you replace `@anti049`,
`test` and `Anti049/test` with real values.

---

## Where each file goes

| From `templates/`                  | To                                     | Guide                            |
| ---------------------------------- | -------------------------------------- | -------------------------------- |
| `.github/workflows/ci.yml`         | `.github/workflows/ci.yml`             | [6](../guides/09-github.md)      |
| `.github/workflows/release.yml`    | `.github/workflows/release.yml`        | [6](../guides/09-github.md)      |
| `.github/workflows/docs.yml`       | `.github/workflows/docs.yml`           | [6](../guides/09-github.md)      |
| `.github/workflows/changeset.yml`  | `.github/workflows/changeset.yml`      | [5](../guides/08-conventions.md) |
| `.github/ISSUE_TEMPLATE/*`         | `.github/ISSUE_TEMPLATE/`              | [6](../guides/09-github.md)      |
| `.github/pull_request_template.md` | `.github/pull_request_template.md`     | [6](../guides/09-github.md)      |
| `.github/dependabot.yml`           | `.github/dependabot.yml`               | [6](../guides/09-github.md)      |
| `.github/CODEOWNERS`               | `.github/CODEOWNERS`                   | [6](../guides/09-github.md)      |
| `.github/CONTRIBUTING.md`          | `.github/CONTRIBUTING.md` or repo root | [6](../guides/09-github.md)      |
| `.github/SECURITY.md`              | `.github/SECURITY.md`                  | [6](../guides/09-github.md)      |
| `.vscode/launch.json`              | `.vscode/launch.json`                  | [8](../guides/11-debugging.md)   |
| `.vscode/tasks.json`               | `.vscode/tasks.json`                   | [8](../guides/11-debugging.md)   |
| `.vscode/settings.json`            | `.vscode/settings.json`                | [5](../guides/08-conventions.md) |
| `.vscode/extensions.json`          | `.vscode/extensions.json`              | [5](../guides/08-conventions.md) |
| `ai/AGENTS.md`                     | `AGENTS.md` (repo root)                | [7](../guides/10-ai-agents.md)   |
| `ai/CLAUDE.md`                     | `CLAUDE.md` (repo root)                | [7](../guides/10-ai-agents.md)   |
| `ai/copilot-instructions.md`       | `.github/copilot-instructions.md`      | [7](../guides/10-ai-agents.md)   |
| `ai/cursor-rules/*.mdc`            | `.cursor/rules/`                       | [7](../guides/10-ai-agents.md)   |
| `claude-skills/*/SKILL.md`         | `.claude/skills/<name>/SKILL.md`       | [7](../guides/10-ai-agents.md)   |
| `commitlint.config.js`             | repo root                              | [5](../guides/08-conventions.md) |
| `.gitmessage`                      | repo root                              | [5](../guides/08-conventions.md) |

---

## Copying them

```sh
# From the repository root, with blueprint/ still present:
cp -r blueprint/templates/.github .
cp -r blueprint/templates/.vscode .
cp blueprint/templates/ai/AGENTS.md .
cp blueprint/templates/ai/CLAUDE.md .
cp blueprint/templates/ai/copilot-instructions.md .github/
mkdir -p .cursor/rules && cp blueprint/templates/ai/cursor-rules/*.mdc .cursor/rules/
mkdir -p .claude/skills && cp -r blueprint/templates/claude-skills/* .claude/skills/
cp blueprint/templates/commitlint.config.js blueprint/templates/.gitmessage .
git config commit.template .gitmessage
```

Then find and replace across the copied files:

```sh
grep -rl '@anti049\|test\|Anti049/' .github .vscode .cursor .claude AGENTS.md CLAUDE.md \
  | xargs sed -i 's|@anti049|@Anti049|g; s|test|moonlight|g; s|Anti049/moonlight|Anti049/moonlight|g'
```

Read the diff before committing — the substitution is blunt and will catch prose
as well as identifiers.

---

## What still needs your input

| File                        | Replace                                       |
| --------------------------- | --------------------------------------------- |
| `CODEOWNERS`                | team handles, or delete it                    |
| `SECURITY.md`               | the advisory URL and your response window     |
| `ISSUE_TEMPLATE/config.yml` | the Discussions and advisory URLs             |
| `docs.yml`                  | deploys the site to GitHub Pages              |
| `release.yml`               | needs `NPM_TOKEN` as a repository secret      |
| `AGENTS.md`                 | the "Known-broken" section, once you have one |

---

## Secrets to configure

| Secret      | Needed by     | Notes                                                 |
| ----------- | ------------- | ----------------------------------------------------- |
| `NPM_TOKEN` | `release.yml` | Granular Access Token with read/write on the packages |

`GITHUB_TOKEN` is provided automatically.
