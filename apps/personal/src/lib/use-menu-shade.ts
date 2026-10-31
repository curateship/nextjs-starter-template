import * as React from "react"

/**
 * Sets the left menu's shade and the dark mode's shade the way Custom Shell
 * does: as `--shell-rail-card-share` (the share of the card colour in
 * `--shell-rail`) and `--shell-dark-lift` (added to every dark grey) on
 * <html>, because that is where `theme.css` works both out. A child element
 * setting them would not change anything. The menu, its drag preview and its
 * popups all follow.
 */
export function useMenuShade(shade: number, darkLift: number) {
  React.useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--shell-rail-card-share", `${shade}%`)
    root.style.setProperty("--shell-dark-lift", String(darkLift))
    return () => {
      root.style.removeProperty("--shell-rail-card-share")
      root.style.removeProperty("--shell-dark-lift")
    }
  }, [shade, darkLift])
}
