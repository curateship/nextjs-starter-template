import { toast } from "sonner"

import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How many refused tasks the result names before it counts the rest. */
const REFUSALS_NAMED = 3

/**
 * "5 tasks marked Done, 1 refused. "Edit the trailer": Fill in Final cut
 * first." Each refused task is named with its reason, up to three. Used by
 * the ticked rows' Mark Done and the bulk bar.
 */
export function reportBulkOutcome(
  outcome: { changed: string[]; refused: { title: string; reason: string }[] },
  verb: string
) {
  const changed = outcome.changed.length
  const refused = outcome.refused.length
  if (refused) {
    const named = outcome.refused
      .slice(0, REFUSALS_NAMED)
      .map((one) => `${one.title ? `"${one.title}": ` : ""}${one.reason}`)
    const more = refused - named.length
    showErrorToast(
      `${changed} ${plural(changed, "task")} ${verb}, ${refused} refused. ${named.join(" ")}${more ? ` And ${more} more.` : ""}`
    )
  } else {
    toast.success(`${changed} ${plural(changed, "task")} ${verb}.`)
  }
}
