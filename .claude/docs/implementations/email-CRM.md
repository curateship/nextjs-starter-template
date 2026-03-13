# Email CRM — Custom Automation Pipelines + Deliverability

## Context

Build a full email CRM with product-specific automation pipelines AND broadcast/newsletter capabilities using Resend. Handles all email: automation drip sequences, local newsletters, broadcasts — everything in one unified system. No Beehiiv, no Flodesk, no external email marketing vendors.

**Example pipeline:** Fitness lead magnet signup → drip sequence (day 0, day 3, day 7) → pitch FitOS product → track opens/clicks/purchases → custom funnel report.

**Example broadcast:** Weekly Austin city guide → sent to all contacts tagged "austin" → track engagement.

**Why:**
- No external tool can provide closed-loop reporting tied to your products and purchases
- The hub already has directories, user accounts, lead magnets — email is tightly integrated
- Local newsletter portals are built on the hub (business directory, user registrations, deals) — Beehiiv would be a data silo
- At 1x/week, Resend is cheaper than Beehiiv up to ~75k subs. At 2x/week, Beehiiv is cheaper but adds vendor dependency, duplicate features, and split data
- Resend charges $0 in quiet months (no idle subscriber tax)

### Cost Analysis

Resend has **two separate pricing models** — transactional (per-email) and marketing (per-contact, unlimited sends).

**Transactional Emails** (automations, drip sequences, order confirmations):
| Plan | Base | Included | Overage |
|------|------|----------|---------|
| Pro | $20/mo | 50k emails | $0.90/1k |
| Scale | $90/mo | 100k emails | $0.90/1k |

Pro cheaper than Scale up to ~128k emails/mo. Start on Pro for automations.

**Marketing Emails** (broadcasts/newsletters — unlimited sends, contact-based):
| Contacts | Resend Pro Marketing | Beehiiv Scale |
|----------|---------------------|---------------|
| 25k | $180/mo | $169/mo |
| 50k | TBD (slider-based) | $199/mo |
| 100k | TBD | $329/mo |

Same pricing model as Beehiiv — per-contact with unlimited sends. Near-identical cost at 25k ($180 vs $169). No cost reason to use Beehiiv.

**Decision:** Resend for everything. No Beehiiv.
- Automations/transactional: Pro ($20/mo), upgrade to Scale at ~130k emails/mo
- Broadcasts/newsletters: Pro Marketing (contact-based, unlimited sends)
- Cost parity with Beehiiv + unified data + closed-loop product reporting
- Dedicated IP add-on ($30/mo) when volume warrants it

### Architecture Decision

Build in the hub (current app). Per the monorepo plan's "extract on second use" principle:
- Email sending primitives → `packages/email/` during monorepo migration
- CRM data layer → stays in hub, extract to `packages/crm/` only when a second app needs it

---

## Database Schema (Migrations 098-103)

### 098: `crm_contacts`
```sql
- id, site_id (FK sites), email, first_name, last_name
- source: 'lead_magnet' | 'paid_purchase' | 'manual' | 'ad' | 'import'
- source_product_id (FK products, nullable)
- tags TEXT[], metadata JSONB
- status: 'active' | 'unsubscribed' | 'bounced' | 'complained'  -- deliverability
- engagement_score INTEGER DEFAULT 0  -- 0-100, calculated from activity
- last_engaged_at TIMESTAMPTZ  -- last open/click
- bounce_count INTEGER DEFAULT 0  -- soft bounce tracking
- UNIQUE(site_id, email) — upsert on conflict
- RLS: site ownership pattern + service_role access
```

### 099: `automations`
```sql
- id, site_id (FK sites), name, description
- status: 'draft' | 'active' | 'paused'
- trigger_type: 'lead_magnet_signup' | 'paid_purchase'
- trigger_config JSONB — { product_id: "uuid" } to scope to specific product
- goal_type: 'purchase' (optional)
- goal_config JSONB — { product_id: "uuid" }
- RLS: site ownership pattern
```

### 100: `automation_steps`
```sql
- id, automation_id (FK automations)
- step_order INTEGER, delay_minutes INTEGER (from enrollment time)
- subject, content (HTML), from_name (optional override)
- UNIQUE(automation_id, step_order)
- RLS: through automation → site ownership
```

### 101: `automation_enrollments`
```sql
- id, automation_id (FK automations), contact_id (FK crm_contacts)
- current_step_order INTEGER (0 = hasn't started)
- status: 'active' | 'completed' | 'goal_met' | 'cancelled'
- enrolled_at, completed_at, goal_met_at, last_step_sent_at
- metadata JSONB — { resend_message_ids: [...], step_events: {...} }
- UNIQUE(automation_id, contact_id) — prevents double-enrollment
- RLS: site ownership + service_role
```

### 102: `broadcasts`
```sql
- id, site_id (FK sites), name, subject, content (HTML), from_name
- status: 'draft' | 'scheduled' | 'sending' | 'sent'
- audience_filter JSONB — { tags: [...], sources: [...], min_engagement_score: N }
- scheduled_at TIMESTAMPTZ (optional)
- sent_at TIMESTAMPTZ
- total_recipients INTEGER, total_sent INTEGER, total_opened INTEGER, total_clicked INTEGER
- metadata JSONB — { resend_batch_id, send_errors: [...] }
- RLS: site ownership
```

### 103: `email_events`
```sql
- id, site_id (FK sites), contact_id (FK crm_contacts)
- event_type: 'sent' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed'
- source_type: 'automation' | 'broadcast' | 'transactional'
- source_id UUID — automation_id or broadcast_id
- resend_message_id VARCHAR(255)
- metadata JSONB — { step_order, link_url, bounce_type, etc. }
- created_at TIMESTAMPTZ DEFAULT now()
- RLS: site ownership + service_role
```
Replaces the JSONB-on-enrollment approach. Dedicated event table enables proper deliverability analytics and engagement scoring queries.

---

## Server Actions

### `/src/lib/actions/crm/contact-actions.ts`
- `getContactsBySite(siteId)` — paginated list
- `createOrUpsertContact({ siteId, email, source, sourceProductId, ... })` — upsert on conflict
- `updateContact(contactId, updates)` — edit tags, name
- `deleteContacts(contactIds)` — bulk delete
- `getContactEngagement(contactId)` — joins with product_orders + enrollments

### `/src/lib/actions/crm/automation-actions.ts`
- `getAutomationsBySite(siteId)` — list with enrollment counts
- `getAutomationById(automationId)` — with steps
- `createAutomation(...)` — creates in draft status
- `updateAutomation(automationId, updates)`
- `updateAutomationStatus(automationId, status)`
- `deleteAutomations(automationIds)`
- `findActiveAutomations(siteId, triggerType, productId)` — for enrollment matching

### `/src/lib/actions/crm/step-actions.ts`
- `getStepsByAutomation(automationId)`
- `createStep(...)`, `updateStep(...)`, `deleteStep(...)`
- `reorderSteps(automationId, stepIds)`

### `/src/lib/actions/crm/enrollment-actions.ts`
- `enrollContact(automationId, contactId)`
- `getEnrollmentsByAutomation(automationId)`
- `cancelEnrollment(enrollmentId)`
- `getAutomationReport(automationId)` — funnel: enrolled → per-step sent/opened/clicked → goal conversions

### `/src/lib/actions/crm/broadcast-actions.ts`
- `getBroadcastsBySite(siteId)` — list with stats
- `createBroadcast({ siteId, name, subject, content, audienceFilter })` — creates as draft in our DB
- `updateBroadcast(broadcastId, updates)` — edit content
- `scheduleBroadcast(broadcastId, scheduledAt)` — schedule for later
- `sendBroadcast(broadcastId)` — creates broadcast in Resend Marketing API, syncs audience, triggers send
- `getBroadcastReport(broadcastId)` — delivery/open/click stats

### `/src/lib/actions/crm/audience-sync-actions.ts`
- `syncContactsToResend(siteId)` — sync crm_contacts → Resend audience (create/update/remove)
- `syncAudienceForBroadcast(broadcastId)` — filter contacts by audience_filter, sync matching subset to Resend audience
- `getOrCreateResendAudience(siteId)` — get/create Resend audience ID (stored in site_integrations)
- Uses Resend Contacts API: `POST /audiences/{id}/contacts`

### `/src/lib/actions/crm/deliverability-actions.ts`
- `processEmailEvent({ messageId, eventType, metadata })` — record event + update contact engagement
- `updateEngagementScores(siteId)` — recalculate scores for all contacts (cron job)
- `autoSuppressContacts(siteId)` — suppress hard bounces, 3+ soft bounces, complainers
- `getDeliverabilityReport(siteId)` — bounce rate, complaint rate, engagement breakdown
- `checkDomainHealth(siteId)` — DNS lookup for SPF/DKIM/DMARC status

---

## Scheduling / Worker

### API Route: `/src/app/api/cron/automations/route.ts`
Protected by `CRON_SECRET` env var. Logic:
1. Query active enrollments where next step is due (enrolled_at + delay_minutes <= now)
2. Send email via `EmailService`
3. Update enrollment (advance step, record message ID)
4. Mark completed if last step

### API Route: `/src/app/api/cron/broadcasts/route.ts`
Protected by `CRON_SECRET`. Logic:
1. Query broadcasts with status = 'scheduled' and scheduled_at <= now
2. Sync matching contacts to Resend audience via `syncAudienceForBroadcast`
3. Create broadcast in Resend Marketing API (`POST /broadcasts`) and send (`POST /broadcasts/{id}/send`)
4. Update local broadcast record with resend_broadcast_id, sent_at, total_recipients
5. Stats (opens, clicks) come back via Resend webhooks → email_events

### API Route: `/src/app/api/cron/engagement/route.ts`
Protected by `CRON_SECRET`. Runs daily. Logic:
1. Recalculate engagement scores for all contacts based on email_events
2. Auto-suppress contacts with hard bounces or spam complaints
3. Flag contacts with no engagement in 90 days

### Trigger: System cron jobs (self-hosted)
```bash
*/5 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://yoursite.com/api/cron/automations
*/5 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://yoursite.com/api/cron/broadcasts
0 3 * * *  curl -s -H "Authorization: Bearer $CRON_SECRET" https://yoursite.com/api/cron/engagement
```

---

## Email Template

### `/src/lib/actions/email/templates/automation-email.ts`
Simple HTML email template (reuse CSS structure from `product-delivery.ts`). Takes subject + HTML content.

### Extend `EmailService`
Add `sendAutomationEmail({ to, subject, content, trackingToken, config })` — simpler than product delivery, still uses link tracking.

---

## Admin UI

### Automations List — `/src/app/admin/automations/page.tsx` (REPLACE mock)
- Replace current mock with real data from `getAutomationsBySite`
- Tabs: All / Active / Paused / Draft
- Table: Name, Trigger (product name), Status, Enrolled count, Last Activity, Actions
- Bulk delete, create modal

### Automation Builder — `/src/app/admin/automations/[automationId]/page.tsx` (NEW)
- **Top section:** Name, description, status toggle
- **Trigger section:** Type dropdown + product picker
- **Visual timeline:** Vertical timeline with connecting lines
  - Trigger node at top (circle + label)
  - Step cards connected by lines with wait duration labels
  - Each step shows: step number, delay, subject, content preview
  - Click step to edit in modal (subject, delay picker, RichTextEditor for content)
  - Delete step button, add step button between steps
  - Goal node at bottom (optional)
- **Goal section:** Optional purchase goal + product picker
- Save in sticky header

### Contacts List — `/src/app/admin/contacts/page.tsx` (NEW)
- Tabs: All / Lead Magnets / Purchases / Manual / Imported
- Table: Email, Name, Source, Product, Tags, Automations count, Created
- Click row → detail modal (engagement history, enrolled automations)
- Bulk delete
- **CSV Import** — upload button, parse CSV (email, first_name, last_name, tags), preview rows, bulk upsert via `createOrUpsertContact`. Source = 'import'. For migrating 23k existing subscribers from external tool.

### Pipeline Report — `/src/app/admin/automations/[automationId]/report/page.tsx` (NEW)
- Funnel visualization: enrolled → per-step (sent / opened / clicked) → goal conversions
- Stat cards: total enrolled, completion rate, goal conversion rate
- Revenue attribution if goal is purchase

### Broadcasts — `/src/app/admin/broadcasts/page.tsx` (NEW)
- List of broadcasts with status (Draft / Scheduled / Sent)
- Table: Name, Subject, Audience size, Status, Sent date, Open rate, Click rate
- "New Broadcast" button → create modal

### Broadcast Composer — `/src/app/admin/broadcasts/[broadcastId]/page.tsx` (NEW)
- Subject line input
- Content editor (RichTextEditor)
- Audience selector: filter by tags, source, engagement score
- Preview audience count (live query)
- Schedule picker or "Send Now" button
- Send test email to self

### Deliverability Dashboard — `/src/app/admin/email-health/page.tsx` (NEW)
- **Domain Health:** SPF/DKIM/DMARC status (green/yellow/red)
- **Key Metrics:** Delivery rate, bounce rate, complaint rate, open rate (30-day rolling)
- **Contact Health:** Pie chart — active / unsubscribed / bounced / cold (no engagement 90d)
- **Alerts:** Warning if bounce rate > 2% or complaint rate > 0.1%
- **Engagement Distribution:** Bar chart showing contact count by engagement score band

### Unsubscribe / Preference Center — `/src/app/[domain]/unsubscribe/page.tsx` (NEW)
- One-click unsubscribe (linked in every email footer)
- Optional: preference center — choose frequency, topics/tags
- Updates contact status to 'unsubscribed'
- Public page (no auth required)

### Sidebar Updates — `AppSidebar.tsx`
Move Automations from `platformProjects` to `contentNavItems`, add CRM section:
```ts
{
  title: "Email CRM",
  url: "/admin/automations",
  icon: Mail,
  items: [
    { title: "Automations", url: "/admin/automations" },
    { title: "Broadcasts", url: "/admin/broadcasts" },
    { title: "Contacts", url: "/admin/contacts" },
    { title: "Email Health", url: "/admin/email-health" },
  ],
}
```

---

## Integration Points

### Lead Magnet Signup — `/src/app/api/products/lead-magnet/signup/route.ts`
After `createFreeSignup()` (line 88), add:
1. `createOrUpsertContact({ siteId, email, source: 'lead_magnet', sourceProductId: productId })`
2. `findActiveAutomations(siteId, 'lead_magnet_signup', productId)` → `enrollContact()` for each

### Paid Purchase — Stripe webhook handler
In `checkout.session.completed`:
1. Upsert CRM contact with source `'paid_purchase'`
2. Enroll in matching automations
3. Check if purchase fulfills any automation goals → mark `'goal_met'`

### Resend Webhook — `/src/app/api/webhooks/resend/route.ts`
Extend existing handler: match `message_id` from Resend events to enrollment metadata, record open/click events per step.

---

## Existing Code to Reuse

| Component | Path |
|-----------|------|
| EmailService (sending) | `/src/lib/actions/email/email-service.ts` |
| Email template CSS | `/src/lib/actions/email/templates/product-delivery.ts` |
| Link tracking | `/src/app/api/track/click/[token]/route.ts` |
| Resend webhook | `/src/app/api/webhooks/resend/route.ts` |
| Order actions | `/src/lib/actions/email/order-actions.ts` |
| Resend config | `/src/lib/actions/email/integration-actions.ts` |
| Lead magnet signup | `/src/app/api/products/lead-magnet/signup/route.ts` |
| Admin page pattern | `/src/app/admin/automations/page.tsx` (mock to replace) |
| RichTextEditor | `/src/components/admin/shared/RichTextEditor.tsx` |
| AdminPageHeader | `/src/components/admin/layout/dashboard/AdminPageHeader.tsx` |
| StickyHeader | `/src/components/admin/layout/dashboard/StickyHeader.tsx` |
| Sidebar | `/src/components/admin/layout/sidebar/AppSidebar.tsx` |

---

## Deliverability Tools (Built-in)

### 1. Bounce/Complaint Auto-Suppression (Required)
- Resend webhooks: `email.bounced` → increment bounce_count, suppress after hard bounce or 3 soft bounces
- Resend webhooks: `email.complained` → set status = 'complained', never email again
- All recorded in `email_events` table

### 2. Engagement Scoring (High ROI)
- Score 0-100 per contact based on recency + frequency of opens/clicks
- Scoring formula: recent open (+20), recent click (+30), decays over time
- Auto-segment: hot (70+), warm (30-69), cold (0-29)
- Cron job recalculates daily
- Broadcast audience filter can set minimum engagement score

### 3. Domain Health Monitor
- DNS lookup for SPF, DKIM, DMARC on configured sending domain
- Dashboard shows green/yellow/red per record
- Alert thresholds: bounce rate > 2%, complaint rate > 0.1%

### 4. Send Throttling / IP Warmup
- When using new dedicated IP, ramp sends: 100/day → 500 → 2000 → 5000 → full volume
- Built into cron worker — daily send limit config in site_integrations
- Warmup schedule stored in Resend config JSONB

### 5. Unsubscribe + Preference Center (Required for CAN-SPAM)
- One-click unsubscribe link in every email footer (RFC 8058)
- `List-Unsubscribe` header in all outbound emails
- Public preference page: unsubscribe, change frequency, manage topic tags
- Contact status updated immediately

### 6. List Hygiene
- Auto-flag contacts with no opens in 90 days as "cold"
- Re-engagement automation template: "We miss you" → if no response → auto-unsubscribe
- Contact cleanup dashboard showing cold/inactive contacts

---

## Implementation Order

**Priority: 23k existing subscribers (CSV from external tool) need broadcasts/marketing emails ASAP. Automations come second.**

### Phase 1: Database + Contacts (Foundation)
1. Migrations 098 (crm_contacts), 102 (broadcasts), 103 (email_events)
2. Contact server actions (CRUD, upsert, bulk import for existing 23k list)
3. Contacts admin page (with CSV import for migrating existing subs)
4. Unsubscribe page (public, required before sending any marketing email)

### Phase 2: Broadcasts + Marketing Emails
5. Audience sync actions (crm_contacts → Resend audiences)
6. Broadcast server actions (create, schedule, send via Resend Marketing API)
7. Broadcasts list page
8. Broadcast composer (audience filter, schedule, send)
9. Broadcast cron worker
10. Resend webhook → email_events recording (opens, clicks, bounces, complaints)
11. Sidebar navigation update (Email CRM section)

### Phase 3: Deliverability + List Health
12. Engagement scoring cron job
13. Auto-suppression logic (bounces, complaints)
14. Domain health checker
15. Deliverability dashboard (email-health page)
16. Broadcast report stats
17. List hygiene tools

### Phase 4: Automations (Transactional)
18. Migrations 099 (automations), 100 (automation_steps), 101 (automation_enrollments)
19. Automation + step server actions
20. Replace mock automations list page
21. Build automation builder with visual timeline
22. Enrollment server actions
23. Automation email template + extend EmailService
24. Automation cron worker
25. Pipeline report page (automation funnels)

### Phase 5: Integration + Polish
26. Add `createOrUpsertContact` to lead magnet signup route
27. Add enrollment to lead magnet signup route
28. Add enrollment + goal tracking to Stripe webhook
29. Send throttling / IP warmup logic

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Contact dedup | `UNIQUE(site_id, email)` with upsert | Simple, prevents duplicates |
| Step delays | Minutes from enrollment, not relative | Simpler worker query |
| Scheduler | System cron hitting API routes every 5 min | Zero new infrastructure |
| Email tracking | Dedicated `email_events` table | Enables deliverability analytics + engagement scoring |
| Automation branching | None (V1) | Ordered list of timed emails is sufficient |
| Goal tracking | Optional, purchase-based only | Check on Stripe webhook |
| Contacts vs product_orders | Separate table | Contacts are long-lived; orders are events |
| CRM location | Hub app | Tightly coupled to products/lead magnets |
| Dedicated IP | Add at $30/mo when > 500 emails/day | Protects domain reputation at scale |
| No Beehiiv | Everything on Resend | Unified data, tight integration, no vendor split |
| Broadcast sending | Resend Marketing API | Unlimited sends under contact-based pricing, not per-email transactional quota |
| Contact sync | crm_contacts → Resend audiences | Our DB is source of truth, synced to Resend for broadcast delivery |
| Automations | Resend transactional API | Per-email pricing ($20/mo Pro), event-triggered 1:1 sends |

---

## Verification

1. Create a test automation: lead magnet trigger → 3 email steps (0 min, 1 min, 2 min delays for testing)
2. Sign up for the lead magnet on the frontend
3. Verify: CRM contact created, enrollment created
4. Trigger cron endpoint manually: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/automations`
5. Verify: emails sent via Resend, enrollment advances through steps
6. Test unsubscribe link in email → contact status changes to 'unsubscribed'
7. Create a broadcast → filter audience by tag → send → verify delivery stats
8. Check deliverability dashboard shows domain health + metrics
9. Verify bounce webhook auto-suppresses contact
10. Check engagement scores recalculate after cron runs
11. Test goal tracking: purchase the goal product, verify enrollment marked as goal_met
