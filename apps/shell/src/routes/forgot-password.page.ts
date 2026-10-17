import { definePage } from "@/lib/pages/page-descriptor"

export default definePage({
  path: "/forgot-password",
  name: "Forgot password",
  summary: "Asks for an email address and sends a link to set a new password.",
  canSwitchOff: false,
})
