import * as React from "react"
import { PlaneTakeoffIcon, SettingsIcon } from "lucide-react"

import { BudgetCard, useSaveTrip } from "@/components/travel/trip-budget-card"
import { useTrip } from "@/components/travel/trip-context"
import { NotesMorphIcon } from "@/components/travel/notes-morph-icon"
import { TripNotes } from "@/components/travel/trip-notes-panel"
import { TripSettingsDialog } from "@/components/travel/trip-settings-dialog"
import { SavingDocument } from "@/components/travel/saving-document"
import { PhotoCreditLine } from "@/components/travel/unsplash-picker"
import { BlendedBanner, HeaderButton } from "@/components/travel/panel-bits"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

/**
 * The trip's left panel. Under the header is the trip's description, written
 * in place in the shell's editor (task "Misc": "I want to also inline edit
 * discription with tiptap editor"), then the Money card. The note icon beside
 * the cog shows the trip's notes in their place and turns into an × that
 * closes them; the cog opens Trip settings.
 */
export function TripDetailsPanel() {
  const { page } = useTrip()
  const { trip } = page
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [notesOpen, setNotesOpen] = React.useState(false)
  // Bumped when Trip settings saves, so the description here redraws from it;
  // its own saves while typing leave the editor alone.
  const [settingsSaves, setSettingsSaves] = React.useState(0)
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
            <HeaderButton label="Trip settings" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon className="size-4" />
            </HeaderButton>
          </div>
        }
      />
      {notesOpen ? (
        <TripNotes />
      ) : (
        <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
            <TripDescription key={settingsSaves} />
            <BudgetCard />
          </div>
        </ScrollArea>
      )}
      <TripSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => setSettingsSaves((count) => count + 1)}
      />
    </div>
  )
}

/** The trip's description in place, and the cover's credit (the card with the name and dates went: task "Misc"). */
function TripDescription() {
  const { page } = useTrip()
  const { trip } = page
  const save = useSaveTrip()
  return (
    <div className="grid gap-1">
      <SavingDocument
        value={trip.description}
        placeholder="Write something about the trip"
        onSave={(description) => save({ description })}
      />
      {trip.coverCredit ? <PhotoCreditLine credit={trip.coverCredit} className="px-1" /> : null}
    </div>
  )
}
