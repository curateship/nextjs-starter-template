import * as React from "react"
import type { ComponentType } from "react"

import {
  appFrontPageRowKind,
  type AppFrontPageRowProps,
} from "@/lib/app-options"
import type { AppFrontPageRowSettings } from "@/lib/pages/front-page"

/**
 * Each app row component wrapped once, outside any render, for the same reason
 * the settings panels are: a component type made during a render is a new type
 * every time, and React throws its state away with it.
 */
const lazyRows = new Map<
  string,
  React.LazyExoticComponent<ComponentType<AppFrontPageRowProps>>
>()

function lazyComponentFor(appKind: string) {
  const found = lazyRows.get(appKind)
  if (found) return found
  const kind = appFrontPageRowKind(appKind)
  if (!kind) return null
  const made = React.lazy(kind.component)
  lazyRows.set(appKind, made)
  return made
}

/**
 * One front page row of a kind the app added.
 *
 * The component belongs to the app and sits behind a pointer, so an app's own
 * public screens are not in the bundle of a page that has no such row. Nothing
 * is drawn while it loads: a front page row appearing a moment late is better
 * than a grey box that turns into one.
 *
 * A kind the app has stopped offering draws nothing at all. The row is still in
 * the settings, where an admin can see it and delete it, but a visitor is never
 * shown a heading over a hole.
 */
export function AppFrontPageRow({
  appKind,
  heading,
  intro,
  settings,
  data,
}: {
  appKind: string
  heading: string
  intro: string
  settings: AppFrontPageRowSettings
  data: unknown
}) {
  const Component = lazyComponentFor(appKind)
  if (!Component) return null

  return (
    <React.Suspense fallback={null}>
      {/* Built with `createElement` rather than as `<Component />` so it is
          plain that the component comes from the cache above. */}
      {React.createElement(Component, { heading, intro, settings, data })}
    </React.Suspense>
  )
}
