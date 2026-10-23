import * as React from "react"

import {
  type AppHeaderLeftContent as AppHeaderLeftContentOption,
  type AppHeaderLeftContentProps,
} from "@/lib/app-options"

const components = new Map<
  AppHeaderLeftContentOption["component"],
  React.LazyExoticComponent<React.ComponentType<AppHeaderLeftContentProps>>
>()

/**
 * An app's own top left. It wins over every Top left shows choice; the
 * chosen content is what it shows while it loads, and what it is handed as
 * `fallback` to draw when it has nothing of its own.
 */
export function AppHeaderLeftContent({
  action,
  role,
  fallback,
}: {
  action: AppHeaderLeftContentOption
  role: string
  fallback: React.ReactNode
}) {
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
