import * as React from "react"
import type { ComponentType } from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { LoadingRow } from "@/components/ui/loading-row"
import type {
  AppFrontPageRowEditorProps,
  AppFrontPageRowKind,
} from "@/lib/app-options"
import type { AppFrontPageRowSettings } from "@/lib/pages/front-page"

/**
 * Each app panel wrapped once, outside any render.
 *
 * `React.lazy` makes a new component type every time it is called, and a
 * component type made during a render resets its state on every render — so a
 * panel would lose what somebody is typing on every keystroke.
 */
const lazyPanels = new Map<
  string,
  React.LazyExoticComponent<ComponentType<AppFrontPageRowEditorProps>>
>()

function lazyPanelFor(kind: AppFrontPageRowKind) {
  const found = lazyPanels.get(kind.key)
  if (found) return found
  const made = React.lazy(kind.panel)
  lazyPanels.set(kind.key, made)
  return made
}

/**
 * The fields of a front page row kind the app added, inside the row window.
 *
 * The panel itself belongs to the app and lives behind a pointer, so an app's
 * own screens — its listings, its events — are not in the bundle of an app that
 * has no such rows. It loads when the kind is chosen, which is the first moment
 * anybody can see it.
 *
 * The card around it is the shell's, so an app row is edited in the same card,
 * with the same folding, as the shell's own rows beside it.
 */
export function AppFrontPageRowEditor({
  kind,
  settings,
  onChange,
}: {
  kind: AppFrontPageRowKind
  settings: AppFrontPageRowSettings
  onChange: (settings: AppFrontPageRowSettings) => void
}) {
  const Panel = lazyPanelFor(kind)

  return (
    <CollapsibleSettingsCard
      size="sm"
      storageId={`front-page-row-app-${kind.key}`}
      title={kind.label}
      description={kind.hint}
      contentClassName="grid gap-4"
    >
      <React.Suspense fallback={<LoadingRow label={`Loading ${kind.label}…`} />}>
        {/* Built with `createElement` rather than as `<Panel />` so it is plain
            that the component comes from the cache below and is not made
            here. */}
        {React.createElement(Panel, { settings, disabled: false, onChange })}
      </React.Suspense>
    </CollapsibleSettingsCard>
  )
}
