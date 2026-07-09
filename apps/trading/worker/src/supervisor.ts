import { eq, inArray } from "drizzle-orm"

import { db } from "@/server/db"
import {
  tradingBotState,
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
 * Owns one BotRunner per (bot, market) — a bot now trades several markets at
 * once, each as an independent runner. Web app writes desired_state + a command
 * row; the supervisor converges actual runner state to it, fanning each command
 * out to all of a bot's market runners.
 */
export class BotSupervisor {
  private runners = new Map<string, BotRunner>()

  private key(botId: string, market: string): string {
    return `${botId}::${market}`
  }

  private runnersFor(botId: string): BotRunner[] {
    const prefix = `${botId}::`
    const list: BotRunner[] = []
    for (const [key, runner] of this.runners) {
      if (key.startsWith(prefix)) list.push(runner)
    }
    return list
  }

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
    const runningBots = new Set<string>()
    for (const runner of this.runners.values()) {
      if (runner.meta().running) runningBots.add(runner.bot.id)
    }
    return {
      runningBots: runningBots.size,
      subscriptions: marketHub.subscriptionCount(),
    }
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

    const existing = this.runnersFor(bot.id)

    switch (command.command) {
      case "start":
      case "resume":
        // Resume any live market runners and spawn any that aren't running yet.
        for (const runner of existing) await runner.resume()
        await this.spawn(bot)
        return
      case "pause":
        for (const runner of existing) await runner.pause("Paused by user")
        return
      case "stop":
        if (existing.length) {
          for (const runner of existing) {
            await runner.stop()
            this.runners.delete(this.key(bot.id, runner.market))
          }
        } else {
          await db
            .update(tradingBotState)
            .set({ status: "stopped", statusReason: null, updatedAt: now() })
            .where(eq(tradingBotState.botId, bot.id))
          await db
            .update(tradingBots)
            .set({ status: "stopped", statusReason: null, updatedAt: now() })
            .where(eq(tradingBots.id, bot.id))
        }
        return
      case "flatten":
        if (!existing.length) throw new Error("Bot is not running")
        // Close the position + cancel orders, then pause so the strategy
        // doesn't immediately re-open — otherwise flattening a running bot
        // looks like a no-op.
        for (const runner of existing) {
          await runner.flatten("Flatten requested by user")
          await runner.pause("Paused after flatten")
        }
        return
      case "update_params": {
        const [fresh] = await db
          .select()
          .from(tradingBots)
          .where(eq(tradingBots.id, bot.id))
          .limit(1)
        const keepMarkets = new Set(fresh?.markets ?? [])
        // Restart every runner so new params take effect atomically. A runner
        // whose market was removed from the bot closes its position first, then
        // stops without respawning (it's not in the fresh market set).
        for (const runner of existing) {
          if (!keepMarkets.has(runner.market)) {
            await runner
              .flatten("Market removed from bot")
              .catch((error: unknown) =>
                console.error(
                  `failed to flatten ${bot.name} ${runner.market} on removal`,
                  error
                )
              )
          }
          await runner.stop("Restarting with updated parameters")
          this.runners.delete(this.key(bot.id, runner.market))
        }
        if (fresh && fresh.desiredState === "running") {
          await this.spawn(fresh)
        }
        return
      }
      default:
        throw new Error(`Unknown command "${command.command}"`)
    }
  }

  /** Spawns a runner for each of the bot's markets that isn't already running. */
  private async spawn(bot: TradingBot) {
    const [wallet] = await db
      .select()
      .from(tradingWallets)
      .where(eq(tradingWallets.id, bot.walletId))
      .limit(1)
    if (!wallet) throw new Error(`Wallet for bot ${bot.name} not found`)

    for (const market of bot.markets) {
      const key = this.key(bot.id, market)
      if (this.runners.has(key)) continue
      const runner = new BotRunner(bot, market)
      this.runners.set(key, runner)
      try {
        await runner.start(wallet)
      } catch (error) {
        // One bad market shouldn't block the bot's other markets; the runner
        // has already flagged its own error status.
        this.runners.delete(key)
        console.error(`failed to start bot ${bot.name} on ${market}`, error)
      }
    }
  }
}
