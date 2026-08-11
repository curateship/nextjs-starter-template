import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { CardGroup } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
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
}

export function NotificationSettings({
  config,
  onConfigChange,
}: {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}) {
  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="notification-types"
        title="Notification types"
        description="Choose which kinds appear in the notification bell and on member home screens. Turn a kind off to hide it for everyone."
        contentClassName="space-y-4"
      >
        {NOTIFICATION_TYPES.map((type) => {
          const id = `notification-type-${type}`
          return (
            <div key={type} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={config.notificationTypes[type]}
                onCheckedChange={(checked) =>
                  onConfigChange({
                    ...config,
                    notificationTypes: {
                      ...config.notificationTypes,
                      [type]: checked === true,
                    },
                  })
                }
              />
              <Label htmlFor={id} className="font-normal">
                {notificationSettingLabels[type]}
              </Label>
            </div>
          )
        })}
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
