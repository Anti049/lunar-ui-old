## What and why

<!-- What changed, and what problem it solves. Assume the reviewer has not seen
     the issue. -->

Closes #

## How to verify

<!-- The commands you ran, and what you saw. "CI is green" is not verification
     of a change to what consumers receive. -->

```sh
bun run check
```

## Checklist

- [ ] `bun run check` passes locally
- [ ] A changeset is included (`bun changeset`), or this PR is labelled `skip-changeset`
- [ ] The changeset body reads as release notes, not as a commit message
- [ ] Commits follow Conventional Commits

### If this changes the plugin

- [ ] The differential harness still passes, and I read the categories rather than the final line
- [ ] Verified against a **packed tarball**, not a workspace link
- [ ] Any new class or token is documented as public API

### If this adds or changes a component

- [ ] Implemented in the plugin and all three bindings, with identical props
- [ ] Keyboard interaction and ARIA covered
- [ ] Focus is visible against every shipped theme
- [ ] Docs page updated; the class table is generated, not hand-written

### If this is a breaking change

- [ ] The changeset says **Breaking** in words, even if the bump is `minor`
- [ ] It says what to change _to_, not just what changed
- [ ] A migration note is added
