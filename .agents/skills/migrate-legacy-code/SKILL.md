---
name: migrate-legacy-code
description: Replace or retire a legacy API, data model, dependency, service, or implementation through an explicit cutover plan. Use when the user asks for a migration, deprecation, compatibility period, data backfill, or removal of an old system. Do not trigger merely because changed code has an older implementation nearby.
---

# Migrate Legacy Code

Move to one clearly defined target state and remove the old path as soon as the stated compatibility requirement allows.

## Workflow

1. Inventory callers, persisted data, public contracts, operational dependencies, and owners of the legacy path.
2. Define the target state, cutover condition, failure handling, verification, and rollback strategy.
3. Choose the narrowest strategy that satisfies the explicit requirement:
   - hard cut when all consumers can move together
   - staged cutover only when independent consumers or persisted data require it
4. Implement or plan data conversion, caller updates, and observability needed to prove the cutover.
5. Remove the legacy implementation, adapters, dual reads or writes, flags, and temporary instrumentation when exit criteria pass.
6. Update public documentation and decision records when contracts or operations change.

## Compatibility Rules

- Default to a hard cut; do not preserve old behavior “just in case.”
- Add compatibility code only when the user explicitly requests it or verified consumers cannot migrate atomically.
- Give every temporary bridge an owner, deletion condition, and tracking task.
- Never silently coerce invalid legacy state into the new model.
- Protect destructive data operations with backups, dry runs, idempotency, and measured verification appropriate to the risk.

## Completion

Report migrated consumers and data, remaining legacy dependencies, verification evidence, rollback limits, and the exact cleanup still required. Do not call a migration complete while an undocumented legacy path remains active.
