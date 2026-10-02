/**
 * Whether a click on a post row should open that post's window.
 *
 * The same rules `TableRow`'s `rowAction` follows in
 * `src/components/ui/table.tsx`, for the same reasons, written here because a
 * post row is a list item and that one is a `<tr>`. Keeping the reasons
 * together matters more than sharing ten lines: get any of these wrong and the
 * window opens when somebody meant to copy a sentence or follow a link.
 */
const OWNS_ITS_OWN_CLICK = [
  "a",
  "button",
  "input",
  "[tabindex]",
  '[role="menuitem"]',
].join(", ")

export function postRowWasClicked(
  event: React.MouseEvent<HTMLElement>
): boolean {
  if (event.defaultPrevented) return false
  // A held modifier means "open this somewhere else", which a window cannot
  // do. Doing nothing beats doing the wrong thing.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false
  }
  if (!(event.target instanceof Element)) return false

  // Whatever is under the pointer owns this click: the handle's link, a coin
  // chip, Open on X.
  const owner = event.target.closest(OWNS_ITS_OWN_CLICK)
  if (owner && owner !== event.currentTarget && event.currentTarget.contains(owner)) {
    return false
  }

  // Dragging across the words to copy them is not a click on the post.
  const selection = window.getSelection()
  if (
    selection &&
    !selection.isCollapsed &&
    event.currentTarget.contains(selection.anchorNode)
  ) {
    return false
  }

  return true
}
