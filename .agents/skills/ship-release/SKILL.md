---
name: ship-release
description: Prepare and execute an authorized production release, including CI/CD gates, deployment configuration, documentation, observability, rollout, and rollback readiness. Use when the user asks to ship, deploy, launch, release, change a delivery pipeline, or prepare production operations. Do not deploy, push, or mutate production without explicit authorization.
---

# Ship Release

Make the release verifiable, reversible where practical, and observable without adding ceremony unrelated to its risk.

## Workflow

1. Read repository deployment instructions and identify the artifact, environment, owners, and approved release scope.
2. Confirm `audit-change` is ready and required tests, builds, migrations, and security checks pass.
3. Verify CI/CD gates use repository commands, protected secrets, deterministic dependencies, and appropriate caching.
4. Add only the logs, metrics, traces, dashboards, or alerts needed to detect failure and explain the changed behavior.
5. Update runbooks, public documentation, configuration references, and architecture decisions affected by the release.
6. Define rollout steps, health signals, abort thresholds, rollback or forward-fix steps, and post-release verification.
7. Execute external mutations only when explicitly authorized, then observe the release and report evidence.

## Guardrails

- Never expose secrets in configuration, commands, logs, or reports.
- Do not introduce feature flags, kill switches, release branches, dashboards, or alerts without a concrete rollout or operational need.
- Do not claim rollback is possible when a destructive migration or external side effect makes it unsafe.
- Prefer the repository's existing deployment and observability systems over new tooling.
- Keep documentation close to the operational behavior it explains.
- Never push, deploy, publish, or change production state based solely on an implied request.

## Release Report

State the version or change shipped, environment, checks and health signals, rollout result, remaining risk, and rollback status. If release authority or required evidence is missing, stop with a clear blocked verdict.
