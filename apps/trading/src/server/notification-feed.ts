import { count, desc, isNull } from "drizzle-orm"

import type { AlertsPollResponse, ScannerAlertItem } from "@/lib/api/scanner"
import { db, type CustomShellDb } from "@/server/db"
import { scannerAlerts } from "@/server/schema"

export async function getScannerAlertsPoll(
  database: CustomShellDb = db
): Promise<AlertsPollResponse> {
  const [latest, [unread]] = await Promise.all([
    database
      .select()
      .from(scannerAlerts)
      .where(isNull(scannerAlerts.readAt))
      .orderBy(desc(scannerAlerts.createdAt))
      .limit(5),
    database
      .select({ value: count() })
      .from(scannerAlerts)
      .where(isNull(scannerAlerts.readAt)),
  ])

  return {
    unreadCount: unread?.value ?? 0,
    latest: latest.map(serializeScannerAlert),
  }
}

function serializeScannerAlert(
  row: typeof scannerAlerts.$inferSelect
): ScannerAlertItem {
  return {
    id: row.id,
    type: row.type,
    coin: row.coin,
    address: row.address,
    title: row.title,
    body: row.body,
    created_at: row.createdAt.toISOString(),
    read_at: row.readAt?.toISOString() ?? null,
  }
}
