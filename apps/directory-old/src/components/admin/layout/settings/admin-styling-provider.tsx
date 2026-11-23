"use client"

import * as React from "react"

import {
  createDefaultStyling,
  getRootStyleVars,
  normalizeStyling,
  ROOT_STYLE_VAR_NAMES,
  type AdminStyling,
} from "@/lib/utils/admin-styling"

type AdminStylingContextValue = {
  styling: AdminStyling
  /** Update the live styling (drives preview across the whole admin shell). */
  setStyling: (styling: AdminStyling) => void
}

const AdminStylingContext = React.createContext<AdminStylingContextValue | null>(null)

/** Returns the live admin styling context, or null when outside the provider. */
export function useAdminStyling(): AdminStylingContextValue | null {
  return React.useContext(AdminStylingContext)
}

/**
 * The dialog portals to document.body, outside the shell subtree, so modal
 * styling — including the shared content gutter it uses for spacing — is applied
 * as CSS variables on the document root where it can reach. `data-shell-flat`
 * mirrors AdminLayout's flat mode so modals drop their chrome at gutter 0 too.
 */
function useRootStyleVars(styling: AdminStyling) {
  React.useEffect(() => {
    const root = document.documentElement
    const vars = getRootStyleVars(styling)
    for (const name of ROOT_STYLE_VAR_NAMES) {
      const value = vars[name]
      if (value === undefined) {
        root.style.removeProperty(name)
      } else {
        root.style.setProperty(name, value)
      }
    }
    if (styling.gutter === 0) {
      root.dataset.shellFlat = "true"
    } else {
      delete root.dataset.shellFlat
    }
    return () => {
      for (const name of ROOT_STYLE_VAR_NAMES) {
        root.style.removeProperty(name)
      }
      delete root.dataset.shellFlat
    }
  }, [styling])
}

export function AdminStylingProvider({
  initialStyling,
  children,
}: {
  initialStyling?: AdminStyling | null
  children: React.ReactNode
}) {
  const [styling, setStyling] = React.useState<AdminStyling>(() =>
    initialStyling ? normalizeStyling(initialStyling) : createDefaultStyling()
  )

  useRootStyleVars(styling)

  const value = React.useMemo<AdminStylingContextValue>(
    () => ({ styling, setStyling }),
    [styling]
  )

  return (
    <AdminStylingContext.Provider value={value}>
      {children}
    </AdminStylingContext.Provider>
  )
}
