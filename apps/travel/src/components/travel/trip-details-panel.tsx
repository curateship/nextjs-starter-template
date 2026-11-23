import * as React from "react"
import { PlaneTakeoffIcon } from "lucide-react"

import { useSaveTrip } from "@/components/travel/trip-budget-card"
import { useTrip } from "@/components/travel/trip-context"
import { NotesMorphIcon } from "@/components/travel/notes-morph-icon"
import { TripNotes } from "@/components/travel/trip-notes-panel"
import { TripMenu } from "@/components/travel/trip-menu"
import { SavingDocument } from "@/components/travel/saving-document"
import { PhotoCreditLine } from "@/components/travel/unsplash-picker"
import { BlendedBanner, HeaderButton } from "@/components/travel/panel-bits"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PANEL_GUTTER } from "@/lib/travel/panel-gutter"
import { cn } from "@/lib/utils"

/**
 * The trip's left panel. Under the header is the trip's description, written
 * in place in the shell's editor (task "Misc": "I want to also inline edit
 * discription with tiptap editor"). The trip's money is the Budget block,
 * typed in with "/" (Tyler, 7 Nov 2026: "turn this bottom card into a budget
 * block"), so the panel has no footer. The note icon beside
 * the ⋮ shows the trip's notes in their place and turns into an × that
 * closes them; the ⋮ opens the trip's menu of settings and Delete trip.
 */
export function TripDetailsPanel() {
  const { page, readOnly, noteRequest } = useTrip()
  const { trip } = page
  // A note asked for on arrival (a pinned note on the Trips dashboard) shows straight away.
  const [notesOpen, setNotesOpen] = React.useState(() => Boolean(noteRequest?.noteId))
  // A picture clicked on the Photos tab shows the note it's in, or the description.
  const [seenRequest, setSeenRequest] = React.useState(noteRequest)
  if (noteRequest !== seenRequest) {
    setSeenRequest(noteRequest)
    if (noteRequest) setNotesOpen(noteRequest.noteId !== null)
  }
  // A cover whose address no longer loads is left out rather than drawn broken.
  const [broken, setBroken] = React.useState<string | null>(null)
  const banner = trip.coverUrl && trip.coverUrl !== broken ? trip.coverUrl : null

  return (
    <div className="@container/trip-left relative flex min-h-0 flex-1 flex-col">
      {banner ? <BlendedBanner url={banner} onBroken={() => setBroken(banner)} /> : null}
      <DashboardCardTitleHeader
        className={cn("relative", banner && "border-b-transparent")}
        icon={<PlaneTakeoffIcon className="size-4" />}
        back={{ label: "Back to trips", to: "/trips" }}
        title={
          // At the panel's narrowest the back arrow, notes and ⋮ leave the name no room, so it
          // moves to its own line under them (Travel polish part 7); a screen reader still finds it here.
          <span className="sr-only @[18rem]/trip-left:not-sr-only">{trip.name}</span>
        }
        action={
          <div className="flex items-center gap-1">
            {/* The page bends into an × while the notes are open, as Project's inbox does. */}
            <HeaderButton
              label={notesOpen ? "Close the notes" : page.notes.length ? `Notes (${page.notes.length})` : "Notes"}
              pressed={notesOpen}
              onClick={() => setNotesOpen((was) => !was)}
            >
              <NotesMorphIcon open={notesOpen} />
            </HeaderButton>
            {readOnly ? null : <TripMenu />}
          </div>
        }
      />
      <p
        aria-hidden
        className={cn(
          "relative px-3.75 pt-3 text-base leading-snug font-semibold break-words @[18rem]/trip-left:hidden",
          banner && "drop-shadow-sm"
        )}
      >
        {trip.name}
      </p>
      {notesOpen ? (
        <TripNotes key={noteRequest?.at ?? "notes"} startOpen={noteRequest?.noteId ?? null} />
      ) : (
        <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
          <div data-side-panel-body="" className={cn("grid grid-cols-[minmax(0,1fr)]", PANEL_GUTTER)}>
            <TripDescription />
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

/** The trip's description in place, and the cover's credit (the card with the name and dates went: task "Misc"). */
function TripDescription() {
  const { page, readOnly } = useTrip()
  const { trip } = page
  const save = useSaveTrip()
  return (
    <div className="grid gap-1">
      {/* Lock blocks in the trip's ⋮ makes it read only; the editor is made again when the lock changes. */}
      <SavingDocument
        // The panel opens narrow, so the description reads at the panel's body size rather than a note's
        // larger one, which left one or two words a line (Travel polish part 6).
        // The panel's body has no top space, so the writing keeps 15px above
        // its first line of text, and none when a block opens it, so the block
        // sits straight under the header.
        className="[&_.page-rte_.tiptap_:is(p,li)]:text-[0.8125rem] [&_.page-rte_.tiptap_:is(p,li)]:leading-normal [&_.page-rte_.tiptap:not(:has(>.react-renderer:first-child))]:!pt-3.75"
        key={trip.descriptionLocked ? "locked" : "open"}
        value={trip.description}
        placeholder={trip.descriptionLocked ? "" : "Write something about the trip"}
        readOnly={readOnly}
        locked={trip.descriptionLocked}
        onSave={(description) => save({ description })}
      />
      {trip.coverCredit ? <PhotoCreditLine credit={trip.coverCredit} className="px-1" /> : null}
    </div>
  )
}
