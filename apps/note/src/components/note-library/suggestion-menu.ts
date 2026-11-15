import { Extension, type Editor, type Range } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import { ReactRenderer } from "@tiptap/react"
import Suggestion, { exitSuggestion, type SuggestionProps } from "@tiptap/suggestion"

import {
  SuggestionList,
  type ListHandle,
  type ListProps,
  type MenuItem,
} from "@/components/note-library/suggestion-list"

/**
 * A list that opens while typing, for the "/" block menu and the "[[" note
 * picker. Arrows move, Enter picks, Escape closes, and typing narrows it.
 * The suggestion plugin places the list beside the cursor itself.
 */

export type { MenuItem }

/**
 * Builds one typing menu as an editor extension. `items` may be slow (a
 * search on the server), and the menu says "Looking…" until it answers.
 */
/** The gap kept between a list and the window's edge. */
const EDGE = 8

/**
 * Moves a list that would run past the bottom of the window up until it fits,
 * as far as its top. The "/" list has no scroller (Tyler, 15 Nov 2026: "we
 * dont need areascroll. just make it fit all the tools"), so a list that ran
 * off the bottom would hide its last rows. Written here rather than taken
 * from floating-ui, which is not one of the app's own packages. With the
 * `fixed` strategy, `y` is measured from the top of the window.
 */
const fitOnScreen = {
  name: "fitOnScreen",
  fn: ({ y, rects }: { y: number; rects: { floating: { height: number } } }) => {
    const last = window.innerHeight - EDGE - rects.floating.height
    return { y: y > last ? Math.max(EDGE, last) : y }
  },
}

export function createSuggestionMenu<T extends MenuItem>(options: {
  name: string
  char: string
  label: string
  emptyText: string
  /** Every row shows with no scrolling, as the "/" list does (Tyler, 15 Nov 2026: "just make it fit all the tools"). */
  fitAll?: boolean
  startOfLine?: boolean
  debounce?: number
  items: (query: string, editor: Editor) => T[] | Promise<T[]>
  pick: (editor: Editor, range: Range, item: T) => void
}) {
  const pluginKey = new PluginKey(options.name)
  return Extension.create({
    name: options.name,
    addProseMirrorPlugins() {
      return [
        Suggestion<T, T>({
          pluginKey,
          editor: this.editor,
          char: options.char,
          startOfLine: options.startOfLine ?? false,
          allowSpaces: options.char !== "/",
          debounce: options.debounce,
          ...(options.fitAll ? { floatingUi: { strategy: "fixed" as const, middleware: [fitOnScreen] } } : {}),
          items: ({ query, editor }) => options.items(query, editor),
          command: ({ editor, range, props }) => options.pick(editor, range, props),
          render: () => {
            let renderer: ReactRenderer<ListHandle, ListProps> | null = null
            let unmount: (() => void) | null = null
            const propsFor = (props: SuggestionProps<T, T>): ListProps => ({
              label: options.label,
              items: props.items,
              loading: props.loading,
              emptyText: options.emptyText,
              fitAll: options.fitAll ?? false,
              onPick: (item) => props.command(item as T),
            })
            return {
              onStart: (props) => {
                renderer = new ReactRenderer(SuggestionList, { props: propsFor(props), editor: props.editor })
                renderer.element.style.zIndex = "50"
                unmount = props.mount(renderer.element as HTMLElement)
              },
              onUpdate: (props) => renderer?.updateProps(propsFor(props)),
              onKeyDown: (props) => {
                if (props.event.key === "Escape") {
                  exitSuggestion(props.view, pluginKey)
                  return true
                }
                return renderer?.ref?.onKeyDown(props.event) ?? false
              },
              onExit: () => {
                unmount?.()
                renderer?.element.remove()
                renderer?.destroy()
                renderer = null
                unmount = null
              },
            }
          },
        }),
      ]
    },
  })
}
