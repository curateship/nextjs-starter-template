import * as React from "react"
import { createPortal } from "react-dom"
import { ListChecksIcon } from "lucide-react"

import { ListSelectProvider, ProjectSubChoice, useInProject } from "@/components/content-app/project-top"
import { CrmListHeader } from "@/components/crm/crm-row"
import { SearchToggle } from "@/components/shared/search-toggle"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"

type CrmListHeaderProps = React.ComponentProps<typeof CrmListHeader>

/**
 * Content's one list header, every dashboard's list in the app (Tyler,
 * 27 Nov 2026, `workspace/tasks/Misc/misc.md`, then "All dashboard has it
 * including projects"). It is the shell's `CrmListHeader`, unchanged, with
 * three things moved:
 *
 * - **Search is an icon** that opens into the box ("Make all the search field
 *   into icon like this"), the shell's `SearchToggle`. Typing still waits
 *   300ms before the list is asked again, as the shell's box does.
 * - **The dropdowns come right after it** ("This should be on the right side
 *   after search icon (same goes for other tabs too)"): on a project's page
 *   the project's own dropdown (`ProjectSubChoice`), then the list's own
 *   (`choices`), before Filter.
 * - **Select is in a ⋮** ("Move all the mass select button to here"): on a
 *   project's page the project's ⋮, at the top of General's actions; on any
 *   other dashboard the list's own ⋮, first.
 *
 * Every button in the header keeps the shell's outline look, so none reads as
 * plain text ("All buttons should look like this").
 *
 * A list's own dropdown can be handed in as `choices`, or drawn anywhere inside
 * the header wrapped in `HeaderChoice`, which moves it to the same spot. That
 * lets a network module hand its "Which list" dropdown down with its tabs, as
 * it always did, and still have it land after the search icon.
 */
export function ListHeader({
  choices,
  search,
  massSelect,
  selected,
  menuItems,
  ...rest
}: CrmListHeaderProps & {
  /** The list's own dropdowns, which list or which kind shows, drawn right after the search icon. */
  choices?: React.ReactNode
}) {
  const inProject = useInProject()
  // The spot after the search icon that `HeaderChoice` draws into.
  const [spot, setSpot] = React.useState<HTMLSpanElement | null>(null)
  const selectRow = massSelect
    ? [{ label: massSelect.on ? "Hide select" : "Select", icon: <ListChecksIcon className="size-4" />, onClick: massSelect.onToggle }]
    : []
  return (
    <ListSelectProvider value={inProject ? massSelect : null}>
      <ChoiceSpot.Provider value={spot}>
      <CrmListHeader
        {...rest}
        // The shell's first slot on the right, so the search icon and the dropdowns come before Filter.
        selected={
          <>
            {selected}
            {search ? <ListSearch search={search} /> : null}
            <ProjectSubChoice />
            {choices}
            <span ref={setSpot} className="contents" />
          </>
        }
        search={null}
        massSelect={null}
        menuItems={[...(inProject ? [] : selectRow), ...(menuItems ?? [])]}
      />
      </ChoiceSpot.Provider>
    </ListSelectProvider>
  )
}

/**
 * The outline look the shell's list header gives every ghost button, for a
 * toolbar drawn outside it, so every button in Content looks the same (Tyler,
 * 27 Nov 2026: "All buttons should look like this"). Copied from
 * `CrmListHeader`, a shell file that does not export it.
 */
export const OUTLINED_TOOLBAR =
  "[&_[data-variant=ghost]]:bg-background [&_[data-variant=ghost]:hover]:bg-muted [&_[data-variant=ghost]]:border-zinc-200/60 [&_[data-variant=outline]]:border-zinc-200/60 [&_input]:border-zinc-200/60 dark:[&_[data-variant=ghost]]:border-zinc-700/60 dark:[&_[data-variant=outline]]:border-zinc-700/60 dark:[&_input]:border-zinc-700/60"

/** The search icon, waiting 300ms after the last letter before the list is asked again, so the caret never jumps. */
function ListSearch({ search }: { search: NonNullable<CrmListHeaderProps["search"]> }) {
  const [text, setText] = useSyncedDraft(search.value)
  const changeRef = React.useRef(search.onChange)
  React.useEffect(() => {
    changeRef.current = search.onChange
  })
  React.useEffect(() => {
    if (text === search.value) return
    const timer = setTimeout(() => changeRef.current(text), 300)
    return () => clearTimeout(timer)
  }, [text, search.value])
  return <SearchToggle name={search.name} label={search.label} placeholder={search.placeholder} value={text} onChange={setText} />
}

/** The spot in a `ListHeader` after the search icon; undefined outside one. */
const ChoiceSpot = React.createContext<HTMLSpanElement | null | undefined>(undefined)

/**
 * A list's own dropdown, drawn after the search icon of the `ListHeader` it
 * sits in, wherever in that header it is written. Outside a `ListHeader`, as
 * in a shell table's toolbar, it draws where it stands.
 */
export function HeaderChoice({ children }: { children: React.ReactNode }) {
  const spot = React.useContext(ChoiceSpot)
  if (spot === undefined) return <>{children}</>
  // The spot is set as the header first draws, before the browser paints.
  return spot ? createPortal(children, spot) : null
}
