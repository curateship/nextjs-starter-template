import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  LayoutTemplateIcon,
  PauseIcon,
  PlayIcon,
  SendIcon,
  Settings2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { BlockInspector } from "@/components/broadcasts/block-inspector"
import { BlockRail } from "@/components/broadcasts/block-rail"
import { BroadcastStatusBadge } from "@/components/broadcasts/broadcast-status-badge"
import { DeliverySettingsDialog } from "@/components/broadcasts/delivery-settings-dialog"
import { SendBroadcastDialog } from "@/components/broadcasts/send-broadcast-dialog"
import {
  ApplyTemplateDialog,
  SaveTemplateDialog,
} from "@/components/broadcasts/template-dialogs"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  getBroadcast,
  getBroadcastErrorMessage,
  pauseBroadcast,
  resumeBroadcast,
  updateBroadcast,
  type BroadcastDetail,
} from "@/lib/api/broadcasts"
import {
  describeAudienceFilter,
  type BroadcastAudienceFilter,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"
import type { BroadcastDripConfig } from "@/lib/broadcasts/drip"
import { renderBroadcastBlockHtml } from "@/lib/broadcasts/render"
import { cn } from "@/lib/utils"

const EDITABLE_STATUSES = new Set(["draft", "scheduled", "paused"])

type EditableFields = {
  name: string
  subject: string
  preheader: string
  fromName: string
  blocks: BroadcastBlock[]
  audienceFilter: BroadcastAudienceFilter
  dripConfig: BroadcastDripConfig
}

function fieldsFromDetail(detail: BroadcastDetail): EditableFields {
  return {
    name: detail.name,
    subject: detail.subject,
    preheader: detail.preheader,
    fromName: detail.fromName ?? "",
    blocks: detail.blocks,
    audienceFilter: detail.audienceFilter,
    dripConfig: detail.dripConfig,
  }
}

export function BroadcastEditor({ initial }: { initial: BroadcastDetail }) {
  const [broadcast, setBroadcast] = React.useState(initial)
  const [fields, setFields] = React.useState<EditableFields>(() =>
    fieldsFromDetail(initial)
  )
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(
    null
  )
  const [saving, setSaving] = React.useState(false)
  const [statusBusy, setStatusBusy] = React.useState(false)
  const [sendOpen, setSendOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [applyTemplateOpen, setApplyTemplateOpen] = React.useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = React.useState(false)

  const editable = EDITABLE_STATUSES.has(broadcast.status)
  const dirty = React.useMemo(
    () =>
      JSON.stringify(fields) !== JSON.stringify(fieldsFromDetail(broadcast)),
    [fields, broadcast]
  )

  const adoptDetail = React.useCallback((detail: BroadcastDetail) => {
    setBroadcast(detail)
    setFields(fieldsFromDetail(detail))
  }, [])

  // Poll while a send is pending or running so counters and promotions show
  // up live. A scheduled broadcast is still editable, so the poll only
  // resets the form once the status leaves the editable set — otherwise it
  // would clobber unsaved edits every five seconds.
  React.useEffect(() => {
    if (broadcast.status !== "sending" && broadcast.status !== "scheduled") {
      return
    }
    const timer = setInterval(() => {
      getBroadcast(broadcast.id)
        .then((detail) => {
          setBroadcast(detail)
          if (!EDITABLE_STATUSES.has(detail.status)) {
            setFields(fieldsFromDetail(detail))
          }
        })
        .catch(() => {
          // Transient polling failure — the next interval retries.
        })
    }, 5000)
    return () => clearInterval(timer)
  }, [broadcast.id, broadcast.status])

  const setField = <K extends keyof EditableFields>(
    key: K,
    value: EditableFields[K]
  ) => {
    setFields((current) => ({ ...current, [key]: value }))
  }

  const save = async (): Promise<BroadcastDetail | null> => {
    setSaving(true)
    try {
      const detail = await updateBroadcast({
        broadcastId: broadcast.id,
        name: fields.name.trim() || broadcast.name,
        subject: fields.subject,
        preheader: fields.preheader,
        fromName: fields.fromName.trim() || null,
        blocks: fields.blocks,
        audienceFilter: fields.audienceFilter,
        dripConfig: fields.dripConfig,
      })
      adoptDetail(detail)
      return detail
    } catch (saveError) {
      toast.error(getBroadcastErrorMessage(saveError))
      return null
    } finally {
      setSaving(false)
    }
  }

  const openSendDialog = async () => {
    if (dirty || saving) {
      const saved = await save()
      if (!saved) return
    }
    setSendOpen(true)
  }

  const toggleStatus = async () => {
    setStatusBusy(true)
    try {
      const detail =
        broadcast.status === "sending"
          ? await pauseBroadcast(broadcast.id)
          : await resumeBroadcast(broadcast.id)
      adoptDetail(detail)
      toast.success(
        detail.status === "paused" ? "Broadcast paused" : "Broadcast resumed"
      )
    } catch (statusError) {
      toast.error(getBroadcastErrorMessage(statusError))
    } finally {
      setStatusBusy(false)
    }
  }

  const selectedBlock =
    fields.blocks.find((block) => block.id === selectedBlockId) ?? null

  const updateBlockContent = (field: string, value: unknown) => {
    if (!selectedBlock) return
    setField(
      "blocks",
      fields.blocks.map((block) =>
        block.id === selectedBlock.id
          ? ({
              ...block,
              content: { ...block.content, [field]: value },
            } as BroadcastBlock)
          : block
      )
    )
  }

  const removeSelectedBlock = () => {
    if (!selectedBlock) return
    setField(
      "blocks",
      fields.blocks.filter((block) => block.id !== selectedBlock.id)
    )
    setSelectedBlockId(null)
  }

  const progressText =
    broadcast.status === "draft"
      ? null
      : `${broadcast.totalSent} of ${broadcast.totalRecipients} sent` +
        (broadcast.totalFailed > 0 ? ` · ${broadcast.totalFailed} failed` : "")

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-2 sm:px-3">
        <Button asChild variant="ghost" size="icon-xs">
          <Link to="/broadcasts" aria-label="Back to Broadcasts">
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <div className="max-w-44 min-w-0 flex-1 sm:max-w-56">
          <Input
            value={fields.name}
            disabled={!editable}
            onChange={(event) => setField("name", event.target.value)}
            aria-label="Broadcast name"
            className="h-7 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-0"
          />
        </div>
        <BroadcastStatusBadge status={broadcast.status} />
        <div className="ml-auto" />
        {broadcast.status === "sending" || broadcast.status === "paused" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={statusBusy}
            onClick={() => void toggleStatus()}
          >
            {broadcast.status === "sending" ? (
              <PauseIcon className="size-3.5" />
            ) : (
              <PlayIcon className="size-3.5" />
            )}
            {statusBusy
              ? broadcast.status === "sending"
                ? "Pausing…"
                : "Resuming…"
              : broadcast.status === "sending"
                ? "Pause"
                : "Resume"}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8">
              <LayoutTemplateIcon className="size-3.5" />
              Templates
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!editable}
              onSelect={() => setApplyTemplateOpen(true)}
            >
              Apply template…
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={fields.blocks.length === 0}
              onSelect={() => setSaveTemplateOpen(true)}
            >
              Save as template…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          disabled={!editable}
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2Icon className="size-3.5" />
          Delivery
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={saving || !dirty || !editable}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </Button>
        {broadcast.status === "draft" || broadcast.status === "scheduled" ? (
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={saving}
            onClick={() => void openSendDialog()}
          >
            <SendIcon className="size-3.5" />
            {broadcast.status === "scheduled" ? "Scheduled…" : "Review & send"}
          </Button>
        ) : null}
      </div>

      {broadcast.status !== "draft" ? (
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-2 text-sm",
            broadcast.status === "paused"
              ? "bg-destructive/10 text-destructive"
              : "bg-muted/50 text-muted-foreground"
          )}
        >
          <span>{progressText}</span>
          <span>{describeAudienceFilter(broadcast.audienceFilter)}</span>
          {broadcast.status === "scheduled" && broadcast.scheduled_at ? (
            <span>
              Sends {new Date(broadcast.scheduled_at).toLocaleString()}
            </span>
          ) : null}
          {broadcast.status === "sent" && broadcast.sent_at ? (
            <span>
              Completed {new Date(broadcast.sent_at).toLocaleString()}
            </span>
          ) : null}
          {broadcast.status === "paused" && broadcast.pausedReason ? (
            <span>{broadcast.pausedReason}</span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 border-r md:block">
          <BlockRail
            blocks={fields.blocks}
            selectedBlockId={selectedBlockId}
            disabled={!editable}
            onSelect={setSelectedBlockId}
            onReorder={(blocks) => setField("blocks", blocks)}
            onAdd={(block) => {
              setField("blocks", [...fields.blocks, block])
              setSelectedBlockId(block.id)
            }}
          />
        </aside>

        <ScrollArea className="min-h-0 flex-1 bg-muted/60">
          <div className="mx-auto w-full max-w-[640px] px-4 py-6">
            <div className="mb-3 grid gap-2 rounded-xl border border-foreground/5 bg-card p-3">
              <div className="grid gap-1">
                <label
                  htmlFor="broadcast-subject"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Subject
                </label>
                <Input
                  id="broadcast-subject"
                  value={fields.subject}
                  disabled={!editable}
                  placeholder="Your subject line…"
                  onChange={(event) => setField("subject", event.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="grid gap-1">
                  <label
                    htmlFor="broadcast-preheader"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Preheader (inbox preview text)
                  </label>
                  <Input
                    id="broadcast-preheader"
                    value={fields.preheader}
                    disabled={!editable}
                    placeholder="Optional preview text"
                    onChange={(event) =>
                      setField("preheader", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label
                    htmlFor="broadcast-from-name"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    From name (optional override)
                  </label>
                  <Input
                    id="broadcast-from-name"
                    value={fields.fromName}
                    disabled={!editable}
                    placeholder="Workspace default"
                    onChange={(event) =>
                      setField("fromName", event.target.value)
                    }
                  />
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-foreground/10">
              {fields.blocks.length === 0 ? (
                <div className="px-6 py-16 text-center text-sm text-neutral-500">
                  This email is empty. Add blocks from the left rail.
                </div>
              ) : (
                fields.blocks.map((block) => (
                  <div
                    key={block.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit ${block.kind} block`}
                    onClick={() => setSelectedBlockId(block.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        setSelectedBlockId(block.id)
                      }
                    }}
                    className={cn(
                      "relative cursor-pointer outline-none",
                      "after:pointer-events-none after:absolute after:inset-0 after:z-10 after:border-2 after:border-dashed after:border-transparent after:transition-colors",
                      "hover:after:border-primary/50 focus-visible:after:border-primary",
                      selectedBlockId === block.id &&
                        "after:border-primary/70 after:border-solid"
                    )}
                    // Block HTML comes from our renderer over structured,
                    // server-sanitized content — not raw user HTML.
                    dangerouslySetInnerHTML={{
                      __html: renderBroadcastBlockHtml(block),
                    }}
                  />
                ))
              )}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Preview is approximate — send yourself a test to check real
              email clients.
            </p>
          </div>
        </ScrollArea>

        <aside className="hidden w-80 shrink-0 border-l lg:block">
          {selectedBlock ? (
            <BlockInspector
              key={selectedBlock.id}
              block={selectedBlock}
              disabled={!editable}
              onContentChange={updateBlockContent}
              onDelete={removeSelectedBlock}
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Select a block in the preview or the list to edit it.
            </div>
          )}
        </aside>
      </div>

      <SendBroadcastDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        broadcast={broadcast}
        onUpdated={adoptDetail}
      />
      <DeliverySettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        audienceFilter={fields.audienceFilter}
        dripConfig={fields.dripConfig}
        onApply={(audienceFilter, dripConfig) => {
          setFields((current) => ({ ...current, audienceFilter, dripConfig }))
        }}
      />
      <ApplyTemplateDialog
        open={applyTemplateOpen}
        onOpenChange={setApplyTemplateOpen}
        onApply={(blocks) => {
          setField("blocks", blocks)
          setSelectedBlockId(null)
        }}
      />
      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        blocks={fields.blocks}
      />
    </div>
  )
}
