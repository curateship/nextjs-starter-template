---
name: polish-app-suggestions
description: Inspect an existing app and suggest evidence-backed ways to polish its current experience in batches of exactly ten, then review them with the user one at a time using separate Yes or No confirmations in a planning-only workflow. After each batch, offer to create tasks, finish, or suggest ten more non-duplicate polish items while preserving earlier selections. Use the Personal IDE task-creation tool and configured default task template only after task creation is selected. Use when the user asks how to polish, refine, improve, clean up, or make an existing app feel more complete. Do not implement changes during this workflow.
---

# Polish App Suggestions

Find focused improvements to workflows the app already has, let the user decide on each one individually, and create tasks only after final confirmation.

## Planning Boundary

- Remain planning-only throughout this workflow. Use Plan mode when available.
- Do not edit product code, implement polish, create branches, commit, push, or deploy.
- Do not create tasks until a full batch of ten decisions is complete and the user separately selects task creation.
- Explain everything in plain English.

## 1. Inspect the Existing Experience

Read the applicable `AGENTS.md`, `workspace/docs/ui-rules.md`, app-specific UI documentation, existing tasks, routes, screens, components, shared UI primitives, forms, tables, modals, tests, and relevant TODOs.

When a running app is safely available, inspect representative workflows in the browser or native shell without changing data unnecessarily. Check narrow and desktop layouts, light and dark themes, keyboard use, long content, and loading, empty, error, disabled, and success states. If live inspection is unavailable, rely on code evidence and state that limitation.

Treat existing tasks as planned work and do not suggest duplicates.

## 2. Produce Exactly Ten Polish Items

Polish improves an existing capability without turning it into a new product feature. Look for:

- inconsistent controls, spacing, typography, icons, tables, cards, and modals
- unclear labels, instructions, validation, confirmations, and error recovery
- missing loading, empty, error, disabled, success, or progress feedback
- unnecessary clicks, repeated input, weak defaults, and confusing action order
- responsive overflow, poor long-content handling, and awkward scrolling
- keyboard, focus, contrast, semantic, and screen-reader problems
- perceived slowness, layout shifts, flicker, or stale interface state
- duplicated UI patterns that should use an existing shared primitive

Do not disguise major new capabilities, broad redesigns, architecture rewrites, or speculative design systems as polish.

Rank ten distinct items from highest to lowest impact using user friction, frequency, evidence, effort, risk, and consistency with the shared UI rules.

For each item include:

- rank and concise name
- affected screen or workflow
- current friction with code or live-app evidence
- proposed polish and user benefit
- effort: Low, Medium, or High
- main risk or dependency

Show the ranked overview before starting confirmations. Do not replace rejected items or add more than ten in a batch. For later batches, exclude existing tasks and every polish item shown in earlier batches.

## 3. Confirm Items One at a Time

Review items in rank order. Ask about exactly one item per turn and wait for the answer before continuing.

For each confirmation show:

```text
Round 1 — Polish 1 of 10: Item name
Current friction: ...
Suggested polish: ...
Effort and risk: ...

Add this polish item to the selected plan?
[Yes] [No]
```

In Plan mode, use the available choice control with exactly `Yes` and `No` options. Do not batch items or auto-resolve unanswered confirmations. Record every decision and allow earlier answers to be revised when requested.

Continue until all ten items have explicit decisions. Do not expand an item into a broad redesign during confirmation.

## 4. Finish, Create Tasks, or Suggest More

After the tenth decision, show a concise summary of the current batch and the cumulative accepted polish items.

If one or more polish items were accepted, ask:

```text
What should I do next?
[Create tasks] [Finish] [Suggest 10 more]
```

If none were accepted, omit the unavailable task action:

```text
[Finish] [Suggest 10 more]
```

Use the available choice control and do not auto-resolve the decision.

- `Create tasks`: Continue to task creation for every accepted polish item across all completed rounds.
- `Finish`: Stop without creating or modifying task files.
- `Suggest 10 more`: Produce a fresh batch of exactly ten, label it with the next round number, exclude all previous suggestions and existing tasks, preserve every earlier decision, and repeat the one-at-a-time confirmation flow. Do not create tasks yet.

## 5. Create Selected Tasks

After the user selects `Create tasks`, use the Personal IDE task-creation tool for the active workspace so every task uses the user's configured default task template. Do not manually create Markdown files when the tool is available.

Create one focused task per accepted polish item across all completed rounds. Preserve the generated template and add:

- affected workflow and current friction
- user-visible outcome
- scoped polish changes and non-goals
- relevant shared UI rules and existing components to reuse
- ordered implementation steps
- acceptance criteria covering applicable states, widths, themes, and keyboard behavior
- verification requirements
- risks, dependencies, and open questions

Do not combine unrelated polish items or expand them into new features. If the IDE task-creation tool is unavailable, report the blocker and ask before using a manual fallback. After creation, list task titles and app-relative locations. Do not begin implementation.
