import * as React from "react"

import {
  getLinkImportErrorMessage,
  listProjectLinkImports,
} from "@/lib/api/video/link-imports"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { LinkImportItem } from "@/lib/video/link-imports"

/** How often the panel asks after imports still on their way. */
const LINK_IMPORT_RECHECK_MS = 4000

/**
 * This project's imports still on their way and the failed ones. While any
 * is waiting or downloading it asks again every few seconds, and stops when
 * none is. `onLanded` runs when one has left the list, which is a file
 * arriving on the shelf, so the panel can show it.
 */
export function useLinkImports({
  projectId,
  enabled,
  onLanded,
}: {
  projectId: string
  enabled: boolean
  onLanded: () => void
}) {
  const [imports, setImports] = React.useState<LinkImportItem[]>([])
  const [version, setVersion] = React.useState(0)
  const onLandedRef = React.useRef(onLanded)
  const importsRef = React.useRef(imports)
  React.useEffect(() => {
    onLandedRef.current = onLanded
    importsRef.current = imports
  })

  React.useEffect(() => {
    if (!enabled) return
    let active = true
    listProjectLinkImports(projectId)
      .then((next) => {
        if (!active) return
        const still = new Set(next.map((item) => item.id))
        const landed = importsRef.current.some(
          (item) => item.status !== "failed" && !still.has(item.id)
        )
        setImports(next)
        if (landed) onLandedRef.current()
      })
      .catch((error) => {
        if (active) showErrorToast(getLinkImportErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [enabled, projectId, version])

  const moving = imports.some((item) => item.status !== "failed")
  React.useEffect(() => {
    if (!moving) return
    const timer = setTimeout(() => setVersion((count) => count + 1), LINK_IMPORT_RECHECK_MS)
    return () => clearTimeout(timer)
  }, [moving, imports])

  const reload = React.useCallback(() => setVersion((count) => count + 1), [])
  return { imports: enabled ? imports : [], reload }
}
