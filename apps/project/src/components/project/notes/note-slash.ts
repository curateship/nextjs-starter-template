import { Extension, type Editor } from "@tiptap/core"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"

/**
 * The "/" that opens a note's block list, copied from Travel
 * (`apps/travel/src/components/travel/note-slash.ts`; Project note blocks task,
 * part 1). It opens
 * when "/" is typed at the start of a line or after a space, so the "/" in a
 * web address never opens it, and the letters typed after it narrow the list.
 * Esc or a click away closes it and leaves the "/" as typed.
 */

/** Where the "/" and the letters after it sit, while the list is open. */
export type SlashMatch = { from: number; to: number; query: string }

/** How the editor tells the list what is typed, and hands it the keys it uses while open. */
export type SlashBridge = {
  onChange: (match: SlashMatch | null, editor: Editor | null) => void
  /** The keys typed while the list is open, with where the "/" is now and the note's editor. */
  onKey: (event: KeyboardEvent, match: SlashMatch, editor: Editor) => boolean
}

type SlashState = { open: SlashMatch | null; dismissed: number | null }

const slashKey = new PluginKey<SlashState>("projectNoteSlash")
const SLASH_BEFORE_CURSOR = /(?:^|\s)\/([A-Za-z]{0,20})$/

function findSlash(state: EditorState): SlashMatch | null {
  const { selection } = state
  if (!selection.empty) return null
  const $from = selection.$from
  if (!$from.parent.isTextblock) return null
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼")
  const match = SLASH_BEFORE_CURSOR.exec(before)
  if (!match) return null
  const to = $from.pos
  return { from: to - match[1].length - 1, to, query: match[1] }
}

/** Closes the list where it is, until the "/" is typed again somewhere else. */
export function dismissSlash(editor: Editor) {
  const { view } = editor
  const open = slashKey.getState(view.state)?.open
  if (open) view.dispatch(view.state.tr.setMeta(slashKey, { dismiss: open.from }))
}

export function noteSlashExtension(bridge: SlashBridge) {
  return Extension.create({
    name: "projectNoteSlash",
    addProseMirrorPlugins() {
      const editor = this.editor
      return [
        new Plugin<SlashState>({
          key: slashKey,
          state: {
            init: () => ({ open: null, dismissed: null }),
            apply(tr, value, _old, next) {
              const meta = tr.getMeta(slashKey) as { dismiss: number } | undefined
              const found = findSlash(next)
              const dismissed = meta ? meta.dismiss : found ? value.dismissed : null
              return { open: found && found.from !== dismissed ? found : null, dismissed }
            },
          },
          props: {
            handleKeyDown(view, event) {
              const open = slashKey.getState(view.state)?.open
              if (!open) return false
              if (event.key === "Escape") {
                dismissSlash(editor)
                return true
              }
              return bridge.onKey(event, open, editor)
            },
          },
          view(view) {
            // Leaving the note closes the list; a click on the list itself doesn't leave it.
            const onBlur = () => dismissSlash(editor)
            view.dom.addEventListener("blur", onBlur)
            return {
              update: (current) => bridge.onChange(slashKey.getState(current.state)?.open ?? null, editor),
              destroy: () => {
                view.dom.removeEventListener("blur", onBlur)
                bridge.onChange(null, null)
              },
            }
          },
        }),
      ]
    },
  })
}
