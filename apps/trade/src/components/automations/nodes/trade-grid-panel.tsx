import { PlusIcon, Trash2Icon } from "lucide-react"

import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { TradeNumberField } from "@/components/automations/nodes/trade-number-field"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import {
  emaGridCleanHours,
  emaGridDaysForCleanHours,
  EMA_GRID_CANDLE_HOURS,
  MAX_EMA_GRID_CLEAN_HOURS,
  MIN_EMA_GRID_CLEAN_HOURS,
  tradeGridNode,
  tradeGridSettingsSchema,
  type TradeGridSettings,
} from "@/lib/automations/nodes/trade-grid"
import {
  GRID_SPACING_HINT,
  GRID_SPACING_LABELS,
  GRID_SPACINGS,
  gridEvenRungPcts,
  gridRungPctsFit,
  gridRungPctsSum,
  MAX_GRID_LEVELS,
  MAX_GRID_STOP_UNDER_PCT,
  MIN_GRID_LEVELS,
} from "@/lib/trade/grid"

export default function TradeGridFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const parsed = tradeGridSettingsSchema.safeParse(node.settings)
  const settings = parsed.success
    ? parsed.data
    : tradeGridSettingsSchema.parse(tradeGridNode.createSettings())

  const write = (next: TradeGridSettings) =>
    onChange({ ...node, settings: { ...node.settings, ...next } })
  const setGrid = (patch: Partial<TradeGridSettings["grid"]>) =>
    write({ ...settings, grid: { ...settings.grid, ...patch } })
  const savedRungs = settings.grid.manualRungPcts
  const rungPcts =
    savedRungs && savedRungs.length === settings.grid.levels
      ? savedRungs
      : gridEvenRungPcts(settings.grid.levels)
  const rungSum = gridRungPctsSum(rungPcts)

  const setRungs = (manualRungPcts: number[]) =>
    setGrid({ levels: manualRungPcts.length, manualRungPcts })
  const setManualSizing = (manualSizing: boolean) => {
    if (!manualSizing) {
      setGrid({ manualSizing: false })
      return
    }
    setGrid({
      manualSizing: true,
      levels: rungPcts.length,
      manualRungPcts: rungPcts,
    })
  }

  return (
    <>
      <InspectorCard title="What calls the grid">
        <TradeNumberField
          id={`grid-${node.id}-hours`}
          label="Clean hours"
          hint="Every wick on each closed 4-hour candle must stay on one side of the EMA for this long. One touch restarts the count, so the value moves in 4-hour steps."
          value={emaGridCleanHours(settings)}
          min={MIN_EMA_GRID_CLEAN_HOURS}
          max={MAX_EMA_GRID_CLEAN_HOURS}
          integer
          step={EMA_GRID_CANDLE_HOURS}
          suffix="hours"
          onChange={(hours) =>
            write({ ...settings, days: emaGridDaysForCleanHours(hours) })
          }
        />
        <TradeNumberField
          id={`grid-${node.id}-ema`}
          label="EMA candles"
          hint="How many 4-hour candle closes make the average. The number is saved on this step, so changing the chart does not change the flow."
          value={settings.emaPeriod}
          min={1}
          max={1_000}
          integer
          onChange={(emaPeriod) => write({ ...settings, emaPeriod })}
        />
        <InspectorNote>
          After the Clean hours wait, entirely above opens a buying grid and
          entirely below opens a selling grid. Mixed candles wait and never
          close a running grid.
        </InspectorNote>
      </InspectorCard>

      <InspectorCard title="Grid">
        {settings.grid.manualSizing ? (
          <InspectorNote>
            The Rungs card sets the level count. This grid has {rungPcts.length}{" "}
            custom rungs.
          </InspectorNote>
        ) : (
          <TradeNumberField
            id={`grid-${node.id}-levels`}
            label="Levels"
            hint="How many prices the range is split into. Every level gets the same share of the grid's money."
            value={settings.grid.levels}
            min={MIN_GRID_LEVELS}
            max={MAX_GRID_LEVELS}
            integer
            onChange={(levels) => setGrid({ levels })}
          />
        )}
        <TradeNumberField
          id={`grid-${node.id}-range`}
          label="Range from the current price"
          hint="How far the grid reaches from the current price when the clean run confirms. A buying grid reaches below it and a selling grid reaches above it. Range and the number of rungs together set the distance between rung prices."
          value={settings.grid.rangePct}
          min={0.01}
          max={99}
          suffix="%"
          onChange={(rangePct) => setGrid({ rangePct })}
        />
        <TradeNumberField
          id={`grid-${node.id}-pot`}
          label="Share of wallet"
          hint={
            settings.grid.manualSizing
              ? "The share of the wallet the whole grid may use. The Rungs card divides this money."
              : "The share of the wallet the whole grid may use, split evenly between its levels."
          }
          value={settings.grid.potPct}
          min={0.01}
          max={100}
          suffix="%"
          onChange={(potPct) => setGrid({ potPct })}
        />
        <TradeNumberField
          id={`grid-${node.id}-leverage`}
          label="Borrowing"
          hint="How many dollars of coin each dollar behind the grid controls. The exchange's lower limit still wins."
          value={settings.grid.leverage}
          min={1}
          max={50}
          integer
          suffix="×"
          onChange={(leverage) => setGrid({ leverage })}
        />
        <div className="grid gap-2">
          <FieldLabel
            htmlFor={`grid-${node.id}-spacing`}
            className="text-xs"
            hint={GRID_SPACING_HINT}
          >
            Spacing
          </FieldLabel>
          <Select
            value={settings.grid.spacing}
            onValueChange={(spacing) =>
              setGrid({
                spacing: spacing as TradeGridSettings["grid"]["spacing"],
              })
            }
          >
            <SelectTrigger
              id={`grid-${node.id}-spacing`}
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRID_SPACINGS.map((spacing) => (
                <SelectItem key={spacing} value={spacing}>
                  {GRID_SPACING_LABELS[spacing]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </InspectorCard>

      <InspectorCard title="Rungs">
        <InspectorNote>
          Range and the number of rungs set how far apart the rung prices are.
          Use Add rung or the trash button when custom rungs are on. Custom rung
          percentages only divide the grid&apos;s money.
        </InspectorNote>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`grid-${node.id}-manual-rungs`}
            checked={settings.grid.manualSizing}
            onCheckedChange={(checked) => setManualSizing(checked === true)}
          />
          <FieldLabel
            htmlFor={`grid-${node.id}-manual-rungs`}
            className="text-xs"
            hint="Give each rung its own share of the grid's money. The shares must add up to 100."
          >
            Set each rung by hand
          </FieldLabel>
        </div>
        {settings.grid.manualSizing ? (
          <>
            <InspectorNote>
              Rung 1 is the first trade nearest the current price. When the EMA
              flips the grid, these shares turn with it so the rung numbers keep
              the same money.
            </InspectorNote>
            {rungPcts.map((pct, index) => (
              <div
                key={`${node.id}-rung-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_2rem] items-end gap-2"
              >
                <TradeNumberField
                  id={`grid-${node.id}-rung-${index + 1}`}
                  label={`Rung ${index + 1}`}
                  hint="This rung's share of the money set by Share of wallet."
                  value={pct}
                  min={0.01}
                  max={100}
                  suffix="%"
                  onChange={(next) =>
                    setRungs(
                      rungPcts.map((held, heldIndex) =>
                        heldIndex === index ? next : held
                      )
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={rungPcts.length <= MIN_GRID_LEVELS}
                  aria-label={`Remove rung ${index + 1}`}
                  onClick={() =>
                    setRungs(
                      rungPcts.filter((_, heldIndex) => heldIndex !== index)
                    )
                  }
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Adds up to</span>
              <span
                className={
                  gridRungPctsFit(rungPcts)
                    ? "text-muted-foreground tabular-nums"
                    : "text-destructive tabular-nums"
                }
              >
                {Math.round(rungSum * 100) / 100}%
                {gridRungPctsFit(rungPcts) ? "" : " · needs 100%"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rungPcts.length >= MAX_GRID_LEVELS}
                onClick={() =>
                  setRungs([...rungPcts, rungPcts[rungPcts.length - 1] ?? 10])
                }
              >
                <PlusIcon />
                Add rung
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRungs(gridEvenRungPcts(rungPcts.length))}
              >
                Even split
              </Button>
            </div>
          </>
        ) : (
          <InspectorNote>
            Off splits the grid's money evenly between every level.
          </InspectorNote>
        )}
      </InspectorCard>

      <InspectorCard title="Following price">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`grid-${node.id}-follow-up`}
            checked={settings.grid.follow}
            onCheckedChange={(checked) => setGrid({ follow: checked === true })}
          />
          <FieldLabel
            htmlFor={`grid-${node.id}-follow-up`}
            className="text-xs"
            hint="When price reaches the top, the range walks up one rung and keeps trading. This is the risky direction while the EMA has the grid selling."
          >
            Follow price up
          </FieldLabel>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`grid-${node.id}-follow-down`}
            checked={settings.grid.followDown}
            onCheckedChange={(checked) =>
              setGrid({ followDown: checked === true })
            }
          />
          <FieldLabel
            htmlFor={`grid-${node.id}-follow-down`}
            className="text-xs"
            hint="When price reaches the bottom, the range walks down one rung and keeps trading. This is the risky direction while the EMA has the grid buying."
          >
            Follow price down
          </FieldLabel>
        </div>
        <InspectorNote>
          Moving toward the grid's losing side never moves its stop farther
          away.
        </InspectorNote>
      </InspectorCard>

      <InspectorCard title="Safety stop">
        <TradeNumberField
          id={`grid-${node.id}-stop`}
          label="Emergency stop past the losing edge"
          hint="How far beyond the losing end of the range the emergency stop sits. Below a buying grid, above a selling grid."
          value={settings.grid.stopLoss.underPct}
          min={0}
          max={MAX_GRID_STOP_UNDER_PCT}
          suffix="%"
          onChange={(underPct) =>
            setGrid({ stopLoss: { ...settings.grid.stopLoss, underPct } })
          }
        />
        <InspectorNote>
          EMA 200 keeps this flow looping. When price stays completely on the
          other side for the Clean hours wait, the current grid closes and the
          opposite grid starts.
        </InspectorNote>
        <InspectorNote>
          The emergency stop closes one grid. If the flow is still on, Grid
          waits for the next closed candle and starts again. Only Stop on the
          flow ends the EMA loop.
        </InspectorNote>
      </InspectorCard>
    </>
  )
}
