import type { CompiledConfig } from "@/lib/automations/compiled-config"
import type { CustomShellDb } from "@/server/db"
import type {
  NewsletterAutomationRun,
  NewsletterContact,
} from "@/server/schema"

export type ExecutorContext = {
  database: CustomShellDb
  workspaceId: string
  run: NewsletterAutomationRun
  contact: NewsletterContact
  config: CompiledConfig
  nodeId: string
  now: () => Date
}

export type ExecutorResult =
  | { type: "next"; port?: "yes" | "no"; output?: unknown }
  | { type: "wait"; wakeAt: Date; output?: unknown }
  | { type: "complete"; output?: unknown }

export type NodeExecutor = (ctx: ExecutorContext) => Promise<ExecutorResult>
