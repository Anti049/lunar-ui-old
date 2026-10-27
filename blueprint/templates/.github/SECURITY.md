# Security policy

## Supported versions

| Version        | Supported           |
| -------------- | ------------------- |
| Latest minor   | Yes                 |
| Previous minor | Security fixes only |
| Anything older | No                  |

## Reporting

Please report privately through
[GitHub Security Advisories](https://github.com/Anti049/test/security/advisories/new)
rather than opening a public issue.

You can expect an acknowledgement within three working days and an assessment
within a week. If the report is accepted we will agree a disclosure timeline with
you before publishing.

## Scope

This is a CSS and component library. The realistic risk surface is small but not
empty:

- **CSS injection** through an unsanitised value interpolated into a custom
  property or an arbitrary-value class.
- **Components that render untrusted HTML.** Any component accepting raw markup
  is a potential XSS vector; if one fetches remote content and injects it, that
  is in scope.
- **Supply chain** — a compromised dependency reaching the published tarball.

Out of scope: vulnerabilities in Tailwind, Svelte, React or Vue themselves.
Report those upstream.
