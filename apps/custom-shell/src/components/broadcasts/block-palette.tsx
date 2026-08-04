import * as React from "react"
import {
  FileTextIcon,
  ImageIcon,
  LayoutGridIcon,
  LayoutTemplateIcon,
  MinusIcon,
  PanelBottomIcon,
  PlusIcon,
} from "lucide-react"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { TemplatePreviewDialog } from "@/components/broadcasts/template-preview-dialog"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  deleteBroadcastTemplates,
  setDefaultBroadcastTemplate,
  getBroadcastErrorMessage,
  loadBroadcastTemplates,
  type BroadcastTemplateItem,
} from "@/lib/api/broadcasts"
import { showErrorToast } from "@/lib/error-toast"
import {
  BROADCAST_BLOCK_KINDS,
  BROADCAST_BLOCK_META,
  type BroadcastBlock,
  type BroadcastBlockKind,
} from "@/lib/broadcasts/blocks"
import { useLastValue } from "@/lib/use-last-value"
import { cn } from "@/lib/utils"

const BLOCK_ICONS: Record<
  BroadcastBlockKind,
  React.ComponentType<{ className?: string }>
> = {
  header: ImageIcon,
  richText: FileTextIcon,
  divider: MinusIcon,
  footer: PanelBottomIcon,
}

/** The underline tab row, shared by both tabs so they cannot drift apart. */
const TAB_TRIGGER =
  "h-full flex-none gap-1.5 rounded-none border-b-2 border-transparent px-0.5 text-muted-foreground data-[state=active]:border-foreground/75 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"

/**
 * The left panel: what an email can be built out of, and the ones already built.
 *
 * Deliberately not a list of the blocks already in *this* email — those live in
 * the middle panel, where they can be seen and dragged in place. This panel only
 * ever answers "what can I add" and "what can I start from".
 */
export function BlockPalette({
  disabled,
  hasBlocks,
  templatesVersion,
  selectedKind,
  onSelect,
  onAdd,
  onApplyTemplate,
  onSaveAsTemplate,
}: {
  disabled?: boolean
  /** Applying a template over a written email is worth asking about first. */
  hasBlocks: boolean
  /** Bumped when a template is saved, so the list goes and fetches again. */
  templatesVersion: number
  /** Which block is open in the options panel, so its card can show as picked. */
  selectedKind: BroadcastBlockKind | null
  onSelect: (kind: BroadcastBlockKind) => void
  onAdd: (kind: BroadcastBlockKind) => void
  onApplyTemplate: (blocks: BroadcastBlock[]) => void
  onSaveAsTemplate: () => void
}) {
  const [tab, setTab] = React.useState<"blocks" | "templates">("blocks")

  // The list lives up here, not in the tab.
  //
  // Radix throws away the content of a tab you switch off, so state kept down
  // there died every time — and coming back showed "Loading…" and then the same
  // list again, which is the flash. Up here it survives, so the second visit
  // onwards is instant.
  const [templates, setTemplates] = React.useState<
    BroadcastTemplateItem[] | null
  >(null)
  const [templatesError, setTemplatesError] = React.useState<string | null>(null)
  // Still nothing is fetched until the tab is actually opened; this just
  // remembers that it has been, so the fetch does not run on every editor load.
  const [everOpened, setEverOpened] = React.useState(false)
  // Bumped by a delete in this panel. The prop next to it is bumped by a save
  // in the editor; either one sends the list back for a fresh copy.
  const [deletedVersion, setDeletedVersion] = React.useState(0)

  React.useEffect(() => {
    if (!everOpened) return
    let live = true
    loadBroadcastTemplates()
      .then((data) => {
        if (!live) return
        // Replaced, never blanked first: a refresh after saving one should not
        // flash the list away and back.
        setTemplates(data.templates)
        setTemplatesError(null)
      })
      .catch((loadError) => {
        if (live) setTemplatesError(getBroadcastErrorMessage(loadError))
      })
    return () => {
      live = false
    }
  }, [everOpened, templatesVersion, deletedVersion])

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next = value as "blocks" | "templates"
        setTab(next)
        if (next === "templates") setEverOpened(true)
      }}
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card"
    >
      {/* Underline tabs, not the segmented pill style: a transparent list on
          the header's own border, with the active one drawing a 2px underline
          that sits on that line. The same row the node palette uses. */}
      <div className="shrink-0 border-b border-foreground/10 px-3">
        <TabsList className="-mb-px h-11 w-full justify-start gap-5 rounded-none bg-transparent p-0">
          <TabsTrigger value="blocks" className={TAB_TRIGGER}>
            <LayoutGridIcon className="size-4" />
            Blocks
          </TabsTrigger>
          <TabsTrigger value="templates" className={TAB_TRIGGER}>
            <LayoutTemplateIcon className="size-4" />
            Templates
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="blocks" className="min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="grid gap-2 p-3">
            {BROADCAST_BLOCK_KINDS.map((kind) => {
              const Icon = BLOCK_ICONS[kind]
              const meta = BROADCAST_BLOCK_META[kind]
              return (
                <PaletteCard
                  key={kind}
                  icon={<Icon className="size-3.5" />}
                  name={meta.name}
                  description={meta.description}
                  disabled={disabled}
                  selected={kind === selectedKind}
                  // The card and the plus do different things on purpose: the
                  // card opens the block's setup in the options panel without
                  // touching the email, and only the plus puts one in. Clicking
                  // a block to look at it used to add it, which meant every
                  // look cost a delete.
                  onClick={() => onSelect(kind)}
                  actionLabel={`Add a ${meta.name} block`}
                  onAction={() => onAdd(kind)}
                />
              )
            })}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="templates" className="min-h-0 overflow-hidden">
        <TemplatesTab
          templates={templates}
          error={templatesError}
          disabled={disabled}
          hasBlocks={hasBlocks}
          onApply={onApplyTemplate}
          onDeleted={() => setDeletedVersion((current) => current + 1)}
          onSaveAsTemplate={onSaveAsTemplate}
        />
      </TabsContent>
    </Tabs>
  )
}

/**
 * One row in either tab: icon chip, name, two lines of description.
 *
 * When it has an action, that action is its own button sitting on top of the
 * card rather than an icon drawn inside it — the two do different things, so
 * they cannot be the same click target. Nested buttons are invalid HTML, so the
 * action is a sibling positioned over the card, exactly as the automation
 * palette does it.
 */
function PaletteCard({
  icon,
  name,
  description,
  badge,
  actionLabel,
  onAction,
  disabled,
  selected,
  onClick,
}: {
  icon: React.ReactNode
  name: string
  description: string
  badge?: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  disabled?: boolean
  selected?: boolean
  onClick: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-2 overflow-hidden rounded-lg border bg-card p-2 text-left transition-colors",
          "hover:border-primary/40 hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
          // A border, not only a tint: which block the options panel is showing
          // has to survive a screen that cannot draw the grey.
          selected
            ? "border-primary/50 bg-muted/40"
            : "border-foreground/5",
          onAction && "pr-10"
        )}
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium">{name}</span>
            {badge}
          </span>
          <span
            className="line-clamp-2 text-[10px] leading-4 text-muted-foreground"
            title={description}
          >
            {description}
          </span>
        </span>
      </button>
      {onAction ? (
        <button
          type="button"
          disabled={disabled}
          aria-label={actionLabel}
          title={actionLabel}
          onClick={onAction}
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[color,background-color,opacity] group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
        >
          <PlusIcon className="size-4" />
        </button>
      ) : null}
    </div>
  )
}

function TemplatesTab({
  templates,
  error,
  disabled,
  hasBlocks,
  onApply,
  onDeleted,
  onSaveAsTemplate,
}: {
  /** Null while the very first fetch is still out. */
  templates: BroadcastTemplateItem[] | null
  error: string | null
  disabled?: boolean
  hasBlocks: boolean
  onApply: (blocks: BroadcastBlock[]) => void
  /** Sends the list back for a fresh copy once one has been thrown away. */
  onDeleted: () => void
  onSaveAsTemplate: () => void
}) {
  const [previewing, setPreviewing] =
    React.useState<BroadcastTemplateItem | null>(null)
  // The dialog is still fading out after Cancel has cleared the target, so its
  // heading keeps reading the name it opened with.
  const closingPreview = useLastValue(previewing)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [settingDefault, setSettingDefault] = React.useState(false)

  /**
   * Makes this the template every new newsletter starts from, or stops it being
   * that. The database allows only one per workspace, so the server clears the
   * old one in the same transaction; the list is fetched again afterwards so
   * the badge lands on the right row.
   */
  const toggleDefault = async () => {
    const target = closingPreview
    if (!target) return
    setSettingDefault(true)
    try {
      await setDefaultBroadcastTemplate(target.id, !target.isDefault)
      onDeleted()
      toast.success(
        target.isDefault
          ? `New newsletters no longer start from "${target.name}".`
          : `New newsletters now start from "${target.name}".`
      )
      setPreviewing(null)
    } catch (defaultError) {
      showErrorToast(getBroadcastErrorMessage(defaultError))
    } finally {
      setSettingDefault(false)
    }
  }

  /**
   * Throws the template away for good.
   *
   * Only ever reached through the question above it, because there is no undo:
   * a template is the only copy of the layout somebody built. Both windows shut
   * on success and the list goes and fetches itself again; on a failure they
   * both stay put so the same button can be tried again.
   */
  const confirmDelete = async () => {
    const target = closingPreview
    if (!target) return
    setDeleting(true)
    try {
      await deleteBroadcastTemplates([target.id])
      setConfirmingDelete(false)
      setPreviewing(null)
      onDeleted()
      toast.success(`"${target.name}" deleted.`)
    } catch (deleteError) {
      showErrorToast(getBroadcastErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  /** New ids, so using one template twice cannot land two blocks sharing an id. */
  const apply = (template: BroadcastTemplateItem) => {
    onApply(
      template.blocks.map((block) => ({
        ...block,
        id: `${block.kind}-${crypto.randomUUID()}`,
      }))
    )
    setPreviewing(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-2 p-3">
          {error ? (
            <ErrorBanner message={error} />
          ) : templates === null ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Loading…
            </p>
          ) : templates.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No templates yet. Build an email you like, then save it here to
              start the next one from it.
            </p>
          ) : (
            templates.map((template) => (
              <PaletteCard
                key={template.id}
                icon={<LayoutTemplateIcon className="size-3.5" />}
                name={template.name}
                description={`${template.blocks.length} block${template.blocks.length === 1 ? "" : "s"}`}
                badge={
                  template.isDefault ? (
                    <Badge variant="secondary" className="shrink-0">
                      Starts new ones
                    </Badge>
                  ) : null
                }
                disabled={disabled}
                // Always the preview first. A list of names tells you nothing
                // about what you are about to put in the email.
                onClick={() => setPreviewing(template)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-foreground/10 p-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={!hasBlocks}
          title={
            hasBlocks
              ? undefined
              : "Add something to the email first — there is nothing to save yet."
          }
          onClick={onSaveAsTemplate}
        >
          <PlusIcon className="size-3.5" />
          Save this as a template
        </Button>
      </div>

      <TemplatePreviewDialog
        open={previewing !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPreviewing(null)
        }}
        name={closingPreview?.name ?? "Template"}
        blocks={closingPreview?.blocks ?? []}
        applying={hasBlocks}
        deleting={deleting}
        onDelete={() => setConfirmingDelete(true)}
        isDefault={closingPreview?.isDefault}
        settingDefault={settingDefault}
        onToggleDefault={() => void toggleDefault()}
        onApply={() => closingPreview && apply(closingPreview)}
      />

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this template?"
        description={`"${closingPreview?.name ?? "This template"}" goes for good. Emails already built from it are not touched.`}
        confirmLabel="Delete template"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
