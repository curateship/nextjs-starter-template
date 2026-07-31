import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SidebarSettings } from "@/components/settings/sidebar-settings"
import { CardGroup } from "@/components/ui/card"
import {
  createDefaultMemberSections,
  type ShellConfig,
} from "@/lib/custom-shell"

/**
 * Everything an admin decides on a member's behalf, in one place. Only the
 * sidebar so far — the card is the shape the rest will follow.
 */
export function MemberSettings({
  config,
  onConfigChange,
  onSaveConfig,
}: {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: () => Promise<boolean>
}) {
  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="member-sidebar"
        // Not just "Sidebar": the rail already says that, and two identical
        // headings one above the other read as a mistake.
        title="Member sidebar"
        description="The links every member sees, in the order you put them. Your own sidebar is on the Sidebar tab and is not affected."
      >
        <SidebarSettings
          sections={config.memberSections}
          onSectionsChange={(memberSections) =>
            onConfigChange({ ...config, memberSections })
          }
          onSaveConfig={onSaveConfig}
          reset={{
            label: "Reset member sidebar",
            description:
              "Every section and link members can see is deleted, and the starting set is put back. Your own sidebar is not touched. This cannot be undone.",
            onReset: () =>
              onConfigChange({
                ...config,
                memberSections: createDefaultMemberSections(),
              }),
          }}
        />
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
