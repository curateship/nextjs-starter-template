# AGENTS.md

Guidance for Codex working in `apps/core/`.
Read all documents for app rules in `apps/core/docs`

The coding philosophy of this app is to focus on code simplicity. Before writing any code. Ask yourself "What is the cleanest way to code this?" or "what is the least amount of code I can implement this feature with the least amount of code as possible"


### Response Format
- Use bullet points for better readability.
- When writing summaries, do not include the full file path.
- Use short sections with clear labels when the response covers more than one topic
- Keep paragraphs short and easy to scan

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
- Ignore pre-existing issues unless specifically asked


### Debugging
- Never ask the user to test or debug for you - solve problems through code analysis
- Only add code that directly solves the stated problem
- Trace code flow -> identify root cause -> implement direct fix
