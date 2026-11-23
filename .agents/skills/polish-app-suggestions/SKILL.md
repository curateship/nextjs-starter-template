---
name: polish-app-suggestions
description: Inspect an existing app and suggest evidence-backed ways to polish its current experience in batches of exactly ten, then present all ten together in a Plan-mode checkbox control with options to suggest ten more or let the user suggest their own. Summarize every option in the terminal chat before showing the control, preserve selections across batches, and create tasks only after separate confirmation. Use the Personal IDE task-creation tool and configured default task template only after task creation is selected. Use when the user asks how to polish, refine, improve, clean up, or make an existing app feel more complete. Do not implement changes during this workflow.
---

# Polish App Suggestions

Find focused improvements to workflows the app already has, let the user select them as a batch, and create tasks only after final confirmation.

## Planning Boundary

- Remain planning-only throughout this workflow. Use Plan mode when available.
- Do not edit product code, implement polish, create branches, commit, push, or deploy.
- Do not create tasks until the user submits the batch checkbox selection and separately selects task creation.
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

** Use plain English

For each item include:

- rank and concise name
- affected screen or workflow
- current friction with code or live-app evidence
- proposed polish and user benefit
- effort: Low, Medium, or High
- main risk or dependency

Show the complete ranked overview in the terminal chat before opening the checkbox control. After the ten polish summaries, also summarize `Suggest 10 more` and `Suggest your own`, so all twelve checkbox options are explained in the terminal chat. This summary is required even when the control also displays descriptions. Do not replace unselected items or add more than ten polish suggestions in a batch. For later batches, exclude existing tasks and every polish item shown in earlier batches.

## 3. Select Items Together in Plan Mode

In Plan mode, use one multi-select checkbox control containing exactly twelve visible options:

- the ten ranked polish suggestions, in rank order
- `Suggest 10 more`
- `Suggest your own`

Use concise polish names as checkbox labels and a one-sentence summary as each option description. Allow any number of polish checkboxes to be selected. Do not replace this with ten separate Yes or No questions, and do not auto-resolve an unanswered selection.

Treat checked polish suggestions as accepted and unchecked suggestions as not selected. Record the batch and preserve all prior selections so the user can revise them later.

- If `Suggest your own` is checked, immediately ask for the user's polish idea in a free-text Plan-mode follow-up. Summarize the idea, identify any obvious overlap, conflict, or expansion into a new feature, and add it to the accepted plan after the user confirms the interpretation.
- If `Suggest 10 more` is checked, preserve every accepted polish item and custom idea, produce the next non-duplicate batch of exactly ten, show its complete terminal-chat summary, and repeat the same twelve-option checkbox control.
- If both action options are checked, collect and confirm the user's own idea first, then produce the next batch.

If Plan mode does not provide a multi-select checkbox control, show the same twelve options as a Markdown checkbox list in the terminal chat and ask the user to return the checked list. Do not expand an item into a broad redesign during selection.

## 4. Finish or Create Tasks

When neither action option is selected, show a concise summary of the current batch and all accepted polish items across completed rounds.

If one or more polish items were accepted, ask:

```text
What should I do next?
[Create tasks] [Finish]
```

If none were accepted, omit the unavailable task action:

```text
[Finish]
```

Use the available choice control and do not auto-resolve the decision.

- `Create tasks`: Continue to task creation for every accepted polish item across all completed rounds.
- `Finish`: Stop without creating or modifying task files.

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
