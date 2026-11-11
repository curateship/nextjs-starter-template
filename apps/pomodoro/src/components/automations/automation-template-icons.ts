import { CreditCardIcon, MailIcon } from "lucide-react"

import type { AutomationTemplateKey } from "@/lib/automations/templates"

/** Each template's icon, the same in the New automation picker and the editor's Templates tab. */
export const AUTOMATION_TEMPLATE_ICONS = {
  "welcome-members": MailIcon,
  "payment-recovery": CreditCardIcon,
} satisfies Record<AutomationTemplateKey, typeof MailIcon>
