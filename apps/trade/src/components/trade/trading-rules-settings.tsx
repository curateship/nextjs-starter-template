import * as React from "react"
import {
  CopyIcon,
  PlusIcon,
  SettingsIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react"

import { useTradePageTitle } from "@/app/page-title"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useTradeSettingsBootstrap } from "@/components/trade/trade-settings-context"
import { TradingRuleBuilder } from "@/components/trade/trading-rule-builder"
import { useTradingRules } from "@/components/trade/use-trading-rules"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getTradingRulesLoadErrorMessage,
  loadTradingRulesSettings,
} from "@/lib/api/trade/trading-rules"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  describeRuleCard,
  describeRuleCovers,
  MAX_RULE_NOTE_LENGTH,
  MAX_RULE_NOTES,
  MAX_TRADING_RULES,
  notesOf,
  RULE_PLACES,
  RULE_SIDES,
  ruleNameSchema,
  type RuleEnd,
  type RulePlace,
  type RuleSide,
  type TradingRule,
  type TradingRules,
} from "@/lib/trade/trading-rules"

const SIDE_LABELS: Record<RuleSide, string> = {
  both: "Longs and shorts",
  longs: "Longs only",
  shorts: "Shorts only",
}

const PLACE_LABELS: Record<RulePlace, string> = {
  order: "A long or short order",
  dca: "A DCA ladder",
  grid: "A grid",
}

const END_LABELS: Record<RuleEnd, string> = {
  warn: "Warn me, and let me confirm",
  block: "Block the trade",
}

type RuleSortColumn = "name" | "covers" | "then" | "on"

const RULE_COLUMNS: SortableColumn<RuleSortColumn>[] = [
  { key: "name", label: "Rule", column: "main", className: "min-w-0 md:min-w-80" },
  { key: "covers", label: "Covers", column: "preview" },
  { key: "then", label: "Then", column: "preview" },
  { key: "on", label: "On", column: "preview" },
]

function compareRules(a: TradingRule, b: TradingRule, column: RuleSortColumn) {
  switch (column) {
    case "covers":
      return describeRuleCovers(a).localeCompare(describeRuleCovers(b))
    case "then":
      return a.then.localeCompare(b.then)
    case "on":
      return Number(b.on) - Number(a.on)
    default:
      return a.name.localeCompare(b.name)
  }
}

/**
 * The conditions of a rule as one line, "Price is under EMA 50 on 1 week, and
 * …", then how many notes it asks to be ticked.
 */
function describeConditions(rule: TradingRule): string {
  const joiner = rule.match === "all" ? ", and " : ", or "
  const conditions =
    rule.cards.length === 0
      ? "No conditions yet"
      : rule.cards
          .map(describeRuleCard)
          .map((sentence, index) =>
            index === 0
              ? sentence
              : sentence.charAt(0).toLowerCase() + sentence.slice(1)
          )
          .join(joiner)
  const notes = notesOf(rule).length
  return notes === 0
    ? conditions
    : `${conditions}. ${notes} ${notes === 1 ? "note" : "notes"} to tick`
}

/**
 * The Trading rules tab: a table of the rules a person built for themselves,
 * each with a switch. A rule opens in a window where its conditions are
 * stacked one card at a time. Everything saves as it changes.
 */
export default function TradingRulesSettings() {
  useTradePageTitle("Settings")
  const bootstrap = useTradeSettingsBootstrap()
  const initial = bootstrap?.tradingRules
  const [loaded, setLoaded] = React.useState<TradingRules | null>(
    initial ?? null
  )
  const [loadFailed, setLoadFailed] = React.useState(false)

  const load = React.useCallback(() => {
    loadTradingRulesSettings()
      .then(({ rules }) => {
        setLoaded(rules)
        setLoadFailed(false)
      })
      .catch((error: unknown) => {
        setLoadFailed(true)
        showErrorToast(getTradingRulesLoadErrorMessage(error))
      })
  }, [])

  React.useEffect(() => {
    if (initial === undefined) load()
  }, [initial, load])

  if (loaded === null) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3">
          {loadFailed ? (
            <p className="text-sm text-muted-foreground">
              Your trading rules could not be loaded.
            </p>
          ) : (
            <LoadingRow label="Reading your trading rules" />
          )}
          {loadFailed ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLoadFailed(false)
                load()
              }}
            >
              Try again
            </Button>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  return <TradingRulesTable initial={loaded} />
}

function TradingRulesTable({ initial }: { initial: TradingRules }) {
  const { rules, updateRule, addRule, duplicateRule, removeRules } =
    useTradingRules(initial)
  const { sort, direction, toggleSort } = useTableSort<RuleSortColumn>("name")
  const selection = useSelection()
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [deleteIds, setDeleteIds] = React.useState<string[]>([])

  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...rules.list].sort((a, b) => factor * compareRules(a, b, sort))
  }, [rules.list, sort, direction])
  const visibleIds = sorted.map((rule) => rule.id)
  const selectedIds = visibleIds.filter((id) => selection.selected.has(id))
  const open = rules.list.find((rule) => rule.id === openId) ?? null
  const full = rules.list.length >= MAX_TRADING_RULES
  const deleting = rules.list.filter((rule) => deleteIds.includes(rule.id))

  return (
    <>
      <DashboardTable
        title="Trading rules"
        icon={<ShieldCheckIcon />}
        count={rules.list.length}
        selectedCount={selectedIds.length}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedIds.length > 0 ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={() => setDeleteIds(selectedIds)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.length})
              </DashboardToolbarButton>
            ) : null}
            <DisabledReason
              disabled={full}
              reason={`You can keep up to ${MAX_TRADING_RULES} rules.`}
            >
              <DashboardToolbarButton
                type="button"
                disabled={full}
                onClick={() => {
                  const rule = addRule()
                  if (rule) setOpenId(rule.id)
                }}
              >
                <PlusIcon className="size-4" />
                New rule
              </DashboardToolbarButton>
            </DisabledReason>
          </>
        }
        header={
          <SortableTableHeader
            columns={RULE_COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="rules"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={rules.list.length === 0}
        emptyText="No rules yet. A rule checks your real-money entries before they go out, and warns or blocks when its conditions are not met."
        emptyColSpan={6}
        footer={{ type: "summary", count: rules.list.length, label: "rules" }}
      >
        {sorted.map((rule) => (
          <TableRow
            key={rule.id}
            className="group"
            rowAction={() => setOpenId(rule.id)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(rule.id)}
                onCheckedChange={() => selection.toggle(rule.id)}
                aria-label={`Select ${rule.name}`}
              />
            </TableCell>
            <TableCell column="main" className="min-w-0 md:min-w-80">
              <button
                type="button"
                className="block max-w-36 truncate text-left text-sm font-medium group-hover:underline sm:max-w-none"
                onClick={() => setOpenId(rule.id)}
              >
                {rule.name}
              </button>
              <span className="line-clamp-2 max-w-36 text-xs whitespace-normal text-muted-foreground sm:max-w-none">
                {describeConditions(rule)}
              </span>
            </TableCell>
            <TableCell column="preview">{describeRuleCovers(rule)}</TableCell>
            <TableCell column="preview">
              <Badge variant={rule.then === "block" ? "destructive" : "outline"}>
                {rule.then === "block" ? "Blocks" : "Warns"}
              </Badge>
            </TableCell>
            <TableCell column="preview">
              <Switch
                checked={rule.on}
                aria-label={`${rule.name} is ${rule.on ? "on" : "off"}`}
                onCheckedChange={(on) =>
                  updateRule(rule.id, (current) => ({ ...current, on }))
                }
              />
            </TableCell>
            <TableCell column="actions">
              <RowButton
                label={`Copy ${rule.name}`}
                tip="Make a copy"
                disabled={full}
                onClick={() => {
                  const copy = duplicateRule(rule.id)
                  if (copy) setOpenId(copy.id)
                }}
              >
                <CopyIcon className="size-4" />
              </RowButton>
              <RowButton
                label={`Edit ${rule.name}`}
                tip="Rule settings"
                onClick={() => setOpenId(rule.id)}
              >
                <SettingsIcon className="size-4" />
              </RowButton>
              <RowButton
                label={`Delete ${rule.name}`}
                tip="Delete rule"
                onClick={() => setDeleteIds([rule.id])}
              >
                <Trash2Icon className="size-4" />
              </RowButton>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <TradingRuleDialog
        key={openId ?? "closed"}
        rule={open}
        onChange={(update) => {
          if (open) updateRule(open.id, update)
        }}
        onDelete={() => {
          if (open) setDeleteIds([open.id])
        }}
        onClose={() => setOpenId(null)}
      />

      <ConfirmDialog
        open={deleting.length > 0}
        onOpenChange={(next) => {
          if (!next) setDeleteIds([])
        }}
        title={
          deleting.length === 1
            ? `Delete ${deleting[0].name}?`
            : `Delete ${deleting.length} rules?`
        }
        description="It stops checking your entries at once. Trades already placed are not touched, and Journal notes that name it stay as they are."
        confirmLabel={deleting.length === 1 ? "Delete rule" : "Delete rules"}
        onConfirm={() => {
          const ids = new Set(deleteIds)
          removeRules(ids)
          selection.setSelected(
            new Set([...selection.selected].filter((id) => !ids.has(id)))
          )
          if (openId && ids.has(openId)) setOpenId(null)
          setDeleteIds([])
        }}
      />
    </>
  )
}

function RowButton({
  label,
  tip,
  disabled,
  onClick,
  children,
}: {
  label: string
  tip: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

/**
 * One rule, edited in place. Every change saves as it is made, so the window
 * ends with Done rather than Save.
 */
function TradingRuleDialog({
  rule,
  onChange,
  onDelete,
  onClose,
}: {
  rule: TradingRule | null
  onChange: (update: (rule: TradingRule) => TradingRule) => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      open={rule !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {rule ? (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{rule.name}</DialogTitle>
            <DialogDescription>
              Checked when you place a real-money entry. Practice wallets,
              exits, recipes and bots are never checked.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>This rule</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <RuleNameField
                  value={rule.name}
                  onChange={(name) => onChange((current) => ({ ...current, name }))}
                />
                <div className="flex items-center gap-2">
                  <Switch
                    id="rule-on"
                    checked={rule.on}
                    onCheckedChange={(on) =>
                      onChange((current) => ({ ...current, on }))
                    }
                  />
                  <Label htmlFor="rule-on">Switched on</Label>
                </div>
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-medium">
                    When I place
                  </legend>
                  {RULE_PLACES.map((place) => (
                    <div key={place} className="flex items-center gap-2">
                      <Checkbox
                        id={`rule-place-${place}`}
                        checked={rule.places.includes(place)}
                        aria-invalid={rule.places.length === 0 || undefined}
                        onCheckedChange={(checked) =>
                          onChange((current) => ({
                            ...current,
                            places: RULE_PLACES.filter((one) =>
                              one === place
                                ? checked === true
                                : current.places.includes(one)
                            ),
                          }))
                        }
                      />
                      <Label htmlFor={`rule-place-${place}`}>
                        {PLACE_LABELS[place]}
                      </Label>
                    </div>
                  ))}
                  {rule.places.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Tick at least one, or this rule never checks anything.
                    </p>
                  ) : null}
                </fieldset>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="rule-sides"
                    hint="A DCA ladder always counts as a long. A grid counts by the way it trades."
                  >
                    Which way
                  </FieldLabel>
                  <Select
                    value={rule.sides}
                    onValueChange={(sides) =>
                      onChange((current) => ({
                        ...current,
                        sides: sides as RuleSide,
                      }))
                    }
                  >
                    <SelectTrigger id="rule-sides" className="w-full sm:w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RULE_SIDES.map((side) => (
                        <SelectItem key={side} value={side}>
                          {SIDE_LABELS[side]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="rule-then"
                    hint="Warn opens a window you can confirm past. Block refuses the entry, with only Go back. A condition that cannot tell yet always warns instead of blocking."
                  >
                    When it is not met
                  </FieldLabel>
                  <Select
                    value={rule.then}
                    onValueChange={(then) =>
                      onChange((current) => ({ ...current, then: then as RuleEnd }))
                    }
                  >
                    <SelectTrigger id="rule-then" className="w-full sm:w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["warn", "block"] as const).map((end) => (
                        <SelectItem key={end} value={end}>
                          {END_LABELS[end]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            <TradingRuleBuilder
              idPrefix="rule-condition"
              cards={rule.cards}
              match={rule.match}
              onCardsChange={(cards) =>
                onChange((current) => ({ ...current, cards }))
              }
              onMatchChange={(match) =>
                onChange((current) => ({ ...current, match }))
              }
            />
            <RuleNotesCard
              notes={rule.notes}
              onChange={(notes) => onChange((current) => ({ ...current, notes }))}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="destructive"
              className="sm:mr-auto"
              onClick={onDelete}
            >
              Delete
            </Button>
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

/**
 * The rule's own bullet points. Each one is a box on the chart that must be
 * ticked before an entry this rule covers can go out, whatever its
 * conditions say. A blank line is kept while it is typed and asks for nothing.
 */
function RuleNotesCard({
  notes,
  onChange,
}: {
  notes: string[]
  onChange: (notes: string[]) => void
}) {
  const full = notes.length >= MAX_RULE_NOTES
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Notes to tick</CardTitle>
        <CardDescription>
          Your own bullet points. Each one is a box on the chart you tick before
          an entry this rule covers can go out.
        </CardDescription>
        <CardAction>
          <DisabledReason
            disabled={full}
            reason={`A rule can hold up to ${MAX_RULE_NOTES} notes.`}
          >
            <Button
              type="button"
              variant="outline"
              disabled={full}
              onClick={() => onChange([...notes, ""])}
            >
              <PlusIcon className="size-4" />
              Add a note
            </Button>
          </DisabledReason>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2">
        {notes.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            No notes yet, so nothing needs ticking.
          </span>
        ) : null}
        {notes.map((note, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              id={`rule-note-${index}`}
              aria-label={`Note ${index + 1}`}
              value={note}
              maxLength={MAX_RULE_NOTE_LENGTH}
              placeholder="Did I check the daily trend?"
              onChange={(event) =>
                onChange(
                  notes.map((current, at) =>
                    at === index ? event.target.value : current
                  )
                )
              }
            />
            <RowButton
              label={`Remove note ${index + 1}`}
              tip="Remove this note"
              onClick={() => onChange(notes.filter((_, at) => at !== index))}
            >
              <Trash2Icon className="size-4" />
            </RowButton>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/**
 * The rule's name. Only a name the Journal can hold reaches the rule: 1 to 40
 * letters, with no comma or full stop, since the Journal lists rule names
 * after commas. Anything else stays in the box, marked, and the rule keeps
 * its last good name.
 */
function RuleNameField({
  value,
  onChange,
}: {
  value: string
  onChange: (name: string) => void
}) {
  const [text, setText] = React.useState(value)
  const [last, setLast] = React.useState(value)
  if (value !== last) {
    setLast(value)
    setText(value)
  }
  const valid = ruleNameSchema.safeParse(text).success
  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor="rule-name"
        hint="Shown in the warning window and on the Journal row of a trade placed against it."
      >
        Name
      </FieldLabel>
      <Input
        id="rule-name"
        value={text}
        maxLength={40}
        aria-invalid={!valid || undefined}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          if (ruleNameSchema.safeParse(next).success) onChange(next)
        }}
        onBlur={() => {
          if (valid) return
          showErrorToast(
            "A rule name needs 1 to 40 letters, with no comma or full stop. The rule keeps its last name until this one fits."
          )
        }}
      />
    </div>
  )
}
