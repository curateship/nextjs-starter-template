import * as React from "react"
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { showErrorToast } from "@/lib/toast/error-toast"

// What the sidebar editor and the top-right menu editor share: both edit
// draggable lists of links an admin typed addresses into, so the grab handle,
// the id maker and the address check live here once. In a file of their own
// (not sidebar-settings.tsx) so component files export only components.

/**
 * The grab handle on a section, a link, a child link and a top-right chip. All
 * are the same control, so all look and behave the same: an open hand on hover
 * that closes while you drag, and the row lighting up so it reads as grabbable.
 */
export const DRAG_HANDLE_CLASS =
  "flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"

/**
 * How every nav editor listens for a drag: a pointer has to travel 8px before
 * it counts as one, so clicking a row still clicks it, and the keyboard can
 * reorder without a mouse.
 */
export function useNavSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
}

/**
 * A draggable row, plus the style that moves it while you drag.
 *
 * `translateOnly` is for rows that are not all the same size — the top-right
 * chips and the sidebar's section cards. dnd-kit's full transform carries a
 * stretch factor so a row can morph into a differently-sized neighbour's
 * space, which skews the label mid-drag; translating only slides it instead.
 */
export function useSortableRow(id: string, translateOnly = false) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: (translateOnly ? CSS.Translate : CSS.Transform).toString(
      transform
    ),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }

  return { attributes, listeners, setNodeRef, style, isDragging }
}

/**
 * A chip you can pick up anywhere on it, not only by its grip.
 *
 * The grip used to be the only drag target, and a chip is a box with a name in
 * the middle of it: grabbing the name, which is the biggest thing on it and the
 * obvious handle, did nothing at all and the chip stayed where it was. Tyler
 * reported that on 27 Sep 2026. The whole chip listens now, and the grip stays
 * as the picture that says the chip can be moved.
 *
 * The chip takes `role="group"` rather than the `button` dnd-kit gives a
 * draggable, because a chip holds its own buttons and a button inside a button
 * is not a thing. It keeps the tab stop and the keyboard drag, so space still
 * picks a chip up and the arrows still move it.
 *
 * A click inside the chip still works: the pointer has to travel 8px before it
 * counts as a drag, which is what `useNavSensors` already says.
 */
export function useSortableChip(id: string, name: string) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(id, true)

  return {
    ref: setNodeRef,
    style,
    ...attributes,
    ...listeners,
    role: "group",
    "aria-label": `Reorder ${name}`,
    // The hand says what the chip does. It is on the whole chip because the
    // whole chip drags, including over the name, which also opens the chip's
    // window on a plain click.
    className: "cursor-grab active:cursor-grabbing",
  } as const
}

/** The grip inside such a chip: a picture, because the whole chip drags. */
export const DRAG_GRIP_CLASS =
  "flex h-8 w-8 items-center justify-center text-muted-foreground"

export function createShellId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}`
}

/**
 * Why this address will not work, in the words the user gets told, or null when
 * it is fine. It checks the shape only — a path inside the app, or a full web
 * address — never whether the route exists, and it never blocks a save. A dead
 * address is a warning, the same as a bad hex colour in Styling settings.
 *
 * A blank address is only a problem once the link has a name. A brand new link
 * starts blank on purpose and stays out of the navigation until it is named.
 *
 * `href` is typed as required, but stored sections come back from jsonb with
 * only an Array.isArray check, so a legacy or hand-edited row can arrive
 * without one — same reason `isShellEntryNamed` guards its label.
 */
function getShellHrefProblem(href: string | undefined, isNamed: boolean) {
  if (!href) {
    return isNamed ? "Give this link an address, like /admin/media." : null
  }

  if (/\s/.test(href)) {
    return "An address cannot contain spaces. Try /admin/media."
  }

  if (href.startsWith("/")) return null

  if (/^https?:\/\//i.test(href)) {
    try {
      new URL(href)
      return null
    } catch {
      return "That is not a complete web address. Try https://example.com."
    }
  }

  return "An address has to start with / — like /admin/media — or be a full web address, like https://example.com."
}

/**
 * The props that turn an address box into a checked one. Every address box —
 * a link's, its children's and a top-right link's — spreads this, so they can
 * never drift into warning about different things.
 *
 * The red ring on a *blank* address waits until you have actually been in the
 * box: naming a brand new link would otherwise redden an address field you have
 * not reached yet. Anything already typed is wrong on sight, so a link saved
 * before this check existed shows its problem the moment its editor opens. The
 * message itself is a toast on leaving the field, never per keystroke.
 */
export function useCheckedAddress(href: string | undefined, isNamed: boolean) {
  const [touched, setTouched] = React.useState(false)
  const problem = getShellHrefProblem(href, isNamed)

  return {
    "aria-invalid":
      (Boolean(problem) && (Boolean(href) || touched)) || undefined,
    onBlur: () => {
      setTouched(true)
      if (problem) showErrorToast(problem)
    },
  }
}
