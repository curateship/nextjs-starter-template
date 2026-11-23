import { DELAY_UNIT_MS } from "@/lib/automations/compiled-config"
import type { NodeExecutor } from "@/server/automations/types"

export const executeDelay: NodeExecutor = async (ctx) => {
  const node = ctx.config.nodes[ctx.nodeId]
  if (node?.kind !== "delay") throw new Error("Node is not a delay node")

  const amount = Math.min(Math.max(node.settings.amount, 1), 10_000)
  const wakeAt = new Date(
    ctx.now().getTime() + amount * DELAY_UNIT_MS[node.settings.unit]
  )

  return { type: "wait", wakeAt, output: { wakeAt: wakeAt.toISOString() } }
}
