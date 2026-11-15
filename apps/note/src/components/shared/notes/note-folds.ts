import * as React from "react"
import { Extension } from "@tiptap/core"
import type { Node as PmNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

import { newFoldId } from "@/lib/notes/note-blocks"

/**
 * Copied from Project (`apps/project/src/components/project/notes/note-folds.ts`)
 * with its basic blocks (Tyler, 6 Nov 2026: "travel is missing some basic
 * blocks"). Which Fold sections this reader has folded (Project note blocks task, part
 * 9; Tyler, 5 Nov 2026: "Only that person"). Folding is each reader's own,
 * kept on their own computer by each section's id, and never saved in the
 * note. A section folded in the editor is folded in the reader too.
 */

const STORAGE_KEY = "page-note-folds"
/** Enough for every section anyone folds; the oldest is forgotten first. */
const MAX_KEPT = 500

let folded: string[] | null = null
const listeners = new Set<() => void>()

function read(): string[] {
  if (folded) return folded
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")
    folded = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : []
  } catch {
    folded = []
  }
  return folded
}

export function isFolded(id: string) {
  return typeof window !== "undefined" && read().includes(id)
}

export function toggleFold(id: string) {
  const now = read()
  folded = now.includes(id) ? now.filter((each) => each !== id) : [...now, id].slice(-MAX_KEPT)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(folded))
  } catch {
    // A browser that won't store it still folds until the page is closed.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether this reader has the section folded, redrawn when they fold it anywhere on the page. */
export function useFolded(id: string) {
  return React.useSyncExternalStore(
    subscribe,
    () => isFolded(id),
    () => false
  )
}

/**
 * Which of a note's top-level blocks sit under a folded section: everything
 * after a folded Fold section, up to the next Fold section or the note's end.
 */
export function hiddenByFolds<T>(children: readonly T[], foldId: (child: T) => string | null): boolean[] {
  let hiding = false
  return children.map((child) => {
    const id = foldId(child)
    if (id !== null) {
      hiding = isFolded(id)
      return false
    }
    return hiding
  })
}

const foldsKey = new PluginKey("pageNoteFolds")

function decorations(doc: PmNode) {
  const children: { node: PmNode; pos: number }[] = []
  doc.forEach((node, pos) => children.push({ node, pos }))
  const hidden = hiddenByFolds(children, ({ node }) => (node.type.name === "noteFold" ? String(node.attrs.id) : null))
  return DecorationSet.create(
    doc,
    children.flatMap(({ node, pos }, index) =>
      hidden[index] ? [Decoration.node(pos, pos + node.nodeSize, { class: "note-folded-away" })] : []
    )
  )
}

/** Hides what sits under a folded section in the editor, without touching the note itself. */
export const NoteFolds = Extension.create({
  name: "pageNoteFolds",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: foldsKey,
        props: { decorations: (state) => decorations(state.doc) },
        // Splitting a section's heading copies its id; the second half gets its own, so the two fold apart.
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          const seen = new Set<string>()
          let tr = null as ReturnType<typeof state.tr.setNodeMarkup> | null
          state.doc.forEach((node, pos) => {
            if (node.type.name !== "noteFold") return
            const id = String(node.attrs.id)
            if (!seen.has(id)) {
              seen.add(id)
              return
            }
            tr = (tr ?? state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, id: newFoldId() })
          })
          return tr
        },
        view(view) {
          // A fold anywhere redraws the decorations; the note's words don't change.
          const stop = subscribe(() => {
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(foldsKey, true).setMeta("addToHistory", false))
          })
          return { destroy: () => void stop() }
        },
      }),
    ]
  },
})
