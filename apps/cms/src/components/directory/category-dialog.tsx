import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  getCategoryErrorMessage,
  saveCategory,
  saveNewCategory,
  type Category,
} from "@/lib/api/directory/categories"
import { slugFromTitle } from "@/lib/directory/slugs"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Creating or editing one category: its name, address part, description and
 * where it sits in the tree. Moving is the parent dropdown — the server
 * refuses a move that would hang a branch on its own tail, and that refusal
 * is shown as it is.
 */
export function CategoryDialog({
  open,
  category,
  categories,
  parentId,
  onClose,
  onSaved,
}: {
  open: boolean
  /** The category being edited, or null when creating one. */
  category: Category | null
  /** The whole tree, for the parent dropdown. */
  categories: Category[]
  /** Where a new category starts out — the row whose + was pressed. */
  parentId?: string | null
  onClose: () => void
  onSaved: (saved: Category, wasNew: boolean) => void
}) {
  const [name, setName] = React.useState("")
  const [slug, setSlug] = React.useState("")
  const [slugEdited, setSlugEdited] = React.useState(false)
  const [description, setDescription] = React.useState("")
  const [parent, setParent] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Reset to whatever the window was opened on, so a second open never shows
  // the last one's values.
  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const key = open ? (category?.id ?? `new:${parentId ?? ""}`) : null
  if (openedFor !== key) {
    setOpenedFor(key)
    setName(category?.name ?? "")
    setSlug(category?.slug ?? "")
    setSlugEdited(Boolean(category))
    setDescription(category?.description ?? "")
    setParent(category?.parentId ?? parentId ?? null)
  }

  const dirty = category
    ? name !== category.name ||
      slug !== category.slug ||
      description !== category.description ||
      parent !== (category.parentId ?? null)
    : name.trim() !== "" || description.trim() !== ""

  /**
   * Where this category may be hung: anywhere except under itself or its own
   * subtree. The server enforces the same rule; hiding those choices here
   * keeps the dropdown from offering something that can only fail.
   */
  const parentChoices = React.useMemo(() => {
    if (!category) return categories
    const blocked = new Set([category.id])
    let grew = true
    while (grew) {
      grew = false
      for (const row of categories) {
        if (row.parentId && blocked.has(row.parentId) && !blocked.has(row.id)) {
          blocked.add(row.id)
          grew = true
        }
      }
    }
    return categories.filter((row) => !blocked.has(row.id))
  }, [categories, category])

  async function save() {
    dismissErrorToast()
    setSaving(true)
    try {
      const input = {
        name,
        slug: slugEdited && slug.trim() ? slug.trim() : undefined,
        description,
        parentId: parent,
      }
      const saved = category
        ? await saveCategory({ id: category.id, ...input, slug: slug.trim() })
        : await saveNewCategory(input)
      onSaved(saved, !category)
    } catch (error) {
      showErrorToast(getCategoryErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {category ? "Edit category" : "New category"}
            </DialogTitle>
            <DialogDescription>
              Categories are how visitors browse the directory.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The category</CardTitle>
                <CardDescription>
                  Moving it is the parent dropdown — its subcategories move
                  with it.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="category-name">Name</FieldLabel>
                  <Input
                    id="category-name"
                    value={name}
                    disabled={saving}
                    onChange={(event) => {
                      setName(event.target.value)
                      if (!slugEdited) setSlug(slugFromTitle(event.target.value))
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="category-slug"
                    hint="The category page's address part, like coffee-tea. Suggested from the name."
                  >
                    Address part
                  </FieldLabel>
                  <Input
                    id="category-slug"
                    value={slug}
                    placeholder="coffee-tea"
                    disabled={saving}
                    onChange={(event) => {
                      setSlug(event.target.value)
                      setSlugEdited(true)
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="category-description"
                    hint="Shown at the top of the category's public page. Optional."
                  >
                    Description
                  </FieldLabel>
                  <Textarea
                    id="category-description"
                    rows={1}
                    value={description}
                    disabled={saving}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="category-parent">Sits under</FieldLabel>
                  <Select
                    value={parent ?? "top"}
                    disabled={saving}
                    onValueChange={(value) =>
                      setParent(value === "top" ? null : value)
                    }
                  >
                    <SelectTrigger
                      id="category-parent"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top">Top level</SelectItem>
                      {parentChoices.map((choice) => (
                        <SelectItem key={choice.id} value={choice.id}>
                          {choice.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {category ? "Save changes" : "Create category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
