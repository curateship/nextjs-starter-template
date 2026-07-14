import { startAntidetectScheduler } from "../scheduler"

// Nitro server plugin — runs once when the server process boots. The scheduler
// itself is gated on ANTIDETECT_SCHEDULER_ENABLED, so this is a no-op unless
// that flag is set. Registered via the `nitro` plugin config in vite.config.ts.
export default function antidetectSchedulerPlugin() {
  startAntidetectScheduler()
}
