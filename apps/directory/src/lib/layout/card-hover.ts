/**
 * The one hover a public card gets: it lifts a little and casts a shadow.
 *
 * One string rather than the same classes copied into five card files, the same
 * way `focus-ring.ts` holds the one focus ring. The cards it is on sit side by
 * side on the same pages, listings and categories on the browse page, listings
 * and deals and posts in the rows of a home page, so a card that hovered
 * differently from the one beside it would read as a mistake.
 *
 * The shadow is a `drop-shadow` rather than a `shadow`, which is a
 * `box-shadow`, because `theme.css` sets the `box-shadow` of every card from
 * the Divider lines setting and its selector beats a utility class. A filter is
 * not in that fight, and it follows the card's rounded corners.
 *
 * The shadow is written out rather than picked from the named ones, because
 * every named `drop-shadow` is a tight 1px to 4px blur and Tyler asked on
 * 25 Sep 2026 for one that spreads. This is 24px of blur at 12% black, 10px
 * below the card: wide and soft rather than dark and close.
 *
 * The lift is 2px, enough to see and not enough to shift the row. `motion-safe`
 * keeps the movement off for anyone who has asked their computer for less of
 * it; they still get the shadow, so the card still answers the pointer.
 */
export const publicCardHover =
  "transition-[filter,translate] hover:drop-shadow-[0_10px_24px_rgba(0,0,0,0.12)] motion-safe:hover:-translate-y-0.5"
