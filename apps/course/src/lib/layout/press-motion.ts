/**
 * Motion that answers a person, and only a person.
 *
 * The small black bar before a picked row (`SlideBar` in the left page's
 * blocks, `OpenBar` in the CRM's tables) grows in over 220ms when a row is
 * pressed. A dashboard also picks a row by itself on arrival, opening the
 * first one so the right panel is never empty (`dashboard-place.ts`), and
 * that pick lands after the page has loaded, so the bar slid in on every
 * load (Tyler, 9 Nov 2026: "whenever i load a page, the black pill animation
 * pushes in every time. We have to disable that").
 *
 * So a press or a key arms the bars on screen at that moment, for two
 * seconds, and only an armed bar slides. A bar drawn after the press, by a
 * refresh, a new dashboard or the page's own pick on arrival, snaps into
 * place (Tyler, 9 Nov 2026: "if it has to refresh then dont add
 * animation"). A press on a row, or on the Dashboards block of a page that
 * stays on screen, slides as before.
 */
const ARMED = "data-slide-armed"
const BARS = "[data-open-bar],[data-dashboards-bar]"
const HOLD_MS = 2000

/**
 * On a bar: its width and gap slide only while it is armed, and never with
 * less motion asked for. The duration sits behind the same condition, because
 * a duration on its own animates everything: `transition-property` starts as
 * `all`.
 */
export const pressSlideClassName =
  "motion-safe:data-[slide-armed]:transition-[width,margin-right] motion-safe:data-[slide-armed]:duration-[220ms] motion-safe:data-[slide-armed]:ease-[cubic-bezier(0.2,0.8,0.2,1)]"

let disarmTimer: number | undefined

function disarm() {
  for (const bar of document.querySelectorAll(`[${ARMED}]`)) bar.removeAttribute(ARMED)
}

function armBarsOnScreen() {
  window.clearTimeout(disarmTimer)
  disarm()
  for (const bar of document.querySelectorAll(BARS)) bar.setAttribute(ARMED, "")
  disarmTimer = window.setTimeout(disarm, HOLD_MS)
}

if (typeof window !== "undefined") {
  // Capture, so a handler that stops the event further down still counts.
  window.addEventListener("pointerdown", armBarsOnScreen, { capture: true, passive: true })
  window.addEventListener("keydown", armBarsOnScreen, { capture: true })
}
