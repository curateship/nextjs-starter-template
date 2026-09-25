import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { CategoryCombobox } from "@/components/directory/category-combobox"
import { RecordPreviewLink } from "@/components/shared/record-preview-link"
import { PostEditor } from "@/components/posts/post-editor"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { CharacterCount } from "@/components/shared/character-count"
import { ImageUpload } from "@/components/shared/image-upload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import type { Category } from "@/lib/api/directory/categories"
import {
  getPostErrorMessage,
  loadPostForEdit,
  savePost,
  saveNewPost,
  type ListingChoice,
  type PostForEdit,
} from "@/lib/api/posts/posts"
import { categoryTreeOrder } from "@/lib/directory/category-tree"
import { slugFromTitle } from "@/lib/directory/slugs"
import { emptyPostBody, type PostBody } from "@/lib/posts/post-body"
import {
  collapseStorageKey,
  useRememberedCollapse,
} from "@/lib/remembered-choice"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** Longest summary a post may have, matching the column. */
const SUMMARY_MAX = 300

type PostFields = {
  title: string
  slug: string
  summary: string
  coverImage: string
  status: "draft" | "published"
  body: PostBody
  categoryIds: string[]
}

function blankFields(): PostFields {
  return {
    title: "",
    slug: "",
    summary: "",
    coverImage: "",
    status: "draft",
    body: emptyPostBody(),
    categoryIds: [],
  }
}

function fieldsFrom(data: PostForEdit): PostFields {
  const { post } = data
  return {
    title: post.title,
    slug: post.slug,
    summary: post.summary,
    coverImage: post.coverImage,
    status: post.status,
    body: post.body,
    // Sorted so choosing a category and dropping it is not read as an edit.
    categoryIds: [...data.categoryIds].sort(),
  }
}

/**
 * One post's window, opened over the Posts list, for editing and for creating.
 * It loads its own record from the id, so a link straight to `?open=<id>`
 * works whichever page of the list is showing.
 */
export function PostDialog({
  open,
  postId,
  categories,
  preview,
  onClose,
  onSaved,
}: {
  open: boolean
  /** The post to edit, or null to create one. */
  postId: string | null
  categories: Category[]
  /** What the row already says, so a cold open names the post while it loads. */
  preview?: { title: string; status: "draft" | "published" } | null
  onClose: () => void
  /** A save landed, so the list behind the window is stale. */
  onSaved: () => void
}) {
  const [loaded, setLoaded] = React.useState<{
    forId: string
    data: PostForEdit
  } | null>(null)
  /** Set when a create's first half lands, so a retry never makes a twin. */
  const [createdId, setCreatedId] = React.useState<string | null>(null)
  /** Once the address is typed directly, the title stops writing it. */
  const [slugEdited, setSlugEdited] = React.useState(false)
  const [fields, setFields] = React.useState<PostFields>(blankFields)
  /** Listings the cards point at, plus any picked since the window opened. */
  const [listings, setListings] = React.useState<Map<string, ListingChoice>>(
    () => new Map()
  )
  const [saving, setSaving] = React.useState(false)
  const [basicsOpen, setBasicsOpen, basicsNoFlash] = useRememberedCollapse(
    collapseStorageKey.settingsCard("post-basics")
  )

  const creating = postId === null && createdId === null
  const ready = postId === null || loaded?.forId === postId
  /** The saved record, which is what the preview link may point at. */
  const saved = loaded?.forId === postId ? loaded.data.post : null

  // A closed window forgets what it held, so the next open reads afresh.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) {
      setLoaded(null)
      setCreatedId(null)
      setSlugEdited(false)
    }
  }

  React.useEffect(() => {
    if (!open || !postId) return
    let cancelled = false
    loadPostForEdit(postId).then(
      (data) => {
        if (cancelled) return
        if (!data) {
          showErrorToast("That post no longer exists.")
          onClose()
          onSaved()
          return
        }
        setLoaded({ forId: postId, data })
      },
      (error: unknown) => {
        if (cancelled) return
        showErrorToast(getPostErrorMessage(error))
        onClose()
      }
    )
    return () => {
      cancelled = true
    }
    // The fetch runs once per opened id; the callbacks are the parent's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId])

  // Fill the fields the moment there is something to fill them with, during
  // render, which is how React asks for state that follows a prop.
  const seedKey = open
    ? postId === null
      ? "new"
      : (loaded?.forId ?? null)
    : null
  const [seededFor, setSeededFor] = React.useState<string | null>(null)
  if (seededFor !== seedKey) {
    setSeededFor(seedKey)
    if (seedKey === "new") {
      setFields(blankFields())
      setListings(new Map())
    } else if (loaded && seedKey === loaded.forId) {
      setFields(fieldsFrom(loaded.data))
      setListings(new Map(loaded.data.listings.map((row) => [row.id, row])))
    }
  }

  const openedWith = React.useMemo(
    () =>
      postId === null
        ? JSON.stringify(blankFields())
        : loaded
          ? JSON.stringify(fieldsFrom(loaded.data))
          : null,
    [postId, loaded]
  )
  const dirty =
    openedWith !== null &&
    seededFor === seedKey &&
    JSON.stringify(fields) !== openedWith

  const update = <Key extends keyof PostFields>(
    key: Key,
    value: PostFields[Key]
  ) => setFields((current) => ({ ...current, [key]: value }))

  const orderedCategories = React.useMemo(
    () => categoryTreeOrder(categories),
    [categories]
  )
  const checked = React.useMemo(
    () => new Set(fields.categoryIds),
    [fields.categoryIds]
  )

  async function save() {
    dismissErrorToast()
    setSaving(true)
    try {
      let id = postId ?? createdId
      const { title, slug, ...rest } = fields
      if (!id) {
        const created = await saveNewPost({
          title,
          slug: slugEdited && slug.trim() ? slug.trim() : undefined,
        })
        setCreatedId(created.id)
        id = created.id
        // Take the address the server gave it, which may be numbered.
        setFields((current) => ({
          ...current,
          title: created.title,
          slug: created.slug,
        }))
        await savePost({ id, ...rest })
      } else {
        await savePost({ id, title, slug, ...rest })
      }
      onSaved()
      toast.success(postId ? "Post saved." : "Post created.")
      onClose()
    } catch (error) {
      // Every refusal is about the title or the address, in the first card.
      setBasicsOpen(true)
      showErrorToast(getPostErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const title = ready ? fields.title : (preview?.title ?? "")
  const status = ready ? fields.status : preview?.status

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="h-[48rem]">
          <DialogHeader>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <DialogTitle className="min-w-0 truncate">
                {title.trim() || (creating ? "New post" : "Untitled post")}
              </DialogTitle>
              {status === "published" ? (
                <Badge variant="secondary">Published</Badge>
              ) : status === "draft" ? (
                <Badge variant="outline">Draft</Badge>
              ) : null}
              <RecordPreviewLink
                word="post"
                path={saved ? `/posts/${saved.slug}` : null}
                published={saved?.status === "published"}
              />
            </div>
            <DialogDescription>
              {creating
                ? "It starts as a draft. Nothing is public until it is published."
                : "What is written here is what the post's page shows."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {!ready ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CollapsibleSettingsCard
                  size="sm"
                  storageId="post-basics"
                  collapse={{
                    open: basicsOpen,
                    onOpenChange: setBasicsOpen,
                    noFlashKey: basicsNoFlash,
                  }}
                  title="The post"
                  description="The title, address, summary and cover image. A draft is never shown to a visitor."
                  contentClassName="grid gap-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel htmlFor="post-title">Title</FieldLabel>
                      <Input
                        id="post-title"
                        value={fields.title}
                        disabled={saving}
                        onChange={(event) => {
                          const next = event.target.value
                          setFields((current) => ({
                            ...current,
                            title: next,
                            // While creating, the address follows the title
                            // until it is typed in directly.
                            slug:
                              creating && !slugEdited
                                ? slugFromTitle(next)
                                : current.slug,
                          }))
                        }}
                      />
                    </div>
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel
                        htmlFor="post-slug"
                        hint="The part after /posts/ in the post's address. Changing it changes the address, and old links stop working."
                      >
                        Address part
                      </FieldLabel>
                      <Input
                        id="post-slug"
                        value={fields.slug}
                        placeholder={
                          creating ? "best-bakeries-in-toronto" : undefined
                        }
                        disabled={saving}
                        onChange={(event) => {
                          update("slug", event.target.value)
                          setSlugEdited(true)
                        }}
                        onBlur={() => {
                          if (!fields.slug.trim() && fields.title.trim()) {
                            update("slug", slugFromTitle(fields.title))
                            setSlugEdited(false)
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel
                        htmlFor="post-summary"
                        hint="One or two sentences. Shown on the posts list, in search results and when the post is shared."
                      >
                        Summary
                      </FieldLabel>
                      <CharacterCount
                        value={fields.summary}
                        max={SUMMARY_MAX}
                      />
                    </div>
                    <Textarea
                      id="post-summary"
                      rows={1}
                      maxLength={SUMMARY_MAX}
                      value={fields.summary}
                      disabled={saving}
                      onChange={(event) =>
                        update("summary", event.target.value)
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel htmlFor="post-status">Status</FieldLabel>
                    <Select
                      value={fields.status}
                      disabled={saving}
                      onValueChange={(value) =>
                        update("status", value as "draft" | "published")
                      }
                    >
                      <SelectTrigger
                        id="post-status"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel hint="Shown at the top of the post, on its card in the posts list, and when it is shared.">
                      Cover image
                    </FieldLabel>
                    <ImageUpload
                      label="Cover image"
                      showLabel={false}
                      value={fields.coverImage}
                      disabled={saving}
                      onChange={(url) => update("coverImage", url)}
                      aspect="square"
                      fit="cover"
                      className="max-w-24"
                    />
                  </div>
                </CollapsibleSettingsCard>

                <CollapsibleSettingsCard
                  size="sm"
                  storageId="post-categories"
                  title="Categories"
                  description="Each category's page lists its newest posts under its listings."
                  contentClassName="grid gap-4"
                >
                  <CategoryCombobox
                    idPrefix="post-category"
                    rows={orderedCategories}
                    checked={checked}
                    disabled={saving}
                    onToggle={(id) =>
                      update(
                        "categoryIds",
                        (checked.has(id)
                          ? fields.categoryIds.filter((each) => each !== id)
                          : [...fields.categoryIds, id]
                        ).sort()
                      )
                    }
                  />
                </CollapsibleSettingsCard>

                <CollapsibleSettingsCard
                  size="sm"
                  storageId="post-body"
                  title="Body"
                  description="Select words to format them. Listing card places a listing's card where the cursor is."
                >
                  <PostEditor
                    value={fields.body}
                    disabled={saving}
                    listings={listings}
                    onChange={(body) => update("body", body)}
                    onListingPicked={(listing) =>
                      setListings((current) =>
                        new Map(current).set(listing.id, listing)
                      )
                    }
                  />
                </CollapsibleSettingsCard>
              </>
            )}
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
            <Button
              type="button"
              disabled={saving || !ready}
              onClick={() => void save()}
            >
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {postId ? "Save changes" : "Create post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
