# Platform Architecture & Automation System

**Project**: Multi-Tenant Page Builder with AI-Native Automation System
**Context**: Webflow + Zapier + AI in One Platform
**Last Updated**: 2026-01-18

---

## Table of Contents

1. [Platform Vision](#platform-vision)
2. [Two Extension Systems](#two-extension-systems)
3. [Architecture Decisions](#architecture-decisions)
4. [Technical Approach](#technical-approach)
5. [Implementation Roadmap](#implementation-roadmap)
6. [Future Vision](#future-vision)

---

## Platform Vision

### What We're Building

A **multi-tenant page builder platform** with TWO extension systems:

```
Multi-Tenant Page Builder Platform = Webflow + Zapier + AI
├── Core (auth, billing, multi-tenancy)
├── Page Builder System (Extension System 1)
│   ├── Hero Block, Rich Text, Stripe, Auth
│   └── ...more blocks added over time
└── Automation System (Extension System 2)
    ├── Workflow Builder, Scraper, AI Writer
    └── ...more automations added over time
```

### This is NOT:
- ❌ 10 separate apps in one codebase
- ❌ A super app like WeChat
- ❌ Microservices in a monolith

### This IS:
- ✅ A page builder (like Webflow)
- ✅ With automation capabilities (like Zapier)
- ✅ Where automations are AI-powered (MCP integration)
- ✅ And business logic is added as blocks (like WordPress plugins)

---

## Two Extension Systems

### Extension System 1: Page Builder Blocks

**Purpose**: Add business logic/UI components to pages

**When to add a block:**
- Users need to see/interact with it on a page
- It's part of the site's UI
- Examples: Payment form, login form, product grid, pricing table

**Storage**: Always loaded as part of page builder, stored in `page_blocks` table

**Future blocks:**
- Stripe payment block
- Pricing table block
- Testimonials block
- Contact form block
- Product showcase block

### Extension System 2: Automation System

**Purpose**: Background processes and workflows

**When to add an automation:**
- Runs in the background (not visible on pages)
- Processes data or performs actions
- Examples: Web scraping, AI article writing, email campaigns, data sync

**Storage**: Only loaded when enabled (code splitting), tables created on-demand

**Future automations:**
- Scraper automation
- AI article writer
- Email campaign automation
- Data import/export
- API integrations

---

## Architecture Decisions

### 1. Monolith Architecture (Not Microservices)

**Decision**: Keep all features in one codebase

**Why:**
- AI sees full codebase context (critical for consistency)
- Share auth, billing, multi-tenancy across all features
- Fast development (no API contracts between services)
- Easy to understand (one codebase, one pattern)
- Perfect for 1-2 devs with AI assistance

**Trade-off**: Harder to scale independently (but not relevant at our stage)

### 2. WordPress-Style On-Demand Tables

**Problem**: If you create tables for every possible automation upfront:
- 20 automations = 60+ tables in schema
- Most tenants only use 2-3 automations
- Wasted database space and complexity

**Solution**: Only create tables when automation is enabled

**Process**:
1. User enables automation for their site
2. System creates necessary tables (if don't exist)
3. Mark automation as enabled for that tenant
4. Initialize automation configuration

**Benefits:**
- Lean database by default (only core tables)
- Pay for what you use
- Can add 50+ automations without bloat
- Can disable and drop tables to reclaim space
- Follows familiar WordPress plugin pattern

### 3. Hybrid TypeScript + Python Runtime

**Why not just one language?**

**TypeScript for:**
- API integrations (Stripe, Airtable, etc.)
- Webhooks and real-time operations
- Database operations
- Simple scraping (static sites)
- 80% of automation blocks

**Python for:**
- Google Maps scraping (anti-bot detection)
- Complex web scraping (Selenium, undetected-chromedriver)
- Data processing (Pandas)
- ML/AI features (future)
- 20% of automation blocks that need heavy lifting

### 4. Visual Workflow Builder

**Alternatives considered:**
1. Config forms (templates only)
2. Code-based (JSON configs)
3. Visual builder ✓

**Visual builder wins because:**
- Better UX - seeing flow is clearer than forms
- Extends existing blocks paradigm consistently
- Differentiator from competitors
- AI can generate workflows ("describe → AI creates blocks")
- With AI assistance, build time is 2-4 weeks (not 6 months)

**MVP Scope:**
- Linear workflows only (A → B → C)
- No branching/conditionals initially
- No parallel execution initially
- No loops initially

This reduces complexity by 60% while covering 80% of use cases.

### 5. Comparison to "Vibe Coding"

**Vibe Coding Approach (Build 10 Separate Apps):**
- Scraper app: 3-4 months
- Automation app: 3-4 months
- AI Writer app: 3-4 months
- Repeat 7 more times...
- **Total**: 30-40 months
- **Result**: 10 codebases, 10 auth systems, inconsistent UX

**Our Approach (Modular Platform):**
- Build foundation once: 3-6 months
- Build automation module: 1-2 months
- Build scraper module: 1-2 months
- Build AI writer module: 1-2 months
- Repeat 7 more times...
- **Total**: 12-18 months
- **Result**: 1 codebase, shared infrastructure, consistent UX

---

## Technical Approach

### System Overview

```
┌─────────────────────────────────────┐
│      Next.js App (Main Platform)    │
│                                     │
│  ├─ Visual Workflow Builder        │
│  ├─ Block library & config panels  │
│  └─ Automation Management UI       │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│   Shared Database (PostgreSQL)      │
│                                     │
│  Core Tables (always present):      │
│  - sites, users, pages, blocks      │
│  - enabled_features                 │
│                                     │
│  Automation Tables (on-demand):     │
│  - workflows, jobs, logs            │
└──────────┬──────────────────────────┘
           │
           ▼
┌──────────────────────┬──────────────────────┐
│  TypeScript Worker   │   Python Worker      │
│                      │                      │
│  - Schedules         │   - Google Maps      │
│  - API calls         │   - Complex scraping │
│  - Webhooks          │   - Data processing  │
│  - Database ops      │   - ML/AI (future)   │
│  - Email             │                      │
└──────────────────────┴──────────────────────┘
```

### Data Flow

1. **User Creates Workflow** → Visual Builder → Save to database
2. **User Triggers Workflow** → Create job (status: pending)
3. **Worker Picks Up Job** → Poll database every 5 seconds
4. **Worker Executes Blocks** → Sequential execution
5. **Results Saved** → Update job with status & output

### Runtime Routing

Blocks are automatically routed to the right runtime:

| Category | Runtime | Examples |
|----------|---------|----------|
| **Most Operations** | TypeScript | API calls, webhooks, database, email, simple scraping |
| **Heavy Lifting** | Python | Google Maps scraping, complex scraping, data processing, ML |

### Database Strategy

**Core Tables (Always Present):**
- Sites, users, pages, blocks
- Permissions, billing
- enabled_features (tracks which automations are active)

**Automation Tables (Created On-Demand):**
- automation_workflows (workflow definitions)
- automation_jobs (queue & execution status)
- automation_logs (execution history)
- automation_block_types (available blocks)

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Goal**: Database setup, basic UI, TypeScript worker

**Deliverables**:
- Core database tables with on-demand function
- Basic admin UI (list workflows, trigger manually)
- TypeScript worker polling database
- Can create simple workflows via JSON

### Phase 2: Visual Builder (Week 3-4)

**Goal**: Drag-and-drop workflow canvas

**Deliverables**:
- React Flow canvas integration
- Block palette with draggable blocks
- Block configuration panels
- Canvas saves to workflow JSON
- Can edit workflows visually

### Phase 3: Core Blocks (Week 5-6)

**Goal**: Essential automation blocks

**Blocks to Build** (8-10 blocks):
1. Schedule Trigger (cron-based)
2. Manual Trigger (user-initiated)
3. API Call (HTTP requests)
4. Database Read/Write (Supabase)
5. Email (Resend integration)
6. Data Transformer (JSON operations)
7. Webhook Trigger (external events)
8. Simple Scraper (static sites)

**Deliverable**: Users can build real workflows

### Phase 4: Python Layer (Week 7-8)

**Goal**: Complex scraping capabilities

**Deliverables**:
- Python worker setup
- Google Maps scraper block
- Stealth/anti-bot capabilities
- Data processing blocks (Pandas)

### Phase 5: Polish & Ship (Week 9-10)

**Goal**: Production-ready

**Deliverables**:
- Error handling & retry logic
- Job execution monitoring
- Workflow templates
- User documentation
- Health checks & alerting

---

## Future Vision

### V2 Features (Month 3-4)
- Branching/conditionals (if/then/else)
- Parallel execution (run blocks simultaneously)
- Loop blocks (iterate over arrays)
- Variable system (store/reuse data)
- Redis queue (upgrade from database polling)

### V3 Features (Month 5-6)
- Pre-built workflow templates
- Workflow marketplace (share/sell)
- Sub-workflows (composability)
- Version control for workflows
- Analytics dashboard

### V4 Features (Month 7+)
- AI workflow generator (describe → creates workflow)
- Block marketplace (custom blocks)
- Multi-step debugging
- Team collaboration
- Audit logs

### MCP Integration (Game-Changer)

**What it enables**: Claude AI agents with access to MCP tools can autonomously complete multi-step tasks

**Example**:
```
[Claude Agent Block]
Instruction: "Find 10 restaurants in NYC, get emails, send intro"
Available Tools: Brave Search, Gmail, Puppeteer
Result: Agent autonomously completes the entire workflow
```

**Why it matters**: No other automation platform has Claude + MCP in a visual builder

---

## Key Insights

### 1. Monolith is Right for AI-Assisted Solo Dev

With AI assistance, having everything in one codebase lets AI maintain consistency automatically. Integration cost of separate services > maintenance cost of monolith.

### 2. WordPress-Style On-Demand Tables

Only create tables when automation is enabled. Keeps database lean and scalable to 50+ automations without bloat.

### 3. Two Extension Systems Working Together

**Blocks** handle UI/business logic, **Automations** handle background processes. Clear separation of concerns enables systematic growth.

### 4. AI-Native from Day One

MCP integration makes automations adaptive and intelligent, not just pattern-matching. This is 10x more powerful than traditional automation platforms.

---

## Success Criteria

### Phase 1 Complete
- ✓ Can create & trigger workflows
- ✓ Jobs execute successfully
- ✓ Logs are captured

### Phase 2 Complete
- ✓ Visual workflow builder works
- ✓ Can drag, configure, and save blocks
- ✓ Workflows load correctly

### Phase 3 Complete
- ✓ 8-10 core blocks implemented
- ✓ Users building real workflows
- ✓ External integrations work

### Phase 4 Complete
- ✓ Python worker running
- ✓ Complex scraping works
- ✓ Anti-bot detection bypassed

### Phase 5 Complete
- ✓ Error handling robust
- ✓ Monitoring in place
- ✓ First 5 users successful
- ✓ Documentation complete

---

## Conclusion

This architecture balances:
- **Pragmatism** - Start simple, add complexity as needed
- **Best practices** - Multi-tenancy, security, error handling
- **Developer experience** - AI sees everything, consistent patterns
- **User experience** - Visual builder, consistent with existing blocks
- **Scalability** - On-demand tables, code splitting, feature isolation

The hybrid TypeScript + Python approach lets us leverage the strengths of each language while maintaining a single codebase for AI context.

**Next Steps:**
1. Review this plan
2. Enable automation for first site
3. Build Phase 1 (Foundation)
4. Iterate based on feedback

**We're building the future of AI-native automation.**
