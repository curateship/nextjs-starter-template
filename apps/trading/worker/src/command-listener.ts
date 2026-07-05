import { asc, eq } from "drizzle-orm"
import pg from "pg"

import { db, getDatabaseUrl } from "@/server/db"
import { tradingBotCommands, type TradingBotCommand } from "@/server/schema"

const POLL_INTERVAL_MS = 5_000
export const COMMAND_CHANNEL = "bot_commands"

export type CommandHandler = (command: TradingBotCommand) => Promise<void>

/**
 * Web → worker signaling: LISTEN on the bot_commands channel for instant
 * wake-ups, with a poll fallback that survives dropped connections and
 * missed notifies. Commands are claimed by flipping status pending →
 * processing before execution, so a crashed worker never loses one.
 */
export class CommandListener {
  private client: pg.Client | null = null
  private timer: NodeJS.Timeout | null = null
  private draining = false
  private stopped = false
  private readonly handler: CommandHandler

  constructor(handler: CommandHandler) {
    this.handler = handler
  }

  async start() {
    this.stopped = false
    await this.connect()
    this.timer = setInterval(() => void this.drain(), POLL_INTERVAL_MS)
    await this.drain()
  }

  async stop() {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.client?.end().catch(() => {})
    this.client = null
  }

  private async connect() {
    if (this.stopped) return
    try {
      const client = new pg.Client({ connectionString: getDatabaseUrl() })
      await client.connect()
      await client.query(`listen ${COMMAND_CHANNEL}`)
      client.on("notification", () => void this.drain())
      client.on("error", () => void this.reconnect())
      client.on("end", () => void this.reconnect())
      this.client = client
      console.log("command listener connected")
    } catch (error) {
      console.error("command listener connect failed; retrying in 5s", error)
      setTimeout(() => void this.connect(), POLL_INTERVAL_MS)
    }
  }

  private async reconnect() {
    if (this.stopped) return
    await this.client?.end().catch(() => {})
    this.client = null
    setTimeout(() => void this.connect(), POLL_INTERVAL_MS)
  }

  private async drain() {
    if (this.draining || this.stopped) return
    this.draining = true
    try {
      for (;;) {
        const command = await this.claimNext()
        if (!command) break
        try {
          await this.handler(command)
          await db
            .update(tradingBotCommands)
            .set({ status: "done", processedAt: new Date() })
            .where(eq(tradingBotCommands.id, command.id))
        } catch (error) {
          const message =
            error instanceof Error ? error.message.slice(0, 400) : "failed"
          await db
            .update(tradingBotCommands)
            .set({
              status: "error",
              error: message,
              processedAt: new Date(),
            })
            .where(eq(tradingBotCommands.id, command.id))
          console.error(`command ${command.command} failed:`, message)
        }
      }
    } finally {
      this.draining = false
    }
  }

  private async claimNext(): Promise<TradingBotCommand | null> {
    const [pending] = await db
      .select()
      .from(tradingBotCommands)
      .where(eq(tradingBotCommands.status, "pending"))
      .orderBy(asc(tradingBotCommands.createdAt))
      .limit(1)
    if (!pending) return null

    const [claimed] = await db
      .update(tradingBotCommands)
      .set({ status: "processing" })
      .where(eq(tradingBotCommands.id, pending.id))
      .returning()
    return claimed ?? null
  }
}
