# Security Policy

## Supported versions

Danio is pre-1.0 and moves quickly. Security fixes land on the latest published version.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately, one of two ways:

1. **GitHub Security Advisories** (preferred) — go to the repository's **Security → Report a
   vulnerability** tab and open a private advisory. This keeps the report confidential until
   a fix is ready.
2. **Email** — send details to **gagankarthik123@gmail.com** with `SECURITY` in the subject.

Please include:

- a description of the issue and its impact,
- steps to reproduce (a minimal proof of concept if possible),
- affected version(s) and environment.

## What to expect

- **Acknowledgement** within a few days.
- An assessment of the report and, if confirmed, a plan and rough timeline for a fix.
- A released patch and a public advisory once the fix is available. With your permission,
  we'll credit you in the advisory.

## Scope

Danio is a client-and-server rendering library with no runtime dependencies. The most
relevant classes of issue are:

- **XSS via rendering** — cases where user-controlled input could be injected as markup that
  `renderToString` or the DOM layer fails to escape.
- **Prototype pollution or unsafe property handling** in element/props processing.

Because Danio ships no network, storage, or auth code, most application-level security is the
responsibility of the app built on top of it. When in doubt, report it — we'd rather hear
about a non-issue than miss a real one.
