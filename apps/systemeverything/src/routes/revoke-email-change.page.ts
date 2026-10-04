import { definePage } from "@/lib/pages/page-descriptor"

export default definePage({
  path: "/revoke-email-change",
  name: "Stop email change",
  summary: "Where the link that cancels an email change lands.",
  canSwitchOff: false,
})
