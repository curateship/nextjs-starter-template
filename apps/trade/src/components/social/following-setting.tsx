import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { QuickSettingRow } from "@/components/ui/quick-setting-row"

/** The Following row in the header's settings cog: the page of traders you follow or copy. */
export default function FollowingSetting() {
  return (
    <QuickSettingRow
      label="Following"
      hint="The traders you follow or copy, and your copies' settings."
    >
      <Button asChild size="sm" variant="outline">
        <Link to="/following">Open</Link>
      </Button>
    </QuickSettingRow>
  )
}
