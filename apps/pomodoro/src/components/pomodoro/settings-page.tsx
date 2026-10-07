import * as React from "react"
import { Link } from "@tanstack/react-router"

import AppearanceSettingsPanel from "@/components/pomodoro/appearance-settings-panel"
import BlockedAccountsCard from "@/components/pomodoro/blocked-accounts-card"
import ProfileSettingsPanel from "@/components/pomodoro/profile-settings-panel"
import PublicProfileSettingsPanel from "@/components/pomodoro/public-profile-settings-panel"
import StreakBadgeCard from "@/components/pomodoro/streak-badge-card"
import TimerSettingsPanel from "@/components/pomodoro/timer-settings-panel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TABS,
  type SettingsTab,
} from "@/lib/pomodoro/settings-tabs"
import { SignInButton } from "@/components/pomodoro/sign-in-button"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { StreakReminderCard } from "@/components/pomodoro/streak-reminder-card"

/**
 * The product's Settings page, like the old app's, in five tabs: the focus
 * rhythm, the look, the profile, the public page, and privacy (blocked people
 * and the streak badge). Account email, password and deletion stay with the
 * platform's own account area.
 *
 * A guest gets the first three. Their Profile tab is the card asking them to
 * sign in, because a guest has no profile to edit.
 */
export function SettingsPage({
  tab,
  onTabChange,
}: {
  tab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}) {
  const { authenticated } = useProductAuth()
  const tabs = SETTINGS_TABS.filter((entry) => authenticated || entry.guest)
  // A guest sent to a members-only tab lands on the first one instead.
  const shown = tabs.some((entry) => entry.key === tab)
    ? tab
    : DEFAULT_SETTINGS_TAB

  // On a phone the five tabs are wider than the screen and the row scrolls
  // sideways. Opening `?tab=privacy` must show the chosen tab, not leave it
  // off the right edge, so the row scrolls to it. Only the row moves; the
  // page itself is never scrolled.
  const tabRow = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const row = tabRow.current
    const viewport = row?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )
    const active = row?.querySelector<HTMLElement>(
      '[data-slot="tabs-trigger"][data-state="active"]'
    )
    if (!viewport || !active) return
    const left = active.offsetLeft
    const right = left + active.offsetWidth
    if (left < viewport.scrollLeft) viewport.scrollLeft = left
    else if (right > viewport.scrollLeft + viewport.clientWidth)
      viewport.scrollLeft = right - viewport.clientWidth
  }, [shown, tabs.length])

  return (
    <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Your rhythm, your profile, your look.
        </p>
      </header>
      <Tabs
        value={shown}
        onValueChange={(next) => onTabChange(next as SettingsTab)}
        className="gap-6"
      >
        <ScrollArea ref={tabRow} className="max-w-full">
          <TabsList aria-label="Settings sections">
            {tabs.map((entry) => (
              <TabsTrigger key={entry.key} value={entry.key}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <TabsContent value="timer" className="flex flex-col gap-4">
          <TimerSettingsPanel />
          {authenticated ? <StreakReminderCard /> : null}
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceSettingsPanel />
        </TabsContent>
        <TabsContent value="profile">
          {authenticated ? <ProfileSettingsPanel /> : <SyncCard />}
        </TabsContent>
        {authenticated ? (
          <>
            <TabsContent value="public">
              <PublicProfileSettingsPanel />
            </TabsContent>
            <TabsContent value="privacy" className="flex flex-col gap-4">
              <BlockedAccountsCard />
              <StreakBadgeCard />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  )
}

function SyncCard() {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Sync across devices</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">
          Everything here saves in this browser. Sign in to keep your focus
          history, join rooms and appear on the leaderboard.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/register">Create free account</Link>
          </Button>
          <SignInButton size="default" />
        </div>
      </CardContent>
    </Card>
  )
}
