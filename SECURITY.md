# Security Policy

## Supported Versions

Aviary is early-stage software and does not currently maintain security backport branches.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Latest tagged release | Best effort |
| Older releases | No |

Security fixes are developed against `main` first. If a fix is practical to backport to the latest tagged release, it may be released there as well.

## Reporting a Vulnerability

Please do not open a public GitHub issue for suspected vulnerabilities.

Use one of these private channels instead:

1. GitHub Private Vulnerability Reporting for this repository, if it is enabled.
2. The repository owner's GitHub profile contact methods: <https://github.com/robertherbaugh>

Include:

- A short description of the issue and affected component
- Reproduction steps or a proof of concept
- Impact assessment
- Any suggested mitigations

You can expect an initial acknowledgment within 3 business days. Follow-up status updates will be shared as the investigation progresses.

## Disclosure Process

- We will confirm whether the report is valid and determine severity.
- We will work on a fix and coordinate disclosure timing with the reporter when practical.
- Once a fix is available, we will publish the relevant release notes or commit references.

## Scope

This policy covers vulnerabilities in code and configuration maintained in this repository, including:

- `apps/web`
- `apps/api`
- `apps/worker`
- `packages/*`

Out-of-scope items include vulnerabilities in third-party services or dependencies that are unrelated to Aviary's own usage or integration.
