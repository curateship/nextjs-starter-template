import * as React from "react"

/**
 * Sets the left menu's shade the way Custom Shell does: as the share of the
 * card colour in `--shell-rail` (`theme.css`), on <html>, because that is
 * where `--shell-rail` is worked out. A child element setting the share would
 * not change it. The menu, its drag preview and its popups all follow.
 */
export function useMenuShade(shade: number) {
  React.useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--shell-rail-card-share", `${shade}%`)
    return () => {
      root.style.removeProperty("--shell-rail-card-share")
    }
  }, [shade])
}
