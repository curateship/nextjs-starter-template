import { useSlidingPill } from "@/lib/hooks/use-sliding-pill"

/**
 * The picked button on an editor's tool rail, the video editor's and the
 * carousel studio's: a black edge down its left side, at the edge of the
 * screen (Tyler, 20 Oct 2026: "the black border on editor and caurosel should
 * be on the left edge"). Drawn in the text colour, so it is white in the dark
 * theme.
 *
 * The edge is one piece that slides from button to button on the tabs' curve
 * (Tyler: "make the tab animation slide"), the shell's sliding pill drawn 2px
 * wide. The caller puts `trackRef` and `trackProps` on a `relative` box
 * holding every rail button, so the buttons' offsets are measured from it, and
 * spreads `pillProps` on a `<span>` inside it. Each button marks itself with
 * `aria-pressed`.
 */
export function useRailPickedEdge<T extends HTMLElement = HTMLDivElement>() {
  return useSlidingPill<T>({
    selected: 'button[aria-pressed="true"]',
    observe: "button",
    attributes: ["aria-pressed"],
    // The pill takes the button's box; the important width beats that box's
    // inline width and leaves a line down its left side.
    className: "w-0.5! bg-foreground shadow-none",
  })
}

/**
 * The picked button's own edge for the moment before the sliding one has been
 * measured, so a page arrives with the line already in place. The button
 * needs `relative`.
 */
export const railPickedEdge =
  "in-data-[pill=pending]:after:absolute in-data-[pill=pending]:after:inset-y-0 in-data-[pill=pending]:after:left-0 in-data-[pill=pending]:after:w-0.5 in-data-[pill=pending]:after:bg-foreground"
