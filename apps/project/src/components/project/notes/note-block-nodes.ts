import type * as React from "react"
import { Node, mergeAttributes, type Extensions } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import {
  CalendarDaysIcon,
  ActivityIcon,
  ChartLineIcon,
  CircleAlertIcon,
  ClipboardCheckIcon,
  ChevronsDownUpIcon,
  ClapperboardIcon,
  FolderKanbanIcon,
  SunriseIcon,
  FileIcon,
  GlobeIcon,
  ImageIcon,
  LinkIcon,
  InfoIcon,
  ListChecksIcon,
  ListTodoIcon,
  MessagesSquareIcon,
  UsersIcon,
  WeightIcon,
  MinusIcon,
  PlayIcon,
  type LucideIcon,
} from "lucide-react"

import {
  CalloutBlockView,
  CommentsBlockView,
  FileBlockView,
  FoldBlockView,
  ImageBlockView,
  LinksBlockView,
  RecordBlockView,
  TaskBlockView,
  VideoBlockView,
  WebPageBlockView,
} from "@/components/project/notes/note-block-views"
import {
  DailyCardBlockView,
  ProjectBlockView,
  RatingMonthBlockView,
  RatingTrendBlockView,
} from "@/components/project/notes/dashboard-blocks"
import {
  AttentionBlockView,
  CheckinsBlockView,
  MembersBlockView,
  WeekBlockView,
  WorkloadBlockView,
} from "@/components/project/notes/team-blocks"
import { NoteFolds } from "@/components/project/notes/note-folds"
import type { NoteWhere } from "@/components/project/notes/note-setup"

/**
 * The "/" blocks in a Project note (Project note blocks task), copied from
 * Travel's (`apps/travel/src/components/travel/note-block-nodes.ts`) with
 * Project's own added. Each block is one editor node holding a few plain
 * values, drawn by its view in `note-block-views.tsx`. What a saved note may
 * hold, and the checks on each value, are in `src/lib/project/note-blocks.ts`;
 * the shell's editor takes these through its `extensions` and `clean` props.
 */

export type BlockKey =
  | "image"
  | "video"
  | "task"
  | "file"
  | "comments"
  | "checklist"
  | "callout"
  | "divider"
  | "fold"
  | "record"
  | "webpage"
  | "links"
  | "project"
  | "habit"
  | "ratingMonth"
  | "ratingTrend"
  | "teamCheckins"
  | "teamWorkload"
  | "teamAttention"
  | "teamWeek"
  | "teamMembers"

/**
 * The "/" list's two groups (Tyler, 6 Nov 2026: "divider the blocks into basic
 * blocks and advanced blocks"). Basic blocks are what the writer types or
 * pastes in themselves; advanced blocks show something live from the app: a
 * task, a file, the comments, a Video or Promo record, a project, the Daily
 * card or the ratings.
 */
export type BlockGroup = "basic" | "advanced"
export const BLOCK_GROUP_LABEL: Record<BlockGroup, string> = { basic: "Basic blocks", advanced: "Advanced blocks" }

export type BlockChoice = { key: BlockKey; label: string; icon: LucideIcon; group: BlockGroup }

/**
 * In the "/" list's order: the basic blocks, then the advanced ones. Image is
 * still first (Tyler, 5 Nov 2026: "FIrst block is an image block").
 */
const BLOCKS: BlockChoice[] = [
  { key: "image", label: "Image", icon: ImageIcon, group: "basic" },
  { key: "video", label: "Video", icon: PlayIcon, group: "basic" },
  { key: "checklist", label: "Checklist", icon: ListChecksIcon, group: "basic" },
  { key: "callout", label: "Callout", icon: InfoIcon, group: "basic" },
  { key: "divider", label: "Divider", icon: MinusIcon, group: "basic" },
  { key: "fold", label: "Fold section", icon: ChevronsDownUpIcon, group: "basic" },
  { key: "webpage", label: "Web page", icon: GlobeIcon, group: "basic" },
  { key: "links", label: "Links", icon: LinkIcon, group: "basic" },
  { key: "task", label: "Task card", icon: ListTodoIcon, group: "advanced" },
  { key: "file", label: "File", icon: FileIcon, group: "advanced" },
  { key: "comments", label: "Comments", icon: MessagesSquareIcon, group: "advanced" },
  { key: "record", label: "Video or Promo", icon: ClapperboardIcon, group: "advanced" },
  // The site admin's own page only (task "My dashboard/left-panel-blocks", 6 Nov 2026).
  { key: "project", label: "Projects", icon: FolderKanbanIcon, group: "advanced" },
  { key: "habit", label: "Daily card", icon: SunriseIcon, group: "advanced" },
  { key: "ratingMonth", label: "Rating calendar", icon: CalendarDaysIcon, group: "advanced" },
  { key: "ratingTrend", label: "Rating trend", icon: ChartLineIcon, group: "advanced" },
  // A team's own page only (task "Team dashboard/admin-3-panel-design", 7 Nov 2026).
  { key: "teamCheckins", label: "Check-ins", icon: ClipboardCheckIcon, group: "advanced" },
  { key: "teamWorkload", label: "Workload", icon: WeightIcon, group: "advanced" },
  { key: "teamAttention", label: "Attention", icon: CircleAlertIcon, group: "advanced" },
  { key: "teamWeek", label: "This week", icon: ActivityIcon, group: "advanced" },
  { key: "teamMembers", label: "Members", icon: UsersIcon, group: "advanced" },
]

/** Blocks only the site admin's own page on My dashboard offers. */
const DASHBOARD_BLOCKS = new Set<BlockKey>(["project", "habit", "ratingMonth", "ratingTrend"])

/**
 * Blocks only a team's own page on the Team dashboard offers (Tyler, 7 Nov
 * 2026: "checkins, workload and attention becomes blocks for the left panel"),
 * with This week and Members, the cards that were in that panel.
 */
const TEAM_BLOCKS = new Set<BlockKey>(["teamCheckins", "teamWorkload", "teamAttention", "teamWeek", "teamMembers"])

/**
 * The blocks a notes box offers. A File block and the Video or Promo card
 * belong to a task, so New task and quick new task leave them out
 * (Tyler, 5 Nov 2026: "Leave File out there"); the Video or Promo card shows
 * only on a task that points at a record. Projects, Habit and the two rating
 * blocks are the site admin's own page's alone (Tyler, 6 Nov 2026: "Your My
 * dashboard page only"). The team blocks are a team's page's alone.
 */
export function blocksFor(where: NoteWhere, hasRecord: boolean): BlockChoice[] {
  return BLOCKS.filter((block) => {
    if (DASHBOARD_BLOCKS.has(block.key)) return where === "dashboard"
    if (TEAM_BLOCKS.has(block.key)) return where === "team"
    if (block.key === "file" || block.key === "comments") return where === "task"
    if (block.key === "record") return where === "task" && hasRecord
    return true
  })
}

/** The blocks whose name starts with what was typed after the "/". */
export function matchingBlocks(choices: BlockChoice[], query: string) {
  const words = query.toLowerCase()
  return choices.filter((block) => block.label.toLowerCase().startsWith(words))
}

function atomNode(name: string, defaults: Record<string, unknown>, view: (props: NodeViewProps) => React.ReactNode) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      // Kept in the document only: none of these is ever written into markup.
      return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, { default: value, rendered: false }]))
    },
    parseHTML() {
      return [{ tag: `div[data-note-block="${name}"]` }]
    },
    renderHTML() {
      return ["div", { "data-note-block": name }]
    },
    addNodeView() {
      return ReactNodeViewRenderer(view)
    },
  })
}

/** A box of words: a Note, a Warning or a Decision. Only paragraphs and lists go in it. */
const Callout = Node.create({
  name: "noteCallout",
  group: "block",
  content: "(paragraph | bulletList | orderedList)+",
  defining: true,
  addAttributes() {
    return { kind: { default: "note", rendered: false } }
  },
  parseHTML() {
    return [{ tag: "div[data-note-callout]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-note-callout": "" }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutBlockView)
  },
  addKeyboardShortcuts() {
    return {
      // Enter on an empty last line leaves the box, as it leaves a list, so a callout at the end of a note isn't a trap.
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty || $from.depth < 2) return false
        const callout = $from.node(-1)
        const line = $from.parent
        if (callout.type.name !== "noteCallout" || line.type.name !== "paragraph" || line.content.size > 0) return false
        if ($from.index(-1) !== callout.childCount - 1 || callout.childCount < 2) return false
        const lineStart = $from.before()
        const after = $from.after(-1)
        return editor
          .chain()
          .command(({ tr }) => {
            tr.delete(lineStart, lineStart + line.nodeSize)
            const at = after - line.nodeSize
            tr.insert(at, editor.schema.nodes.paragraph.create())
            tr.setSelection(TextSelection.create(tr.doc, at + 1))
            return true
          })
          .run()
      },
    }
  },
})

/**
 * A Fold section's heading line. What sits under it, up to the next Fold
 * section, is hidden while this reader has it folded (`note-folds.ts`).
 */
const Fold = Node.create({
  name: "noteFold",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return { id: { default: "fold", rendered: false } }
  },
  parseHTML() {
    return [{ tag: "div[data-note-fold]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-note-fold": "" }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(FoldBlockView)
  },
  addKeyboardShortcuts() {
    return {
      // Enter at the end of the heading starts the words under it, as a heading does, not a second heading.
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty || $from.parent.type.name !== "noteFold" || $from.parentOffset !== $from.parent.content.size) return false
        const after = $from.after()
        return editor
          .chain()
          .command(({ tr }) => {
            tr.insert(after, editor.schema.nodes.paragraph.create())
            tr.setSelection(TextSelection.create(tr.doc, after + 1))
            return true
          })
          .run()
      },
    }
  },
})

/**
 * Every block's node, handed to the shell's editor. Made once, at the top of
 * the module, because the editor asks for the same array every render.
 */
export const BLOCK_NODES: Extensions = [
  atomNode("noteImage", { src: null, fileId: null, alt: "", credit: null }, ImageBlockView),
  atomNode("noteVideo", { url: null }, VideoBlockView),
  atomNode("noteTask", { taskId: null }, TaskBlockView),
  atomNode("noteFile", { fileId: null }, FileBlockView),
  atomNode("noteComments", {}, CommentsBlockView),
  atomNode("noteRecord", {}, RecordBlockView),
  atomNode("noteWebPage", { url: null }, WebPageBlockView),
  atomNode("noteLinks", { links: [] }, LinksBlockView),
  atomNode("noteProject", { projectId: null }, ProjectBlockView),
  atomNode("noteHabit", {}, DailyCardBlockView),
  atomNode("noteRatingMonth", {}, RatingMonthBlockView),
  atomNode("noteRatingTrend", {}, RatingTrendBlockView),
  atomNode("noteTeamCheckins", {}, CheckinsBlockView),
  atomNode("noteTeamWorkload", {}, WorkloadBlockView),
  atomNode("noteTeamAttention", {}, AttentionBlockView),
  atomNode("noteTeamWeek", {}, WeekBlockView),
  atomNode("noteTeamMembers", {}, MembersBlockView),
  Callout,
  Fold,
  TaskList,
  // A ticked line is only a tick; it is never a task or a step (Tyler, 5 Nov 2026: "Tick only").
  TaskItem.configure({ nested: true }),
  NoteFolds,
]
