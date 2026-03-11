# CLAUDE.md

Guidance for Claude Code working in this repository.

## Core Philosophy

**Simplicity is mandatory.** Always implement the simplest solution that works. If a simple feature needs more than 20 lines, stop and reconsider. Direct solutions beat clever architecture. Try removing code before adding code. Question every new dependency, hook, or context.

## Rules

### Simplicity & State
- No fake "safety" systems — use database transactions, not backup/restore in app code
- No staged deletions — just delete the data
- No temporary UI state that doesn't map to the database — load fresh data when needed
- No complex state synchronization or staged/pending/deleted tracking

### Fail Fast
- Report errors immediately. Never pretend success when operations fail
- Never hide errors with complex error handling

### No Scope Creep
- Only fix the exact problem asked about — nothing more
- Never "fix" unrelated TypeScript warnings or build errors unless they block your change
- Ignore pre-existing issues unless specifically asked
- Only fix build errors directly caused by your changes

### Task Confirmation Protocol
- Repeat back the user's request, confirm the component/file, and state which files you'll examine
- Wait for confirmation before proceeding (exception: simple questions — just answer directly)

### Server Verification
- Never claim "server is running" without testing: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
- Verify process exists: `lsof -ti:3000`

### Git Commits
- When asked to commit, ONLY commit existing changes — never make additional code changes and never push changes unless asked
- If build fails during commit, report errors and ask before fixing

### Security
- Never hardcode credentials in client-side code
- Always validate authentication server-side
- Every `'use server'` action that mutates data must verify auth + ownership independently — middleware only protects UI routes, not server action calls
- Use secure session management (httpOnly cookies, proper JWT expiration)
- Check for XSS, CSRF, SQL injection, and OWASP Top 10 after every code change
- Never add `.trim()` to input sanitization — it breaks typing spaces

### Code Quality
- Delete test files after debugging (test-*.js, debug-*.*, tmp-*.*, etc.)
- Never leave debugging console.logs in production code
- Clean up unused imports and dead code before completing a task
- Never commit test data or mock data used for debugging

### Debugging
- Never ask the user to test or debug for you — solve problems through code analysis
- Only add code that directly solves the stated problem
- Trace code flow → identify root cause → implement direct fix

## Development Commands

```bash
npm run dev      # Dev server (Next.js + Turbopack)
npm run build    # Production build
npm start        # Production server
npm run lint     # ESLint
```

## Code Review Checklist

Before implementing any feature:
- Can this be done with basic CRUD operations? (Usually yes)
- Am I adding complexity to solve a problem I created? (Usually yes)
- Would a junior developer understand this in 5 minutes? (If no, simplify)
- Does this follow the "Load → Edit → Save" pattern? (If no, why not?)
- With every changes, check the server to see if its running. if not then reboot the server on port 3000
