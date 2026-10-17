import { definePage } from "@/lib/pages/page-descriptor"

export default definePage({
  path: "/reset-password",
  name: "Reset password",
  summary: "Where the emailed reset link lands and the new password is set.",
  canSwitchOff: false,
})
