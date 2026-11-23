import type { NodeExecutor } from "@/server/automations/types"

export const executeBranch: NodeExecutor = async (ctx) => {
  const node = ctx.config.nodes[ctx.nodeId]
  if (node?.kind !== "branch") throw new Error("Node is not a branch node")

  const { field, op, value } = node.settings
  let result = false

  if (field === "tag") {
    const needle = value.toLowerCase()
    const tags = ctx.contact.tags.map((tag) => tag.toLowerCase())
    result =
      op === "contains"
        ? tags.some((tag) => tag.includes(needle))
        : tags.includes(needle)
  } else {
    const subject = (
      field === "source" ? (ctx.contact.source ?? "") : ctx.contact.email
    ).toLowerCase()
    const needle = value.toLowerCase()
    result = op === "contains" ? subject.includes(needle) : subject === needle
  }

  return { type: "next", port: result ? "yes" : "no", output: { result } }
}
