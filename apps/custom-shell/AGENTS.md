# AGENTS.md

Guidance for Codex working in `apps/yourapp/`.

## UI Rules

- Prefer components from `src/components/ui/` over native HTML controls whenever a shadcn equivalent exists.
- Do not introduce custom modal, select, dropdown, button, input, table, or sheet styling when the scraper app already has a shadcn component for it.
- If a required shadcn component does not exist in `src/components/ui/`, add it there first, then use it in the page/component.
- Keep styling consistent with existing scraper app primitives instead of mixing in one-off Tailwind implementations.

## Forms

- Use shadcn form controls for inputs and interactions.
- Avoid native `<select>` and similar browser-default controls when a shadcn control should be used instead.


## Conversation Rules
- In Plan mode: explain to user like he's 5
- Use bullet points for better readability.
- When writing summaries, do not include the full file path.

### Simplicity & State
- No fake "safety" systems - use database transactions, not backup/restore in app code
- No staged deletions - just delete the data
- No temporary UI state that doesn't map to the database - load fresh data when needed
- No complex state synchronization or staged/pending/deleted tracking

### Fail Fast
- Report errors immediately. Never pretend success when operations fail
- Never hide errors with complex error handling

### No Scope Creep
- Only fix the exact problem asked about - nothing more
- Never "fix" unrelated TypeScript warnings or build errors unless they block your change
- Ignore pre-existing issues unless specifically asked
- Only fix build errors directly caused by your changes

### UI Boundaries
- Build app-specific branding, navigation, and layout in the app itself
- Do not introduce shared UI abstractions unless the user explicitly asks for them

### Response Format
- Prefer structured answers over dense paragraphs when summarizing code, architecture, or project state
- Use short sections with clear labels when the response covers more than one topic
- Use flat bullets for distinct points, systems, or findings
- Keep paragraphs short and easy to scan
- Avoid wall-of-text explanations when a structured format would be clearer

### Debugging
- Never ask the user to test or debug for you - solve problems through code analysis
- Only add code that directly solves the stated problem
- Trace code flow -> identify root cause -> implement direct fix

### Live Validation
- Do not proactively use live/browser validation
- Only run browser validation when the user explicitly asks to validate, test, verify, or check it
- Build and typecheck are allowed without asking unless the user says otherwise
- Do not run build, typecheck, or other verification commands for styling-only changes unless the user explicitly asks for verification