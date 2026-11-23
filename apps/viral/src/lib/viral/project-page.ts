import type { NoteNode } from "@/lib/notes/note-blocks"
import { readPageBody, storedPageBody } from "@/lib/notes/page-body"

/**
 * A project's own page on the left of its dashboard, copied from Promo's
 * project page (Tyler, 21 Nov 2026: "Copy the pattern of the promo app
 * instead"; `apps/promo/src/lib/social/project-description.ts`). It is the
 * project's notes, written in the shell's editor, holding:
 *
 * - **Socials**, fixed at the top, as Promo's Networks block: each social the
 *   project uses, picking what the middle shows.
 * - **Vault**, fixed under it, as Promo's Archive block: the project's ideas
 *   and its Winning ads.
 *
 * The creators and what Promo reads on X, Reddit and LinkedIn were blocks
 * here, and moved to the middle (Tyler, 21 Nov 2026: "Move the creators block
 * into the middle tab here", then "these belong in the middle panel"). A page
 * that still holds one of those blocks loses it when read, since none is a
 * block of this page any more.
 *
 * The page is kept in `viral_projects.notes`.
 */

export const PROJECT_SOCIALS_NODE = "noteViralProjectSocials"
export const PROJECT_VAULT_NODE = "noteViralProjectVault"

const PROJECT_PAGE_BLOCK_TYPES = [PROJECT_SOCIALS_NODE, PROJECT_VAULT_NODE] as const

export const PROJECT_PAGE_ERRORS = {
  locked: "The project's page is locked. Unlock it in the project's ⋮ first.",
} as const

function hasNode(body: NoteNode, type: string) {
  return (body.content ?? []).some((node) => node.type === type)
}

/**
 * The two fixed blocks, as Promo keeps its Networks and Archive blocks: a
 * page saved without Socials gets it back at the top, one without Vault gets
 * it back under Socials, and a second of either is dropped. Where they were
 * moved to stays.
 *
 * A page that starts with a block gets an empty line above it, so there is
 * always somewhere to click and write before the blocks (Tyler, 21 Nov 2026,
 * pointing above Socials: "I cant click here for the editor"). The editor
 * puts no cursor above a block at the very top on its own.
 */
function withFixedProjectBlocks(body: NoteNode): NoteNode {
  const seen = new Set<string>()
  const content = (body.content ?? []).filter((node) => {
    if (node.type !== PROJECT_SOCIALS_NODE && node.type !== PROJECT_VAULT_NODE) return true
    if (seen.has(node.type)) return false
    seen.add(node.type)
    return true
  })
  if (!seen.has(PROJECT_SOCIALS_NODE)) content.unshift({ type: PROJECT_SOCIALS_NODE })
  if (!seen.has(PROJECT_VAULT_NODE)) {
    const at = content.findIndex((node) => node.type === PROJECT_SOCIALS_NODE)
    content.splice(at + 1, 0, { type: PROJECT_VAULT_NODE })
  }
  if (content[0]?.type === PROJECT_SOCIALS_NODE || content[0]?.type === PROJECT_VAULT_NODE) content.unshift({ type: "paragraph" })
  return { ...body, content }
}

/**
 * The page as the screen draws it. A page from before the blocks gets the
 * two fixed blocks at the top, then its words.
 */
export function projectPageBody(stored: string): NoteNode {
  const body = readPageBody(stored, PROJECT_PAGE_BLOCK_TYPES)
  if (hasNode(body, PROJECT_SOCIALS_NODE)) return withFixedProjectBlocks(body)
  const words = (body.content ?? []).filter((node) => !(node.type === "paragraph" && !(node.content ?? []).length))
  return withFixedProjectBlocks({
    type: "doc",
    content: [{ type: PROJECT_SOCIALS_NODE }, { type: PROJECT_VAULT_NODE }, ...words, { type: "paragraph" }],
  })
}

/** What is saved: the cleaned page, its fixed blocks put back if they went. */
export function storedProjectPage(text: string): string {
  const stored = storedPageBody(text, PROJECT_PAGE_BLOCK_TYPES)
  const body = stored ? (JSON.parse(stored) as NoteNode) : { type: "doc", content: [] }
  return JSON.stringify(withFixedProjectBlocks(body))
}
