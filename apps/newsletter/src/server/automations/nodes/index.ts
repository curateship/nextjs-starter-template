import type { AutomationNodeKind } from "@/lib/automations/compiled-config"
import { executeBranch } from "@/server/automations/nodes/branch"
import { executeDelay } from "@/server/automations/nodes/delay"
import { executeSendEmail } from "@/server/automations/nodes/send-email"
import { executeTag } from "@/server/automations/nodes/tag"
import { executeTrigger } from "@/server/automations/nodes/trigger"
import { executeWebhook } from "@/server/automations/nodes/webhook"
import type { NodeExecutor } from "@/server/automations/types"

export const nodeExecutors: Record<AutomationNodeKind, NodeExecutor> = {
  trigger: executeTrigger,
  sendEmail: executeSendEmail,
  delay: executeDelay,
  branch: executeBranch,
  tag: executeTag,
  webhook: executeWebhook,
}
