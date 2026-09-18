import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { Category } from "@/lib/api/directory/categories"

/**
 * One checkbox per category, indented under its parent. Used by the listing
 * form and the post form, which file things under the same categories.
 */
export function CategoryChecklist({
  idPrefix,
  rows,
  checked,
  disabled,
  onToggle,
}: {
  /** Keeps each checkbox's `id` unique to its form. */
  idPrefix: string
  /** The tree in drawing order, from `categoryTreeOrder`. */
  rows: { category: Category; depth: number }[]
  checked: ReadonlySet<string>
  disabled?: boolean
  onToggle: (categoryId: string) => void
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No categories exist yet. Create them on the Categories screen and they
        appear here.
      </p>
    )
  }

  return (
    <div className="grid gap-2">
      {rows.map(({ category, depth }) => (
        <div
          key={category.id}
          className="flex items-center gap-2"
          style={depth ? { paddingLeft: `${depth * 1.25}rem` } : undefined}
        >
          <Checkbox
            id={`${idPrefix}-${category.id}`}
            checked={checked.has(category.id)}
            disabled={disabled}
            onCheckedChange={() => onToggle(category.id)}
          />
          <Label htmlFor={`${idPrefix}-${category.id}`}>{category.name}</Label>
        </div>
      ))}
    </div>
  )
}
