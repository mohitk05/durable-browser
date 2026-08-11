# Browser-local durable execution engine

Restate's [blog](https://restate.dev/what-is-durable-execution) on DE states these common principles of such engines:
1. **Journaled steps.** Every external interaction is recorded to a persistent log before its result is observed by the application. The log is the source of truth for what happened.
2. **Automatic retries with idempotency.** Failed steps are retried by the engine. Already-completed steps are not re-executed; their recorded results are replayed instead, making actions like generating an idempotency key to call an API trivial.
3. **Durable timers and signals.** Sleeps, scheduled work, and inter-service signals (like awaiting a webhook or human approval) survive crashes and process restarts. A workflow can wait days or weeks without holding a process open.
4. **Resumability.** Any in-flight execution can be recovered by any healthy worker. Recovery is transparent to the application code; there is no checkpoint logic to write.
