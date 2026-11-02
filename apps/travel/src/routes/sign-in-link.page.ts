import { definePage } from "@/lib/pages/page-descriptor"

export default definePage({
  path: "/sign-in-link",
  name: "Email me a sign-in link",
  summary: "Signing in by emailed link instead of a password.",
  canSwitchOff: false,
})
