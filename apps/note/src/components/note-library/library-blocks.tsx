import * as React from "react"
import { LibraryIcon, PlusIcon, TagsIcon, type LucideIcon } from "lucide-react"

import { blockView, useBlockCount, useBlockMenu } from "@/components/shared/notes/block-card"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { SideRows, type SideRow } from "@/components/shared/notes/side-rows"
import { LIBRARIES_NODE, TAGS_NODE } from "@/lib/note/library/library-page"

/**
 * The Library dashboard's own "/" blocks on its left page (Tyler, 15 Nov
 * 2026: "I think the library should live as a left panel dashboard block").
 * Libraries is the fixed block, a row per library, the picked one dark with
 * the sliding bar. Tags follows the library picked. Pinned, Folders, Authors
 * and Recently opened went the same day; pinned notes are a middle tab.
 *
 * Each keeps no values: the dashboard works out every row and hands them down
 * through `LibraryBlocksProvider`, as Travel's Trips blocks and the CRM's do.
 */
export type LibraryBlocks = {
  libraries: SideRow[]
  /** The Libraries block's ⋮, New library. */
  onNewLibrary: () => void
  /** Null while the picked library is read, or when there is none. */
  tags: SideRow[] | null
}

const LibraryBlocksContext = React.createContext<LibraryBlocks | null>(null)

export function LibraryBlocksProvider({ value, children }: { value: LibraryBlocks; children: React.ReactNode }) {
  return <LibraryBlocksContext.Provider value={value}>{children}</LibraryBlocksContext.Provider>
}

/** What a block shows on a page with no Library dashboard behind it. */
function NotHere() {
  return <p className="p-3 text-xs text-muted-foreground">This block shows on the Library dashboard.</p>
}

/** Libraries: every library of this person's, pinned first, each with its note count. */
export function LibrariesBlock() {
  const blocks = React.useContext(LibraryBlocksContext)
  // In the block's ⋮, never a + in its heading (Tyler, 15 Nov 2026: "all the
  // + icon must move into the dotted icon dropdown").
  useBlockMenu(blocks ? [{ label: "New library", icon: <PlusIcon className="size-4" />, onSelect: blocks.onNewLibrary }] : undefined)
  if (!blocks) return <NotHere />
  return <SideRows showAll empty="No libraries yet. The ⋮ above, then New library, makes one." rows={blocks.libraries} />
}

/** Tags: every tag in the library picked, with its count. Pressing one filters the list to it. */
function TagsBlock() {
  const blocks = React.useContext(LibraryBlocksContext)
  useBlockCount(blocks?.tags?.length || undefined)
  if (!blocks) return <NotHere />
  if (!blocks.tags) return <p className="p-3 text-xs text-muted-foreground">Reading…</p>
  return <SideRows empty="No tags yet. Add them on a note, or Analyse adds its own." rows={blocks.tags} />
}

function appBlock(
  key: string,
  node: string,
  label: string,
  icon: LucideIcon,
  Draw: () => React.ReactNode,
  fixed = false
): AppBlock {
  const view = blockView({ kind: key, title: label, icon: React.createElement(icon), Draw, fixed })
  const extension = blockNode(node, {}, view)
  return {
    key,
    label,
    icon,
    node,
    extension: fixed ? keepOnPage(extension) : extension,
    ...(fixed ? { offered: false } : {}),
  }
}

/**
 * Every block the Library page knows: Libraries (fixed, never in the "/"
 * list), then Tags under Advanced blocks. Their node names are
 * `LIBRARY_PAGE_BLOCK_TYPES`, which the server cleans a saved page with.
 */
export const LIBRARY_APP_BLOCKS: readonly AppBlock[] = [
  appBlock("noteLibraries", LIBRARIES_NODE, "Libraries", LibraryIcon, LibrariesBlock, true),
  appBlock("noteLibraryTags", TAGS_NODE, "Tags", TagsIcon, TagsBlock),
]
