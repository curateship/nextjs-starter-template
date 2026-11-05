import * as React from "react"

import {
  DashboardCardHeader,
  dashboardCardTabClassName,
} from "@/components/shared/dashboard-card-header"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SOUNDS_TABS, SoundsTabContext, isSoundsTab } from "@/lib/video/sounds-tabs"

/**
 * The header each of the three tabs draws: the tabs on the left and that
 * tab's own buttons on the right, so Music and Voices keep their + and
 * search, and Sounds its upload.
 *
 * The three tabs need about 280px with Voices' two buttons. The panel opens
 * at its narrowest, which on a 1440px screen leaves the header 108px, so
 * below that room the tabs give way to a picker holding the same three
 * (a container query on the header, measured on its own width).
 */
export function SoundsTabsHeader({ action }: { action?: React.ReactNode }) {
  const current = React.useContext(SoundsTabContext)
  return (
    <DashboardCardHeader className="@container/sounds">
      <TabsList className="min-w-0 justify-start @max-[17.5rem]/sounds:hidden">
        {SOUNDS_TABS.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className={dashboardCardTabClassName}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {current ? (
        <div className="hidden min-w-0 @max-[17.5rem]/sounds:block">
          <Select
            value={current.tab}
            onValueChange={(value) => {
              if (isSoundsTab(value)) current.onTabChange(value)
            }}
          >
            <SelectTrigger aria-label="Music, Sounds or Voices" className="max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOUNDS_TABS.map((tab) => (
                <SelectItem key={tab.id} value={tab.id}>
                  {tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {action ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>
      ) : null}
    </DashboardCardHeader>
  )
}
