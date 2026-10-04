# Design docs

The system of record for _why_ Gyral is built the way it is. Work items (_what/when_) live in
beads, not here. Every file in this folder must be listed below (`pnpm invariants` checks).

Status values: **accepted** (in force), **proposed** (under discussion), **superseded**.

| Doc                                                        | Status   | Summary                                                                                    |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| [core-beliefs.md](core-beliefs.md)                         | accepted | Operating principles for humans and agents                                                 |
| [0001-mvi-parsed-intent.md](0001-mvi-parsed-intent.md)     | accepted | Component model: parsed intent, record-of-reducers model, pure view                        |
| [0002-effect-boundary.md](0002-effect-boundary.md)         | accepted | Effect.ts inside, plain TypeScript outside; optional `@gyral/effect` later                 |
| [0003-browser-baseline.md](0003-browser-baseline.md)       | accepted | Target Baseline _widely available_; newer features only behind detection                   |
| [0004-local-ci.md](0004-local-ci.md)                       | accepted | GitHub Actions workflows that run only locally via `gh act`                                |
| [0005-harness-engineering.md](0005-harness-engineering.md) | accepted | Repo as system of record, mechanical invariants, beads for work                            |
| [0006-effects-and-drivers.md](0006-effects-and-drivers.md) | accepted | Commands as data with typed mappers; drivers as plain objects; concurrency lanes           |
| [0007-props.md](0007-props.md)                             | accepted | Props as `{ props }` context; enter state only via `PropsChanged`                          |
| [0008-forms.md](0008-forms.md)                             | accepted | Native constraints, schema-parsed intents, errors in the model mirrored to native validity |
| [lessons-from-cyclejs.md](lessons-from-cyclejs.md)         | accepted | What we keep, drop and replace from Cycle.js                                               |
