# Security policy

## Supported versions

Gyral is pre-1.0. Security fixes go into the latest published `0.x` minor release only; please
upgrade to it. Once 1.0 ships, this table will list the supported release lines.

| Version                | Supported |
| ---------------------- | --------- |
| latest `0.x` minor     | yes       |
| older `0.x` releases   | no        |
| `0.0.0` (placeholders) | no code   |

## Reporting a vulnerability

Please **do not** open a public issue. Report it privately through GitHub:
[github.com/gyraljs/gyral/security/advisories/new](https://github.com/gyraljs/gyral/security/advisories/new)
(Security tab → Report a vulnerability).

Include the affected package and version, a description of the impact, and steps or a
minimal reproduction. You can expect an acknowledgement within 3 business days and a plan
within 10. We will credit you in the advisory unless you ask us not to.

Every release is published from GitHub Actions with npm provenance; you can verify a package
with `npm audit signatures`.
