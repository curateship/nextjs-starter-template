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

### 3. DATABASE OPERATIONS ARE SIMPLE
- **Load data from database**
- **Edit data in UI**
- **Save data to database**
- **Done - no staging, no caching, no complex state management**

### 4. NO OVERCOMPLICATED STATE MANAGEMENT
- **NEVER create temporary UI state that doesn't map to database**
- **NEVER implement complex state synchronization** - load fresh data when needed
- **NEVER add staged/pending/deleted tracking** - just do the operation

### 5. FAIL FAST PRINCIPLE
- **If an operation fails, report the error immediately**
- **NEVER pretend success when operations fail**
- **NEVER hide errors with complex error handling**
- **User should know immediately when something doesn't work**

### 6. CODE REVIEW CHECKLIST
Before implementing ANY feature, ask:
- **Can this be done with basic CRUD operations?** (Usually yes)
- **Am I adding complexity to solve a problem I created?** (Usually yes) 
- **Would a junior developer understand this in 5 minutes?** (If no, simplify)
- **Does this follow the "Load → Edit → Save" pattern?** (If no, why not?)

**REMEMBER: The user losing data due to "safety" features is worse than any simple bug.**

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

**Testing:**
No specific test commands configured. Check for testing setup before running tests.

**Development Server Notes:**
```bash
# ALWAYS use port 3000 - shut down any existing server first:
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
npm run dev

# ⚠️ CRITICAL: After running 'npm run build', you MUST clear cache before 'npm run dev'
# Running production build creates manifest files that conflict with development mode
# This causes "ENOENT: no such file or directory" errors for build manifests

# Use this automated script after any build:
./scripts/dev-restart.sh

# Or manual command:
rm -rf .next && lsof -ti:3000 | xargs kill -9 2>/dev/null || true && npm run dev

# Server restart is required after:
# - Running 'npm run build' (ALWAYS clear cache first!)
# - Server action changes (adding/modifying functions in lib/actions/)
# - Middleware.ts modifications  
# - Database schema changes
# - Environment variable updates

# Quick restart command (use this after server action changes):
lsof -ti:3000 | xargs kill -9 2>/dev/null || true && npm run dev
```

## Architecture Overview

This is a **multi-tenant platform** for managing multiple sites with theme-based customization, built on Next.js 15.3.4 with App Router.

### Folder Structure & Component Organization

**Application Routes:**
- `/app/(main)/` - Main application routes with navbar/footer layout
- `/app/admin/` - Admin dashboard for platform management
- `/app/themes/` - Theme preview and demo pages

**Component Structure (MANDATORY ORGANIZATION):**
```
/src/components/
├── ui/                          # Reusable UI components (buttons, cards, inputs, etc.)
│   ├── button.tsx              # ShadCN and generic UI components
│   ├── card.tsx                # Follow kebab-case naming convention
│   ├── post-block.tsx          # Static UI blocks (posts, newsletters, etc.)
│   └── product-*-block.tsx     # Product-related UI components
│
├── admin/                       # Admin-specific components
│   └── layout/                  # Admin layout and builder components
│       ├── page-builder/        # Page builder components (Navigation, Footer, Hero)
│       ├── product-builder/     # Product builder components
│       └── image-library/       # Image management components
│
└── frontend/                    # Frontend-facing components
    └── layout/                  # Frontend layout components
        ├── pages/               # Page-specific components
        ├── products/            # Product display components
        └── shared/              # Shared frontend components (FAQ, Rich Text, etc.)
```

**Component Placement Rules:**
- **UI Components** (`/components/ui/`): Generic, reusable UI elements and static blocks
- **Admin Components** (`/components/admin/`): Admin dashboard and builder interfaces
- **Frontend Components** (`/components/frontend/`): User-facing display components
- **Shared Components** (`/components/frontend/layout/shared/`): Components used across multiple frontend contexts

**File Naming Conventions:**
- Components in `/components/ui/`: Use kebab-case (e.g., `product-hero-block.tsx`)
- Components in `/components/admin/` and `/components/frontend/`: Use PascalCase (e.g., `ProductHeroBlock.tsx`)
- Always use `.tsx` extension for React components

### Organization Principles

**Component Extraction Standards:**
- **Component Extraction**: Break large components into focused, single-purpose parts
- **Hierarchy**: Main component → direct dependencies → supporting components  
- **Clean Code**: Eliminate deep nesting and "ugly closing brackets"
- **Strategic Commenting**: Explain "why" not "what", avoid over-commenting

**Example Structure:**
```typescript
// Main component (clean, focused)
const NavBlock = () => (
  <nav>
    <MobileMenuButton />
    <DesktopNav />
    <MobileMenuPanel />
  </nav>
)

// Supporting components (extracted for clarity)
const DesktopNav = ({ menuItems, ...props }) => (...)
const MobileNav = ({ menuItems }) => (...)
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

**📊 DATABASE SCHEMA PRESENTATION RULE:**
- **ALWAYS present database schemas visually** as formatted tables, not SQL code
- When planning or executing database changes, show tables like this:
  - Table name as header
  - Columns shown with example data
  - Relationships indicated clearly
  - Use clean, readable formatting
- Example format:
  ```
  | id | name | status | created_at |
  |----|------|--------|------------|
  | 123 | Example | active | 2024-01-20 |
  ```
- This makes database structure accessible to non-technical users
- SQL code can be shown separately ONLY if explicitly requested for implementation

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

## 🧱 BLOCK CREATION GUIDE (CRITICAL - FOLLOW EXACTLY)

When adding new block types to the platform, follow this **MANDATORY CHECKLIST** to prevent issues:

### **📋 COMPLETE BLOCK IMPLEMENTATION CHECKLIST:**

#### **1. Database Schema (REQUIRED FIRST)**
- [ ] **Update database constraint** in migration file:
  ```sql
  ALTER TABLE page_blocks DROP CONSTRAINT IF EXISTS site_blocks_block_type_check;
  ALTER TABLE page_blocks ADD CONSTRAINT site_blocks_block_type_check 
  CHECK (block_type IN ('navigation', 'hero', 'footer', 'rich-text', 'faq', 'NEW_BLOCK_TYPE'));
  ```
- [ ] **Apply migration** manually in Supabase dashboard if CLI not available
- [ ] **Test block creation** - verify constraint allows new block type

#### **2. Backend Actions (REQUIRED)**
- [ ] **Add to block type union** in `src/lib/actions/page-blocks-actions.ts`:
  ```typescript
  block_type: 'hero' | 'rich-text' | 'faq' | 'NEW_BLOCK_TYPE'
  ```
- [ ] **Add to validation check**:
  ```typescript
  if (params.block_type !== 'hero' && params.block_type !== 'rich-text' && params.block_type !== 'faq' && params.block_type !== 'NEW_BLOCK_TYPE') {
    return { success: false, error: 'Only hero, rich-text, FAQ, and NEW_BLOCK_TYPE blocks can be added' }
  }
  ```
- [ ] **Add default content** in `addSiteBlockAction`:
  ```typescript
  } else if (params.block_type === 'NEW_BLOCK_TYPE') {
    defaultContent = {
      title: 'Default Title',
      // ... other default properties
    }
  ```
- [ ] **Add server-side validation** for new block content structure
- [ ] **Add to block utils** `src/lib/shared-blocks/block-utils.ts`:
  ```typescript
  case 'NEW_BLOCK_TYPE':
    return 'New Block Display Name'
  ```

#### **3. Frontend Display Component (REQUIRED)**
- [ ] **Create frontend component** in `src/components/frontend/layout/shared/NewBlockType.tsx`
- [ ] **Implement proper props interface** with content validation
- [ ] **Add security measures** - input sanitization, XSS prevention
- [ ] **NO drag functionality** on frontend (admin only)
- [ ] **Use React escaping** - never use `dangerouslySetInnerHTML` without DOMPurify

#### **4. Admin Editor Component (REQUIRED)**
- [ ] **Create admin editor** in `src/components/admin/layout/page-builder/SharedNewBlockType.tsx`
- [ ] **Implement two-card layout** (settings card + content card)
- [ ] **Add input validation** with length limits and sanitization
- [ ] **Add drag & drop** functionality if needed (Framer Motion Reorder)
- [ ] **Implement proper callbacks** for content updates

#### **5. Admin UI Integration (REQUIRED - ALL THREE PANELS)**
- [ ] **BlockTypesPanel** (Right Panel) - Add new block option:
  ```typescript
  // Import icon
  import { NewIcon } from "lucide-react"
  
  // Add UI block
  <div className="p-3 rounded-lg border bg-background flex items-center justify-between">
    <div className="flex items-center space-x-2">
      <NewIcon className="w-4 h-4" />
      <span className="font-medium">New Block Type</span>
    </div>
    {onAddNewBlockType && (
      <Button onClick={onAddNewBlockType}>
        <Plus className="w-4 h-4" />
      </Button>
    )}
  </div>
  ```
- [ ] **BlockPropertiesPanel** (Left Panel) - Add editing interface:
  ```typescript
  {selectedBlock.type === 'NEW_BLOCK_TYPE' && (
    <SharedNewBlockType
      title={selectedBlock.content.title}
      // ... other props
      onTitleChange={(value) => updateBlockContent('title', value)}
    />
  )}
  ```
- [ ] **BlockListPanel** (Middle Panel) - Add icon and label:
  ```typescript
  // Import icon
  import { NewIcon } from "lucide-react"
  
  // Add to getBlockIcon function
  case 'NEW_BLOCK_TYPE':
    return <NewIcon className="w-4 h-4" />
  
  // Add to getBlockTypeName function
  block.type === 'NEW_BLOCK_TYPE' ? 'New Block Display Name' :
  ```

#### **6. Block Rendering System (REQUIRED)**
- [ ] **page-block-renderer.tsx** - Add rendering logic:
  ```typescript
  // Add to type union
  const allBlocks: Array<{ type: 'hero' | 'richText' | 'faq' | 'newBlockType'; data: any; display_order: number }> = []
  
  // Add block collection
  if (blocks.newBlockType) {
    blocks.newBlockType.forEach(block => {
      allBlocks.push({
        type: 'newBlockType',
        data: block,
        display_order: block.display_order
      })
    })
  }
  
  // Add rendering case
  } else if (block.type === 'newBlockType') {
    const newBlock = block.data
    return (
      <NewBlockType 
        key={`newBlockType-${newBlock.id}`}
        content={newBlock} 
      />
    )
  ```

#### **7. Type Definitions (REQUIRED)**
- [ ] **frontend-actions.ts** - Add to SiteWithBlocks interface:
  ```typescript
  newBlockType?: Array<{
    id: string
    title: string
    // ... other properties
    display_order: number
  }>
  ```
- [ ] **admin-to-frontend-blocks.ts** - Add transformation logic:
  ```typescript
  } else if (block.type === 'NEW_BLOCK_TYPE') {
    if (!frontendBlocks.newBlockType) {
      frontendBlocks.newBlockType = []
    }
    
    frontendBlocks.newBlockType.push({
      id: block.id,
      title: block.content.title || 'Default Title',
      // ... other properties
      display_order: (block as any).display_order || 0
    })
  ```

#### **8. Hook Integration (REQUIRED)**
- [ ] **usePageBuilder.ts** - Add handler function:
  ```typescript
  // Add to interface
  handleAddNewBlockType: () => Promise<void>
  
  // Add handler implementation
  const handleAddNewBlockType = async () => {
    // Implementation similar to other handlers
  }
  
  // Add to return object
  handleAddNewBlockType,
  ```
- [ ] **Wire up in page builder** - Connect handler to UI button

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