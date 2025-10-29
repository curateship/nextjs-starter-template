# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨 CRITICAL ANTI-OVERCOMPLICATION RULES (NEVER VIOLATE)

**READ THIS FIRST - These rules prevent the disasters documented in JOURNEY.md Phase 12**

### 1. SIMPLICITY IS MANDATORY
- **If a solution needs more than 20 lines for a simple feature, STOP and reconsider**
- **Always implement the simplest solution that works** - avoid over-engineering
- **Direct solutions > Clever architecture** - prefer straightforward code over "smart" solutions
- **Question every new dependency, hook, or context** - can this be done without it?

### 2. NO FAKE "SAFETY" SYSTEMS  
- **NEVER create backup/restore systems in application code** - use database transactions
- **NEVER implement staged deletions** - just delete the fucking data
- **NEVER create "safety" features that silently fail** - fail fast and honestly
- **If you need complex error recovery, your primary operation is broken**


### 3. NO OVERCOMPLICATED STATE MANAGEMENT
- **NEVER create temporary UI state that doesn't map to database**
- **NEVER implement complex state synchronization** - load fresh data when needed
- **NEVER add staged/pending/deleted tracking** - just do the operation

### 4. FAIL FAST PRINCIPLE
- **If an operation fails, report the error immediately**
- **NEVER pretend success when operations fail**
- **NEVER hide errors with complex error handling**
- **User should know immediately when something doesn't work**

### 5. CODE REVIEW CHECKLIST
Before implementing ANY feature, ask:
- **Can this be done with basic CRUD operations?** (Usually yes)
- **Am I adding complexity to solve a problem I created?** (Usually yes) 
- **Would a junior developer understand this in 5 minutes?** (If no, simplify)
- **Does this follow the "Load → Edit → Save" pattern?** (If no, why not?)

**REMEMBER: The user losing data due to "safety" features is worse than any simple bug.**

### 7. ABSOLUTELY NO SCOPE CREEP (CRITICAL RULE)
- **ONLY fix the exact problem the user asked about** - nothing more, nothing less
- **NEVER "fix" unrelated TypeScript warnings or compilation errors** unless they directly block the requested change
- **NEVER optimize, refactor, or improve code that wasn't part of the request**
- **If you see unrelated issues, IGNORE THEM** - they were working before and can keep working
- **Pre-existing warnings/errors are NOT your problem unless specifically asked**
- **When you see `npm run build` errors, only fix ones that are directly caused by your changes**
- **Stop fucking around and just fix the problem at hand**

### 8. MANDATORY SERVER VERIFICATION (NEVER SKIP)
- **NEVER say "server is running" without actually testing it first**
- **ALWAYS verify server response with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`**
- **ALWAYS check if process exists with `lsof -ti:3000`**
- **If server returns non-200 status or no process exists, DO NOT claim it's running**
- **Test actual functionality, not just build output or "Ready" messages**
- **A server that says "Ready" but doesn't respond to requests is NOT running**

### 9. MANDATORY TASK CONFIRMATION PROTOCOL (NEVER SKIP)
- **ALWAYS repeat back the user's request in your own words first**
- **ALWAYS confirm what specific component/file/location you understand the issue to be in**
- **ALWAYS state exactly which files you plan to examine before doing anything**
- **WAIT for user confirmation before proceeding with any debugging or implementation**
- **If you skip this protocol and start working without confirmation, you are violating CLAUDE.md**
- **EXCEPTION: For simple questions about code/components, just answer directly without confirmation**

**Example:**
- User: "the preview panel is not showing the right thing"
- Claude: "I understand you're reporting an issue with the preview panel in the admin builder where content is not displaying correctly. I plan to examine the ProductPreview component and related files. Should I proceed with this focus?"
- User: "yes" 
- Claude: *then* proceed with investigation

**Exception Example:**
- User: "what is this component used for?"
- Claude: *directly examines and explains the component*

**This protocol prevents Claude from debugging wrong components and wasting user time.**

## Development Commands

**Start development server:**
```bash
npm run dev
# Uses Next.js with Turbopack for fast development
```

**Build and deployment:**
```bash
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run ESLint
```


### Critical Development Rules

**🚨 SECURITY RULES (NEVER VIOLATE):**
1. **NEVER hardcode credentials** in client-side code - EVER
2. **NEVER implement client-side only authentication** - always use server-side validation
3. **NEVER store sensitive data** in localStorage without encryption
4. **ALWAYS validate authentication** on the server side
5. **ALWAYS use secure session management** (httpOnly cookies, JWTs with proper expiration)

**⚡ CODING STANDARDS (MANDATORY):**
1. **NEVER take shortcuts** that compromise security, maintainability, or code quality
2. **ALWAYS follow best practices** - proper error handling, validation, and secure coding patterns
3. **NEVER sacrifice security for speed** - security vulnerabilities are NEVER acceptable trade-offs
4. **ALWAYS implement server-side validation** before client-side convenience features
5. **NEVER use temporary "quick fixes"** that expose security risks - fix the root problem properly
6. **ALWAYS ask for guidance** when stuck instead of implementing dangerous workarounds
7. **NEVER commit code** that you wouldn't be comfortable running in production
8. **ALWAYS consider the security implications** of every code change before implementation
9. **MANDATORY DISCLOSURE**: If Claude cannot find a solution that follows these coding standards, it MUST explicitly state that it might need to break coding standards and that it cannot and will not proceed until it has approval to explore alternative paths
10. **ALWAYS delete test files and test code** immediately after they are no longer needed - no test files (test-*.js, test-*.ts, debug-*.*, etc.) should remain in the codebase

**🎯 SIMPLICITY FIRST RULE (MANDATORY):**
- **ALWAYS implement the simplest solution that works** - avoid over-engineering
- **If adding more than 20 lines for a simple feature, STOP and reconsider** the approach
- **Before adding state management, caching, or abstractions, ask: "Is this necessary?"**
- **Direct solutions > Clever architecture** - prefer straightforward code over "smart" solutions
- **When fixing issues, try removing code before adding code** - often the problem is too much complexity
- **If the solution feels complicated, it probably is** - step back and find the simple path
- **NEVER add layers of indirection** unless absolutely necessary
- **Question every new dependency, hook, or context** - can this be done without it?

**🧹 CODE CLEANUP PROTOCOL (MANDATORY):**
- **ALWAYS delete test files** after debugging (test-*.js, test-*.ts, debug-*.*, tmp-*.*, etc.)
- **NEVER leave debugging console.logs** in production code
- **ALWAYS remove temporary workarounds** once the proper solution is implemented
- **NEVER commit test data or mock data** that was used for debugging
- **ALWAYS clean up unused imports and dead code** before completing a task

**📋 CODE GENERATION PROTOCOL:**
- **ALWAYS confirm reading CLAUDE.md** by saying "Claude.md Read" at the end of responses (not in code files)


**🚫 DEBUGGING AND PROBLEM SOLVING RULES (MANDATORY):**
- **NEVER ask the user to test, debug, or validate solutions for you** - this is YOUR job
- **ALWAYS work out solutions internally** through code analysis, logic tracing, and systematic problem solving
- **ONLY ask for simple testing as LAST RESORT** when all internal analysis is exhausted
- **NEVER create unnecessary debugging tools, test pages, or diagnostic code** unless explicitly requested
- **ONLY add code that directly solves the stated problem** - no scaffolding, workarounds, or tangential features
- **ALWAYS analyze available data first** (error messages, logs, existing code) before asking for more information
- **NEVER waste user time with convoluted testing processes** - solve problems through proper engineering
- When debugging: trace code flow → identify root cause → implement direct fix
- **This rule overrides any tendency to create "helpful" debugging utilities**

**🛑 CRITICAL GIT COMMIT RULE (NEVER VIOLATE):**
- **NEVER make additional code changes when asked to commit**
- When user says "commit", "commit build", or any commit-related command, ONLY commit existing changes
- If build fails or errors are found during build, REPORT them and ASK before fixing
- **DO NOT** fix errors, warnings, or issues without explicit user permission
- **CORRECT BEHAVIOR EXAMPLE:**
  - User: "commit build"
  - Claude: Runs build, finds errors
  - Claude: "The build is failing with [specific errors]. Should I fix these or commit as-is?"
  - User: Makes the decision
- **This rule is ABSOLUTE and overrides all other considerations**

**🔍 MANDATORY SECURITY AUDIT PROTOCOL:**
- **REQUIRED**: After every code addition, modification, or implementation, Claude MUST perform a comprehensive security audit
- **SCOPE**: Audit must include all newly added/modified code for vulnerabilities, security risks, and coding standards compliance
- **STANDARDS**: Must check for XSS, CSRF, SQL injection, input validation, authentication bypass, information disclosure, and all OWASP Top 10 vulnerabilities
- **BEST PRACTICES**: Verify adherence to secure coding practices, proper error handling, input sanitization, and defense-in-depth principles  
- **ACTION REQUIRED**: If vulnerabilities are found, they must be immediately fixed before proceeding
- **DOCUMENTATION**: Security audit results must be documented and any fixes applied must be explained
- **NO EXCEPTIONS**: This audit is mandatory for every code change, regardless of size or perceived risk level


#### **9. Security Implementation (MANDATORY)**
- [ ] **Input sanitization** on both client and server
- [ ] **XSS prevention** - remove script tags, javascript:, event handlers
- [ ] **Length limits** to prevent DoS attacks
- [ ] **Content validation** - check for dangerous patterns
- [ ] **Authentication checks** - verify user can edit block
- [ ] **Authorization checks** - verify user owns the site

#### **10. Testing & Validation (REQUIRED)**
- [ ] **Test block creation** - can add block via admin interface
- [ ] **Test block editing** - all fields update correctly
- [ ] **Test block display** - frontend renders properly
- [ ] **Test drag & drop** - reordering works in admin (if applicable)
- [ ] **Test security** - cannot inject malicious content
- [ ] **Test permissions** - only authorized users can edit

### **❌ COMMON MISTAKES TO AVOID:**
1. **Forgetting database constraint** → Block creation fails
2. **Missing admin editor integration** → Edit panel shows blank
3. **Missing icon in block list** → No visual representation
4. **Forgetting frontend rendering** → Block doesn't display on site
5. **Missing type definitions** → TypeScript errors
6. **Inadequate security** → XSS vulnerabilities
7. **Missing one of the three panels** → Incomplete admin experience

### **✅ SUCCESS CRITERIA:**
- Block appears in right panel (BlockTypesPanel) with icon and add button
- Block appears in middle panel (BlockListPanel) with correct icon when added
- Block shows editing interface in left panel (BlockPropertiesPanel) when selected
- Block renders correctly on frontend with all content
- All security measures implemented and tested
- No TypeScript errors or console warnings

**⚠️ CRITICAL**: If ANY step is missed, the block will not work properly. Follow this checklist completely for every new block type.

**🚫 SANITIZATION HORROR PREVENTION (AUGUST 19, 2025):**
- **NEVER add `.trim()` to user input sanitization** - it prevents typing spaces and breaks basic text input functionality
- **NEVER add complex input sanitization** without testing basic typing functionality first
- **If you add sanitization that breaks spaces, delete it immediately** - coherent text input is more important than overly aggressive "security"
- **Use plain HTML inputs** instead of ShadCN components when drag-and-drop interferes with text editing
- **When debugging input issues, check for `.trim()` in sanitization code first** - this was the root cause of the FAQ space typing disaster