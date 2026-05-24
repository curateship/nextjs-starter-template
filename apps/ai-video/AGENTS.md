# AGENTS.md

Guidance for Codex working in `apps/yourapp/`.
Read all documents for app rules in `apps/ai-video/docs`

### Response Format
- In Plan mode: explain to user like he's 5
- Use bullet points for better readability.
- When writing summaries, do not include the full file path.
- Prefer structured answers over dense paragraphs when summarizing code, architecture, or project state
- Use short sections with clear labels when the response covers more than one topic
- Use flat bullets for distinct points, systems, or findings
- Keep paragraphs short and easy to scan
- Avoid wall-of-text explanations when a structured format would be clearer

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


### Debugging
- Never ask the user to test or debug for you - solve problems through code analysis
- Only add code that directly solves the stated problem
- Trace code flow -> identify root cause -> implement direct fix

### Live Validation
- Do not proactively use live/browser validation
- Only run browser validation when the user explicitly asks to validate, test, verify, or check it
- Build and typecheck are allowed without asking unless the user says otherwise
- Do not run build, typecheck, or other verification commands for styling-only changes unless the user explicitly asks for verification