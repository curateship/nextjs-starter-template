---
name: new-features-suggestion
description: Scan an existing codebase and suggest evidence-backed product features in batches of exactly ten, then present all ten together in a Plan-mode checkbox control with options to suggest ten more or let the user suggest their own. Summarize every option in the terminal chat before showing the control, preserve selections across batches, and create tasks only after separate confirmation. Use the Personal IDE task-creation tool and configured default task template only after task creation is selected. Use when the user asks for new feature suggestions, product opportunities, roadmap ideas, or what to build next. Do not implement features during this workflow.
---

# New Features Suggestion

Discover realistic product opportunities from the codebase, let the user select them as a batch, and create tasks only after a final confirmation.

## Planning Boundary

- Remain planning-only throughout this workflow. Use Plan mode when available.
- Do not edit product code, implement a feature, create branches, commit, push, or deploy.
- Do not create task files until the user submits the batch checkbox selection and separately selects task creation.
- Explain everything in plain English.

## 1. Scan the Codebase

Read the applicable `AGENTS.md`, product documentation, existing tasks, package scripts, routes, screens, components, data models, server actions, integrations, tests, and relevant TODOs.

Identify what the product already does, who it serves, incomplete workflows, repeated user friction, underused architecture, and capabilities the current system can support without changing its identity. Treat existing tasks as planned work and do not suggest duplicates.

Use repository evidence, not generic feature lists. Do not browse for trends unless the user explicitly asks.

## 2. Produce Exactly Ten Features

Rank ten distinct product features from strongest to weakest using:

- fit with the current product and users
- clear user value
- evidence of a real gap in the codebase
- reuse of existing architecture and data
- reasonable effort, risk, and dependencies

For each feature include:

- rank and concise name
- one-sentence description
- codebase evidence showing why it fits
- primary user value
- effort: Low, Medium, or High
- main risk or dependency

Show the complete ranked overview in the terminal chat before opening the checkbox control. After the ten feature summaries, also summarize `Suggest 10 more` and `Suggest your own`, so all twelve checkbox options are explained in the terminal chat. This summary is required even when the control also displays descriptions. Do not replace unselected features or add more than ten feature suggestions in a batch. For later batches, exclude existing tasks and every feature shown in earlier batches.

## 3. Select Features Together in Plan Mode

In Plan mode, use one multi-select checkbox control containing exactly twelve visible options:

- the ten ranked feature suggestions, in rank order
- `Suggest 10 more`
- `Suggest your own`

Use concise feature names as checkbox labels and a one-sentence summary as each option description. Allow any number of feature checkboxes to be selected. Do not replace this with ten separate Yes or No questions, and do not auto-resolve an unanswered selection.

Treat checked feature suggestions as accepted and unchecked suggestions as not selected. Record the batch and preserve all prior selections so the user can revise them later.

- If `Suggest your own` is checked, immediately ask for the user's feature idea in a free-text Plan-mode follow-up. Summarize the idea, identify any obvious overlap or conflict with the codebase, and add it to the accepted plan after the user confirms the interpretation.
- If `Suggest 10 more` is checked, preserve every accepted feature and custom idea, produce the next non-duplicate batch of exactly ten, show its complete terminal-chat summary, and repeat the same twelve-option checkbox control.
- If both action options are checked, collect and confirm the user's own idea first, then produce the next batch.

If Plan mode does not provide a multi-select checkbox control, show the same twelve options as a Markdown checkbox list in the terminal chat and ask the user to return the checked list. Do not expand a feature into a full implementation plan during selection unless the user asks a brief clarifying question.

## 4. Finish or Create Tasks

When neither action option is selected, show a concise summary of the current batch and all accepted features across completed rounds.

If one or more features were accepted, ask:

```text
What should I do next?
[Create tasks] [Finish]
```

If no features were accepted, omit the unavailable task action:

```text
[Finish]
```

Use the available choice control and do not auto-resolve the decision.

- `Create tasks`: Continue to task creation for every accepted feature across all completed rounds.
- `Finish`: Stop without creating or modifying task files.

## 5. Create Selected Tasks

After the user selects `Create tasks`, use the Personal IDE task-creation tool for the active workspace. The tool must create each task from the user's configured default task template. Do not bypass the tool by manually creating Markdown files when the tool is available.

Create one task per accepted feature across all completed rounds with a concise title. Fill the generated task with:

- goal and user value
- codebase evidence
- agreed MVP scope
- non-goals
- likely UI, data, API, and integration areas
- ordered implementation steps
- acceptance criteria
- verification requirements
- known risks, dependencies, and unresolved questions

Preserve all frontmatter and sections supplied by the default template. Do not combine unrelated selected features into one task.

If the IDE task-creation tool is unavailable, report the blocker and ask before using any manual fallback. After creation, list the task titles and their app-relative locations. Do not begin implementation.
