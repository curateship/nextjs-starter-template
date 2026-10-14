import { SidebarSettings } from "@/components/settings/sidebar-settings"
import {
  createDefaultMemberSections,
  type ShellConfig,
} from "@/lib/custom-shell"

/** The sidebar editor on Members → Navigation. */
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
    <SidebarSettings
      sections={config.memberSections}
      onSectionsChange={(memberSections) =>
        onConfigChange({ ...config, memberSections })
      }
      onSaveConfig={onSaveConfig}
      card={{
        storageId: "member-sidebar",
        title: "Member sidebar",
        description:
          "The links every member sees, in the order you put them. Your own sidebar is on the Platform → Navigation page and is not affected.",
      }}
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
  )
}
