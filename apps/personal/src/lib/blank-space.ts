/** What a double-click in the menu's empty space must not land on. */
const NOT_BLANK = "a, button, input, textarea, select, p, [role], [contenteditable='true']"

/**
 * Whether a double-click landed on the left menu's empty space, not on a
 * link, a button, a box or a line of text. Custom Shell folds its menu the
 * same way. The browser selects the nearest word on a double-click even in
 * empty space, so a yes clears that selection.
 */
export function isBlankSpace(target: EventTarget | null) {
  if (!(target instanceof Element) || target.closest(NOT_BLANK)) return false
  window.getSelection()?.removeAllRanges()
  return true
}
