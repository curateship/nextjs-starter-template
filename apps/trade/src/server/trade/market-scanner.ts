import { eq } from "drizzle-orm"
import { db } from "@/server/trade/db"
import { tradePrefs } from "@/server/trade/schema"
import {
  defaultScannerSettings,
  scannerSettingsSchema,
  type ScannerSettings,
} from "@/lib/trade/market-scanner"

export async function loadScannerSettings(userId: string) {
  const [row] = await db
    .select({ settings: tradePrefs.marketScanner })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return row?.settings == null
    ? defaultScannerSettings()
    : scannerSettingsSchema.parse(row.settings)
}
export async function saveScannerSettings(
  userId: string,
  settings: ScannerSettings
) {
  await db
    .insert(tradePrefs)
    .values({ userId, marketScanner: settings, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { marketScanner: settings, updatedAt: new Date() },
    })
  return settings
}
