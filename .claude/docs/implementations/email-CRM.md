# Email Newsletter System

## What's Built

### Database Tables
| Table | Migration | Description |
|-------|-----------|-------------|
| `newsletter_contacts` | 098 | Subscribers: email, status, bounce_count, engagement_score, last_engaged_at, metadata (first_name, last_name, source, tags) |
| `newsletters` | 099 | Email campaigns: name, subject, content, status, audience_filter, send stats |
| `newsletter_events` | 100 | Tracking: sent/opened/clicked/bounced/complained per contact per newsletter |

### Server Actions (all in `/src/lib/actions/newsletters/`)

**`contact-actions.ts`** — Contact CRUD
- `getContactsBySite(siteId, options)` — paginated, filterable by source/status
- `createOrUpsertContact(...)` — upsert on (site_id, email), metadata has first_name/last_name/source/tags
- `bulkImportContacts(...)` — batched upsert with dedup, max 50k
- `updateContact(contactId, { metadata, status })` — merge metadata
- `deleteContacts(contactIds)` — bulk delete with ownership check
- `getContactStats(siteId)` — counts by status and source
- `unsubscribeContact(siteId, email, token)` — public, HMAC-signed

**`newsletter-actions.ts`** — Newsletter CRUD + sending
- `getNewslettersBySite(siteId)` — list all
- `getNewsletterById(newsletterId)` — single with auth
- `createNewsletter(...)` — creates in `newsletters` table
- `updateNewsletter(newsletterId, updates)` — name, subject, content, status, audience_filter
- `deleteNewsletters(ids)` — bulk delete
- `sendNewsletter(newsletterId)` — sends to matching contacts via Resend, records events, adds unsubscribe footer + List-Unsubscribe header
- `sendTestNewsletter(newsletterId, testEmail)` — preview to single email

**`audience-sync-actions.ts`** — Resend audience management
- `getOrCreateResendAudience(siteId)` — creates Resend audience, stores ID in site_integrations
- `syncContactsToResend(siteId)` — syncs active contacts to Resend
- `getAudienceCount(siteId, filter)` — live count matching audience filter

### Admin UI

**Newsletters Dashboard** — `/src/app/admin/newsletters/page.tsx`
- List with checkboxes, bulk delete, status tabs (All/Drafts/Sent)
- Cog icon → settings modal, trash icon → delete
- Click name → composer page
- Create newsletter modal (Dialog pattern, 840px)

**Newsletter Composer** — `/src/app/admin/newsletters/[newsletterId]/page.tsx`
- Name + subject inputs
- RichTextEditor for content
- Audience filter by tags with live contact count
- Send test email
- Save Draft / Send with confirmation dialog

**Contacts** — `/src/app/admin/newsletters/contacts/page.tsx`
- Table with checkboxes, bulk delete, source tabs
- CSV import with Flodesk-style column mapping (shows each CSV column → dropdown to map to our field)
- Add contact modal, edit contact modal (Dialog pattern, 840px)
- Cog icon → edit, trash icon → delete
- Server-side pagination

**Unsubscribe** — `/src/app/unsubscribe/page.tsx` (public, no auth)
- HMAC-signed token required (prevents mass unsubscription abuse)
- One-click unsubscribe

### Cron Workers
- `/src/app/api/cron/newsletters/route.ts` — processes scheduled newsletters (protected by CRON_SECRET)

### Webhook
- `/src/app/api/webhooks/resend/route.ts` — records opens/clicks/bounces/complaints to `newsletter_events`, auto-suppresses bounced/complained contacts, updates newsletter open/click counts

### Sidebar
- Newsletters in contentNavItems with "Contacts" dropdown sub-item

### Utilities
- `/src/lib/utils/unsubscribe-token.ts` — HMAC-SHA256 token generation/verification

---

## What's Next

### Phase 3: Deliverability + List Health
12. Engagement scoring cron job (`/api/cron/engagement`) — recalculate scores from newsletter_events
13. Auto-suppression already done in webhook (bounces + complaints)
14. Domain health checker — DNS lookup for SPF/DKIM/DMARC
15. Deliverability dashboard — `/admin/newsletters/email-health`
16. Newsletter report stats (open rate, click rate per newsletter)
17. List hygiene tools (flag cold contacts, re-engagement)

### Phase 4: Email Automations (Transactional Drip Sequences)
New tables: `email_automations`, `email_automation_steps`, `email_automation_enrollments`

**DO NOT touch `/src/app/admin/automations/` — that is a separate general-purpose automation system.**

Email automations live under the newsletters section:

Actions in `/src/lib/actions/newsletters/`:
- `automation-actions.ts` — CRUD for email drip sequences
- `step-actions.ts` — CRUD for steps within a drip sequence
- `enrollment-actions.ts` — enroll/cancel/advance contacts

UI (under newsletters, not automations):
- `/src/app/admin/newsletters/automations/page.tsx` — list of email drip sequences
- `/src/app/admin/newsletters/automations/[automationId]/page.tsx` — visual timeline builder
- `/src/app/admin/newsletters/automations/[automationId]/report/page.tsx` — funnel report
- Add "Automations" to Newsletters sidebar dropdown

Cron: `/api/cron/email-automations` — process due steps every 5 min

### Phase 5: Integration + Polish
- Add `createOrUpsertContact` to lead magnet signup route
- Add enrollment to lead magnet signup route
- Add enrollment + goal tracking to Stripe webhook
- Send throttling / IP warmup logic

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Contact dedup | `UNIQUE(site_id, email)` with upsert | Simple, prevents duplicates |
| Contact metadata | first_name, last_name, source, tags in JSONB `metadata` | Flexible, fewer columns |
| Newsletter sending | Resend transactional API (per-email) | Individual unsubscribe links + tracking per contact |
| Event tracking | Dedicated `newsletter_events` table | Enables deliverability analytics |
| Scheduler | System cron hitting API routes every 5 min | Zero new infrastructure |
| Unsubscribe security | HMAC-signed tokens | Prevents mass unsubscription abuse |
| No Beehiiv | Everything on Resend | Unified data, tight integration, no vendor split |

---

## File Structure

```
src/lib/actions/newsletters/
  contact-actions.ts          # Contact CRUD + import + unsubscribe
  newsletter-actions.ts       # Newsletter CRUD + send
  audience-sync-actions.ts    # Resend audience sync

src/app/admin/newsletters/
  page.tsx                    # Newsletters list dashboard
  [newsletterId]/page.tsx     # Newsletter composer
  contacts/page.tsx           # Contacts dashboard
  new/page.tsx                # (legacy, unused)

src/app/unsubscribe/
  page.tsx                    # Public unsubscribe page
  UnsubscribeForm.tsx         # Client component

src/app/api/cron/newsletters/route.ts    # Scheduled send cron
src/app/api/webhooks/resend/route.ts     # Event recording webhook

src/components/admin/newsletter-builder/layout/
  CreateNewsletterModal.tsx
  NewsletterSettingsModal.tsx

src/lib/utils/unsubscribe-token.ts       # HMAC tokens

supabase/migrations/
  098_create_newsletter_contacts.sql
  099_create_newsletters.sql
  100_create_newsletter_events.sql
```
