import { definePage } from "@/lib/pages/page-descriptor"

export default definePage({
  path: "/maintenance",
  name: "Maintenance",
  summary:
    "The holding page visitors see while the app is switched off for maintenance.",
  // Not switchable, for the same reason the sign-in pages are not: this is the
  // one screen a locked-out member can still reach, and hiding it would leave
  // maintenance mode showing them a not-found page with nothing to explain it.
  canSwitchOff: false,
})
