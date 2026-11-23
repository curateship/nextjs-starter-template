import * as React from "react"

/**
 * Whether the page is dark right now, read from the `dark` class the theme
 * provider puts on <html>.
 *
 * The stored theme can be "system", and "not light" is not the same as dark:
 * on a light-mode computer "system" draws light. Reading the class is reading
 * the answer the provider already worked out, so the photo menu's Dark mode
 * row and Settings → Appearance cannot disagree with what is on screen.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })
  return () => observer.disconnect()
}

const appliedDark = () => document.documentElement.classList.contains("dark")

// The server cannot know; dark is the product's resting look.
const serverDark = () => true

export function useAppliedDark() {
  return React.useSyncExternalStore(subscribe, appliedDark, serverDark)
}
