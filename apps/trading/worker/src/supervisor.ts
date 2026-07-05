import { eq, inArray } from "drizzle-orm"

import { db } from "@/server/db"
import {
  tradingBots,
  tradingWallets,
  type TradingBot,
  type TradingBotCommand,
} from "@/server/schema"
import { now } from "@/server/util"

import { BotRunner } from "./bot-runner"
import { marketHub } from "./market-hub"
import type { HeartbeatMeta } from "./heartbeat"

/**
 * Owns one BotRunner per bot. Web app writes desired_state + a command row;
 * the supervisor converges actual runner state to it.
 */
export class BotSupervisor {
  private runners = new Map<string, BotRunner>()

  async start() {
    const bots = await db
      .select()
      .from(tradingBots)
      .where(inArray(tradingBots.desiredState, ["running", "paused"]))
    console.log(`supervisor: resuming ${bots.length} bot(s)`)
    for (const bot of bots) {
      await this.spawn(bot).catch((error: unknown) => {
        console.error(`failed to resume bot ${bot.name}`, error)
      })
    }
  }

  async stop() {
    for (const runner of this.runners.values()) {
      await runner.stop("Worker shutting down").catch(() => {})
    }
    this.runners.clear()
  }

  meta(): HeartbeatMeta {
    let running = 0
    for (const runner of this.runners.values()) {
      if (runner.meta().running) running += 1
    }
    return { runningBots: running, subscriptions: marketHub.subscriptionCount() }
  }

  async handleCommand(command: TradingBotCommand): Promise<void> {
    if (command.command === "pause_all" || command.command === "flatten_all") {
      for (const runner of [...this.runners.values()]) {
        // Global commands only touch the issuing user's own bots.
        if (runner.bot.userId !== command.createdByUserId) continue
        if (command.command === "flatten_all") {
          await runner.flatten("Global flatten")
        }
        await runner.pause(
          command.command === "flatten_all" ? "Global flatten" : "Global pause"
        )
        await db
          .update(tradingBots)
          .set({ desiredState: "paused", updatedAt: now() })
          .where(eq(tradingBots.id, runner.bot.id))
      }
      return
    }

    if (!command.botId) {
      throw new Error(`Command "${command.command}" requires a bot id.`)
    }
    const [bot] = await db
      .select()
      .from(tradingBots)
      .where(eq(tradingBots.id, command.botId))
      .limit(1)
    if (!bot) throw new Error("Bot not found")

    const runner = this.runners.get(bot.id)

    switch (command.command) {
      case "start":
        if (runner) {
          await runner.resume()
        } else {
          await this.spawn(bot)
        }
        return
      case "resume":
        if (!runner) {
          await this.spawn(bot)
        } else {
          await runner.resume()
        }
        return
      case "pause":
        await runner?.pause("Paused by user")
        return
      case "stop":
        if (runner) {
          await runner.stop()
          this.runners.delete(bot.id)
        } else {
          await db
            .update(tradingBots)
            .set({ status: "stopped", statusReason: null, updatedAt: now() })
            .where(eq(tradingBots.id, bot.id))
        }
        return
      case "flatten":
        if (!runner) throw new Error("Bot is not running")
        await runner.flatten("Flatten requested by user")
        return
      case "update_params": {
        // Restart the runner so new params take effect atomically.
        if (runner) {
          await runner.stop("Restarting with updated parameters")
          this.runners.delete(bot.id)
        }
        const [fresh] = await db
          .select()
          .from(tradingBots)
          .where(eq(tradingBots.id, bot.id))
          .limit(1)
        if (fresh && fresh.desiredState === "running") {
          await this.spawn(fresh)
        }
        return
      }
      default:
        throw new Error(`Unknown command "${command.command}"`)
    }
  }

  private async spawn(bot: TradingBot) {
    if (this.runners.has(bot.id)) return
    const [wallet] = await db
      .select()
      .from(tradingWallets)
      .where(eq(tradingWallets.id, bot.walletId))
      .limit(1)
    if (!wallet) throw new Error(`Wallet for bot ${bot.name} not found`)

    const runner = new BotRunner(bot)
    this.runners.set(bot.id, runner)
    try {
      await runner.start(wallet)
    } catch (error) {
      this.runners.delete(bot.id)
      throw error
    }
  }
}
