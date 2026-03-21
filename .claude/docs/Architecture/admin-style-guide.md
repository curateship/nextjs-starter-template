# Admin Style Guide

Styling rules for the admin dashboard. Every admin UI component must follow these patterns to maintain visual consistency.

See also: `.claude/docs/Architecture/architecture-overview.md`

## Rule 1: Use shadcn components for everything

Never write raw HTML elements when a shadcn component exists. The project has a full set of shadcn components in `src/components/ui/`. Use them.

| Instead of | Use |
|---|---|
| `<button>` | `<Button>` from `@/components/ui/button` |
| `<input>` | `<Input>` from `@/components/ui/input` |
| `<select>` | `<Select>` from `@/components/ui/select` |
| `<table>` | `<Table>` from `@/components/ui/table` |
| `<label>` | `<Label>` from `@/components/ui/label` |
| `<textarea>` | `<Textarea>` from `@/components/ui/textarea` |
| Custom dialog markup | `<Dialog>` from `@/components/ui/dialog` |
| Custom tab markup | `<Tabs>` from `@/components/ui/tabs` |
| Custom toggle | `<Switch>` from `@/components/ui/switch` |
| Custom checkbox | `<Checkbox>` from `@/components/ui/checkbox` |
| Custom tooltip | `<Tooltip>` from `@/components/ui/tooltip` |
| Custom dropdown | `<DropdownMenu>` from `@/components/ui/dropdown-menu` |
| Custom accordion | `<Accordion>` from `@/components/ui/accordion` |

The only exception is the back button in block builder panels, which uses a plain `<button>` with specific muted styling classes to match the TabsList appearance. This is an established pattern — don't change it to `<Button>`.

## Rule 2: Use AdminLayout as the content container

Every piece of admin content rendered below the StickyHeader and beside the sidebar must be wrapped in `AdminLayout` from `@/components/admin/layout/admin-layout`. This component provides the standard page padding (`px-7 pt-[15px]`) that all admin pages share.

```tsx
import { AdminLayout } from "@/components/admin/layout/admin-layout"

// Correct
<AdminLayout>
  <Card>...</Card>
  <Card>...</Card>
</AdminLayout>

// Wrong — missing AdminLayout, Cards will have inconsistent spacing
<div>
  <Card>...</Card>
  <Card>...</Card>
</div>
```

This applies to:
- Full admin pages (`src/app/admin/**/page.tsx`)
- Builder block property panels (the left panel that shows block config)
- Any scrollable admin content area

The only things that live outside AdminLayout are:
- The `StickyHeader` (sits above it)
- The `AppSidebar` (sits beside it)
- Canvas/preview areas (like `NewsletterCanvas` or `ProductPreview`) that have their own background and scroll behavior

## Rule 3: Use the Card component — don't add extra spacing

The `Card` component (`@/components/ui/card`) already includes its own spacing:
- `mb-10` — bottom margin between stacked cards
- `mx-5` — horizontal margin within its container

Combined with `AdminLayout`'s `px-7`, cards get consistent, even spacing automatically. The same spacing you see on the dashboard, analytics, and every other admin page.

**Do not** add your own margins, padding, or gaps around cards. The spacing is already handled.

```tsx
// Correct — Card spacing is built in, AdminLayout provides the container
<AdminLayout>
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Section Title</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {/* fields */}
    </CardContent>
  </Card>
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Another Section</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {/* fields */}
    </CardContent>
  </Card>
</AdminLayout>

// Wrong — extra spacing classes fight the Card's built-in margins
<div className="space-y-6 p-4">
  <Card className="mb-4 mx-2">...</Card>
  <Card className="mb-4 mx-2">...</Card>
</div>
```

## Rule 4: Card internal structure

Cards follow this structure:

```tsx
<Card className="shadow-sm">
  <CardHeader>
    <CardTitle className="text-base">Title Here</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div>
      <Label htmlFor="field-id">Field Label</Label>
      <Input id="field-id" className="mt-1" />
    </div>
  </CardContent>
</Card>
```

- `CardHeader` provides `p-6` padding
- `CardContent` provides `p-6 pt-0` (no top padding since header handles it)
- Use `space-y-4` on `CardContent` for consistent spacing between fields
- Use `mt-1` on inputs/selects after labels for the label-to-input gap
- Use `htmlFor` on Labels and matching `id` on inputs for accessibility

## Rule 5: Page structure pattern

A standard admin page follows this structure:

```tsx
<>
  <StickyHeader breadcrumbItems={[...]} />
  <AdminLayout>
    <AdminPageHeader title="Page Title" />
    <Card>...</Card>
    <Card>...</Card>
  </AdminLayout>
</>
```

A builder page (products, newsletters, pages) follows this structure:

```tsx
<div className="flex flex-col h-full overflow-hidden">
  <StickyHeader breadcrumbItems={[...]} rightActions={...} />
  <div className="flex-1 flex overflow-hidden">
    {/* Left panel — block config or preview */}
    <div className="flex-1 border-r bg-background overflow-y-auto pb-10">
      <AdminLayout>
        {/* Block config components with Cards */}
      </AdminLayout>
    </div>
    {/* Right panel — block list, 250px */}
    <div className="w-[250px]">...</div>
  </div>
</div>
```

The key difference: builder pages don't wrap the entire page in AdminLayout — they wrap just the block config content area in it, since the canvas/preview and block list have their own layouts.

## Rule 6: Numeric inputs (padding, spacing, thickness, etc.)

**Never** use controlled `<Input type="number">` with `parseInt(e.target.value) || 0` for numeric fields. This pattern prevents users from deleting the last digit because the empty string immediately snaps back to `0`.

Instead, use an **uncontrolled `<input type="text">`** with `defaultValue` and `onBlur`:

```tsx
// Correct — user can freely type and clear the field
<input
  type="text"
  defaultValue={(content.padding ?? 20).toString()}
  onBlur={(e) => {
    const val = e.target.value
    const num = val === '' ? 0 : parseInt(val)
    if (!isNaN(num)) {
      onContentChange('padding', num)
    }
  }}
  className="border p-2 rounded-md mt-1"
  style={{ width: '100%' }}
/>

// Wrong — can't delete the last digit, value snaps to 0
<Input
  type="number"
  value={content.padding ?? 20}
  onChange={(e) => onContentChange('padding', parseInt(e.target.value) || 0)}
/>
```

This is the **one exception** to Rule 1 (use shadcn components). Numeric fields for pixel values use a plain `<input>` because the uncontrolled `defaultValue` + `onBlur` pattern doesn't work well with shadcn's controlled `<Input>`. This applies to all pixel-value fields: padding, spacing, thickness, width, etc.
