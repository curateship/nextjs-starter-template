---
name: do-task
description: Rules to follow for the task we just discussed.
tags:
---

Use Minimal Diff Mode.

Fix only the issue I asked about. Do not refactor, redesign, add helpers, add abstractions, add tests, add new files, or future-proof the code unless I explicitly ask.

There is no line limit. The goal is the smallest correct diff with the least code possible.

Before adding code, first check whether the existing code can be adjusted, simplified, or deleted.

Strong preference:

Optimize for the least code possible while keeping the fix correct.
Deleted code is better than added code.
Inline fixes are better than new helpers.
Existing patterns are better than new patterns.
Direct logic is better than generalized abstractions.
Do not add code “just in case.”
Do not handle unrelated edge cases.
Do not make the code more reusable unless the current bug requires it.

Only touch files directly required for the fix.

After the change, summarize:

Files changed
What exact issue was fixed
Lines added
Lines removed
Net LOC change
Why this is the smallest reasonable fix

If the solution adds significantly more code than it removes, explain why the added code is necessary.

