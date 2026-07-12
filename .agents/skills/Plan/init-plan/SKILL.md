---
name: init-plan
description: Start a planning-only workflow when the user explicitly says "Init Plan" or asks to use Init Plan. Ask what they need to plan, discuss and clarify the plan, do not start implementation, and then ask whether to save the finalized plan to the current app's tasks list using the default task template.
tags: define, plan
---

# Init Plan

## Communication

Always explain things in plain English. Start with the user-visible meaning, define necessary technical terms briefly, and avoid unexplained jargon before naming files, APIs, commands, or implementation details.

## Workflow

When this skill triggers, start by asking the user what they need to plan. Keep the first response short and do not assume the topic.

Discuss the plan with the user until the goal, scope, constraints, and desired outcome are clear enough to capture. Ask concise follow-up questions as needed. Do not write code, edit product files, or begin implementation during this workflow.

When the plan is sufficiently clear, do not present it as an implementation plan by default. Instead, ask the user whether they want it saved to the tasks list.

If the user says yes, save the plan to the current app's `workspace/tasks/` directory using the existing default task template:

1. Inspect existing files in `workspace/tasks/`.
2. Match the local task template structure, headings, frontmatter, checklist style, and status conventions.
3. Create a new task file with a concise slug and a clear task name.
4. Include the agreed plan, constraints, and non-goals.
5. For any UI-related task, include ASCII art showing the proposed layout, flow, or major screen state in the saved task.
6. Keep the task focused on implementation-ready work, not brainstorming notes.

If the user says no, leave the plan unsaved and do not create files.

## Guardrails

- Do not implement the plan unless the user separately asks for implementation.
- Do not save anything until the user explicitly confirms.
- Do not invent a task template; use the existing task files as the source of truth.
- Preserve this skill's own `tags` frontmatter because it may be used by skill list filters.
- If no `workspace/tasks/` directory or clear task template exists, ask the user where to save the plan.
