import { definePage } from "@/lib/pages/page-descriptor"

export default definePage({
  path: "/verify-email",
  name: "Verify email",
  summary: "Where the emailed verification link lands to confirm an address.",
  canSwitchOff: false,
})
