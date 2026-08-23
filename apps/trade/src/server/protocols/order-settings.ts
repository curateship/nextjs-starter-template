import type { ProtocolId } from "@/lib/protocols/contracts"
import type { AsterMarginMode } from "@/lib/trade/aster-margin-mode"

/** The account mode a fresh order must set, when its protocol owns one. */
export function openingMarginMode(
  protocol: ProtocolId,
  asterMode: AsterMarginMode
): AsterMarginMode | null {
  return protocol === "aster" ? asterMode : null
}
