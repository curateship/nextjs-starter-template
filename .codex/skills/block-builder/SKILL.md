---
name: block-builder
description: Standardized process for adding new blocks to any content type builder (product, page, post, category, directory, event, user-page). Use this skill whenever the user wants to add a new block, create a block component, scaffold a block, or add a new section type to any builder. Also trigger when the user mentions adding features like "add a testimonials block to products" or "create a pricing block for events" — even if they don't say "block" explicitly. This skill ensures consistency across the 5 files that must be touched for every new block.
---

# Block Builder

This skill standardizes how new blocks are added to the builder system. Every block requires changes to exactly 5 files across 3 layers. Skipping any of these creates broken or invisible blocks.

## Architecture Overview

The project has 7 content type builders, each following the same pattern:

| Builder | Config Constant | Admin Path | Frontend Path |
|---------|----------------|------------|---------------|
| product | `PRODUCT_BLOCK_TYPES` | `admin/product-builder/blocks/` | `frontend/products/` |
| page | `PAGE_BLOCK_TYPES` | `admin/page-builder/blocks/` | `frontend/pages/` |
| post | `POST_BLOCK_TYPES` | `admin/post-builder/blocks/` | `frontend/posts/` |
| category | `CATEGORY_BLOCK_TYPES` | `admin/category-builder/blocks/` | `frontend/categories/` |
| directory | `DIRECTORY_BLOCK_TYPES` | `admin/directory-builder/blocks/` | `frontend/directories/` |
| event | `EVENT_BLOCK_TYPES` | `admin/event-builder/blocks/` | `frontend/events/` |
| user-page | `USER_PAGE_BLOCK_TYPES` | `admin/user-page-builder/blocks/` | `frontend/user-pages/` |

All paths are relative to `src/components/`. Config files live in `src/config/`.

## The 5 Files to Touch

For every new block, modify or create these files in order:

### 1. Block Type Config (`src/config/{entity}-block-types.tsx`)

Add an entry to the block types array. This registers the block so it shows up in the block selection modal.

```tsx
{
  type: '{entity}-{block-name}',      // unique identifier, prefixed with entity
  name: '{Display Name}',              // shown in selection modal
  icon: SomeIcon,                      // import from lucide-react
  description: 'What this block does', // shown in selection modal
  defaultContent: {                    // initial data when block is added
    header: '',
    // ... fields matching what the admin component expects
    visibility: {}                     // element visibility toggles (defaults to all visible)
  },
  conflictsWith: ['other-block-type']  // optional: mutually exclusive blocks
}
```

**Naming convention for `type`:**
- Product blocks: `product-{name}` (e.g., `product-faq`, `product-hero`)
- Page blocks: just `{name}` (e.g., `faq`, `hero`, `divider`) — page blocks historically omit the prefix
- All other builders: `{entity}-{name}` (e.g., `event-content`, `post-content`)

Import the icon at the top of the file from `lucide-react`.

### 2. Admin Block Component (`src/components/admin/{entity}-builder/blocks/{block-name}/{EntityBlockName}Block.tsx`)

Create the admin editing UI. This is what users see in the block properties panel when they click on a block.

**File location:** Each block gets its own folder under `blocks/`. The component file is named `{Entity}{BlockName}Block.tsx`.

Every admin block component must have:
- A **Back button** at the top (using `onBack` callback)
- **Content and Settings tabs** (using shadcn Tabs)
- **Element Visibility settings** in the Settings tab (using the `VisibilitySettings` component)

**Pattern:**

```tsx
"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VisibilitySettings } from "@/components/admin/page-builder/blocks/shared/VisibilitySettings"

interface {Entity}{BlockName}BlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
  siteId?: string
  blockId?: string
}

export function {Entity}{BlockName}Block({
  content,
  onContentChange,
  onBack,
  siteId,
  blockId,
}: {Entity}{BlockName}BlockProps) {
  const [activeTab, setActiveTab] = useState('content')

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="px-6 pt-6 flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-3.5 h-4 mr-1.5" />
            Back
          </Button>
        )}
        <TabsList className="gap-1">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
      </div>

      {/* Content Tab */}
      <TabsContent value="content" className="mt-6">
        <div className="px-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Section Header</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Header</Label>
                <Input
                  value={content.header ?? ''}
                  onChange={(e) => onContentChange('header', e.target.value)}
                  placeholder="Enter header..."
                />
              </div>
              <div className="space-y-2">
                <Label>Subheader</Label>
                <Input
                  value={content.subheader ?? ''}
                  onChange={(e) => onContentChange('subheader', e.target.value)}
                  placeholder="Enter subheader..."
                />
              </div>
            </CardContent>
          </Card>
          {/* Add more Cards for block-specific content fields */}
        </div>
      </TabsContent>

      {/* Settings Tab */}
      <TabsContent value="settings" className="mt-6">
        <div className="px-6 space-y-6">
          <VisibilitySettings
            visibility={content.visibility}
            onChange={(v) => onContentChange('visibility', v)}
            fields={[
              { key: 'title', label: 'Title' },
              { key: 'subtitle', label: 'Subtitle' },
              // Add fields matching the visible elements of this block
            ]}
          />
        </div>
      </TabsContent>
    </Tabs>
  )
}
```

**Key conventions:**
- `onBack` callback renders the Back button — always include it in props
- Content tab holds the block's editing UI (Cards with form fields)
- Settings tab holds VisibilitySettings (and any other configuration)
- `VisibilitySettings` is imported from `@/components/admin/page-builder/blocks/shared/VisibilitySettings` — it's a shared component usable by all builders
- The `fields` array for VisibilitySettings should list every user-facing element the block renders (title, subtitle, images, buttons, etc.)
- All content props are optional with `?:` and have defaults
- Use shadcn/ui components (`Card`, `Input`, `Label`, `Select`, etc.)
- For list/array data, manage local state with `useState` and sync via `onContentChange`
- `siteId` and `blockId` are passed for blocks that need to upload images or make API calls
- Always use shadcn/ui components for all UI elements — never use raw HTML inputs, selects, buttons, etc. Key shadcn components: `Button`, `Input`, `Label`, `Select`/`SelectTrigger`/`SelectContent`/`SelectItem`, `Switch`, `Textarea`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `Accordion`, `Separator`. Import from `@/components/ui/{component}`

### 3. BlockPropertiesPanel Wiring (`src/components/admin/{entity}-builder/layout/BlockPropertiesPanel.tsx`)

Add a conditional render block for the new block type. This connects the admin component to the builder.

**Add import at top:**
```tsx
import { {Entity}{BlockName}Block } from "@/components/admin/{entity}-builder/blocks/{block-name}/{Entity}{BlockName}Block"
```

**Add conditional render in the component body** (alongside existing block type checks):
```tsx
{selectedBlock.type === '{entity}-{block-name}' && (
  <{Entity}{BlockName}Block
    content={selectedBlock.content}
    onContentChange={updateBlockContent}
    onBack={() => onSelectBlock(null)}
    siteId={siteId}
    blockId={selectedBlock.id}
  />
)}
```

The `content` prop passes the full block content object, `onContentChange` maps to `updateBlockContent`, and `onBack` deselects the block. Check existing blocks in the same builder to match how `onBack` is wired — some builders use `onSelectBlock(null)`, others may use a different deselect mechanism.

### 4. BlockListPanel Icon & Name (`src/components/admin/{entity}-builder/layout/BlockListPanel.tsx`)

The BlockListPanel displays blocks in the sidebar with icons and names. It uses hardcoded `getBlockIcon()` and `getBlockTypeName()` functions that need entries for each block type.

**Add a case to `getBlockIcon()`:**
```tsx
case '{entity}-{block-name}':
  return <SomeIcon className="w-3.5 h-3.5" />
```

**Add a case to `getBlockTypeName()`:**
```tsx
block.type === '{entity}-{block-name}' ? '{Display Name}' :
```

Import the icon from `lucide-react` at the top of the file. Use the same icon chosen in the block type config (step 1).

### 5. Frontend Block Component + Renderer Wiring

Two parts here — create the display component and wire it into the renderer.

**a) Create the frontend component:**

Location: `src/components/frontend/{entity-plural}/{block-name}/{Entity}{BlockName}Block.tsx`

```tsx
"use client"

import { BlockContainer } from "@/components/frontend/layout/block-container"

interface {Entity}{BlockName}BlockProps {
  content?: {
    header?: string
    subheader?: string
    headerAlign?: string
    // ... fields matching defaultContent
  }
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function {Entity}{BlockName}Block({
  content,
  siteWidth,
  customWidth,
}: {Entity}{BlockName}BlockProps) {
  return (
    <BlockContainer
      header={{
        title: content?.header ?? '',
        subtitle: content?.subheader ?? '',
        align: (content?.headerAlign as "left" | "center" | "right") ?? "center"
      }}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      {/* Block display content goes here */}
    </BlockContainer>
  )
}
```

**Key conventions:**
- Frontend components receive a single `content` object (not individual props)
- Always accept `siteWidth` and `customWidth` for layout consistency
- Use `BlockContainer` wrapper for consistent spacing, headers, and width constraints
- All props are optional with sensible defaults
- No callbacks — frontend blocks are read-only

**b) Wire into the renderer:**

File: `src/components/frontend/{entity-plural}/{Entity}BlockRenderer.tsx`

Add import and conditional render:

```tsx
import { {Entity}{BlockName}Block } from "@/components/frontend/{entity-plural}/{block-name}/{Entity}{BlockName}Block"

// Inside the block map:
if (block.type === '{entity}-{block-name}') {
  return (
    <{Entity}{BlockName}Block
      key={`{entity}-{block-name}-${block.id}`}
      content={block.content as any}
      siteWidth={siteWidth}
      customWidth={customWidth}
    />
  )
}
```

## Reference Docs

- `.claude/docs/how-tos/how-to-add-blocks.md` — step-by-step guide for adding blocks
- `.claude/docs/how-tos/how-to-add-block-styles.md` — how to add style variants to blocks

## Checklist

When adding a new block, verify all 5 steps are done:

- [ ] Block type added to `src/config/{entity}-block-types.tsx` with `type`, `name`, `icon`, `description`, `defaultContent`
- [ ] Admin component created at `src/components/admin/{entity}-builder/blocks/{block-name}/{Entity}{BlockName}Block.tsx`
- [ ] BlockPropertiesPanel updated with import + conditional render at `src/components/admin/{entity}-builder/layout/BlockPropertiesPanel.tsx`
- [ ] BlockListPanel updated with icon + name at `src/components/admin/{entity}-builder/layout/BlockListPanel.tsx`
- [ ] Frontend component created at `src/components/frontend/{entity-plural}/{block-name}/{Entity}{BlockName}Block.tsx` AND wired into `{Entity}BlockRenderer.tsx`

## Entity Reference

| Entity | Config File | Admin Builder Dir | Frontend Dir | Renderer File |
|--------|-------------|-------------------|-------------|---------------|
| product | `product-block-types.tsx` | `product-builder` | `products` | `ProductBlockRenderer.tsx` |
| page | `page-block-types.tsx` | `page-builder` | `pages` | `PageBlockRenderer.tsx` |
| post | `post-block-types.tsx` | `post-builder` | `posts` | `PostBlockRenderer.tsx` |
| category | `category-block-types.tsx` | `category-builder` | `categories` | `CategoryBlockRenderer.tsx` |
| directory | `directory-block-types.tsx` | `directory-builder` | `directories` | `DirectoryBlockRenderer.tsx` |
| event | `event-block-types.tsx` | `event-builder` | `events` | `EventBlockRenderer.tsx` |
| user-page | `user-page-block-types.tsx` | `user-page-builder` | `user-pages` | *check for UserPageBlockRenderer* |
