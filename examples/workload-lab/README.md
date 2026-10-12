# Workload lab

Run `pnpm examples workload-lab`, then open the printed example URL. Run its browser,
real-pointer and model tests with `pnpm exec vitest run examples/workload-lab/test`.

| Component     | Companion implementation                                     | Contract exercised                                                                                                    |
| ------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `sequence.ts` | `test/sequence.test.ts`                                      | Equal-duration steps, stale replies, fresh delay after detach, synchronous moves                                      |
| `solver.ts`   | `solver-driver.ts`, `solver.worker.ts`, `solver-model.ts`    | Real module worker, replacement/cancel/detach, validated replies, resource release                                    |
| `booking.ts`  | `booking-model.ts`, `booking-service.ts`, `booking-types.ts` | Authorized projections, stable-ID drafts, generations/revisions, idempotent retry, native form outcomes               |
| `grid.ts`     | `grid-hooks.ts`, `test/grid.node.test.ts`                    | Held keys, real mouse/touch capture, hit testing, cancellation, shadow focus, popover retargeting, owned canvas/fonts |

The page owns the booking service and provider. Components release their watches on removal;
the shared service survives. The in-memory service illustrates backend responsibilities, not
production authentication or durable transactions. Use authenticated server identity,
transactional receipt storage and conflict policy in a real application.

See the [workload guide](../../skills/gyral/references/workloads.md) for lifecycle choices,
shared Effect runtime integration at the application boundary, and explicit readiness waits.
This example and its guide are available since 0.3.2 (in the skill and the MCP corpus). They
use only APIs that 0.3.1 already has.
