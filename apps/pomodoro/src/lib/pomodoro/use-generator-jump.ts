import * as React from "react"

/**
 * Generate with AI on the "Your own" card: a ref for the box around the
 * generator, and the jump that scrolls to it and puts the cursor in its
 * prompt, so the next thing typed is the description.
 */
export function useGeneratorJump() {
  const generatorRef = React.useRef<HTMLDivElement>(null)
  const goToGenerator = React.useCallback(() => {
    const box = generatorRef.current
    if (!box) return
    box.scrollIntoView({ behavior: "smooth", block: "start" })
    box.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus({
      preventScroll: true,
    })
  }, [])
  return { generatorRef, goToGenerator }
}
