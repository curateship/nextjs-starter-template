/**
 * The Settings page's tabs, in order, and which of them a guest gets. The
 * address carries the key (`/settings?tab=public`), so a link can open one tab
 * and Back steps between them.
 */
export const SETTINGS_TABS = [
  { key: "timer", label: "Timer", guest: true },
  { key: "appearance", label: "Appearance", guest: true },
  { key: "profile", label: "Profile", guest: true },
  { key: "public", label: "Public page", guest: false },
  { key: "privacy", label: "Privacy", guest: false },
] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]["key"]

export const DEFAULT_SETTINGS_TAB: SettingsTab = "timer"

export function parseSettingsTab(value: unknown): SettingsTab | null {
  return SETTINGS_TABS.some((tab) => tab.key === value)
    ? (value as SettingsTab)
    : null
}
