---
name: plan-change
description: Turn a product or code request into a focused specification and ordered implementation plan. Use when the user asks to ideate, refine requirements, write a spec, plan a feature, break work into tasks, or evaluate what to build next. Stay planning-only when the user explicitly asks for a plan; otherwise use the result to guide authorized implementation.
---

# Plan Change

Create the smallest plan that removes meaningful uncertainty. Do not turn routine changes into ceremonies.

## Workflow

1. Read the applicable `AGENTS.md`, relevant app documentation, existing tasks, and the code closest to the request.
2. Restate the intended user outcome, scope, and important exclusions.
3. Resolve unknowns from the repository first. Ask one concise question only when a missing decision would materially change the result.
4. Identify affected components, interfaces, data, risks, and verification needs.
5. Break the work into ordered, independently verifiable steps.
6. Define acceptance criteria in observable terms.

## Modes

- **Idea refinement:** present 3–5 materially different options, compare their tradeoffs, and recommend one.
- **Feature discovery:** inspect the product first, then rank 5–10 evidence-backed opportunities. Prefer quality over reaching a quota.
- **Specification:** capture outcome, behavior, boundaries, failure cases, data or interface changes, and acceptance criteria.
- **Task breakdown:** make each task concrete enough to implement and verify without rediscovering the plan.
- **Explicit planning mode:** do not edit implementation files. Save a task document only when the user requests it or repository instructions require it.

## Guardrails

- Make reasonable, reversible assumptions and state the important ones.
- Do not demand an interview for requirements the repository already answers.
- Do not prescribe compatibility layers, feature flags, migrations, or new abstractions without a current requirement.
- Keep implementation details proportional to the decision being made.
- End with unresolved decisions only when they genuinely block implementation.
