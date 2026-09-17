# 09 — GitHub Artifacts & Repository Hygiene

Everything under `.github/` (and a few root files) that makes the repository
welcoming, safe, and self-explanatory to a new contributor. Each artifact is
shown in full so you can copy it.

```
.github/
├── ISSUE_TEMPLATE/
│   ├── bug.yml
│   ├── feature.yml
│   ├── component.yml
│   ├── a11y.yml
│   └── config.yml
├── PULL_REQUEST_TEMPLATE.md
├── CODEOWNERS
├── dependabot.yml
├── FUNDING.yml
└── workflows/                # covered in 08
CONTRIBUTING.md
SECURITY.md
CODE_OF_CONDUCT.md
```

## 1. Issue forms (structured templates)

GitHub renders `.yml` issue **forms** as real inputs, which produce consistent,
parseable issues. `.github/ISSUE_TEMPLATE/bug.yml`:

```yaml
name: Bug report
description: Something is broken in a package.
labels: [type:fix]
body:
  - type: dropdown
    id: area
    attributes:
      label: Package
      options: [plugin, svelte, react, vue, docs]
    validations: { required: true }
  - type: input
    id: version
    attributes: { label: Package version, placeholder: '1.2.3' }
    validations: { required: true }
  - type: textarea
    id: repro
    attributes:
      label: Reproduction
      description: Steps, or a link to a minimal repro (StackBlitz/repo).
    validations: { required: true }
  - type: textarea
    id: expected
    attributes: { label: Expected vs. actual }
    validations: { required: true }
```

`.github/ISSUE_TEMPLATE/component.yml` (proposing a new component — ties into the
`add-component` AI skill in [10-ai-agents.md](10-ai-agents.md)):

```yaml
name: New component
description: Propose a component to add across all frameworks.
labels: [type:feat, area:plugin]
body:
  - type: input
    id: name
    attributes: { label: Component name, placeholder: 'Tooltip' }
    validations: { required: true }
  - type: textarea
    id: anatomy
    attributes:
      label: Anatomy & variants
      description: Parts, variants, roles, and states. What plugin classes will it emit?
    validations: { required: true }
  - type: textarea
    id: a11y
    attributes: { label: Accessibility requirements, description: Roles, keyboard, ARIA. }
    validations: { required: true }
```

Add `feature.yml` and `a11y.yml` on the same pattern.

`.github/ISSUE_TEMPLATE/config.yml` disables blank issues and points elsewhere for
questions:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Questions & discussion
    url: https://github.com/your-org/project-name/discussions
    about: Ask questions and share ideas here, not in issues.
```

## 2. Pull request template

`.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## What & why

<!-- A short description. Link the issue: Closes #123. -->

## Changes

-

## Checklist

- [ ] Conventional Commit title (e.g. `feat(svelte): add Tooltip`).
- [ ] Added a changeset (`bun run changeset`) if this changes a published package.
- [ ] `bun run lint && bun run check && bun run test` pass locally.
- [ ] Updated docs / examples if behavior changed.
- [ ] Cross-framework parity kept (if a component changed in one library).
```

The changeset reminder is the single most important line — it is what turns a
merge into a release (see [11-conventions.md](11-conventions.md)).

## 3. CODEOWNERS

Auto-requests review from the right people per area. `.github/CODEOWNERS`:

```
# Fallback owner for everything.
*                         @your-org/maintainers

/packages/project-name/   @your-org/design-system
/packages/svelte/         @your-org/svelte
/packages/react/          @your-org/react
/packages/vue/            @your-org/vue
/packages/docs/           @your-org/docs
/.github/                 @your-org/maintainers
```

Combined with branch protection ([08-github-workflows.md](08-github-workflows.md#7-required-status-checks)),
this enforces domain review.

## 4. Dependabot

`.github/dependabot.yml` keeps dependencies and actions current:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    groups:
      dev-dependencies:
        dependency-type: development
    open-pull-requests-limit: 10
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
```

> Bun uses `bun.lock`; Dependabot updates the `package.json` ranges and opens PRs.
> Your `ci.yml` re-runs on those PRs, and `--frozen-lockfile` will fail if the
> lockfile was not updated — so include a small workflow step or a bot that runs
> `bun install` on Dependabot PRs, or enable Dependabot's lockfile updates.

## 5. Security policy

`SECURITY.md`:

```markdown
# Security Policy

## Supported versions

The latest minor of the current major receives security fixes.

## Reporting a vulnerability

Please report privately via GitHub's **Report a vulnerability** button
(Security → Advisories) or email security@your-org.example. Do not open a public
issue for security reports. We aim to acknowledge within 3 business days.
```

## 6. Contributing guide

`CONTRIBUTING.md` — the on-ramp. It should link heavily into this handbook
rather than duplicate it:

```markdown
# Contributing

Thanks for helping! Start with the [developer handbook](handbook/README.md).

## Setup

```sh
bun install
bun run dev        # docs site with live-reload
```

## Workflow

1. Create a branch: `git switch -c feat/tooltip`.
2. Make changes. Keep cross-framework parity (see handbook/04 §8).
3. Add a changeset: `bun run changeset` (required for published-package changes).
4. Commit using Conventional Commits (the commit-msg hook enforces this).
5. Open a PR; fill in the template; ensure CI is green.

## Adding a component

Use the `add-component` AI skill (handbook/10) or follow handbook/02–05 to add it
to the plugin and all three libraries at once. A component is not "done" until it
exists in the plugin CSS, all three libraries, and the docs.

## Conventions

- Commits & versions: handbook/11.
- Code style: Prettier + ESLint, enforced on commit and in CI.
```

## 7. Code of conduct

Adopt the Contributor Covenant. Generate it from GitHub's community-health UI, or
add `CODE_OF_CONDUCT.md` from https://www.contributor-covenant.org. Reference it
from `CONTRIBUTING.md`.

## 8. Funding

`.github/FUNDING.yml` (optional):

```yaml
github: [your-org]
open_collective: project-name
```

## 9. Root README and per-package READMEs

- **Root `README.md`** — the table of packages, quick start, and a link to the
  handbook. (This repo already has one; keep it terse and current.)
- **Each package README** — what it is, install, minimal usage, and a link to the
  docs site. These are what npm displays, so they are the package's storefront;
  `files` in each `package.json` must include `README.md`.

## 10. Community health check

GitHub's **Insights → Community Standards** page grades the repo on README,
CODE_OF_CONDUCT, CONTRIBUTING, LICENSE, issue/PR templates, and security policy.
Aim for a full checkmark set before 1.0.

## Checklist

- [ ] Issue **forms** for bug, feature, component, a11y + `config.yml`.
- [ ] PR template with the changeset + parity reminders.
- [ ] CODEOWNERS mapping each package to a team.
- [ ] Dependabot for npm + actions.
- [ ] SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, LICENSE.
- [ ] Root + per-package READMEs; Community Standards page fully green.

Next: [10-ai-agents.md](10-ai-agents.md).
