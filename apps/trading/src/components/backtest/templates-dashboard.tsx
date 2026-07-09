import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  CopyIcon,
  LibraryIcon,
  Loader2Icon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import {
  TemplateEditorDialog,
  type EditorTarget,
} from "@/components/backtest/template-editor-dialog"
import { uniqueCopyName } from "@/components/backtest/template-config"
import { PARAM_DEFAULTS } from "@/components/bots/strategy-params-form"
import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  deleteStrategyTemplate,
  saveStrategyDefaults,
  saveStrategyTemplate,
  type StrategyDefaultsMap,
  type StrategyRunDefaults,
  type StrategyTemplate,
} from "@/lib/api/backtests"
import { STRATEGY_LABELS, type StrategyType } from "@/lib/strategies/params"
import { cn } from "@/lib/utils"

/** Backtestable strategies that carry defaults + templates (copy is live-only). */
const TEMPLATE_STRATEGIES: StrategyType[] = ["momentum", "qqe", "vwap", "grid", "dca"]

const STRATEGY_ORDER = Object.fromEntries(
  TEMPLATE_STRATEGIES.map((strategy, index) => [strategy, index])
) as Record<StrategyType, number>

type StrategyFilter = "all" | StrategyType
type TypeFilter = "all" | "default" | "template"

/** One flattened table row: a strategy's main default, or a named template. */
type Row =
  | { kind: "default"; strategy: StrategyType; config: StrategyRunDefaults }
  | { kind: "template"; strategy: StrategyType; template: StrategyTemplate }

export function TemplatesDashboard({
  strategyDefaults,
  templates,
}: {
  strategyDefaults: StrategyDefaultsMap
  templates: StrategyTemplate[]
}) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<{
    strategy: StrategyType
    target: EditorTarget
  } | null>(null)
  const [picking, setPicking] = React.useState(false)
  const [pendingDelete, setPendingDelete] = React.useState<StrategyTemplate | null>(
    null
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [strategyFilter, setStrategyFilter] = React.useState<StrategyFilter>("all")
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all")

  /** A strategy's stored default overlaid on built-in param seeds. */
  const seedFor = React.useCallback(
    (strategy: StrategyType): StrategyRunDefaults => {
      const stored = strategyDefaults[strategy]
      return {
        ...stored,
        params: { ...PARAM_DEFAULTS[strategy], ...(stored?.params ?? {}) },
      }
    },
    [strategyDefaults]
  )

  const stratLabel = (strategy: StrategyType) =>
    strategyDefaults[strategy]?.strategyName?.trim() || STRATEGY_LABELS[strategy]

  const rows = React.useMemo<Row[]>(() => {
    const all: Row[] = []
    for (const strategy of TEMPLATE_STRATEGIES) {
      if (typeFilter !== "template") {
        all.push({ kind: "default", strategy, config: seedFor(strategy) })
      }
      if (typeFilter !== "default") {
        for (const template of templates.filter(
          (t) => t.strategyType === strategy
        )) {
          all.push({ kind: "template", strategy, template })
        }
      }
    }
    const filtered =
      strategyFilter === "all"
        ? all
        : all.filter((row) => row.strategy === strategyFilter)

    const isPinned = (row: Row) =>
      (row.kind === "default" ? row.config.pinned : row.template.config.pinned) ===
      true

    return filtered.sort((a, b) => {
      // Pinned templates first, then by strategy, default before templates.
      if (isPinned(a) !== isPinned(b)) return isPinned(a) ? -1 : 1
      if (a.strategy !== b.strategy)
        return STRATEGY_ORDER[a.strategy] - STRATEGY_ORDER[b.strategy]
      const aType = a.kind === "default" ? 0 : 1
      const bType = b.kind === "default" ? 0 : 1
      if (aType !== bType) return aType - bType
      if (a.kind === "template" && b.kind === "template")
        return a.template.name.localeCompare(b.template.name)
      return 0
    })
  }, [templates, seedFor, strategyFilter, typeFilter])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  function togglePin(row: Row) {
    if (row.kind === "template") {
      const t = row.template
      void run(() =>
        saveStrategyTemplate({
          id: t.id,
          strategyType: t.strategyType,
          name: t.name,
          config: { ...t.config, pinned: !t.config.pinned },
        })
      )
      return
    }
    // Pin the strategy's default: persist onto its stored config.
    const stored = strategyDefaults[row.strategy]
    void run(() =>
      saveStrategyDefaults({
        strategyType: row.strategy,
        defaults: {
          ...(stored ?? { params: {} }),
          params: stored?.params ?? {},
          pinned: !stored?.pinned,
        },
      })
    )
  }

  /** Duplicate any row into a new named template (defaults become templates). */
  function duplicate(row: Row) {
    const config = row.kind === "template" ? row.template.config : seedFor(row.strategy)
    const baseName =
      row.kind === "template"
        ? row.template.name
        : `${stratLabel(row.strategy)} copy`
    const siblings = templates
      .filter((t) => t.strategyType === row.strategy)
      .map((t) => t.name)
    const name = uniqueCopyName(baseName, siblings)
    void run(() =>
      saveStrategyTemplate({
        strategyType: row.strategy,
        name,
        // A copy starts unpinned and without the strategy-level overrides.
        config: {
          ...config,
          pinned: false,
          strategyName: undefined,
          strategyKind: undefined,
        },
      })
    )
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const id = pendingDelete.id
    await run(() => deleteStrategyTemplate(id))
    setPendingDelete(null)
  }

  function openEditor(row: Row) {
    setEditing({
      strategy: row.strategy,
      target:
        row.kind === "default"
          ? { mode: "default" }
          : { mode: "template", template: row.template },
    })
  }

  return (
    <div className="w-full pb-8">
      {error ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <DashboardTable
        title="Templates"
        icon={<LibraryIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={rows.length}
        controls={
          <>
            <Select
              value={strategyFilter}
              onValueChange={(value) => setStrategyFilter(value as StrategyFilter)}
            >
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All strategies</SelectItem>
                {TEMPLATE_STRATEGIES.map((strategy) => (
                  <SelectItem key={strategy} value={strategy}>
                    {stratLabel(strategy)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as TypeFilter)}
            >
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="default">Defaults only</SelectItem>
                <SelectItem value="template">Templates only</SelectItem>
              </SelectContent>
            </Select>
            <DashboardToolbarButton type="button" onClick={() => setPicking(true)}>
              <PlusIcon className="size-4" />
              New template
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Name</TableHead>
              <TableHead column="meta">Strategy</TableHead>
              <TableHead column="meta">Type</TableHead>
              <TableHead column="meta">Timeframe</TableHead>
              <TableHead column="meta">Market</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={rows.length === 0}
        emptyText="No templates match these filters."
        emptyColSpan={6}
        footer={{ type: "summary", count: rows.length }}
      >
        {rows.map((row) => {
          const config =
            row.kind === "default" ? row.config : row.template.config
          const pinned = config.pinned === true
          return (
            <TableRow
              key={row.kind === "default" ? `default-${row.strategy}` : row.template.id}
              className={cn(
                "cursor-pointer",
                pinned && "border-l-2 border-amber-500 bg-amber-500/5"
              )}
              onClick={() => openEditor(row)}
            >
              <TableCell column="main">
                <span className="inline-flex items-center gap-1.5">
                  {pinned ? (
                    <PinIcon className="size-3.5 shrink-0 fill-amber-500 text-amber-500" />
                  ) : null}
                  {row.kind === "default" ? (
                    <span className="font-medium text-muted-foreground">
                      {stratLabel(row.strategy)} default
                    </span>
                  ) : (
                    <span className="font-medium">{row.template.name}</span>
                  )}
                </span>
              </TableCell>
              <TableCell column="meta" className="text-sm">
                {stratLabel(row.strategy)}
              </TableCell>
              <TableCell column="meta">
                {row.kind === "default" ? (
                  <Badge variant="secondary">Default</Badge>
                ) : (
                  <Badge>Template</Badge>
                )}
              </TableCell>
              <TableCell column="meta" className="font-mono text-xs tabular-nums">
                {config.interval ?? "15m"}
              </TableCell>
              <TableCell column="meta" className="font-mono text-xs">
                {config.market ?? "BTC"}
                {config.extraMarkets && config.extraMarkets.length > 0
                  ? ` +${config.extraMarkets.length}`
                  : ""}
              </TableCell>
              <TableCell
                column="meta"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={pinned ? "Unpin" : "Pin to top"}
                    disabled={busy}
                    onClick={() => togglePin(row)}
                  >
                    {pinned ? (
                      <PinOffIcon className="size-4 text-muted-foreground" />
                    ) : (
                      <PinIcon className="size-4 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={
                      row.kind === "default"
                        ? `Edit ${stratLabel(row.strategy)} default`
                        : `Edit ${row.template.name}`
                    }
                    disabled={busy}
                    onClick={() => openEditor(row)}
                  >
                    <SettingsIcon className="size-4 text-muted-foreground" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={
                      row.kind === "default"
                        ? `Duplicate ${stratLabel(row.strategy)} default`
                        : `Duplicate ${row.template.name}`
                    }
                    disabled={busy}
                    onClick={() => duplicate(row)}
                  >
                    <CopyIcon className="size-4 text-muted-foreground" />
                  </Button>
                  {row.kind === "template" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Delete ${row.template.name}`}
                      disabled={busy}
                      onClick={() => setPendingDelete(row.template)}
                    >
                      <Trash2Icon className="size-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>

      <NewTemplateDialog
        open={picking}
        stratLabel={stratLabel}
        onOpenChange={setPicking}
        onContinue={(strategy) => {
          setPicking(false)
          setEditing({ strategy, target: { mode: "template" } })
        }}
      />

      {editing ? (
        <TemplateEditorDialog
          key={`${editing.strategy}-${editing.target.mode}-${editing.target.mode === "template" ? (editing.target.template?.id ?? "new") : "default"}`}
          strategy={editing.strategy}
          target={editing.target}
          seed={
            editing.target.mode === "template" && editing.target.template
              ? editing.target.template.config
              : seedFor(editing.strategy)
          }
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null)
          }}
          onSaved={() => void router.invalidate()}
        />
      ) : null}

      <DeleteTemplateDialog
        template={pendingDelete}
        deleting={busy}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}

/** Step one of creating a template: pick which strategy it's for. */
function NewTemplateDialog({
  open,
  stratLabel,
  onOpenChange,
  onContinue,
}: {
  open: boolean
  stratLabel: (strategy: StrategyType) => string
  onOpenChange: (open: boolean) => void
  onContinue: (strategy: StrategyType) => void
}) {
  const [strategy, setStrategy] = React.useState<StrategyType>(TEMPLATE_STRATEGIES[0])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>
            Pick the strategy this template is for.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-2">
          <Label>Strategy</Label>
          <Select
            value={strategy}
            onValueChange={(value) => setStrategy(value as StrategyType)}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_STRATEGIES.map((option) => (
                <SelectItem key={option} value={option}>
                  {stratLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => onContinue(strategy)}>
              Continue
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteTemplateDialog({
  template,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  template: StrategyTemplate | null
  deleting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={Boolean(template)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Delete template</DialogTitle>
          <DialogDescription>
            This removes the template. Existing runs are unaffected.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm">
            Delete{" "}
            <span className="font-medium">{template?.name ?? "this template"}</span>?
          </p>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={onConfirm}
            >
              {deleting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              Delete
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
