# Automation & Newsletter Builder Integration

The automation email builder and the newsletter builder share the same block-based editor system. They use identical UI components but persist data to different database tables.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Page Layer                           │
│  newsletters/[newsletterId]/page.tsx                        │
│  newsletters/automations/[automationId]/email/[stepId]/page │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                     Builder Hooks                           │
│  useNewsletterBuilder     useAutomationEmailBuilder         │
│  (newsletters table)      (email_automation_steps table)    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   useBlockEditor (shared)                   │
│  Block state, add/delete/reorder/update, JSON conversion    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                 Shared UI Components                        │
│  NewsletterCanvas, BlockPropertiesPanel, BlockListPanel,    │
│  BlockSelectionModal, StickyHeader                          │
└─────────────────────────────────────────────────────────────┘
```

## Hook Hierarchy

### useBlockEditor (shared foundation)
**File:** `src/components/admin/newsletter-builder/config/useBlockEditor.ts`

Manages pure block state with no knowledge of where data comes from:
- `blocks[]` — array of `NewsletterBlock` objects
- `selectedBlock` — currently selected block for editing
- `setBlocks()` — bulk replace (used on load)
- `updateBlockContent(blockId, field, value)` — update a single field
- `handleDeleteBlock(blockId)` — remove a block
- `handleReorderBlocks(blocks)` — set new order (from drag-and-drop)
- `handleAddBlocks(selections)` — create new blocks from type + quantity

Provides two JSON conversion utilities:
- `parseBlocksFromJson(json)` — DB JSON → block objects, sorted by `display_order`
- `blocksToJson(blocks)` — block objects → DB JSON with `display_order` indices

### useNewsletterBuilder
**File:** `src/components/admin/newsletter-builder/config/useNewsletterBuilder.ts`

Wraps `useBlockEditor` with newsletter-specific data loading and saving:
- Loads from `getNewsletterById()` → sets blocks + subject
- Saves via `updateNewsletter()` → sends `{ subject, content_blocks }`
- Exposes `subject` / `setSubject` for inline subject editing
- Exposes `reloadNewsletter()` for manual refresh

### useAutomationEmailBuilder
**File:** `src/components/admin/newsletter-builder/config/useAutomationEmailBuilder.ts`

Wraps `useBlockEditor` with automation step data loading and saving:
- Loads from `getStepById()` + `getAutomationById()` → sets blocks + subject
- Saves via `updateStep()` → sends `{ subject, content_blocks }`
- Exposes `subject` / `setSubject` for inline subject editing
- Also loads parent automation metadata (name, for breadcrumbs)

## Data Flow

### Load
```
Page mounts
  → Builder hook calls server action (getNewsletterById / getStepById)
  → Receives record with content_blocks JSON
  → parseBlocksFromJson() converts to block objects
  → Sets blocks[] and subject in state
```

### Edit
```
User clicks block on canvas → setSelectedBlock()
  → BlockPropertiesPanel shows block editor component
  → User edits field → onContentChange(field, value)
  → updateBlockContent(blockId, field, value)
  → blocks[] state updates → canvas re-renders preview
```

### Save
```
User clicks Save
  → blocksToJson(blocks) converts state to DB format
  → Server action (updateNewsletter / updateStep) receives { subject, content_blocks }
  → Server parses blocks, calls generateEmailHtml() to create HTML
  → Stores content_blocks (JSON) + content (HTML) + subject in DB
```

## Database Differences

| | Newsletter Builder | Automation Email Builder |
|---|---|---|
| **Table** | `newsletters` | `email_automation_steps` |
| **Load params** | `newsletterId` | `stepId` + `automationId` |
| **Server actions** | `newsletter-actions.ts` | `automation-actions.ts` |
| **Subject** | `newsletters.subject` | `email_automation_steps.subject` |
| **Blocks JSON** | `newsletters.content_blocks` | `email_automation_steps.content_blocks` |
| **Generated HTML** | `newsletters.content` | `email_automation_steps.content` |

Both tables store the same structure:
- `content_blocks` — JSONB with block definitions keyed by block ID
- `content` — generated email HTML (rebuilt on every save from blocks)
- `subject` — email subject line string

## Block JSON Structure (in database)

```json
{
  "newsletter-header-1234567890": {
    "id": "newsletter-header-1234567890",
    "type": "newsletter-header",
    "content": { "logoUrl": "...", "alignment": "center", ... },
    "display_order": 0
  },
  "newsletter-rich-text-1234567891": {
    "id": "newsletter-rich-text-1234567891",
    "type": "newsletter-rich-text",
    "content": { "htmlContent": "<p>...</p>", "padding": 20, ... },
    "display_order": 1
  }
}
```

## Shared UI Components

### NewsletterCanvas
**File:** `src/components/admin/newsletter-builder/layout/NewsletterCanvas.tsx`

Live preview of the email. Renders:
1. **Subject line** — editable inline input at top (via `onSubjectChange` prop), or clickable text (via `onSubjectClick` prop)
2. **Block previews** — simplified renderers for each block type (CanvasHeaderBlock, CanvasRichTextBlock, CanvasDividerBlock, CanvasFooterBlock)
3. **Hover effect** — blue dashed border on hover (CSS `canvas-block` class)

Supports responsive preview widths: desktop (600px), tablet (480px), mobile (320px).

### BlockPropertiesPanel
**File:** `src/components/admin/newsletter-builder/layout/BlockPropertiesPanel.tsx`

Left panel that shows either:
- **Canvas** (when no block selected) — the full email preview
- **Block editor** (when a block is selected) — routes to the specific block component based on `selectedBlock.type`

### BlockListPanel
**File:** `src/components/admin/newsletter-builder/layout/BlockListPanel.tsx`

Right sidebar with:
- Draggable block list (via `@dnd-kit`)
- Click to select/edit
- Delete with confirmation dialog

### BlockSelectionModal
**File:** `src/components/admin/newsletter-builder/layout/BlockSelectionModal.tsx`

Modal for adding new blocks — shows all 4 block types with quantity selectors.

## Block Types

All defined in `src/components/admin/newsletter-builder/config/newsletter-block-types.tsx`.

| Type | Editor Component | Canvas Renderer |
|---|---|---|
| `newsletter-header` | `blocks/header/NewsletterHeaderBlock.tsx` | `CanvasHeaderBlock` (in canvas) |
| `newsletter-rich-text` | `blocks/rich-text/NewsletterRichTextBlock.tsx` | `CanvasRichTextBlock` (in canvas) |
| `newsletter-divider` | `blocks/divider/NewsletterDividerBlock.tsx` | `CanvasDividerBlock` (in canvas) |
| `newsletter-footer` | `blocks/footer/NewsletterFooterBlock.tsx` | `CanvasFooterBlock` (in canvas) |

Each editor component uses tabs (Content / Styling / Settings) via `AdminLayout` wrapper.

## Email HTML Generation

**File:** `src/lib/actions/newsletters/email-html.ts`

`generateEmailHtml(blocks, maxWidth)` creates email-client-safe HTML:
- Table-based layout (for Outlook/email client compatibility)
- MSO conditional comments
- Inline styles only (no CSS classes)
- Called server-side during save, not client-side

## Page Layout

Both builder pages use the same layout structure:

```
┌──────────────────────────────────────────────────────────────┐
│ StickyHeader                                                 │
│ [Breadcrumbs]                    [Preview Toggles] [Save] [+]│
├───────────────────────────────────────────┬──────────────────┤
│                                           │                  │
│  BlockPropertiesPanel                     │  BlockListPanel   │
│  ┌─────────────────────────────────────┐  │  ┌────────────┐  │
│  │ Subject: [editable inline input]    │  │  │ Header   ≡ │  │
│  │ ┌─────────────────────────────────┐ │  │  │ Rich Text≡ │  │
│  │ │ [Logo]                          │ │  │  │ Divider  ≡ │  │
│  │ │ [Rich text content]             │ │  │  │ Footer   ≡ │  │
│  │ │ [Divider]                       │ │  │  └────────────┘  │
│  │ │ [Footer]                        │ │  │                  │
│  │ └─────────────────────────────────┘ │  │                  │
│  └─────────────────────────────────────┘  │                  │
└───────────────────────────────────────────┴──────────────────┘
```

## File Map

```
src/components/admin/newsletter-builder/
├── config/
│   ├── useBlockEditor.ts              # Shared block state management
│   ├── useNewsletterBuilder.ts        # Newsletter-specific hook
│   ├── useAutomationEmailBuilder.ts   # Automation-specific hook
│   └── newsletter-block-types.tsx     # Block type definitions
├── layout/
│   ├── NewsletterCanvas.tsx           # Live email preview
│   ├── BlockPropertiesPanel.tsx       # Left panel (canvas or editor)
│   ├── BlockListPanel.tsx             # Right sidebar block list
│   ├── BlockSelectionModal.tsx        # Add blocks modal
│   └── StickyHeader.tsx               # Top header bar
└── blocks/
    ├── header/NewsletterHeaderBlock.tsx
    ├── rich-text/NewsletterRichTextBlock.tsx
    ├── divider/NewsletterDividerBlock.tsx
    └── footer/NewsletterFooterBlock.tsx

src/app/admin/newsletters/
├── [newsletterId]/page.tsx            # Newsletter builder page
└── automations/[automationId]/
    └── email/[stepId]/page.tsx        # Automation email builder page

src/lib/actions/newsletters/
├── newsletter-actions.ts             # Newsletter CRUD + send
├── automation-actions.ts             # Automation + step CRUD
└── email-html.ts                     # HTML generation from blocks
```
