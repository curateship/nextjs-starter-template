import { TabbedMenu, type MySettingsTab } from "@/components/shared/notes/tabbed-menu"

/**
 * My settings on My dashboard, for the site admin and for everyone else, behind
 * the ⋮ in the left panel's header (Tyler, 6 Nov 2026: "it needs to be replaced
 * with a 3 vertical icon ... It uses tabs. The first tab should be called
 * "General" ... second tab is "Notifications""). A dropdown up to 20.4rem
 * wide, as the shell's left panel ⋮ is (Tyler, 9 Nov 2026: "reduce the left
 * panel dropdown width by 10%"), underlined tabs on top from the left, and
 * each tab scrolling inside it. It is the shell's `TabbedMenu`, which
 * Project's own copy started, so a tab's footer (Lock blocks) stays in view
 * while its rows scroll. It opens on its first tab every time. Every field saves
 * itself, so closing leaves the field being typed in first, which saves it.
 */
export function MySettingsMenu({ tabs }: { tabs: MySettingsTab[] }) {
  return <TabbedMenu label="My settings" width="20.4rem" tabs={tabs} />
}
