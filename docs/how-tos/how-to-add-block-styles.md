# How to Add Tab Styling and Style Variants to a Block

This guide explains how to add a Content/Styling tab system with a pluggable style registry to any page builder block. The hero and navigation blocks use this pattern.

## Architecture Overview

```
src/components/admin/page-builder/blocks/
  PageHeroBlock.tsx              ← Thin orchestrator (tabs + style selector)
  hero-styles/
    index.ts                     ← Style registry + shared types
    DefaultHeroConfig.tsx         ← Styling panel for "default" variant
    MinimalHeroConfig.tsx         ← Styling panel for another variant (example)
```

The block component itself is a lightweight shell with Content/Styling tabs. Each style variant has its own admin config component registered in the `index.ts` registry. Styling data is stored in `content.styleConfig[styleName]` so each variant keeps its own independent config.

## Data Structure

```json
{
  "title": "Hello World",
  "subtitle": "...",
  "heroStyle": "default",
  "styleConfig": {
    "default": { "showParticles": true, "backgroundPattern": "dots" },
    "minimal": { "backgroundColor": "#fff" }
  }
}
```

- Shared content fields (`title`, `subtitle`, buttons, etc.) live at the root
- `heroStyle` / `navigationStyle` stores the active variant key
- `styleConfig` is a map of variant key → config object

## Step-by-Step Guide

### 1. Create the Style Registry

Create a directory for your block's styles and an `index.ts` registry.

**Location:** `src/components/admin/page-builder/blocks/{block-name}-styles/index.ts`

```tsx
import { ComponentType } from "react"
import { DefaultMyBlockConfig } from "./DefaultMyBlockConfig"

export interface MyBlockStyleDefinition {
  label: string
  description: string
  AdminPanel: ComponentType<MyBlockStyleAdminProps>
}

export interface MyBlockStyleAdminProps {
  config: Record<string, any>
  onConfigChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export const MY_BLOCK_STYLES: Record<string, MyBlockStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Standard layout',
    AdminPanel: DefaultMyBlockConfig,
  },
}
```

### 2. Create the Default Style Config Panel

**Location:** `src/components/admin/page-builder/blocks/{block-name}-styles/DefaultMyBlockConfig.tsx`

This receives `config` (the current variant's config object) and `onConfigChange` to update individual fields.

```tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { MyBlockStyleAdminProps } from "./index"

export function DefaultMyBlockConfig({ config, onConfigChange }: MyBlockStyleAdminProps) {
  return (
    <div>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label>Show Border</Label>
            <Switch
              checked={config.showBorder !== false}
              onCheckedChange={(checked) => onConfigChange('showBorder', checked)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

### 3. Restructure the Block Component with Tabs

**Location:** `src/components/admin/page-builder/blocks/PageMyBlock.tsx`

The block component becomes a thin orchestrator:

```tsx
"use client"

import { useState, useEffect, useCallback } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils/tailwind-class-merger"
import { MY_BLOCK_STYLES } from "./{block-name}-styles"

interface PageMyBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  blockId: string
}

export function PageMyBlock({ content, onContentChange, siteId, blockId }: PageMyBlockProps) {
  const [activeTab, setActiveTab] = useState('content')

  const myBlockStyle = content.myBlockStyle || 'default'
  const styleConfig = content.styleConfig || {}
  const currentStyleConfig = styleConfig[myBlockStyle] || {}

  // Lazy migration: move legacy flat style fields into styleConfig.default
  useEffect(() => {
    if (content.style && !content.styleConfig) {
      onContentChange('styleConfig', { default: { ...content.style } })
      onContentChange('style', undefined)
      if (!content.myBlockStyle) {
        onContentChange('myBlockStyle', 'default')
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStyleConfigChange = useCallback((field: string, value: any) => {
    onContentChange('styleConfig', {
      ...styleConfig,
      [myBlockStyle]: { ...currentStyleConfig, [field]: value },
    })
  }, [styleConfig, myBlockStyle, currentStyleConfig, onContentChange])

  const ActivePanel = MY_BLOCK_STYLES[myBlockStyle]?.AdminPanel

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="px-6 pt-6">
        <TabsList className="gap-1">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="styling">Styling</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="content" className="mt-6">
        {/* Style Selector - at top, no card wrapper */}
        <div className="space-y-2 mb-4 px-6">
          <Label className="text-sm font-medium px-1">Block Style</Label>
          <div className="grid gap-2 max-w-[260px]">
            {Object.entries(MY_BLOCK_STYLES).map(([key, style]) => (
              <button
                key={key}
                type="button"
                onClick={() => onContentChange('myBlockStyle', key)}
                className={cn(
                  "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  myBlockStyle === key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                )}
              >
                <div className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  myBlockStyle === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}>
                  {myBlockStyle === key && <Check className="h-3 w-3" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{style.label}</div>
                  {style.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">{style.description}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Content editing cards go here */}
      </TabsContent>

      <TabsContent value="styling" className="mt-6">
        {ActivePanel && (
          <ActivePanel
            config={currentStyleConfig}
            onConfigChange={handleStyleConfigChange}
            siteId={siteId}
            blockId={blockId}
          />
        )}
      </TabsContent>
    </Tabs>
  )
}
```

### 4. Update BlockPropertiesPanel

Pass `content` and `onContentChange` directly instead of spreading individual props:

```tsx
{selectedBlock.type === 'my-block' && (
  <PageMyBlock
    content={selectedBlock.content}
    onContentChange={updateBlockContent}
    siteId={siteId}
    blockId={selectedBlock.id}
  />
)}
```

### 5. Update the Frontend Renderer

The frontend component needs to resolve style from the new `styleConfig` structure with a legacy fallback:

```tsx
import { useMemo } from 'react'

interface MyBlockProps {
  myBlockStyle?: string;
  styleConfig?: Record<string, Record<string, any>>;
  style?: { /* legacy fields */ };
  // ... other content props
}

export function MyBlock({ myBlockStyle, styleConfig, style: legacyStyle, ...rest }: MyBlockProps) {
  const style = useMemo(() => {
    const activeStyle = myBlockStyle || 'default'
    if (styleConfig?.[activeStyle]) {
      return styleConfig[activeStyle]
    }
    return legacyStyle
  }, [myBlockStyle, styleConfig, legacyStyle])

  // Use `style` throughout the component
}
```

## Adding a New Style Variant

Once the system is in place, adding a new variant is simple:

1. Create the config panel: `{block-name}-styles/MinimalMyBlockConfig.tsx`
2. Register it in `index.ts`:

```tsx
import { MinimalMyBlockConfig } from "./MinimalMyBlockConfig"

export const MY_BLOCK_STYLES: Record<string, MyBlockStyleDefinition> = {
  default: {
    label: 'Default',
    description: 'Standard layout',
    AdminPanel: DefaultMyBlockConfig,
  },
  minimal: {
    label: 'Minimal',
    description: 'Clean, minimal layout',
    AdminPanel: MinimalMyBlockConfig,
  },
}
```

The style selector, tab routing, and config persistence all work automatically.

## Reference Files

- Hero block (full example): `src/components/admin/page-builder/blocks/PageHeroBlock.tsx`
- Hero styles registry: `src/components/admin/page-builder/blocks/hero-styles/index.ts`
- Hero default config: `src/components/admin/page-builder/blocks/hero-styles/DefaultHeroConfig.tsx`
- Navigation block: `src/components/admin/page-builder/blocks/PageNavigationBlock.tsx`
- Navigation styles registry: `src/components/admin/page-builder/blocks/navigation-styles/index.ts`
