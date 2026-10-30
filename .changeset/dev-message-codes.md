---
'@gyral/core': patch
---

Development messages now name their code: each ends with its code and errors-page link, such
as ` (G0017: https://gyral.dev/errors/#G0017)`, as production's `Gyral G0017 …` already did
(gyral-99d). A test that matches a development message exactly (`toBe`, `toEqual`) needs the
suffix, or can match with `toContain`. G0063's text ends with a period instead of a colon, and
the build-time warning about a second copy of core (G0015) ends the same way. Production
messages are unchanged.
