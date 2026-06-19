---
name: new-features-ideation
description: Scan a project to suggest and rank new feature opportunities. Use when the user asks for feature ideas, product expansion ideas, roadmap suggestions, or what to build next from an existing codebase. Produce at least 10 ranked feature ideas, ask which ideas the user wants to plan further, then continue planning only the selected ideas.
---

# New Features Ideation

Use this skill to turn an existing project into a ranked feature backlog.

## Workflow

1. Inspect the project before suggesting features:
   - Read the relevant `AGENTS.md` files.
   - Read available docs, task files, README files, package scripts, app routes, core components, models, APIs, and recent TODOs.
   - Prefer project evidence over generic product ideas.

2. Produce at least 10 feature ideas ranked from best to worst.

3. For each feature, include:
   - Rank
   - Feature name
   - Short description
   - Why it fits this project
   - User value
   - Implementation effort: Low, Medium, or High
   - Risk or dependency

4. Rank using these criteria:
   - Strong fit with the current product
   - Clear user value
   - Reasonable implementation effort
   - Reuse of existing architecture
   - Low risk of distracting from the product direction

5. End the first response by asking the user which feature numbers they want to plan further.

6. After the user chooses features, plan only those selected features. For each selected feature, provide:
   - Goal
   - User story
   - MVP scope
   - Non-goals
   - Data or API changes
   - UI changes
   - Implementation tasks
   - Acceptance criteria
   - Open questions

Do not write code unless the user explicitly asks to implement a planned feature.
