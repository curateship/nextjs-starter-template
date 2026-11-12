import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * A page with its one fixed block (the Dashboards block on the Admin page
 * and the CRM's; Tyler, 8 Nov 2026: "It can be a fixed block but I'd need to
 * be able to move it too"): a page saved before the block existed, or one
 * that lost it some other way, gets it back at the top, and a second one is
 * dropped. A page already holding exactly one comes back as it was, the block
 * wherever it was moved to.
 */
export function withFixedBlock(body: NoteNode, type: string): NoteNode {
  const content = body.content ?? []
  let seen = false
  const kept = content.filter((node) => {
    if (node.type !== type) return true
    if (seen) return false
    seen = true
    return true
  })
  if (seen) return kept.length === content.length ? body : { ...body, content: kept }
  return { ...body, content: [{ type }, ...kept] }
}
