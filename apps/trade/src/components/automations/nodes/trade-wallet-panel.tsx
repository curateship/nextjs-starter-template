import {
  InspectorCard,
  InspectorNote,
} from "@/components/automations/inspector-card"
import { TradeNumberField } from "@/components/automations/nodes/trade-number-field"
import type { AutomationNodeFieldsProps } from "@/lib/automations/node-descriptor"
import {
  tradeWalletNode,
  tradeWalletSettingsSchema,
} from "@/lib/automations/nodes/trade-wallet"

/**
 * The pretend wallet's settings: a starting pot and what trading costs.
 *
 * Read through the step's own schema, with the step's own defaults standing in
 * for anything unreadable, so a flow saved by an older build opens with sensible
 * numbers rather than empty boxes.
 */
export default function TradeWalletFields({
  node,
  onChange,
}: AutomationNodeFieldsProps) {
  const parsed = tradeWalletSettingsSchema.safeParse(node.settings)
  const settings = parsed.success
    ? parsed.data
    : tradeWalletSettingsSchema.parse(tradeWalletNode.createSettings())

  const set = (patch: Partial<typeof settings>) =>
    onChange({ ...node, settings: { ...settings, ...patch } })

  return (
    <>
      <InspectorCard title="The pot">
        <TradeNumberField
          id={`wallet-${node.id}-start`}
          label="Starting money"
          hint="What the whole test starts with. Every coin shares it, so this is the money the strategy has to work with in total — not per coin."
          value={settings.startingUsd}
          min={1}
          max={100_000_000}
          suffix="$"
          onChange={(startingUsd) => set({ startingUsd })}
        />
      </InspectorCard>

      <InspectorCard title="What trading costs">
        <TradeNumberField
          id={`wallet-${node.id}-taker`}
          label="Taker fee"
          hint="Charged when a buy or sell takes a price that is already on the book — market buys and stops. Prefilled with what the exchange really charges."
          value={settings.takerFeePct}
          min={0}
          max={5}
          suffix="%"
          onChange={(takerFeePct) => set({ takerFeePct })}
        />
        <TradeNumberField
          id={`wallet-${node.id}-maker`}
          label="Maker fee"
          hint="Charged when an order sat and waited to be filled — the ladder's rungs and its take-profit sells."
          value={settings.makerFeePct}
          min={0}
          max={5}
          suffix="%"
          onChange={(makerFeePct) => set({ makerFeePct })}
        />
        <TradeNumberField
          id={`wallet-${node.id}-slippage`}
          label="Slippage"
          hint="How much worse than the price on the line a market order really fills. Only stops and market buys pay it; orders that waited get the price they asked for."
          value={settings.slippagePct}
          min={0}
          max={5}
          suffix="%"
          onChange={(slippagePct) => set({ slippagePct })}
        />
      </InspectorCard>

      <InspectorNote>
        Pretend money only. A backtest never touches a real or a practice
        wallet, and nothing here can move a cent. Funding costs are not counted
        yet — the results page says so.
      </InspectorNote>
    </>
  )
}
