import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import type { ShellConfig } from "@/lib/custom-shell"
import {
  NOTIFICATION_TYPES,
  type NotificationType,
} from "@/lib/notification-types"

const notificationSettingLabels: Record<NotificationType, string> = {
  feedback_vote: "Thumbs up on feedback",
  feedback_comment: "Comments on feedback",
  feedback_merged: "Merged feedback",
  changelog: "Product updates",
  announcement: "Announcements",
  ai_limit_warning: "AI allowance warnings",
  ai_limit_reached: "AI allowance reached",
  automation_approval: "Automation approvals",
  automation_failed: "Failed automations",
  account_update: "Account changes made by an admin",
  system_email_failed: "Account emails that stopped retrying",
  app_activity: "Activity in the app, such as a trade or a price alert",
}

/**
 * The Notifications card on General settings.
 *
 * The live switch and the type list were two cards on two different screens
 * until 25 Sep 2026. They are one question — what the bell shows and how
 * quickly — so they are one card.
 */
export function NotificationSettings({
  config,
  onConfigChange,
}: {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}) {
  return (
    <CollapsibleSettingsCard
      storageId="notifications"
      title="Notifications"
      description="Which kinds appear in the notification bell and on member home screens, and whether the bell lights up the moment something happens."
      contentClassName="space-y-4"
    >
      <SettingsSwitchRow
        id="live-notifications"
        checked={config.liveNotifications}
        onCheckedChange={(liveNotifications) =>
          onConfigChange({ ...config, liveNotifications })
        }
        label="Update the bell as things happen"
      />

      {/* Edge to edge, so the line does not read as broken: pulled out to the
          card's own 16px inset and the content put back inside it. */}
      <div className="-mx-4 space-y-4 border-t px-4 pt-4">
        {NOTIFICATION_TYPES.map((type) => {
          const id = `notification-type-${type}`
          return (
            <SettingsSwitchRow
              key={type}
              id={id}
              checked={config.notificationTypes[type]}
              onCheckedChange={(checked) =>
                onConfigChange({
                  ...config,
                  notificationTypes: {
                    ...config.notificationTypes,
                    [type]: checked,
                  },
                })
              }
              label={notificationSettingLabels[type]}
            />
          )
        })}
      </div>
    </CollapsibleSettingsCard>
  )
}
