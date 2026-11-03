import * as React from "react"

import { SavingDocument } from "@/components/travel/saving-document"
import { takeClickedOpen } from "@/components/travel/trip-context"
import { useSaveActivity } from "@/components/travel/use-save-activity"
import type { Activity } from "@/lib/api/travel/trips"

/**
 * The activity's notes, always open to write in, as a task's notes are in
 * Project's right panel. Clicking a card open puts the blinking cursor in
 * them, under "Write something" (task "Misc").
 */
export function ActivityNotes({ activity }: { activity: Activity }) {
  const [save] = useSaveActivity(activity.id)
  const [focus] = React.useState(() => takeClickedOpen(activity.id))
  return <SavingDocument value={activity.notes} focus={focus} onSave={(notes) => save({ notes })} />
}
