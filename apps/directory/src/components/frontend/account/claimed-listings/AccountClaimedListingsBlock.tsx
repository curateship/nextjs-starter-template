"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"

import {
  getMyClaimedDirectoriesAction,
  submitMyClaimedDirectoryEditRequestAction,
  type ClaimedDirectoryCategory,
  type ClaimedDirectoryEditorItem
} from "@/lib/actions/directories/directory-claim-actions"
import {
  confirmDirectoryFeaturedCheckoutAction,
  createDirectoryFeaturedCheckoutAction,
  getMyDirectoryFeaturedUpgradeStateAction,
  type MyDirectoryFeaturedUpgradePlan
} from "@/lib/actions/directories/directory-monetization-actions"
import { formatCentsAmount } from "@/lib/actions/directories/directory-featured-helpers"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import { DIRECTORY_CORE_BLOCK_TYPE } from "@/lib/actions/directories/directory-core"
import { DIRECTORY_GOOGLE_MAP_BLOCK_TYPE } from "@/lib/actions/directories/directory-google-map"
import { DIRECTORY_OPENING_HOURS_BLOCK_TYPE } from "@/lib/actions/directories/directory-opening-hours"
import { FeaturedBadge } from "@/components/frontend/directories/FeaturedBadge"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { DirectoryCoreBlock } from "@/components/admin/directory-builder/blocks/core/DirectoryCoreBlock"
import { DirectoryCustomBlock } from "@/components/admin/directory-builder/blocks/DirectoryCustomBlock"
import { DirectoryGoogleMapBlock } from "@/components/admin/directory-builder/blocks/google-map/DirectoryGoogleMapBlock"
import { DirectoryOpeningHoursBlock } from "@/components/admin/directory-builder/blocks/opening-hours/DirectoryOpeningHoursBlock"
import { DirectoryRichTextEditorBlock } from "@/components/admin/directory-builder/blocks/rich-text-editor/DirectoryRichTextEditorBlock"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface AccountClaimedListingsBlockProps {
  siteId: string
  content?: {
    title?: string
    description?: string
    listingLabel?: string
    saveButtonText?: string
    emptyText?: string
    visibility?: Record<string, boolean>
  }
  siteWidth?: "full" | "custom"
  customWidth?: number
  isPreview?: boolean
}

type EditorBlock = {
  id: string
  type: string
  title: string
  content: Record<string, any>
  display_order: number
}

type DraftState = {
  title: string
  slug: string
  featuredImage: string
  metaDescription: string
  contentBlocks: Record<string, any>
  categoryIds: string[]
  primaryCategoryId: string | null
}

const EDITABLE_DIRECTORY_BLOCK_TYPES = new Set([
  DIRECTORY_CORE_BLOCK_TYPE,
  "directory-rich-text",
  "directory-custom",
  DIRECTORY_GOOGLE_MAP_BLOCK_TYPE,
  DIRECTORY_OPENING_HOURS_BLOCK_TYPE,
])

function getObjectBlocks(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {}
}

function getBlockTitle(block: { type: string; content?: Record<string, any> }, customTemplateById: Map<string, DirectoryCustomBlockTemplate>) {
  if (block.type === DIRECTORY_CORE_BLOCK_TYPE) return "Core"
  if (block.type === "directory-rich-text") return "Rich Text"
  if (block.type === DIRECTORY_GOOGLE_MAP_BLOCK_TYPE) return "Google Map"
  if (block.type === DIRECTORY_OPENING_HOURS_BLOCK_TYPE) return "Opening Hours"
  if (block.type === "directory-custom") {
    const templateId = typeof block.content?.templateId === "string" ? block.content.templateId : ""
    return customTemplateById.get(templateId)?.name || "Custom Block"
  }
  return "Block"
}

function toEditorBlocks(contentBlocks: Record<string, any>, customTemplateById: Map<string, DirectoryCustomBlockTemplate>): EditorBlock[] {
  return Object.entries(contentBlocks)
    .map(([id, block]: [string, any]) => ({
      id,
      type: block?.type || "",
      title: getBlockTitle(block || {}, customTemplateById),
      content: getObjectBlocks(block?.content),
      display_order: Number(block?.display_order ?? 0),
    }))
    .filter((block) => EDITABLE_DIRECTORY_BLOCK_TYPES.has(block.type))
    .sort((a, b) => a.display_order - b.display_order)
}

function createDraft(item: ClaimedDirectoryEditorItem): DraftState {
  return {
    title: item.title || "",
    slug: item.slug || "",
    featuredImage: item.featured_image || "",
    metaDescription: item.meta_description || "",
    contentBlocks: item.content_blocks || {},
    categoryIds: item.categories.map((category) => category.id),
    primaryCategoryId: item.primary_category_id,
  }
}

function statusBadge(item: ClaimedDirectoryEditorItem | null) {
  if (!item?.pending_edit) return null
  return <Badge className="bg-amber-100 text-amber-800">Pending Review</Badge>
}

type FeaturedUpgradeState = Awaited<ReturnType<typeof getMyDirectoryFeaturedUpgradeStateAction>>

function formatFeaturedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
}

function formatPlanPrice(plan: MyDirectoryFeaturedUpgradePlan) {
  return formatCentsAmount(plan.amount, plan.currency)
}

export function AccountClaimedListingsBlock({
  siteId,
  content,
  siteWidth,
  customWidth,
  isPreview = false
}: AccountClaimedListingsBlockProps) {
  const visibility = content?.visibility || {}
  const [items, setItems] = useState<ClaimedDirectoryEditorItem[]>([])
  const [customBlockTemplates, setCustomBlockTemplates] = useState<DirectoryCustomBlockTemplate[]>([])
  const [categories, setCategories] = useState<ClaimedDirectoryCategory[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [featuredState, setFeaturedState] = useState<FeaturedUpgradeState | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState("")
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [upgradePending, setUpgradePending] = useState(false)
  const confirmAttempted = useRef(false)

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId])

  const loadListings = useCallback(async (preferredId?: string) => {
    if (isPreview) {
      setItems([])
      setCustomBlockTemplates([])
      setCategories([])
      setSelectedId("")
      setLoading(false)
      return
    }

    setLoading(true)
    const result = await getMyClaimedDirectoriesAction(siteId)
    setLoading(false)

    if (result.error) {
      setError(result.error)
      setItems([])
      setCustomBlockTemplates([])
      setCategories([])
      return
    }

    setError(null)
    setItems(result.data)
    setCustomBlockTemplates(result.customBlockTemplates)
    setCategories(result.categories)
    setSelectedId((current) => {
      if (preferredId && result.data.some((item) => item.id === preferredId)) return preferredId
      if (current && result.data.some((item) => item.id === current)) return current
      return result.data[0]?.id || ""
    })
  }, [isPreview, siteId])

  useEffect(() => {
    void loadListings()
  }, [loadListings])

  useEffect(() => {
    if (!selectedItem) {
      setDraft(null)
      return
    }
    setDraft(createDraft(selectedItem))
  }, [selectedItem])

  // Clear-then-load with a cancelled flag so switching listings never shows the
  // previous listing's featured status, even when responses arrive out of order
  useEffect(() => {
    if (isPreview || !selectedItem?.id || upgradePending) return

    let cancelled = false
    setFeaturedState(null)
    getMyDirectoryFeaturedUpgradeStateAction(siteId, selectedItem.id)
      .then((result) => {
        if (cancelled) return
        setFeaturedState(result)
        setSelectedPlanId((current) => {
          if (current && result.plans.some((plan) => plan.id === current)) return current
          return result.plans[0]?.id || ""
        })
      })
      .catch(() => {
        if (!cancelled) setFeaturedState(null)
      })

    return () => {
      cancelled = true
    }
  }, [isPreview, selectedItem?.id, siteId, upgradePending])

  // Complete a Stripe success redirect (?featured_session=cs_...) before
  // loading upgrade state so the new entitlement is visible immediately
  useEffect(() => {
    if (isPreview || confirmAttempted.current) return
    confirmAttempted.current = true

    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get("featured_session")
    const cancelled = params.get("featured_checkout") === "cancelled"
    if (!sessionId && !cancelled) return

    params.delete("featured_session")
    params.delete("featured_checkout")
    const query = params.toString()
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`)

    if (cancelled) {
      setUpgradeError("Checkout was cancelled. Your listing was not upgraded.")
      return
    }

    setUpgradePending(true)
    confirmDirectoryFeaturedCheckoutAction({ siteId, sessionId: sessionId! })
      .then((result) => {
        if (result.success) {
          setUpgradeMessage("Payment received — your listing is now featured.")
        } else {
          setUpgradeError(result.error || "We could not confirm the payment yet. It will activate automatically once Stripe notifies us.")
        }
      })
      .finally(() => setUpgradePending(false))
  }, [isPreview, siteId])

  const handleBuyUpgrade = async () => {
    if (!selectedItem || !selectedPlanId || isPreview) return

    setUpgradeError(null)
    setUpgradeMessage(null)
    setUpgradePending(true)
    const result = await createDirectoryFeaturedCheckoutAction({
      siteId,
      directoryId: selectedItem.id,
      planId: selectedPlanId,
      returnPath: window.location.pathname,
    })

    if (!result.success || !result.url) {
      setUpgradePending(false)
      setUpgradeError(result.error || "Failed to start checkout")
      return
    }

    window.location.href = result.url
  }

  const customTemplateById = useMemo(
    () => new Map(customBlockTemplates.map((template) => [template.id, template])),
    [customBlockTemplates]
  )

  const blocks = useMemo(
    () => draft ? toEditorBlocks(draft.contentBlocks, customTemplateById) : [],
    [customTemplateById, draft]
  )

  const categoriesByParent = useMemo(() => {
    const parents = categories.filter((category) => !category.parent_id)
    return parents.map((parent) => ({
      parent,
      children: categories.filter((category) => category.parent_id === parent.id),
    })).filter((group) => group.children.length > 0)
  }, [categories])

  const selectedCategoryLabels = useMemo(() => {
    const categoryById = new Map(categories.map((category) => [category.id, category]))
    return (draft?.categoryIds || []).map((id) => {
      const category = categoryById.get(id)
      return category ? { id, label: `${category.parent_title || "Category"} > ${category.title}` } : null
    }).filter((item): item is { id: string; label: string } => !!item)
  }, [categories, draft?.categoryIds])

  const updateDraft = (updates: Partial<DraftState>) => {
    setDraft((current) => current ? { ...current, ...updates } : current)
  }

  const updateBlockContent = (blockId: string, field: string, value: any) => {
    setDraft((current) => {
      if (!current) return current
      const block = current.contentBlocks[blockId]
      if (!block) return current

      return {
        ...current,
        contentBlocks: {
          ...current.contentBlocks,
          [blockId]: {
            ...block,
            content: {
              ...(block.content || {}),
              [field]: value,
            },
          },
        },
      }
    })
  }

  const toggleCategory = (categoryId: string) => {
    if (!draft) return
    const selected = draft.categoryIds.includes(categoryId)
    const nextCategoryIds = selected
      ? draft.categoryIds.filter((id) => id !== categoryId)
      : [...draft.categoryIds, categoryId]

    updateDraft({
      categoryIds: nextCategoryIds,
      primaryCategoryId: draft.primaryCategoryId && nextCategoryIds.includes(draft.primaryCategoryId)
        ? draft.primaryCategoryId
        : nextCategoryIds[0] || null,
    })
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedItem || !draft || isPreview) return
    setMessage(null)
    setError(null)

    startTransition(async () => {
      const result = await submitMyClaimedDirectoryEditRequestAction({
        siteId,
        directoryId: selectedItem.id,
        title: draft.title,
        slug: draft.slug,
        featuredImage: draft.featuredImage,
        metaDescription: draft.metaDescription,
        contentBlocks: draft.contentBlocks,
        categoryIds: draft.categoryIds,
        primaryCategoryId: draft.primaryCategoryId,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setMessage(result.message || "Changes submitted for review.")
      await loadListings(selectedItem.id)
    })
  }

  return (
    <BlockContainer
      header={{
        title: visibility.title === false ? "" : content?.title || "My Listings",
        subtitle: visibility.description === false ? "" : content?.description || "",
        align: "left"
      }}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      {loading ? null : items.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            {content?.emptyText || "No approved listing claims yet."}
          </CardContent>
        </Card>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          {visibility.listingSelector !== false ? (
            <div className="max-w-md space-y-2">
              <Label>{content?.listingLabel || "Listing"}</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {statusBadge(selectedItem)}
            {featuredState?.featuredUntil ? (
              <FeaturedBadge>Featured until {formatFeaturedDate(featuredState.featuredUntil)}</FeaturedBadge>
            ) : null}
            {selectedItem?.pending_edit ? (
              <p className="text-sm text-muted-foreground">Latest submitted changes are waiting for admin review.</p>
            ) : null}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Listing Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="claimed-title">Title</Label>
                  <Input id="claimed-title" value={draft?.title || ""} onChange={(event) => updateDraft({ title: event.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="claimed-slug">URL Slug</Label>
                  <Input id="claimed-slug" value={draft?.slug || ""} onChange={(event) => updateDraft({ slug: event.target.value })} required />
                </div>
              </div>

              {visibility.image !== false ? (
                <div className="space-y-2">
                  <Label htmlFor="claimed-image">Featured Image URL</Label>
                  <Input id="claimed-image" value={draft?.featuredImage || ""} onChange={(event) => updateDraft({ featuredImage: event.target.value })} />
                </div>
              ) : null}

              {visibility.metaDescription !== false ? (
                <div className="space-y-2">
                  <Label htmlFor="claimed-meta">Meta Description</Label>
                  <Textarea
                    id="claimed-meta"
                    value={draft?.metaDescription || ""}
                    onChange={(event) => updateDraft({ metaDescription: event.target.value })}
                    rows={3}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {categoriesByParent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No listing categories are available.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {categoriesByParent.map(({ parent, children }) => (
                    <div key={parent.id} className="space-y-2">
                      <p className="text-sm font-medium">{parent.title}</p>
                      <div className="grid gap-2">
                        {children.map((category) => (
                          <label key={category.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={draft?.categoryIds.includes(category.id) || false}
                              onCheckedChange={() => toggleCategory(category.id)}
                            />
                            {category.title}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedCategoryLabels.length > 0 ? (
                <div className="max-w-md space-y-2">
                  <Label>Primary Category</Label>
                  <Select value={draft?.primaryCategoryId || selectedCategoryLabels[0]?.id} onValueChange={(value) => updateDraft({ primaryCategoryId: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedCategoryLabels.map((category) => (
                        <SelectItem key={category.id} value={category.id}>{category.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {visibility.upgrade !== false && (featuredState?.plans.length || featuredState?.featuredUntil || upgradeMessage || upgradeError) ? (
            <Card>
              <CardHeader>
                <CardTitle>Featured Upgrade</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {featuredState?.featuredUntil
                    ? `Current status: Featured until ${formatFeaturedDate(featuredState.featuredUntil)}${featuredState.activePlanName ? ` (${featuredState.activePlanName})` : ""}.`
                    : "Current status: Not featured. Buy an upgrade to show this listing first with a Featured badge."}
                </p>

                {featuredState?.plans.length ? (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {featuredState.plans.map((plan) => {
                        const price = formatPlanPrice(plan)
                        const isSelected = selectedPlanId === plan.id

                        return (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => setSelectedPlanId(plan.id)}
                            className={`rounded-lg border p-3 text-left text-sm transition-colors ${isSelected ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30"}`}
                            aria-pressed={isSelected}
                          >
                            <span className="block font-medium">{plan.name}</span>
                            <span className="block text-muted-foreground">
                              {plan.duration_days} days{price ? ` · ${price}` : ""}
                            </span>
                            {plan.description ? (
                              <span className="mt-1 block text-xs text-muted-foreground">{plan.description}</span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>

                    <Button
                      type="button"
                      onClick={handleBuyUpgrade}
                      disabled={upgradePending || !selectedPlanId || isPreview}
                    >
                      {upgradePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Buy Upgrade
                    </Button>
                  </>
                ) : null}

                {upgradeMessage ? <p className="text-sm text-green-700">{upgradeMessage}</p> : null}
                {upgradeError ? <p className="text-sm text-red-600">{upgradeError}</p> : null}
              </CardContent>
            </Card>
          ) : null}

          {blocks.map((block) => {
            if (block.type === DIRECTORY_CORE_BLOCK_TYPE) {
              return (
                <DirectoryCoreBlock
                  key={block.id}
                  content={block.content}
                  onContentChange={(field, value) => updateBlockContent(block.id, field, value)}
                  siteId={siteId}
                  directoryTitle={draft?.title}
                  directoryFeaturedImage={draft?.featuredImage}
                  onDirectoryTitleChange={(title) => updateDraft({ title })}
                  onDirectoryFeaturedImageChange={(featuredImage) => updateDraft({ featuredImage })}
                  showDirectoryTitleField={false}
                  showDirectoryTitlePlaceholder={false}
                />
              )
            }

            if (block.type === "directory-rich-text") {
              return (
                <DirectoryRichTextEditorBlock
                  key={block.id}
                  content={block.content}
                  onContentChange={(field, value) => updateBlockContent(block.id, field, value)}
                  siteId={siteId}
                  blockId={block.id}
                />
              )
            }

            if (block.type === "directory-custom") {
              return (
                <DirectoryCustomBlock
                  key={block.id}
                  content={block.content}
                  onContentChange={(field, value) => updateBlockContent(block.id, field, value)}
                  siteId={siteId}
                  template={customTemplateById.get(block.content?.templateId) || null}
                  allowMediaLibrary={false}
                />
              )
            }

            if (block.type === DIRECTORY_GOOGLE_MAP_BLOCK_TYPE && visibility.map !== false) {
              return (
                <DirectoryGoogleMapBlock
                  key={block.id}
                  content={block.content}
                  onContentChange={(field, value) => updateBlockContent(block.id, field, value)}
                />
              )
            }

            if (block.type === DIRECTORY_OPENING_HOURS_BLOCK_TYPE && visibility.hours !== false) {
              return (
                <DirectoryOpeningHoursBlock
                  key={block.id}
                  content={block.content}
                  onContentChange={(field, value) => updateBlockContent(block.id, field, value)}
                />
              )
            }

            return null
          })}

          {message ? <p className="text-sm text-green-700">{message}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {selectedItem ? (
              <Button variant="outline" asChild>
                <a href={`/directory/${selectedItem.slug}`} target="_blank" rel="noopener noreferrer">
                  View Listing
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            ) : (
              <div />
            )}
            <Button type="submit" disabled={isPending || isPreview || !draft}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {content?.saveButtonText || "Submit for Review"}
            </Button>
          </div>
        </form>
      )}
    </BlockContainer>
  )
}
