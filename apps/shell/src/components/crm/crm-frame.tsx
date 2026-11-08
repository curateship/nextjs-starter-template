import * as React from "react"
import { createPortal } from "react-dom"

import type { CrmTab } from "@/lib/crm/crm-search"

/**
 * How a CRM section draws into the dashboard's one frame (Tyler, 8 Nov 2026:
 * "We need to get the CRM dashboard up to date with the new admin
 * dashboard"). The frame, its left page and the page's ⋮ stay put while the
 * section changes, as on the Admin dashboard; only the middle and the record
 * on the right are the section's.
 *
 * - `middle`: the section's header and list.
 * - `right`: its record panel, drawn into the right panel's spot.
 * - `ids`: the rows shown, first first, so a bare address goes back to the
 *   open one and arrival opens the first.
 * - `showMiddleFor` and `showRightFor`: on a phone, each new value brings the
 *   middle, or the record, to the front.
 * - `windows`: the section's own windows over the dashboard.
 */
export type CrmSectionPanels = {
  middle: React.ReactNode
  right: { label: string; showLabel: string; content: React.ReactNode }
  ids: string[]
  showMiddleFor?: string
  showRightFor?: string
  windows?: React.ReactNode
}

export type CrmFrame = (panels: CrmSectionPanels) => React.ReactNode

/** What the section showing tells the frame, for `ThreePanels`. */
export type CrmSectionPlace = {
  section: CrmTab
  ids: string[]
  showMiddleFor?: string
  showRightFor?: string
  rightLabel: string
  rightShowLabel: string
}

function samePlace(a: CrmSectionPlace | null, b: CrmSectionPlace) {
  return (
    a !== null &&
    a.section === b.section &&
    a.showMiddleFor === b.showMiddleFor &&
    a.showRightFor === b.showRightFor &&
    a.rightLabel === b.rightLabel &&
    a.rightShowLabel === b.rightShowLabel &&
    a.ids.join("\n") === b.ids.join("\n")
  )
}

/**
 * The frame's half: where the right panel's spot is, what the section showing
 * reported, and the `frame` each section is handed.
 */
export function useCrmFrame(section: CrmTab) {
  const [rightSpot, setRightSpot] = React.useState<HTMLDivElement | null>(null)
  const [reported, setReported] = React.useState<CrmSectionPlace | null>(null)
  const report = React.useCallback(
    (next: CrmSectionPlace) => setReported((current) => (samePlace(current, next) ? current : next)),
    []
  )
  // Until the section showing has reported, nothing: the rows from the one
  // before are not this section's.
  const place = reported?.section === section ? reported : null
  const frame: CrmFrame = (panels) => (
    <SectionPanels section={section} panels={panels} rightSpot={rightSpot} onReport={report} />
  )
  return { place, frame, setRightSpot }
}

/**
 * One section's panels inside the frame that stays: its middle where it
 * stands, its record drawn into the right panel's spot, its windows, and its
 * rows told to the frame.
 */
function SectionPanels({
  section,
  panels,
  rightSpot,
  onReport,
}: {
  section: CrmTab
  panels: CrmSectionPanels
  rightSpot: HTMLDivElement | null
  onReport: (place: CrmSectionPlace) => void
}) {
  // Compared as text: a section hands over a fresh list every render.
  const idsText = panels.ids.join("\n")
  const { showMiddleFor, showRightFor } = panels
  const { label: rightLabel, showLabel: rightShowLabel } = panels.right
  React.useEffect(() => {
    onReport({
      section,
      ids: idsText ? idsText.split("\n") : [],
      showMiddleFor,
      showRightFor,
      rightLabel,
      rightShowLabel,
    })
  }, [section, idsText, showMiddleFor, showRightFor, rightLabel, rightShowLabel, onReport])

  return (
    <>
      {panels.middle}
      {rightSpot ? createPortal(panels.right.content, rightSpot) : null}
      {panels.windows}
    </>
  )
}

/**
 * The People section's segment windows, for the Segments block on the left
 * page: Edit and Delete in a segment row's ⋯, and Add a segment. The left
 * page stays while the section changes, so People hands them over while it
 * shows and takes them back when it goes; elsewhere a segment row has no ⋯.
 */
export type CrmSegmentActions = {
  onEdit: (segmentId: string) => void
  onDelete: (segmentId: string) => void
  onNew: () => void
}

export const CrmSegmentActionsContext = React.createContext<(actions: CrmSegmentActions | null) => void>(() => {})

/** People's half: hands its windows to the left page while it shows. */
export function useHandSegmentActions(actions: CrmSegmentActions) {
  const hand = React.useContext(CrmSegmentActionsContext)
  // The latest, called through steady functions, so the left page is handed
  // them once rather than on every draw.
  const latest = React.useRef(actions)
  React.useLayoutEffect(() => {
    latest.current = actions
  })
  React.useEffect(() => {
    hand({
      onEdit: (segmentId) => latest.current.onEdit(segmentId),
      onDelete: (segmentId) => latest.current.onDelete(segmentId),
      onNew: () => latest.current.onNew(),
    })
    return () => hand(null)
  }, [hand])
}
