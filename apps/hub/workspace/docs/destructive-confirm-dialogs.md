# Destructive confirmation dialogs

All admin deletions use `ConfirmDestructive`. The action key selects one of three policies:

- Level 1: consequence copy and explicit confirmation.
- Level 2: server-loaded counts for dependent records; deletion stays disabled until counts load.
- Level 3: Level 2 plus an exact, trimmed, case-sensitive name prompt.

Add new actions to `destructive-confirm-policy.ts`. Actions with dependents must also add a target to `deletion-impact-contract.ts`, a scoped aggregate in `deletion-impact-actions.ts`, and pass an `impactRequest`. The server action rejects unknown targets, revalidates site ownership, and restricts platform-user impact to super admins.

Keep archive and membership-removal copy honest. The dialog keeps Cancel and Escape available, focuses Cancel first, prevents double submission, and displays deletion failures inline without removing the item.
