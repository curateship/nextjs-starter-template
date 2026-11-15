import * as React from "react"

import { useShellRuntime } from "@/components/shell/shell-layout"
import type { ShellConfig } from "@/lib/custom-shell"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

/**
 * Changes part of the site's settings, built from the newest copy.
 *
 * Every write builds a whole new config by spreading one, and some writes run
 * long after the render that made them: a save that comes back, a font that
 * finishes uploading, a drag that ends. Spreading the render's own `config`
 * there puts the settings back as they were when the screen last drew and
 * undoes anything changed since. The ref here is always the newest copy, so
 * `patch` never does.
 *
 * Written before the paint rather than during the render, which is still
 * before any press can land, because nothing can be pressed in a frame the
 * browser has not drawn. `SettingsPage` does the same with its own ref.
 */
export function useShellConfigPatch() {
  const { config, onConfigChange, onSaveConfig } = useShellRuntime()
  const latest = React.useRef(config)
  useEffectBeforePaint(() => {
    latest.current = config
  }, [config])

  const patch = React.useCallback(
    (part: Partial<ShellConfig> | ((current: ShellConfig) => Partial<ShellConfig>)) => {
      const current = latest.current
      const next = { ...current, ...(typeof part === "function" ? part(current) : part) }
      // Kept at once, so a second write in the same frame builds on this one.
      latest.current = next
      onConfigChange(next)
    },
    [onConfigChange]
  )

  return { config, patch, onSaveConfig }
}
