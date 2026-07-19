"use client"

import * as React from "react"

import {
  createDefaultStyling,
  getModalStyleVars,
  MODAL_STYLE_VAR_NAMES,
  normalizeStyling,
  type AdminModalStyling,
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
 * styling is applied as CSS variables on the document root where it can reach.
 */
function useModalStyleVars(modal: AdminModalStyling) {
  React.useEffect(() => {
    const root = document.documentElement
    const vars = getModalStyleVars(modal)
    for (const name of MODAL_STYLE_VAR_NAMES) {
      const value = vars[name]
      if (value === undefined) {
        root.style.removeProperty(name)
      } else {
        root.style.setProperty(name, value)
      }
    }
    return () => {
      for (const name of MODAL_STYLE_VAR_NAMES) {
        root.style.removeProperty(name)
      }
    }
  }, [modal])
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

  useModalStyleVars(styling.modal)

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
