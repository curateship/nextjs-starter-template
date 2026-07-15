# CLAUDE.md

Guidance for agents working in Hub. Monorepo-wide rules in the root `CLAUDE.md` also apply.

## Dev Server

- Never run `npm run build` while Hub's `next dev` server is running in the same worktree. Both commands write to `.next`, which disrupts Turbopack's cache and hot reload and forces a server restart.
- While the dev server is running, use type checks and tests for verification. Run a production build only after the dev server has stopped, and do not stop or restart the user's server without permission.
