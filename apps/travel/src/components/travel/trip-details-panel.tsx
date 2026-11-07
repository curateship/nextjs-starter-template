import * as React from "react"
import { PlaneTakeoffIcon } from "lucide-react"

import { BudgetCard, useSaveTrip } from "@/components/travel/trip-budget-card"
import { useTrip } from "@/components/travel/trip-context"
import { NotesMorphIcon } from "@/components/travel/notes-morph-icon"
import { TripNotes } from "@/components/travel/trip-notes-panel"
import { TripMenu } from "@/components/travel/trip-menu"
import { SavingDocument } from "@/components/travel/saving-document"
import { PhotoCreditLine } from "@/components/travel/unsplash-picker"
import { BlendedBanner, HeaderButton } from "@/components/travel/panel-bits"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { PanelFooter } from "@/components/travel/panel-footer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PANEL_BODY_ABOVE_FOOTER, PANEL_GUTTER } from "@/lib/travel/panel-gutter"
import { cn } from "@/lib/utils"

/**
 * The trip's left panel. Under the header is the trip's description, written
 * in place in the shell's editor (task "Misc": "I want to also inline edit
 * discription with tiptap editor"). The Money card is a folding card in the
 * panel's footer (the Admin 3 panel design, 6 Nov 2026). The note icon beside
 * the ⋮ shows the trip's notes in their place and turns into an × that
 * closes them; the ⋮ opens the trip's menu of settings and Delete trip.
 */
export function TripDetailsPanel() {
  const { page, readOnly, noteRequest } = useTrip()
  const { trip } = page
  const [notesOpen, setNotesOpen] = React.useState(false)
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
    <div className="relative flex min-h-0 flex-1 flex-col">
      {banner ? <BlendedBanner url={banner} onBroken={() => setBroken(banner)} /> : null}
      <DashboardCardTitleHeader
        className={cn("relative", banner && "border-b-transparent")}
        icon={<PlaneTakeoffIcon className="size-4" />}
        back={{ label: "Back to trips", to: "/trips" }}
        title={trip.name}
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
      {notesOpen ? (
        <TripNotes key={noteRequest?.at ?? "notes"} startOpen={noteRequest?.noteId ?? null} />
      ) : (
        <>
          {/* The body and the footer share the panel's height: the footer takes what Money needs, and the
              description grows into the rest, keeping at least 6rem (the Admin 3 panel design). */}
          <ScrollArea className={cn("relative min-h-0", PANEL_BODY_ABOVE_FOOTER)} viewportClassName="h-full">
            <div className={cn("grid grid-cols-[minmax(0,1fr)]", PANEL_GUTTER)}>
              <TripDescription />
            </div>
          </ScrollArea>
          <PanelFooter>
            <BudgetCard />
          </PanelFooter>
        </>
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
      <SavingDocument
        value={trip.description}
        placeholder="Write something about the trip"
        readOnly={readOnly}
        onSave={(description) => save({ description })}
      />
      {trip.coverCredit ? <PhotoCreditLine credit={trip.coverCredit} className="px-1" /> : null}
    </div>
  )
}
