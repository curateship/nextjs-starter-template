# Automation System Architecture & Implementation Plan

**Project**: Visual Workflow Builder with Hybrid TypeScript/Python Execution
**Context**: Multi-tenant SaaS Platform (Everything App)
**Last Updated**: 2026-01-10

---

## Executive Summary

This document outlines the architecture and implementation plan for adding a visual workflow automation system to our multi-tenant SaaS platform. The system will enable users to build custom automations using a drag-and-drop interface, with support for complex operations like Google Maps scraping, API integrations, and data processing.

### Key Decisions

1. **Monolithic Architecture** - Keep all features in one codebase for AI context and development velocity
2. **Hybrid Runtime** - TypeScript for most automation, Python for complex scraping
3. **Visual Workflow Builder** - n8n-style canvas with linear workflows (no branching initially)
4. **Database Queue** - Start with PostgreSQL polling, upgrade to Redis if needed
5. **Incremental Complexity** - Ship basic blocks first, add advanced features based on demand

---

## Why This Approach

### The Context: Solo Dev + AI-Assisted Development

**Traditional Advice**: Microservices, separate repos, clear service boundaries

**Our Reality**:
- Solo developer building with AI assistance
- AI needs full codebase context to maintain consistency
- Integration cost of separate services > maintenance cost of monolith
- Need to ship fast and validate features quickly

**Decision**: Monolithic architecture with well-organized feature modules

### Why Monolith is Right for Us

| Factor | Monolith | Microservices |
|--------|----------|---------------|
| **AI Context** | ✅ Sees entire codebase, maintains patterns | ❌ Loses context between repos |
| **Dev Speed** | ✅ Fast iteration, no API contracts | ❌ Coordinate changes across services |
| **Integration** | ✅ Shared DB, auth, billing | ❌ Need to sync/integrate everything |
| **Deployment** | ✅ One deploy | ❌ Coordinate multiple deploys |
| **Team Size** | ✅ Perfect for 1-2 devs | ✅ Better for 5+ dev teams |
| **Scale** | ⚠️ Harder to scale independently | ✅ Scale services separately |

**For our stage (solo, early, AI-assisted): Monolith wins.**

### Why Hybrid TypeScript + Python

**Most automation platforms use one language:**
- n8n: 100% TypeScript
- Zapier: Python backend
- Make: TypeScript

**We need both because:**

**TypeScript for:**
- ✅ API integrations (Gumroad, Stripe, Airtable)
- ✅ Webhooks and real-time operations
- ✅ Database operations
- ✅ Simple scraping (static sites)
- ✅ 80% of automation blocks

**Python for:**
- ✅ Google Maps scraping (anti-bot detection)
- ✅ Complex web scraping (Selenium, undetected-chromedriver)
- ✅ Data processing (Pandas)
- ✅ ML/AI features (future)
- ✅ 20% of automation blocks that need heavy lifting

### Why Visual Workflow Builder

**Alternatives considered:**
1. Config forms (templates only)
2. Code-based (JSON configs)
3. Visual builder

**Visual builder wins because:**
- ✅ Better UX - seeing flow is clearer than forms
- ✅ Extends existing blocks paradigm consistently
- ✅ Differentiator from competitors
- ✅ AI can generate workflows ("describe automation → AI creates blocks")
- ✅ With AI assistance, build time is 2-4 weeks (not 6 months)

**Scope constraint for MVP:**
- ✅ Linear workflows only (A → B → C)
- ❌ No branching/conditionals initially
- ❌ No parallel execution initially
- ❌ No loops initially

This reduces complexity by 60% while covering 80% of use cases.

---

## Technical Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────┐
│              Next.js App (Main Platform)                 │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │     Visual Workflow Builder (React)            │    │
│  │     - Canvas (React Flow)                      │    │
│  │     - Block library                            │    │
│  │     - Configuration panels                     │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │     Automation Management                      │    │
│  │     - List workflows                           │    │
│  │     - View job history                         │    │
│  │     - Logs viewer                              │    │
│  └────────────────────────────────────────────────┘    │
└────────────┬──────────────────────────────┬────────────┘
             │                              │
             │ Write workflows & jobs       │ Admin UI
             ▼                              │
┌────────────────────────────────────────────────────────┐
│         Shared Database (Supabase PostgreSQL)         │
│                                                        │
│  Tables:                                               │
│  - automation_workflows (workflow definitions)         │
│  - automation_jobs (job queue & status)               │
│  - automation_logs (execution logs)                   │
└──────────┬─────────────────────────────┬──────────────┘
           │ Poll for jobs               │ Poll for jobs
           │ (runtime: typescript)       │ (runtime: python)
           ▼                             ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│   TypeScript Worker     │    │    Python Worker        │
│                         │    │                         │
│ Handles:                │    │ Handles:                │
│ - Schedule triggers     │    │ - Google Maps scraping  │
│ - API calls             │    │ - Complex scraping      │
│ - Webhooks              │    │ - Anti-bot bypassing    │
│ - Database operations   │    │ - Data processing       │
│ - Email sending         │    │ - Pandas operations     │
│ - Simple HTML scraping  │    │                         │
│                         │    │                         │
│ Execution: Sequential   │    │ Execution: Sequential   │
│ blocks in workflow      │    │ blocks assigned to it   │
└─────────────────────────┘    └─────────────────────────┘
           │                             │
           └──────────┬──────────────────┘
                      │ Write results
                      ▼
              Update automation_jobs
              with status & output_data
```

### Data Flow

**1. User Creates Workflow:**
```
User → Visual Builder → Save workflow JSON → automation_workflows table
```

**2. User Triggers Workflow:**
```
User clicks "Run" → Create job → automation_jobs (status: pending)
```

**3. Worker Picks Up Job:**
```typescript
// TypeScript Worker
while (true) {
  const jobs = await supabase
    .from('automation_jobs')
    .select('*')
    .eq('status', 'pending')
    .eq('runtime', 'typescript')
    .limit(10)

  for (const job of jobs) {
    await executeJob(job)
  }

  await sleep(5000) // Poll every 5 seconds
}
```

**4. Worker Executes Blocks:**
```typescript
async function executeJob(job) {
  const workflow = await getWorkflow(job.workflow_id)

  for (const block of workflow.blocks) {
    // Check if block should route to Python
    if (block.runtime === 'python') {
      await createPythonSubJob(block)
      await waitForPythonCompletion()
    } else {
      await executeBlock(block)
    }
  }

  await updateJobStatus(job.id, 'completed')
}
```

**5. Python Worker (for specific blocks):**
```python
# Python Worker
while True:
    jobs = supabase.table('automation_jobs') \
        .select('*') \
        .eq('status', 'pending') \
        .eq('runtime', 'python') \
        .limit(10) \
        .execute()

    for job in jobs.data:
        execute_python_job(job)

    time.sleep(5)
```

### Runtime Routing

**How we decide TypeScript vs Python:**

```json
{
  "workflow_id": "wf_123",
  "blocks": [
    {
      "id": "trigger-1",
      "type": "schedule",
      "runtime": "typescript",
      "config": { "cron": "0 * * * *" }
    },
    {
      "id": "scraper-1",
      "type": "google_maps_scraper",
      "runtime": "python",  // Routes to Python worker
      "config": {
        "query": "restaurants in NYC",
        "max_results": 100
      }
    },
    {
      "id": "transform-1",
      "type": "data_transformer",
      "runtime": "typescript",
      "config": { "mapping": {...} }
    },
    {
      "id": "database-1",
      "type": "database_write",
      "runtime": "typescript",
      "config": { "table": "listings" }
    }
  ]
}
```

**Block Type → Runtime Mapping:**

| Block Type | Runtime | Reason |
|------------|---------|--------|
| schedule | TypeScript | Simple cron handling |
| manual_trigger | TypeScript | Just starts workflow |
| api_call | TypeScript | Node.js excellent for HTTP |
| webhook | TypeScript | Real-time HTTP handling |
| database_read | TypeScript | Supabase client |
| database_write | TypeScript | Supabase client |
| email | TypeScript | Resend SDK |
| simple_scraper | TypeScript | Playwright works |
| **google_maps_scraper** | **Python** | Anti-bot, stealth needed |
| **data_processor** | **Python** | Pandas for complex transforms |
| **ml_model** | **Python** | scikit-learn, TensorFlow |

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal**: Database schema, basic UI, TypeScript worker

**Tasks**:

1. **Database Schema**
   ```sql
   -- Create tables
   - automation_workflows
   - automation_jobs
   - automation_logs
   - automation_block_types (registry)

   -- Add RLS policies for multi-tenancy
   ```

2. **TypeScript Worker**
   ```
   /src/workers/automation-worker.ts
   - Poll database for pending jobs
   - Execute blocks sequentially
   - Update job status
   - Error handling & retry logic
   ```

3. **Server Actions**
   ```
   /src/lib/actions/automation/
   - workflow-actions.ts (CRUD workflows)
   - job-actions.ts (create, list, get status)
   - block-types.ts (get available blocks)
   ```

4. **Basic UI (No visual builder yet)**
   ```
   /src/app/admin/automation/
   - List workflows
   - Create workflow (JSON editor for now)
   - Trigger workflow
   - View job history
   ```

**Deliverable**: Can create workflow via JSON, trigger it, see it execute

**Time**: 1-2 weeks with AI

---

### Phase 2: Visual Builder (Week 3-4)

**Goal**: React Flow canvas for visual workflow creation

**Tasks**:

1. **Install Dependencies**
   ```bash
   npm install reactflow
   npm install @xyflow/react  # If using XYFlow
   ```

2. **Visual Builder Component**
   ```
   /src/components/admin/workflow-builder/
   - WorkflowCanvas.tsx (React Flow canvas)
   - BlockPalette.tsx (draggable blocks)
   - BlockConfigPanel.tsx (configure selected block)
   - WorkflowToolbar.tsx (save, run, test)
   ```

3. **Block Type Definitions**
   ```typescript
   /src/config/automation-block-types.ts

   export const AUTOMATION_BLOCK_TYPES = [
     {
       type: 'schedule',
       name: 'Schedule Trigger',
       category: 'triggers',
       icon: Clock,
       runtime: 'typescript',
       configSchema: {
         cron: { type: 'string', label: 'Cron Expression' }
       }
     },
     {
       type: 'api_call',
       name: 'API Call',
       category: 'actions',
       icon: Globe,
       runtime: 'typescript',
       configSchema: {
         method: { type: 'select', options: ['GET', 'POST'] },
         url: { type: 'string' },
         headers: { type: 'object' }
       }
     }
   ]
   ```

4. **Canvas → JSON Conversion**
   ```typescript
   // Convert React Flow nodes/edges to workflow JSON
   function canvasToWorkflow(nodes, edges) {
     return {
       blocks: nodes.map(node => ({
         id: node.id,
         type: node.data.type,
         runtime: node.data.runtime,
         config: node.data.config
       })),
       connections: edges.map(edge => ({
         from: edge.source,
         to: edge.target
       }))
     }
   }
   ```

**Deliverable**: Visual drag-and-drop workflow builder

**Time**: 1-2 weeks with AI

---

### Phase 3: Core Blocks (Week 5-6)

**Goal**: Implement 8-10 essential automation blocks

**TypeScript Blocks to Build**:

1. **Schedule Trigger** (`schedule`)
   - Cron expression parser
   - Create jobs on schedule
   - Use node-cron

2. **Manual Trigger** (`manual_trigger`)
   - Just starts workflow when user clicks

3. **API Call** (`api_call`)
   - HTTP client (axios)
   - Support GET, POST, PUT, DELETE
   - Headers, body, query params

4. **Database Read** (`database_read`)
   - Query Supabase
   - Filters, sorting, pagination

5. **Database Write** (`database_write`)
   - Insert/update/delete in Supabase
   - Support bulk operations

6. **Email** (`email_send`)
   - Resend integration
   - Template support

7. **Data Transformer** (`data_transformer`)
   - Basic JSON transformations
   - Map/filter/reduce operations

8. **Webhook Trigger** (`webhook_trigger`)
   - Expose URL for external services
   - Validate payload

**Implementation Pattern**:
```typescript
// /src/workers/blocks/api-call-block.ts
export async function executeApiCallBlock(block: Block, context: Context) {
  const { method, url, headers, body } = block.config

  try {
    const response = await axios({
      method,
      url,
      headers,
      data: body
    })

    return {
      success: true,
      data: response.data,
      status: response.status
    }
  } catch (error) {
    throw new BlockExecutionError('API call failed', error)
  }
}
```

**Deliverable**: Users can build real workflows with TypeScript blocks

**Time**: 1-2 weeks (1-2 days per block with AI)

---

### Phase 4: Python Layer (Week 7-8)

**Goal**: Add Python worker for complex scraping

**Tasks**:

1. **Python Worker Setup**
   ```
   /python/
   ├── worker.py              # Main worker loop
   ├── config.py              # Shared config
   ├── requirements.txt       # Dependencies
   ├── blocks/
   │   ├── __init__.py
   │   ├── base.py           # Base block executor
   │   ├── google_maps.py    # Google Maps scraper
   │   └── data_processor.py # Pandas operations
   ├── core/
   │   ├── db.py             # Supabase client
   │   ├── logger.py         # Logging
   │   └── executor.py       # Block execution logic
   └── scrapers/
       ├── stealth.py        # Anti-detection
       ├── proxies.py        # Proxy rotation
       └── captcha.py        # CAPTCHA handling
   ```

2. **Python Dependencies**
   ```txt
   # requirements.txt
   supabase==2.0.0
   undetected-chromedriver==3.5.0
   playwright==1.40.0
   beautifulsoup4==4.12.0
   requests==2.31.0
   pandas==2.1.0
   python-dotenv==1.0.0
   ```

3. **Google Maps Scraper Block**
   ```python
   # /python/blocks/google_maps.py
   import undetected_chromedriver as uc
   from typing import Dict, List

   class GoogleMapsScraper:
       def __init__(self, config: Dict):
           self.query = config['query']
           self.max_results = config.get('max_results', 20)

       async def execute(self) -> List[Dict]:
           driver = uc.Chrome()

           try:
               # Navigate to Google Maps
               driver.get(f'https://www.google.com/maps/search/{self.query}')

               # Scraping logic with stealth
               results = self.scrape_listings(driver)

               return {
                   'success': True,
                   'data': results,
                   'count': len(results)
               }
           finally:
               driver.quit()
   ```

4. **Worker Loop**
   ```python
   # /python/worker.py
   from core.db import supabase
   from core.executor import execute_block
   import time

   def main():
       print("Python worker started")

       while True:
           try:
               # Poll for Python jobs
               result = supabase.table('automation_jobs') \
                   .select('*') \
                   .eq('status', 'pending') \
                   .eq('runtime', 'python') \
                   .limit(10) \
                   .execute()

               for job in result.data:
                   process_job(job)

           except Exception as e:
               print(f"Worker error: {e}")

           time.sleep(5)

   def process_job(job):
       # Mark running
       supabase.table('automation_jobs') \
           .update({'status': 'running'}) \
           .eq('id', job['id']) \
           .execute()

       try:
           # Execute block
           result = execute_block(job['block_type'], job['config'])

           # Mark completed
           supabase.table('automation_jobs') \
               .update({
                   'status': 'completed',
                   'output_data': result,
                   'completed_at': datetime.now()
               }) \
               .eq('id', job['id']) \
               .execute()

       except Exception as e:
           # Mark failed
           supabase.table('automation_jobs') \
               .update({
                   'status': 'failed',
                   'error_message': str(e)
               }) \
               .eq('id', job['id']) \
               .execute()
   ```

5. **Deployment Setup**
   ```javascript
   // pm2.config.js
   module.exports = {
     apps: [
       {
         name: 'nextjs',
         script: 'npm',
         args: 'start'
       },
       {
         name: 'typescript-worker',
         script: 'node',
         args: 'dist/workers/automation-worker.js'
       },
       {
         name: 'python-worker',
         script: 'python/worker.py',
         interpreter: 'python3',
         interpreter_args: '-u'
       }
     ]
   }
   ```

**Deliverable**: Google Maps scraping works in workflows

**Time**: 1-2 weeks

---

### Phase 5: Polish & Ship (Week 9-10)

**Goal**: Production-ready with monitoring, error handling, docs

**Tasks**:

1. **Error Handling**
   - Retry logic (exponential backoff)
   - Dead letter queue for failed jobs
   - User-friendly error messages

2. **Monitoring**
   - Job execution metrics
   - Worker health checks
   - Alert on failures (email admin)

3. **User Experience**
   - Workflow templates (pre-built)
   - Block documentation in UI
   - Test workflow feature
   - Job logs viewer

4. **Performance**
   - Lazy load workflow builder (code splitting)
   - Optimize DB queries (indexes)
   - Consider Redis queue if DB polling is slow

5. **Documentation**
   - User guide (how to create workflows)
   - Block reference (all blocks documented)
   - API docs (for webhook triggers)

**Deliverable**: Production-ready automation system

**Time**: 1-2 weeks

---

## Database Schema

### automation_workflows

```sql
CREATE TABLE automation_workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Visual builder state
  canvas_state JSONB DEFAULT '{}',

  -- Compiled workflow definition
  workflow_definition JSONB NOT NULL,
  -- Example structure:
  -- {
  --   "blocks": [
  --     {
  --       "id": "block-1",
  --       "type": "schedule",
  --       "runtime": "typescript",
  --       "config": {...}
  --     }
  --   ],
  --   "connections": [
  --     { "from": "block-1", "to": "block-2" }
  --   ]
  -- }

  is_active BOOLEAN DEFAULT true,

  -- Trigger configuration
  trigger_type VARCHAR(50), -- 'schedule', 'manual', 'webhook'
  trigger_config JSONB,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_executed_at TIMESTAMP,
  execution_count INTEGER DEFAULT 0,

  -- Indexing
  CONSTRAINT unique_workflow_name_per_site UNIQUE (site_id, name)
);

-- Indexes
CREATE INDEX idx_automation_workflows_site_id ON automation_workflows(site_id);
CREATE INDEX idx_automation_workflows_user_id ON automation_workflows(user_id);
CREATE INDEX idx_automation_workflows_trigger_type ON automation_workflows(trigger_type);
CREATE INDEX idx_automation_workflows_is_active ON automation_workflows(is_active);

-- RLS Policies
ALTER TABLE automation_workflows ENABLE ROW LEVEL SECURITY;

-- Users can only see their own workflows
CREATE POLICY "Users can view their own workflows"
  ON automation_workflows FOR SELECT
  USING (user_id = auth.uid() OR site_id IN (
    SELECT id FROM sites WHERE user_id = auth.uid()
  ));

-- Super admins can see all
CREATE POLICY "Super admins can view all workflows"
  ON automation_workflows FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

-- Similar policies for INSERT, UPDATE, DELETE
```

### automation_jobs

```sql
CREATE TABLE automation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID REFERENCES automation_workflows(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,

  -- Execution details
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- Status: pending, running, completed, failed, cancelled

  runtime VARCHAR(20), -- 'typescript' or 'python'

  -- Current block being executed
  current_block_id VARCHAR(100),

  -- Input/Output
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',

  -- Error handling
  error_message TEXT,
  error_stack TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Indexing for performance
  CONSTRAINT check_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

-- Indexes for worker polling
CREATE INDEX idx_automation_jobs_status ON automation_jobs(status);
CREATE INDEX idx_automation_jobs_runtime ON automation_jobs(runtime);
CREATE INDEX idx_automation_jobs_status_runtime ON automation_jobs(status, runtime);
CREATE INDEX idx_automation_jobs_workflow_id ON automation_jobs(workflow_id);
CREATE INDEX idx_automation_jobs_site_id ON automation_jobs(site_id);
CREATE INDEX idx_automation_jobs_created_at ON automation_jobs(created_at DESC);

-- Composite index for worker queries
CREATE INDEX idx_jobs_worker_poll ON automation_jobs(status, runtime, created_at)
WHERE status = 'pending';

-- RLS Policies
ALTER TABLE automation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own jobs"
  ON automation_jobs FOR SELECT
  USING (site_id IN (
    SELECT id FROM sites WHERE user_id = auth.uid()
  ));
```

### automation_logs

```sql
CREATE TABLE automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES automation_jobs(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES automation_workflows(id) ON DELETE CASCADE,

  -- Log details
  level VARCHAR(20) NOT NULL, -- 'info', 'warn', 'error', 'debug'
  message TEXT NOT NULL,

  -- Context
  block_id VARCHAR(100),
  block_type VARCHAR(50),

  -- Additional data
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT check_level CHECK (level IN ('info', 'warn', 'error', 'debug'))
);

-- Indexes
CREATE INDEX idx_automation_logs_job_id ON automation_logs(job_id);
CREATE INDEX idx_automation_logs_workflow_id ON automation_logs(workflow_id);
CREATE INDEX idx_automation_logs_level ON automation_logs(level);
CREATE INDEX idx_automation_logs_created_at ON automation_logs(created_at DESC);

-- Partitioning by date (optional, for high volume)
-- CREATE TABLE automation_logs_2026_01 PARTITION OF automation_logs
-- FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- RLS Policies
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs for their jobs"
  ON automation_logs FOR SELECT
  USING (job_id IN (
    SELECT id FROM automation_jobs WHERE site_id IN (
      SELECT id FROM sites WHERE user_id = auth.uid()
    )
  ));
```

### automation_block_types (Registry)

```sql
CREATE TABLE automation_block_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Block identity
  type VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50), -- 'triggers', 'actions', 'conditions', 'transformers'

  -- Runtime
  runtime VARCHAR(20) NOT NULL, -- 'typescript' or 'python'

  -- Configuration schema (JSON Schema)
  config_schema JSONB NOT NULL,
  -- Example:
  -- {
  --   "type": "object",
  --   "properties": {
  --     "url": { "type": "string", "label": "URL" },
  --     "method": { "type": "string", "enum": ["GET", "POST"] }
  --   },
  --   "required": ["url"]
  -- }

  -- UI metadata
  icon VARCHAR(50),
  color VARCHAR(20),

  -- Availability
  is_active BOOLEAN DEFAULT true,
  is_premium BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed initial block types
INSERT INTO automation_block_types (type, name, description, category, runtime, config_schema) VALUES
('schedule', 'Schedule Trigger', 'Run workflow on a schedule', 'triggers', 'typescript', '{"type":"object","properties":{"cron":{"type":"string"}}}'),
('manual_trigger', 'Manual Trigger', 'Start workflow manually', 'triggers', 'typescript', '{}'),
('api_call', 'API Call', 'Make HTTP request', 'actions', 'typescript', '{"type":"object","properties":{"method":{"type":"string"},"url":{"type":"string"}}}'),
('google_maps_scraper', 'Google Maps Scraper', 'Scrape Google Maps listings', 'actions', 'python', '{"type":"object","properties":{"query":{"type":"string"},"max_results":{"type":"number"}}}');
```

---

## File Structure

### Complete Directory Layout

```
/nextjs-starter-template-1/
├── src/                              # Next.js app (existing)
│   ├── app/
│   │   ├── admin/
│   │   │   └── automation/           # NEW: Automation admin pages
│   │   │       ├── page.tsx          # List workflows
│   │   │       ├── workflows/
│   │   │       │   ├── new/
│   │   │       │   │   └── page.tsx  # Create workflow (visual builder)
│   │   │       │   └── [id]/
│   │   │       │       ├── page.tsx  # Edit workflow
│   │   │       │       └── jobs/
│   │   │       │           └── page.tsx # Job history
│   │   │       └── jobs/
│   │   │           └── page.tsx      # All jobs across workflows
│   │   └── api/
│   │       └── automation/           # NEW: Automation API routes
│   │           ├── trigger/
│   │           │   └── route.ts      # Manual trigger endpoint
│   │           └── webhook/
│   │               └── [workflowId]/
│   │                   └── route.ts  # Webhook receiver
│   │
│   ├── components/
│   │   └── admin/
│   │       └── automation/           # NEW: Automation components
│   │           ├── WorkflowCanvas.tsx       # React Flow canvas
│   │           ├── BlockPalette.tsx         # Draggable blocks
│   │           ├── BlockConfigPanel.tsx     # Configure selected block
│   │           ├── WorkflowToolbar.tsx      # Save, run, test buttons
│   │           ├── JobsList.tsx             # Job history table
│   │           ├── JobDetailsModal.tsx      # Job details & logs
│   │           └── LogViewer.tsx            # Execution logs
│   │
│   ├── lib/
│   │   ├── actions/
│   │   │   └── automation/           # NEW: Server actions
│   │   │       ├── workflow-actions.ts     # CRUD workflows
│   │   │       ├── job-actions.ts          # Job management
│   │   │       ├── block-types-actions.ts  # Get available blocks
│   │   │       └── log-actions.ts          # Fetch logs
│   │   │
│   │   └── types/
│   │       └── automation.ts         # NEW: TypeScript types
│   │
│   ├── workers/                      # NEW: Background workers
│   │   └── automation-worker.ts      # TypeScript worker
│   │       ├── Main worker loop
│   │       ├── Poll database
│   │       ├── Execute blocks
│   │       └── Error handling
│   │
│   └── config/
│       └── automation-block-types.ts # NEW: Block definitions
│
├── python/                           # NEW: Python automation layer
│   ├── worker.py                     # Main Python worker
│   ├── config.py                     # Configuration
│   ├── requirements.txt              # Python dependencies
│   │
│   ├── blocks/                       # Block executors
│   │   ├── __init__.py
│   │   ├── base.py                  # Base block class
│   │   ├── google_maps.py           # Google Maps scraper
│   │   ├── data_processor.py        # Pandas operations
│   │   └── ml_model.py              # ML/AI blocks (future)
│   │
│   ├── core/                         # Core utilities
│   │   ├── __init__.py
│   │   ├── db.py                    # Supabase client
│   │   ├── executor.py              # Block execution engine
│   │   ├── logger.py                # Logging
│   │   └── retry.py                 # Retry logic
│   │
│   ├── scrapers/                     # Scraping utilities
│   │   ├── __init__.py
│   │   ├── stealth.py               # Anti-detection
│   │   ├── proxies.py               # Proxy management
│   │   └── captcha.py               # CAPTCHA solving
│   │
│   └── utils/
│       ├── __init__.py
│       └── helpers.py
│
├── supabase/
│   └── migrations/                   # NEW: Automation migrations
│       ├── XXX_create_automation_workflows.sql
│       ├── XXX_create_automation_jobs.sql
│       ├── XXX_create_automation_logs.sql
│       └── XXX_create_automation_block_types.sql
│
├── docs/
│   └── implementations/              # THIS FILE
│       └── automation-system-architecture.md
│
├── .env                              # Shared env vars
├── pm2.config.js                     # NEW: PM2 config for all services
└── package.json
```

---

## Code Examples

### TypeScript Worker

```typescript
// /src/workers/automation-worker.ts
import { createClient } from '@supabase/supabase-js'
import { executeBlock } from './blocks'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  console.log('TypeScript automation worker started')

  while (true) {
    try {
      await pollAndExecuteJobs()
    } catch (error) {
      console.error('Worker error:', error)
    }

    await sleep(5000) // Poll every 5 seconds
  }
}

async function pollAndExecuteJobs() {
  // Fetch pending jobs for TypeScript runtime
  const { data: jobs, error } = await supabase
    .from('automation_jobs')
    .select(`
      *,
      workflow:automation_workflows(*)
    `)
    .eq('status', 'pending')
    .eq('runtime', 'typescript')
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) throw error
  if (!jobs || jobs.length === 0) return

  // Process jobs in parallel (up to 5 concurrent)
  await Promise.allSettled(
    jobs.map(job => executeJob(job))
  )
}

async function executeJob(job: any) {
  const jobId = job.id
  const workflow = job.workflow

  try {
    // Mark as running
    await updateJobStatus(jobId, 'running')

    // Execute workflow blocks sequentially
    const blocks = workflow.workflow_definition.blocks
    let context: any = {}

    for (const block of blocks) {
      // Check if block should route to Python
      if (block.runtime === 'python') {
        // Create sub-job for Python worker
        context = await createPythonSubJob(jobId, block, context)
        continue
      }

      // Execute TypeScript block
      await logInfo(jobId, `Executing block: ${block.id} (${block.type})`)

      const result = await executeBlock(block, context)

      // Store result in context for next block
      context[block.id] = result

      await logInfo(jobId, `Block completed: ${block.id}`)
    }

    // Mark as completed
    await updateJobStatus(jobId, 'completed', context)

    await logInfo(jobId, 'Workflow completed successfully')

  } catch (error: any) {
    await logError(jobId, `Workflow failed: ${error.message}`, error)
    await updateJobStatus(jobId, 'failed', null, error.message)

    // Retry logic
    if (job.retry_count < job.max_retries) {
      await retryJob(jobId, job.retry_count + 1)
    }
  }
}

async function updateJobStatus(
  jobId: string,
  status: string,
  outputData?: any,
  errorMessage?: string
) {
  const updates: any = { status }

  if (status === 'running') {
    updates.started_at = new Date().toISOString()
  }

  if (status === 'completed' || status === 'failed') {
    updates.completed_at = new Date().toISOString()
  }

  if (outputData) {
    updates.output_data = outputData
  }

  if (errorMessage) {
    updates.error_message = errorMessage
  }

  await supabase
    .from('automation_jobs')
    .update(updates)
    .eq('id', jobId)
}

async function logInfo(jobId: string, message: string, metadata?: any) {
  await supabase.from('automation_logs').insert({
    job_id: jobId,
    level: 'info',
    message,
    metadata: metadata || {}
  })
}

async function logError(jobId: string, message: string, error: any) {
  await supabase.from('automation_logs').insert({
    job_id: jobId,
    level: 'error',
    message,
    metadata: {
      error: error.message,
      stack: error.stack
    }
  })
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Start worker
main()
```

### Block Executor

```typescript
// /src/workers/blocks/index.ts
import { apiCallBlock } from './api-call-block'
import { databaseWriteBlock } from './database-write-block'
import { emailBlock } from './email-block'
import { scheduleBlock } from './schedule-block'

export async function executeBlock(block: any, context: any) {
  const blockExecutors: Record<string, Function> = {
    'api_call': apiCallBlock,
    'database_write': databaseWriteBlock,
    'email_send': emailBlock,
    'schedule': scheduleBlock,
    // Add more block types here
  }

  const executor = blockExecutors[block.type]

  if (!executor) {
    throw new Error(`Unknown block type: ${block.type}`)
  }

  return await executor(block, context)
}
```

```typescript
// /src/workers/blocks/api-call-block.ts
import axios from 'axios'

export async function apiCallBlock(block: any, context: any) {
  const { method, url, headers, body } = block.config

  // Replace variables in config from context
  const resolvedUrl = replaceVariables(url, context)
  const resolvedBody = replaceVariables(body, context)

  const response = await axios({
    method: method || 'GET',
    url: resolvedUrl,
    headers: headers || {},
    data: resolvedBody
  })

  return {
    status: response.status,
    data: response.data,
    headers: response.headers
  }
}

function replaceVariables(value: any, context: any): any {
  if (typeof value === 'string') {
    // Replace {{blockId.field}} with actual value from context
    return value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      return getNestedValue(context, path)
    })
  }

  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map(item => replaceVariables(item, context))
    }

    const result: any = {}
    for (const key in value) {
      result[key] = replaceVariables(value[key], context)
    }
    return result
  }

  return value
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}
```

### Python Worker

```python
# /python/worker.py
from supabase import create_client, Client
from dotenv import load_dotenv
from typing import Dict, Any
import os
import time
import traceback
from datetime import datetime

from core.executor import execute_block
from core.logger import Logger

load_dotenv()

# Initialize Supabase client
supabase: Client = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)

logger = Logger(supabase)

def main():
    """Main worker loop"""
    print("Python automation worker started")

    while True:
        try:
            poll_and_execute_jobs()
        except Exception as e:
            print(f"Worker error: {e}")
            traceback.print_exc()

        time.sleep(5)  # Poll every 5 seconds

def poll_and_execute_jobs():
    """Poll database for pending Python jobs"""
    result = supabase.table('automation_jobs') \
        .select('*, workflow:automation_workflows(*)') \
        .eq('status', 'pending') \
        .eq('runtime', 'python') \
        .order('created_at', desc=False) \
        .limit(10) \
        .execute()

    jobs = result.data

    if not jobs:
        return

    for job in jobs:
        execute_job(job)

def execute_job(job: Dict[str, Any]):
    """Execute a single job"""
    job_id = job['id']
    workflow = job['workflow']

    try:
        # Mark as running
        update_job_status(job_id, 'running')

        # Get the specific block to execute
        block = find_block_for_job(workflow, job)

        if not block:
            raise Exception("Block not found in workflow")

        logger.info(job_id, f"Executing block: {block['id']} ({block['type']})")

        # Execute block
        result = execute_block(block, job.get('input_data', {}))

        logger.info(job_id, f"Block completed: {block['id']}")

        # Mark as completed
        update_job_status(job_id, 'completed', output_data=result)

    except Exception as e:
        error_msg = str(e)
        logger.error(job_id, f"Job failed: {error_msg}", {
            'error': error_msg,
            'traceback': traceback.format_exc()
        })

        update_job_status(
            job_id,
            'failed',
            error_message=error_msg
        )

        # Retry logic
        if job.get('retry_count', 0) < job.get('max_retries', 3):
            retry_job(job_id, job.get('retry_count', 0) + 1)

def update_job_status(
    job_id: str,
    status: str,
    output_data: Any = None,
    error_message: str = None
):
    """Update job status in database"""
    updates = {'status': status}

    if status == 'running':
        updates['started_at'] = datetime.now().isoformat()

    if status in ['completed', 'failed']:
        updates['completed_at'] = datetime.now().isoformat()

    if output_data is not None:
        updates['output_data'] = output_data

    if error_message:
        updates['error_message'] = error_message

    supabase.table('automation_jobs') \
        .update(updates) \
        .eq('id', job_id) \
        .execute()

def find_block_for_job(workflow: Dict, job: Dict) -> Dict:
    """Find the specific block this job should execute"""
    blocks = workflow['workflow_definition']['blocks']

    # If job has current_block_id, use that
    if 'current_block_id' in job:
        for block in blocks:
            if block['id'] == job['current_block_id']:
                return block

    # Otherwise, find first Python block
    for block in blocks:
        if block.get('runtime') == 'python':
            return block

    return None

def retry_job(job_id: str, retry_count: int):
    """Retry a failed job"""
    supabase.table('automation_jobs') \
        .update({
            'status': 'pending',
            'retry_count': retry_count,
            'error_message': None
        }) \
        .eq('id', job_id) \
        .execute()

if __name__ == '__main__':
    main()
```

### Python Block Executor

```python
# /python/core/executor.py
from typing import Dict, Any
from blocks.google_maps import GoogleMapsScraper
from blocks.data_processor import DataProcessor

def execute_block(block: Dict[str, Any], context: Dict[str, Any]) -> Any:
    """
    Execute a Python block

    Args:
        block: Block definition with type and config
        context: Context data from previous blocks

    Returns:
        Block execution result
    """
    block_type = block['type']
    config = block['config']

    executors = {
        'google_maps_scraper': GoogleMapsScraper,
        'data_processor': DataProcessor,
        # Add more block types here
    }

    executor_class = executors.get(block_type)

    if not executor_class:
        raise ValueError(f"Unknown Python block type: {block_type}")

    # Instantiate and execute
    executor = executor_class(config, context)
    return executor.execute()
```

### Google Maps Scraper Block

```python
# /python/blocks/google_maps.py
import undetected_chromedriver as uc
from typing import Dict, List, Any
import time
from bs4 import BeautifulSoup

class GoogleMapsScraper:
    """Google Maps scraping block"""

    def __init__(self, config: Dict[str, Any], context: Dict[str, Any]):
        self.query = config['query']
        self.max_results = config.get('max_results', 20)
        self.context = context

    def execute(self) -> Dict[str, Any]:
        """Execute the scraping"""
        driver = None

        try:
            # Initialize undetected Chrome
            options = uc.ChromeOptions()
            options.add_argument('--headless')
            options.add_argument('--no-sandbox')

            driver = uc.Chrome(options=options)

            # Navigate to Google Maps search
            search_url = f'https://www.google.com/maps/search/{self.query}'
            driver.get(search_url)

            # Wait for results to load
            time.sleep(3)

            # Scroll to load more results
            self._scroll_results(driver, self.max_results)

            # Parse listings
            listings = self._parse_listings(driver)

            return {
                'success': True,
                'data': listings[:self.max_results],
                'count': len(listings[:self.max_results]),
                'query': self.query
            }

        finally:
            if driver:
                driver.quit()

    def _scroll_results(self, driver, target_count: int):
        """Scroll the results panel to load more listings"""
        last_height = 0
        attempts = 0
        max_attempts = 10

        while attempts < max_attempts:
            # Find scrollable element
            scrollable = driver.find_element('css selector', '[role="feed"]')

            # Scroll to bottom
            driver.execute_script(
                'arguments[0].scrollTo(0, arguments[0].scrollHeight)',
                scrollable
            )

            time.sleep(2)

            # Check if we've loaded enough or hit bottom
            new_height = driver.execute_script(
                'return arguments[0].scrollHeight',
                scrollable
            )

            if new_height == last_height:
                break

            last_height = new_height
            attempts += 1

    def _parse_listings(self, driver) -> List[Dict[str, Any]]:
        """Parse listing data from the page"""
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        listings = []

        # Find all listing elements
        # Note: Selectors may change, need to keep updated
        listing_elements = soup.select('[role="article"]')

        for element in listing_elements:
            try:
                listing = {
                    'name': self._extract_text(element, '[class*="fontHeadline"]'),
                    'rating': self._extract_rating(element),
                    'reviews': self._extract_reviews(element),
                    'address': self._extract_text(element, '[class*="fontBody"]'),
                    'category': self._extract_category(element),
                    'phone': self._extract_phone(element),
                    'website': self._extract_website(element),
                }

                listings.append(listing)

            except Exception as e:
                print(f"Error parsing listing: {e}")
                continue

        return listings

    def _extract_text(self, element, selector: str) -> str:
        """Extract text from element"""
        found = element.select_one(selector)
        return found.text.strip() if found else ''

    def _extract_rating(self, element) -> float:
        """Extract rating value"""
        rating_elem = element.select_one('[role="img"][aria-label*="stars"]')
        if rating_elem:
            aria_label = rating_elem.get('aria-label', '')
            # Extract number from "4.5 stars"
            rating = aria_label.split()[0]
            try:
                return float(rating)
            except:
                return 0.0
        return 0.0

    def _extract_reviews(self, element) -> int:
        """Extract review count"""
        # Implementation depends on HTML structure
        return 0

    def _extract_category(self, element) -> str:
        """Extract business category"""
        # Implementation depends on HTML structure
        return ''

    def _extract_phone(self, element) -> str:
        """Extract phone number"""
        # Implementation depends on HTML structure
        return ''

    def _extract_website(self, element) -> str:
        """Extract website URL"""
        # Implementation depends on HTML structure
        return ''
```

---

## Deployment

### Environment Variables

```bash
# .env (root of project)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Database
DATABASE_URL=postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres

# Workers
WORKER_POLL_INTERVAL=5000  # milliseconds
WORKER_CONCURRENCY=5       # max parallel jobs

# Python
PYTHON_WORKER_ENABLED=true
PYTHON_EXECUTABLE=python3

# Optional: Redis (if upgrading from DB polling)
# REDIS_URL=redis://localhost:6379
```

### PM2 Configuration

```javascript
// pm2.config.js
module.exports = {
  apps: [
    {
      name: 'nextjs',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'typescript-worker',
      script: 'node',
      args: 'dist/workers/automation-worker.js',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'python-worker',
      script: 'python/worker.py',
      interpreter: 'python3',
      interpreter_args: '-u',  // Unbuffered output
      env: {
        PYTHONUNBUFFERED: '1'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
}
```

### Deployment Steps

```bash
# 1. Install Node.js dependencies
npm install

# 2. Build Next.js
npm run build

# 3. Build TypeScript worker
tsc src/workers/automation-worker.ts --outDir dist/workers

# 4. Setup Python environment
cd python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..

# 5. Run database migrations
npx supabase db push

# 6. Start all services with PM2
pm2 start pm2.config.js

# 7. Save PM2 config
pm2 save

# 8. Setup PM2 to start on boot
pm2 startup
```

### Monitoring

```bash
# View all services
pm2 status

# View logs
pm2 logs

# View specific service logs
pm2 logs nextjs
pm2 logs typescript-worker
pm2 logs python-worker

# Monitor resources
pm2 monit

# Restart services
pm2 restart all
pm2 restart typescript-worker
pm2 restart python-worker

# Stop services
pm2 stop all
pm2 delete all
```

### Health Checks

```typescript
// /src/app/api/health/route.ts
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const checks = {
    nextjs: 'ok',
    database: 'unknown',
    typescriptWorker: 'unknown',
    pythonWorker: 'unknown'
  }

  // Check database
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase.from('automation_workflows').select('id').limit(1)
    checks.database = 'ok'
  } catch {
    checks.database = 'error'
  }

  // Check workers by looking at recent job processing
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

    const { data: tsJobs } = await supabase
      .from('automation_jobs')
      .select('id')
      .eq('runtime', 'typescript')
      .gte('updated_at', fiveMinutesAgo.toISOString())
      .limit(1)

    checks.typescriptWorker = tsJobs && tsJobs.length > 0 ? 'ok' : 'stale'

    const { data: pyJobs } = await supabase
      .from('automation_jobs')
      .select('id')
      .eq('runtime', 'python')
      .gte('updated_at', fiveMinutesAgo.toISOString())
      .limit(1)

    checks.pythonWorker = pyJobs && pyJobs.length > 0 ? 'ok' : 'stale'

  } catch {
    checks.typescriptWorker = 'error'
    checks.pythonWorker = 'error'
  }

  const allOk = Object.values(checks).every(status => status === 'ok')

  return Response.json(
    { status: allOk ? 'healthy' : 'degraded', checks },
    { status: allOk ? 200 : 503 }
  )
}
```

---

## Success Metrics

### Phase 1 (Foundation) - Week 2
- [ ] Database tables created with RLS policies
- [ ] TypeScript worker running and processing jobs
- [ ] Can create workflow via JSON and trigger it
- [ ] Job status updates correctly
- [ ] Logs are captured

### Phase 2 (Visual Builder) - Week 4
- [ ] Visual workflow canvas works
- [ ] Can drag blocks onto canvas
- [ ] Can configure blocks
- [ ] Canvas saves to workflow JSON correctly
- [ ] Can edit existing workflows visually

### Phase 3 (Core Blocks) - Week 6
- [ ] 8-10 TypeScript blocks implemented
- [ ] Users can build real workflows
- [ ] API Call block works with external services
- [ ] Database operations work
- [ ] Email sending works

### Phase 4 (Python Layer) - Week 8
- [ ] Python worker running alongside TypeScript worker
- [ ] Google Maps scraper works
- [ ] Results saved to database
- [ ] Anti-bot detection bypassed successfully
- [ ] Can scrape 100+ listings

### Phase 5 (Production) - Week 10
- [ ] Error handling and retries work
- [ ] Health checks pass
- [ ] Monitoring dashboard shows metrics
- [ ] User documentation complete
- [ ] First 5 users successfully create workflows

---

## Future Enhancements

**After MVP ships, consider adding:**

### V2 Features (Month 3-4)
- [ ] Branching/conditionals (if/then/else)
- [ ] Parallel execution (run blocks simultaneously)
- [ ] Loop blocks (iterate over arrays)
- [ ] Variable system (store/reuse data across blocks)
- [ ] FastAPI server for webhook handling
- [ ] Redis queue (upgrade from DB polling)

### V3 Features (Month 5-6)
- [ ] Pre-built workflow templates
- [ ] Workflow marketplace (share/sell workflows)
- [ ] Sub-workflows (call workflow from workflow)
- [ ] Version control for workflows
- [ ] A/B testing for workflows
- [ ] Analytics dashboard (execution metrics)

### V4 Features (Month 7+)
- [ ] AI workflow generator (describe → workflow created)
- [ ] Block marketplace (custom blocks)
- [ ] Multi-step debugging (step through execution)
- [ ] Workflow scheduler UI (cron builder)
- [ ] Collaboration (share workflows with team)
- [ ] Audit logs (who changed what)

---

## Key Insights from Discussion

### 1. Monolith is Right for AI-Assisted Solo Dev

**Why it matters**: Traditional best practices (microservices, boundaries) assume human teams coordinating. With AI assistance, having everything in one codebase lets AI maintain consistency and patterns automatically.

**Impact**: Faster development, fewer integration bugs, consistent patterns.

### 2. Python Layer Justified by Google Maps Scraping

**Why it matters**: Google Maps has sophisticated anti-bot detection. Python's `undetected-chromedriver` and mature scraping ecosystem make it significantly better than Node.js for this use case.

**Impact**: Better scraping success rate, less maintenance fighting detection.

### 3. Visual Builder Feasible with AI

**Why it matters**: With AI coding assistance, building a visual workflow builder takes 2-4 weeks, not 6 months. This changes the cost/benefit calculation.

**Impact**: Can ship differentiating feature quickly without huge time investment.

### 4. Start Simple, Add Complexity Based on Demand

**Why it matters**: Linear workflows (no branching) cover 80% of use cases with 40% of the complexity. Ship fast, validate, then add advanced features.

**Impact**: Faster validation, less wasted effort on unused features.

### 5. Integration Blocks vs Workflow Builder

**Why it matters**: Scraping doesn't fit the "display block on page" model. Need separate automation system, but can reuse "blocks" concept for consistency.

**Impact**: Consistent UX paradigm across platform.

---

## MCP Integration for Advanced Automation

### Can MCP Servers Work in Our Visual UI?

**YES.** MCP (Model Context Protocol) servers can be integrated directly into our Next.js visual workflow builder.

### What This Enables

Same capabilities as terminal Claude Skills, but in your visual UI:

**Terminal Claude Skills:**
```bash
claude "Find real estate agents in NYC, analyze their sites, email them"
```

**Our Visual UI:**
```
[Trigger] → [Claude Agent Block] → [Save Results]
            (has access to MCP tools: Brave Search, Gmail, Puppeteer)
```

### How It Works

1. Install MCP SDK in TypeScript worker
2. Connect to MCP servers (Brave Search, Gmail, etc.) on startup
3. When executing workflow, call Claude API with those tools available
4. Claude autonomously uses MCP tools to complete multi-step tasks
5. Show progress and results in UI

### Available MCP Servers

Popular servers we can integrate:
- **Brave Search** - Web search
- **Gmail** - Send/read emails
- **Puppeteer** - Browser automation
- **Google Drive** - File access
- **Slack** - Messaging
- **GitHub** - Repository management
- **Custom servers** - Build your own

### Implementation Approach

**Add "Claude Agent" block type:**
- User describes task in plain English
- Agent has access to specified MCP servers
- Autonomously uses tools to complete task
- Saves results to database

**Example workflow:**
```json
{
  "blocks": [
    {
      "type": "claude_agent",
      "config": {
        "instruction": "Find 10 restaurants in NYC, get their emails, send intro email",
        "available_mcp_servers": ["brave-search", "gmail"],
        "max_steps": 20
      }
    }
  ]
}
```

### Benefits vs Terminal Skills

| Feature | Terminal | Our UI |
|---------|----------|--------|
| Multi-step automation | ✅ | ✅ |
| MCP tool access | ✅ | ✅ |
| Visual interface | ❌ | ✅ |
| Saved workflows | ❌ | ✅ |
| Scheduled execution | ❌ | ✅ |
| Multi-tenant | ❌ | ✅ |

### Implementation Phase

Add to **Phase 4** of roadmap:
- Install `@modelcontextprotocol/sdk`
- Build MCP manager to connect to servers
- Add Claude Agent block type
- Test with 2-3 popular MCP servers

**This would be a major differentiator** - no other automation platform has Claude + MCP in a visual builder.

---

## Questions to Answer Before Building

1. **What are the top 10 automation use cases our users need?**
   - List them out to validate workflow builder is the right approach

2. **Do we have users waiting for this feature?**
   - If yes: prioritize their specific needs
   - If no: consider building specific integrations first to validate demand

3. **What's our go-to-market strategy?**
   - How will we position automation in our product?
   - Is this a core feature or premium add-on?

4. **How will we handle API rate limits?**
   - Google Maps blocks aggressive scraping
   - Need proxy rotation strategy?
   - Need to throttle job execution?

5. **What's our pricing model for automation?**
   - Charge per workflow execution?
   - Charge per scraping job?
   - Included in platform pricing?

6. **MCP usage costs?**
   - Claude API calls for each tool use
   - Need usage limits or cost warnings
   - Pass through costs to users?

---

## Conclusion

This architecture balances:
- **Pragmatism** (start simple, add complexity as needed)
- **Best practices** (RLS, multi-tenancy, error handling)
- **Developer experience** (AI can see everything, consistent patterns)
- **User experience** (visual builder, consistent with existing blocks)
- **Technical excellence** (right tool for each job)

The hybrid TypeScript + Python approach lets us leverage the strengths of each language while maintaining a single codebase for AI context.

**Next Steps:**
1. Review this plan
2. Answer the questions above
3. Create Phase 1 tasks in project management tool
4. Start building database schema

**Ready to build the future of no-code automation.**
