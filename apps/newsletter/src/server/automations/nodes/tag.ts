import { eq } from "drizzle-orm"

import { newsletterContacts } from "@/server/schema"
import type { NodeExecutor } from "@/server/automations/types"

export const executeTag: NodeExecutor = async (ctx) => {
  const node = ctx.config.nodes[ctx.nodeId]
  if (node?.kind !== "tag") throw new Error("Node is not a tag node")

  const current = ctx.contact.tags
  const tags =
    node.settings.mode === "add"
      ? [...new Set([...current, ...node.settings.tags])]
      : current.filter((tag) => !node.settings.tags.includes(tag))

  const [updated] = await ctx.database
    .update(newsletterContacts)
    .set({ tags, updatedAt: ctx.now() })
    .where(eq(newsletterContacts.id, ctx.contact.id))
    .returning()

  if (!updated) throw new Error("Contact not found")
  // Later nodes in this run (e.g. branch) must see the new tags.
  ctx.contact.tags = updated.tags

  return { type: "next", output: { tags: updated.tags } }
}
