import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { getCleanupErrorMessage, runDataCleanup } from "@/lib/api/admin-cleanup"
import {
  describeCleanupResult,
  LINK_KEEP_DAYS,
  READ_NOTICE_KEEP_DAYS,
} from "@/lib/data-cleanup"
import { useAsyncAction } from "@/lib/use-async-action"

/**
 * Settings → Security. The app tidies itself once a day off an admin's first
 * page, and this is the button for doing it on the spot.
 *
 * The outcome is four numbers, so it is reported as a line under the button
 * rather than a toast: a toast is gone before anybody has finished reading it.
 */
export function DataCleanupCard() {
  const [runCleanup, running] = useAsyncAction(getCleanupErrorMessage)
  const [result, setResult] = React.useState<string | null>(null)

  const run = async () => {
    setResult(null)
    await runCleanup(async () => {
      setResult(describeCleanupResult(await runDataCleanup()))
    })
  }

  return (
    <CollapsibleSettingsCard
      storageId="data-cleanup"
      title="Old data"
      description="The app deletes what it can no longer use, by itself, once a day."
      contentClassName="space-y-4"
    >
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Sign-ins that have expired or run past the limits above.</li>
        <li>
          Sign-in, verification and password links, {LINK_KEEP_DAYS} days after
          they were used or ran out.
        </li>
        <li>Finished attempt counters. Anyone still blocked stays blocked.</li>
        <li>
          Notifications somebody read more than {READ_NOTICE_KEEP_DAYS} days
          ago. Unread ones are left alone.
        </li>
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={running}
          onClick={() => void run()}
        >
          {running ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Run cleanup now
        </Button>
        {result ? (
          <p role="status" className="text-sm text-muted-foreground">
            {result}
          </p>
        ) : null}
      </div>
    </CollapsibleSettingsCard>
  )
}
