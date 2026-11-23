import { z } from "zod"
import type { NetworkId } from "@/lib/protocols/contracts"
import type { KeyPermission } from "@/lib/trade/wallets"
import { kucoinSigned, parseKucoinCredential } from "./client"

const permissionSchema = z.object({ permission: z.string().min(1) })

export async function readKucoinKeyPermission(
  network: NetworkId,
  _address: string,
  credential: () => string | null
): Promise<KeyPermission> {
  const blob = credential()
  if (!blob) return "unknown"
  const answer = await kucoinSigned(
    network,
    parseKucoinCredential(blob),
    "GET",
    "/api/v1/user/api-key"
  )
  const parsed = permissionSchema.safeParse(answer)
  if (!parsed.success) return "unknown"
  const permissions = parsed.data.permission
    .split(",")
    .map((value) => value.trim())
  if (permissions.includes("Withdrawal")) return "can-withdraw"
  const known = [
    "General",
    "Futures",
    "Unified",
    "Spot",
    "Earn",
    "InnerTransfer",
    "Margin",
  ]
  return permissions.includes("Futures") &&
    permissions.every((value) => known.includes(value))
    ? "trade-only"
    : "unknown"
}
