import * as React from "react"

/**
 * Anything that already does its own thing with Space, or takes typing. A
 * focused button presses itself on Space, so the timer must not press too.
 */
const OWNS_SPACE = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='checkbox']",
  "[role='switch']",
  "[role='tab']",
  "[role='slider']",
  "[role='option']",
  "[role='menuitem']",
  "[role='textbox']",
].join(",")

/** A Radix dialog, alert dialog or popover that is open over the page. */
const OPEN_LAYER =
  "[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']"

/** Whether a Space press should go to the timer rather than to what has focus. */
export function spaceIsForTheTimer(event: KeyboardEvent) {
  if (event.code !== "Space" && event.key !== " ") return false
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return false
  if (event.defaultPrevented) return false
  const target = event.target
  if (target instanceof Element && target.closest(OWNS_SPACE)) return false
  return !document.querySelector(OPEN_LAYER)
}

/**
 * Space starts and pauses the timer, the way it does on every other timer
 * people have used. Only while nothing else wants the key: typing a task
 * with spaces in it, or pressing a focused button, never touches the timer.
 */
export function useSpaceToggle(toggle: () => void) {
  // The newest toggle, so the one listener never calls a stale one.
  const latest = React.useRef(toggle)
  React.useLayoutEffect(() => {
    latest.current = toggle
  })
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!spaceIsForTheTimer(event)) return
      // Space on the page itself would otherwise scroll it.
      event.preventDefault()
      latest.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
