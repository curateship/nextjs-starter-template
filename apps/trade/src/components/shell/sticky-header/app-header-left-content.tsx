import * as React from "react"

import {
  appHeaderLeftContentForRole,
  type AppHeaderAction,
  type AppHeaderActionProps,
} from "@/lib/app-options"
import {
  StickyHeaderLeftNav,
  type StickyHeaderLeftNavLink,
} from "@/components/shell/sticky-header/sticky-header-left-nav"

const components = new Map<
  AppHeaderAction["component"],
  React.LazyExoticComponent<React.ComponentType<AppHeaderActionProps>>
>()

export function AppHeaderLeftContent({
  role,
  navLinks,
  limit,
}: {
  role: string
  navLinks: StickyHeaderLeftNavLink[]
  limit?: number
}) {
  const action = appHeaderLeftContentForRole(role)
  const fallback = <StickyHeaderLeftNav navLinks={navLinks} limit={limit} />
  if (!action) return fallback
  let Component = components.get(action.component)
  if (!Component) {
    Component = React.lazy(action.component)
    components.set(action.component, Component)
  }
  return (
    <React.Suspense fallback={fallback}>
      {React.createElement(Component, { role, fallback })}
    </React.Suspense>
  )
}
