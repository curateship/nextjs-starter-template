# How to Add New Blocks to Product Builder

This guide walks you through the process of adding a new block type to the product builder. We'll use the Rich Text block as an example.

## Overview

Adding a new block type requires changes across multiple files in both the admin (builder) and frontend (rendering) sections of the application.

## Step-by-Step Guide

### 1. Create the Admin Block Component

**Location:** `src/components/admin/product-builder/blocks/`

Create a new file for your block editor component (e.g., `ProductRichTextEditorBlock.tsx`).

This component should:
- Accept `content` and `onContentChange` props
- Provide a user interface for editing the block's content
- Use the `Card` component from `@/components/ui/card` for consistent styling
- Handle all user interactions and state management

**Example:**
```tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface RichTextBlockProps {
  content: {
    // Define your content structure
    title?: string
    content: string
  }
  onContentChange: (content: any) => void
}

export function ProductRichTextEditorBlock({ content, onContentChange }: RichTextBlockProps) {
  // Your editor implementation
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Rich Text Content</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Your editor UI */}
      </CardContent>
    </Card>
  )
}
```

### 2. Update BlockPropertiesPanel

**Location:** `src/components/admin/product-builder/BlockPropertiesPanel.tsx`

1. **Import your new block component:**
```tsx
import { ProductRichTextEditorBlock } from "@/components/admin/product-builder/blocks/ProductRichTextEditorBlock"
```

2. **Add a handler for your block type:**

Add a new condition in the component's render method:

```tsx
{selectedBlock.type === 'rich-text' && (
  <ProductRichTextEditorBlock
    content={{
      title: selectedBlock.content.title || '',
      content: selectedBlock.content.content || '',
    }}
    onContentChange={(contentObj) => {
      updateBlockContent('title', contentObj.title)
      updateBlockContent('content', contentObj.content)
    }}
  />
)}
```

### 3. Update useProductBuilder Hook

**Location:** `src/hooks/useProductBuilder.ts`

1. **Add the handler function to the return type interface:**
```tsx
interface UseProductBuilderReturn {
  // ... existing handlers
  handleAddProductRichTextBlock: () => void
  // ...
}
```

2. **Create the add block handler:**
```tsx
const handleAddProductRichTextBlock = () => {
  addBlock('rich-text', 'Rich Text', {
    content: '<p>Add your content here...</p>'
  })
}
```

3. **Export the handler in the return statement:**
```tsx
return {
  // ... existing returns
  handleAddProductRichTextBlock,
  // ...
}
```

### 4. Update BlockTypesPanel

**Location:** `src/components/admin/product-builder/BlockTypesPanel.tsx`

1. **Import the icon from lucide-react:**
```tsx
import { FileText } from "lucide-react"
```

2. **Add the prop to the interface:**
```tsx
interface BlockTypesPanelProps {
  // ... existing props
  onAddProductRichTextBlock: () => void
}
```

3. **Add the prop to the component parameters:**
```tsx
export function BlockTypesPanel({
  // ... existing props
  onAddProductRichTextBlock
}: BlockTypesPanelProps) {
```

4. **Add a new block type button:**
```tsx
<div className="p-3 rounded-lg border bg-background flex items-center justify-between">
  <div className="flex items-center space-x-2">
    <FileText className="w-4 h-4" />
    <span className="font-medium">Rich Text</span>
  </div>
  <Button
    variant="ghost"
    size="sm"
    className="h-8 w-8 p-3 -m-2 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
    onClick={onAddProductRichTextBlock}
    title="Add rich text block"
  >
    <Plus className="w-4 h-4" />
  </Button>
</div>
```

### 5. Update BlockListPanel

**Location:** `src/components/admin/product-builder/BlockListPanel.tsx`

1. **Import the icon:**
```tsx
import { FileText } from "lucide-react"
```

2. **Add to getBlockTypeName function:**
```tsx
const getBlockTypeName = (block: ProductBlock) => {
  return block.type === 'product-default' ? 'Default Block' :
         // ... other cases
         block.type === 'rich-text' ? 'Rich Text' : 'Block'
}
```

3. **Add to getBlockIcon function:**
```tsx
const getBlockIcon = (blockType: string) => {
  switch (blockType) {
    // ... other cases
    case 'rich-text':
      return <FileText className="w-4 h-4" />
    default:
      return <div className="w-4 h-4" />
  }
}
```

### 6. Wire Up in Product Builder Page

**Location:** `src/app/admin/products/builder/[siteId]/page.tsx`

Add the handler prop to the BlockTypesPanel component:

```tsx
<BlockTypesPanel
  // ... existing props
  onAddProductRichTextBlock={builderState.handleAddProductRichTextBlock}
/>
```

### 7. Update Product Actions (Security)

**Location:** `src/lib/actions/products/product-actions.ts`

Add your block type to the allowed block types array in the `updateProductBlocksAction` function:

```tsx
const allowedBlockTypes = [
  'product-default',
  'product-hero',
  'product-details',
  'product-gallery',
  'product-features',
  'product-hotspot',
  'product-pricing',
  'faq',
  'listing-views',
  'rich-text', // Add your new block type
  '_settings'
]
```

### 8. Update Product Block Utils

**Location:** `src/lib/utils/product-block-utils.ts`

1. **Add to getProductBlockTitle function:**
```tsx
export function getProductBlockTitle(blockType: string): string {
  switch (blockType) {
    // ... other cases
    case 'rich-text':
      return 'Rich Text'
    default:
      return 'Product Block'
  }
}
```

2. **Add to allowed block types in convertContentBlocksToArray:**
```tsx
const allowedBlockTypes = [
  'product-default',
  'product-hero',
  'product-details',
  'product-gallery',
  'product-features',
  'product-hotspot',
  'product-pricing',
  'faq',
  'listing-views',
  'rich-text' // Add your new block type
]
```

### 9. Create Frontend Block Component

**Location:** `src/components/frontend/products/`

Create a new file for rendering the block on the frontend (e.g., `ProductRichTextBlock.tsx`).

**Example:**
```tsx
"use client"

import { BlockContainer } from "@/components/frontend/layout/block-container"

interface RichTextBlockProps {
  content: {
    title?: string
    subtitle?: string
    content: string
  }
  className?: string
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export function ProductRichTextBlock({
  content,
  className = "",
  siteWidth = 'custom',
  customWidth
}: RichTextBlockProps) {
  return (
    <BlockContainer
      header={{
        title: content.title,
        subtitle: content.subtitle,
        align: 'left'
      }}
      className={className}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      <div
        className="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: content.content }}
      />
    </BlockContainer>
  )
}
```

### 10. Update ProductBlockRenderer

**Location:** `src/components/frontend/products/ProductBlockRenderer.tsx`

1. **Import your frontend block component:**
```tsx
import { ProductRichTextBlock } from "@/components/frontend/products/ProductRichTextBlock"
```

2. **Add a renderer for your block type:**
```tsx
if (block.type === 'rich-text') {
  return (
    <ProductRichTextBlock
      key={`rich-text-${block.id}`}
      content={block.content}
      siteWidth={siteWidth}
      customWidth={customWidth}
    />
  )
}
```

## Checklist

Use this checklist when adding a new block type:

- [ ] Create admin block component in `src/components/admin/product-builder/blocks/`
- [ ] Import and add handler in `BlockPropertiesPanel.tsx`
- [ ] Add handler function in `useProductBuilder.ts`
- [ ] Add to interface return type in `useProductBuilder.ts`
- [ ] Export handler in return statement of `useProductBuilder.ts`
- [ ] Import icon in `BlockTypesPanel.tsx`
- [ ] Add prop to `BlockTypesPanelProps` interface
- [ ] Add prop to component parameters in `BlockTypesPanel.tsx`
- [ ] Add button UI in `BlockTypesPanel.tsx`
- [ ] Import icon in `BlockListPanel.tsx`
- [ ] Add case in `getBlockTypeName()` function
- [ ] Add case in `getBlockIcon()` function
- [ ] Wire up handler in product builder page `[siteId]/page.tsx`
- [ ] Add to allowed types in `product-actions.ts`
- [ ] Add case in `getProductBlockTitle()` in `product-block-utils.ts`
- [ ] Add to allowed types in `convertContentBlocksToArray()` in `product-block-utils.ts`
- [ ] Create frontend block component in `src/components/frontend/products/`
- [ ] Import and add renderer in `ProductBlockRenderer.tsx`

## Common Icons

Here are some commonly used Lucide React icons you might want to use:

- `FileText` - Document/text content
- `Image` - Images/gallery
- `Zap` - Hero/featured content
- `Star` - Features/highlights
- `DollarSign` - Pricing
- `HelpCircle` - FAQ/help
- `LayoutGrid` - Grid/listings
- `Package` - Products
- `Info` - Information
- `Target` - Hotspots/interactive
- `Calendar` - Events/dates
- `Users` - Team/people
- `Mail` - Contact/email
- `Video` - Video content

## Best Practices

1. **Naming Convention:** Use `Product[BlockName]Block` for admin components and the same for frontend components
2. **Type Safety:** Always define TypeScript interfaces for your content structure
3. **Security:** For user-generated content (like rich text), always sanitize with DOMPurify on the frontend
4. **Consistency:** Use the existing Card components and UI patterns for a consistent admin experience
5. **Accessibility:** Include proper ARIA labels and keyboard navigation
6. **Responsive Design:** Ensure your blocks work well on all screen sizes
7. **Default Content:** Provide sensible default values when creating new blocks
8. **Validation:** Validate content structure in both frontend and backend

## Example: Complete Rich Text Block Implementation

For a complete working example, refer to these files:
- Admin: `src/components/admin/product-builder/blocks/ProductRichTextEditorBlock.tsx`
- Frontend: `src/components/frontend/products/ProductRichTextBlock.tsx`
- Utils: `src/lib/utils/product-block-utils.ts`
- Actions: `src/lib/actions/products/product-actions.ts`

## Troubleshooting

### Block not appearing in the panel
- Check that you've added the handler to the `BlockTypesPanel` in the builder page
- Verify the icon is imported correctly

### Block not saving
- Ensure the block type is in the `allowedBlockTypes` array in `product-actions.ts`
- Check browser console for validation errors

### Block not loading after refresh
- Verify the block type is in `allowedBlockTypes` in `product-block-utils.ts`
- Check that `getProductBlockTitle()` has a case for your block type

### Block not rendering on frontend
- Ensure you've added the renderer in `ProductBlockRenderer.tsx`
- Check that the frontend component is properly exported


Older guide (may be outdated)
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