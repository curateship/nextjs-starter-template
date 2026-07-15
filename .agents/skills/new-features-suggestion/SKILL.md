---
name: new-features-suggestion
description: Scan an existing codebase and suggest evidence-backed product features in batches of exactly ten, then review them with the user one at a time using separate Yes or No confirmations in a planning-only workflow. After each batch, offer to create tasks, finish, or suggest ten more non-duplicate features while preserving earlier selections. Use the Personal IDE task-creation tool and configured default task template only after task creation is selected. Use when the user asks for new feature suggestions, product opportunities, roadmap ideas, or what to build next. Do not implement features during this workflow.
---

# New Features Suggestion

Discover realistic product opportunities from the codebase, let the user decide on each one individually, and create tasks only after a final confirmation.

## Planning Boundary

- Remain planning-only throughout this workflow. Use Plan mode when available.
- Do not edit product code, implement a feature, create branches, commit, push, or deploy.
- Do not create task files until a full batch of ten decisions is complete and the user separately selects task creation.
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

Show the ranked overview before starting confirmations. Do not replace rejected features or add more than ten in a batch. For later batches, exclude existing tasks and every feature shown in earlier batches.

## 3. Confirm Features One at a Time

Review features in rank order. Ask about exactly one feature per turn and wait for the answer before continuing.

For each confirmation show:

```text
Round 1 — Feature 1 of 10: Feature name
What it adds: ...
Why it fits: ...
Effort and risk: ...

Add this feature to the selected plan?
[Yes] [No]
```

In Plan mode, use the available choice control with exactly `Yes` and `No` options. Do not batch multiple features into one question and do not auto-resolve unanswered confirmations. Record each decision and allow the user to revise an earlier answer if requested.

Do not expand a feature into a full implementation plan during confirmation unless the user asks a brief clarifying question. Continue until all ten have explicit decisions.

## 4. Finish, Create Tasks, or Suggest More

After the tenth decision, show a concise summary of the current batch and the cumulative accepted features.

If one or more features were accepted, ask:

```text
What should I do next?
[Create tasks] [Finish] [Suggest 10 more]
```

If no features were accepted, omit the unavailable task action:

```text
[Finish] [Suggest 10 more]
```

Use the available choice control and do not auto-resolve the decision.

- `Create tasks`: Continue to task creation for every accepted feature across all completed rounds.
- `Finish`: Stop without creating or modifying task files.
- `Suggest 10 more`: Produce a fresh batch of exactly ten, label it with the next round number, exclude all previous suggestions and existing tasks, preserve every earlier decision, and repeat the one-at-a-time confirmation flow. Do not create tasks yet.

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
