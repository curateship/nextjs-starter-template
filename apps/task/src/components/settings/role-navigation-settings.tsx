import { SidebarSettings } from "@/components/settings/sidebar-settings"
import type { AppRole } from "@/lib/app-options"
import type { ShellConfig } from "@/lib/custom-shell"

/**
 * The left menu one app role sees, on that role's own Navigation row.
 *
 * The same editor as the members' sidebar. Until an admin saves a change, it
 * shows the menu the app declared for the role, and Reset puts that back.
 */
export function RoleNavigationSettings({
  role,
  config,
  onConfigChange,
  onSaveConfig,
}: {
  role: AppRole
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: () => Promise<boolean>
}) {
  const setSections = (sections: ShellConfig["memberSections"]) =>
    onConfigChange({
      ...config,
      roleSections: { ...config.roleSections, [role.id]: sections },
    })

  return (
    <SidebarSettings
      sections={
        Object.hasOwn(config.roleSections, role.id)
          ? config.roleSections[role.id]
          : role.menu
      }
      onSectionsChange={setSections}
      onSaveConfig={onSaveConfig}
      card={{
        storageId: `role-sidebar-${role.id}`,
        title: `${role.label} sidebar`,
        description: `The links every ${role.label.toLowerCase()} sees, in the order you put them. Members and your own sidebar are not affected.`,
      }}
      reset={{
        label: `Reset ${role.label.toLowerCase()} sidebar`,
        description: `Every section and link a ${role.label.toLowerCase()} can see is deleted, and the app's starting set is put back. Nobody else's sidebar is touched. This cannot be undone.`,
        onReset: () => setSections(role.menu),
      }}
    />
  )
}
