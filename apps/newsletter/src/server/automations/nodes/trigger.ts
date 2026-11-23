import type { NodeExecutor } from "@/server/automations/types"

// The trigger fired at enrollment time; executing it is a no-op so every run
// starts with a uniform step log entry.
export const executeTrigger: NodeExecutor = async () => {
  return { type: "next" }
}
