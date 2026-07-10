import { randomUUID } from "node:crypto"

import { and, desc, eq } from "drizzle-orm"

import type { StrategyConfig } from "@/lib/strategies/strategy-config"
import { db, type CustomShellDb } from "@/server/db"
import { tradingStrategies, type TradingStrategy } from "@/server/schema"

const now = () => new Date()

/** All of a user's saved strategies, newest first. */
export async function listUserStrategies(
  userId: string,
  database: CustomShellDb = db
): Promise<TradingStrategy[]> {
  return database
    .select()
    .from(tradingStrategies)
    .where(eq(tradingStrategies.userId, userId))
    .orderBy(desc(tradingStrategies.updatedAt))
}

export async function getUserStrategy(
  userId: string,
  strategyId: string,
  database: CustomShellDb = db
): Promise<TradingStrategy | null> {
  const [row] = await database
    .select()
    .from(tradingStrategies)
    .where(
      and(
        eq(tradingStrategies.id, strategyId),
        eq(tradingStrategies.userId, userId)
      )
    )
    .limit(1)
  return row ?? null
}

export async function createUserStrategy(
  userId: string,
  input: { name: string; config: StrategyConfig },
  database: CustomShellDb = db
): Promise<TradingStrategy> {
  const [row] = await database
    .insert(tradingStrategies)
    .values({
      id: randomUUID(),
      userId,
      name: input.name,
      config: input.config,
      createdAt: now(),
      updatedAt: now(),
    })
    .returning()
  return row
}

export async function updateUserStrategy(
  userId: string,
  strategyId: string,
  input: { name: string; config: StrategyConfig },
  database: CustomShellDb = db
): Promise<TradingStrategy | null> {
  const [row] = await database
    .update(tradingStrategies)
    .set({ name: input.name, config: input.config, updatedAt: now() })
    .where(
      and(
        eq(tradingStrategies.id, strategyId),
        eq(tradingStrategies.userId, userId)
      )
    )
    .returning()
  return row ?? null
}

/** Deletes a saved strategy. Bots keep their snapshots (strategy_id nulls). */
export async function deleteUserStrategy(
  userId: string,
  strategyId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const rows = await database
    .delete(tradingStrategies)
    .where(
      and(
        eq(tradingStrategies.id, strategyId),
        eq(tradingStrategies.userId, userId)
      )
    )
    .returning({ id: tradingStrategies.id })
  return rows.length > 0
}
