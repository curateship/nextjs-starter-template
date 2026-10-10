import * as React from "react"

import {
  type AppHeaderLeftContent as AppHeaderLeftContentOption,
  type AppHeaderLeftContentProps,
} from "@/lib/app-options"
import {
  StickyHeaderLeftNav,
  type StickyHeaderLeftNavLink,
} from "@/components/shell/sticky-header/sticky-header-left-nav"

const components = new Map<
  AppHeaderLeftContentOption["component"],
  React.LazyExoticComponent<React.ComponentType<AppHeaderLeftContentProps>>
>()

export function AppHeaderLeftContent({
  action,
  role,
  navLinks,
  limit,
}: {
  action: AppHeaderLeftContentOption
  role: string
  navLinks: StickyHeaderLeftNavLink[]
  limit?: number
}) {
  const fallback = <StickyHeaderLeftNav navLinks={navLinks} limit={limit} />
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
