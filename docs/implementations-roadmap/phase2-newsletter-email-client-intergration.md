# Newsletter Email Client Integration (Conversations / Inbox)

## Overview

A CRM-style inbox built on top of the existing newsletter system. Uses Resend's inbound email feature to capture replies to newsletters and automations, display them in the admin dashboard, and allow responding from within the app. Not a full email client — no Gmail/IMAP integration needed. Everything routes through the domain already configured for Resend.

**Complexity: 6/10** — moderate, mostly follows existing patterns.

---

## How It Works

1. Outbound newsletters/automations include a `Reply-To` header pointing to the site's configured email (e.g., `hello@yourdomain.com`)
2. When someone replies, Resend receives it (catch-all on the domain) and fires an `email.received` webhook
3. The webhook handler fetches the full email body via `resend.emails.receiving.get(email_id)`, matches the sender to a newsletter contact, and stores it as a conversation message
4. Admin sees the reply in the Inbox, can read it and respond — the response sends via Resend and gets stored in the same conversation thread

---

## Architecture

- **One conversation per contact per site** (helpdesk model, not Gmail-style threading)
- **Resend inbound** via `email.received` webhook → fetch full content via `resend.emails.receiving.get(id)`
- **Reply-To headers** added to all outbound emails so replies route back through Resend
- **Webhook handler** extended to capture matched `site_id` during Svix verification (currently only tracks `verified` boolean, discards which integration matched)

### Resend Inbound Details

- Webhook event: `email.received` with payload `{ email_id, from, to, subject, attachments[] }`
- Webhook does NOT include email body — requires a second API call to fetch HTML/text/headers
- Resend acts as catch-all for configured domains (any address @domain receives)
- Same Svix HMAC-SHA256 signature verification as outbound events
- DNS: MX records needed on the domain (or use a subdomain to avoid conflicts with existing email)

---

## Database Schema

### Migration: `109_create_conversations.sql`

#### `conversations`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| site_id | UUID FK → sites | NOT NULL, ON DELETE CASCADE |
| contact_id | UUID FK → newsletter_contacts | nullable, ON DELETE SET NULL |
| contact_email | VARCHAR(255) | NOT NULL — always stored even if contact is deleted |
| contact_name | VARCHAR(255) | nullable |
| subject | VARCHAR(500) | subject of first message |
| status | VARCHAR(20) | 'open' / 'closed' / 'archived', default 'open' |
| is_read | BOOLEAN | default false |
| last_message_at | TIMESTAMPTZ | updated on each new message |
| message_count | INTEGER | default 0 |
| metadata | JSONB | default '{}' |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Indexes:**
- `(site_id, status, last_message_at DESC)` — inbox list query
- `(site_id, contact_email)` — find existing conversation for sender
- `(site_id, is_read) WHERE is_read = false` — unread count

**RLS:** Site ownership via `sites.user_id = auth.uid()` (same pattern as all newsletter tables)

#### `conversation_messages`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| conversation_id | UUID FK → conversations | NOT NULL, ON DELETE CASCADE |
| site_id | UUID FK → sites | NOT NULL, ON DELETE CASCADE |
| direction | VARCHAR(10) | 'inbound' / 'outbound' |
| from_email | VARCHAR(255) | NOT NULL |
| to_email | VARCHAR(255) | NOT NULL |
| subject | VARCHAR(500) | nullable |
| body_html | TEXT | nullable |
| body_text | TEXT | nullable |
| resend_message_id | VARCHAR(255) | for outbound: Resend's message ID |
| resend_email_id | VARCHAR(255) | for inbound: the email.received ID |
| headers | JSONB | In-Reply-To, References, Message-ID |
| metadata | JSONB | default '{}' |
| created_at | TIMESTAMPTZ | |

**Indexes:**
- `(conversation_id, created_at ASC)` — thread view
- `(resend_message_id)` — webhook correlation
- `(site_id, created_at DESC)` — global message list

**RLS:** Same site ownership pattern

---

## Implementation Steps

### Step 1: Database Migration

Create `supabase/migrations/109_create_conversations.sql` with both tables, indexes, RLS policies, and updated_at trigger.

### Step 2: Extend Webhook Handler

**Modify:** `src/app/api/webhooks/resend/route.ts`

1. Capture `matchedSiteId` and `matchedConfig` from the Svix verification loop (currently only `verified` boolean is tracked — the loop breaks without storing which integration matched)
2. Add `email.received` handler after signature verification, before existing event recording:
   - Extract `from`, `to`, `subject`, `email_id` from webhook data
   - Call `resend.emails.receiving.get(email_id)` using the matched site's API key to fetch body_html, body_text, headers
   - Look up existing `newsletter_contacts` by (site_id, from_email) — if found, link via contact_id
   - Find or create `conversations` record by (site_id, contact_email)
   - Insert `conversation_messages` record (direction: 'inbound')
   - Update conversation: last_message_at, increment message_count, set is_read = false
   - Return early after recording inbound email events

### Step 3: Server Actions

**Create:** `src/lib/actions/newsletters/conversation-actions.ts`

Follow existing patterns from `newsletter-actions.ts` and `contact-actions.ts`:

| Action | Description |
|--------|-------------|
| `getConversationsBySite(siteId, filters?)` | Paginated list sorted by last_message_at DESC. Filters: status, is_read, search (email/name) |
| `getConversationById(conversationId)` | Single conversation + all messages ordered by created_at ASC |
| `markConversationRead(conversationId)` | Set is_read = true |
| `updateConversationStatus(conversationId, status)` | open / closed / archived |
| `sendReply(conversationId, bodyHtml)` | Send via Resend, insert outbound message, set In-Reply-To/References headers from last inbound |
| `getInboxStats(siteId)` | Counts: total open, unread, closed |

All actions must verify auth + site ownership independently (not rely on middleware).

### Step 4: Add Reply-To to Outbound Emails

**Modify:** `src/lib/actions/integrations/config-helpers.ts`
- Add `replyToEmail` to `getResendConfig()` return type (from `config.reply_to_email`, fallback to `fromEmail`)

**Modify:** `src/app/api/cron/newsletters/route.ts`
- Add `replyTo` field to the `resend.emails.send()` call

**Modify:** `src/app/api/cron/email-automations/route.ts`
- Same: add `replyTo` to automation email sends

### Step 5: Inbox List Page

**Create:** `src/app/admin/newsletters/inbox/page.tsx`

- StickyHeader with newsletter navLinks (add "Inbox")
- Table: contact avatar + name/email, subject/preview snippet, status badge (open/closed), relative time, unread indicator (bold + dot)
- Tabs: All | Unread | Open | Closed
- Click row → `/admin/newsletters/inbox/[conversationId]`
- Pagination using existing components

### Step 6: Conversation Detail Page

**Create:** `src/app/admin/newsletters/inbox/[conversationId]/page.tsx`

- StickyHeader breadcrumbs: Newsletters > Inbox > [Contact Name]
- Contact info bar: email, name, status toggle (open/closed), link to contact profile
- Message thread: chronological, inbound left-aligned (muted bg), outbound right-aligned (branded bg), timestamps
- Reply composer at bottom: simple textarea + Send button (not the block builder — this is quick replies)
- Auto-mark as read on page load

### Step 7: Navigation Updates

**Modify:** `src/components/admin/layout/sidebar/AppSidebar.tsx`
- Add `{ title: "Inbox", url: "/admin/newsletters/inbox" }` as first item in Newsletter sub-items (line 76)

**Modify:** All newsletter pages' StickyHeader navLinks to include "Inbox":
- `src/app/admin/newsletters/page.tsx`
- `src/app/admin/newsletters/contacts/page.tsx`
- `src/app/admin/newsletters/segments/page.tsx`
- `src/app/admin/newsletters/automations/page.tsx`
- `src/app/admin/newsletters/templates/page.tsx`
- `src/app/admin/newsletters/email-health/page.tsx`

---

## Files Summary

### Create
| File | Purpose |
|------|---------|
| `supabase/migrations/109_create_conversations.sql` | Database tables + RLS |
| `src/lib/actions/newsletters/conversation-actions.ts` | Server actions for CRUD + send |
| `src/app/admin/newsletters/inbox/page.tsx` | Inbox list page |
| `src/app/admin/newsletters/inbox/[conversationId]/page.tsx` | Conversation detail + reply |

### Modify
| File | Change |
|------|--------|
| `src/app/api/webhooks/resend/route.ts` | Handle `email.received`, capture matched site_id |
| `src/lib/actions/integrations/config-helpers.ts` | Add `replyToEmail` to Resend config |
| `src/app/api/cron/newsletters/route.ts` | Add reply-to header to sends |
| `src/app/api/cron/email-automations/route.ts` | Add reply-to header to sends |
| `src/components/admin/layout/sidebar/AppSidebar.tsx` | Add Inbox nav item |
| 6 newsletter pages | Add Inbox to StickyHeader navLinks |

### Reuse (no changes needed)
- Auth patterns from `newsletter-actions.ts` (verifyAuth, verifySiteOwnership)
- Resend SDK (already a dependency)
- Svix webhook verification (already implemented)
- `getResendConfig()` from config-helpers.ts
- Pagination, AdminPageHeader, StickyHeader components

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Threading model | One conversation per contact | Simpler than subject-based threading, matches CRM mental model |
| Inbound capture | Resend `email.received` webhook | Already using Resend, no new service needed |
| Body fetching | Inline API call in webhook | Resend webhook doesn't include body — must call `emails.receiving.get()` |
| Reply composer | Simple textarea, not block builder | Quick replies don't need newsletter-grade formatting |
| Contact linking | Match by (site_id, email) | Automatic linking to existing newsletter contacts |
| Unknown senders | Create conversation without contact_id | Still captured, can be linked later if contact is added |

---

## Gotchas

1. **Webhook doesn't include email body** — the `email.received` payload only has metadata (from, to, subject, email_id). Must call `resend.emails.receiving.get(email_id)` to get HTML/text. If this fails, store the email_id and show "Failed to load content" in the UI.

2. **HTML email rendering** — inbound emails can have wild CSS that breaks your layout. Render in an iframe or sanitize heavily with DOMPurify.

3. **MX records** — for inbound to work, the domain needs MX records pointing to Resend. If the domain already has MX records (e.g., Google Workspace), use a subdomain like `mail.yourdomain.com` to avoid conflicts.

4. **Webhook site matching** — the current webhook handler verifies the signature but discards which integration matched. Need to refactor the verification loop to also return `matchedSiteId` and `matchedConfig`.

5. **Catch-all behavior** — Resend receives ALL emails to the domain. The webhook handler must correctly route based on the `to` address domain matching the site's `from_email` domain.

---

## Future: AI Features (Phase 2)

Not in scope for initial implementation, but the foundation supports:

- **AI-drafted replies** — use site's Anthropic/OpenAI integration config to generate draft responses
- **Auto-categorization** — classify inbound as support, feedback, spam, etc.
- **Smart reply suggestions** — quick-reply chips based on message content
- **Auto-responders** — configurable auto-replies for common questions
- **Sentiment analysis** — flag negative sentiment for priority handling
