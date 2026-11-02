/**
 * The one focus ring, so every keyboard stop in the app looks the same. It is
 * the ring `Button` already draws (`src/components/ui/button.tsx`); anything
 * that is not a `Button` — a link, a card header, a table row — reaches for one
 * of these two instead of writing a ring of its own.
 */

/** The ring, drawn just outside the control. Use this unless it is clipped. */
export const focusRing =
  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

/**
 * The same ring drawn just inside the control instead, for the two places the
 * outside one would never be seen:
 *
 * - Anything filling its card edge to edge. A `Card` hides what overflows it,
 *   so a ring painted outside a full-width child is cut off entirely.
 * - A table row. A ring is a box-shadow, and browsers do not paint a
 *   box-shadow on a `<tr>` in a collapsed-border table — which is every table
 *   here, since that is the browser default Tailwind keeps.
 *
 * An outline is painted in both cases, and the negative offset pulls it inside
 * the box so nothing can clip it.
 *
 * Note the missing `outline-none`: Tailwind's version of it does not only hide
 * the outline, it sets the outline *style* to none for the whole element, and
 * `outline-2` then draws a 2px-wide outline of no style — that is, nothing at
 * all. Leaving it off costs nothing, because a browser only draws its own
 * outline on keyboard focus, which is the moment this replaces it.
 */
export const focusRingInset =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
