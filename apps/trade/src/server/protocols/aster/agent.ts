import type { NetworkId } from "@/lib/protocols/contracts"
import { fetchAsterAccount } from "@/server/protocols/aster/account"
import { parseAsterCredential } from "@/server/protocols/aster/client"
import { scrubbedMessage } from "@/server/protocols/scrub"

const WHY =
  "Aster would not accept the API wallet. Check the account address and make a new Pro API wallet on Aster's key page with perpetual trading permission."

export async function verifyAsterAgentKey(
  network: NetworkId,
  accountAddress: string,
  blob: string
): Promise<{ validUntil: number | null }> {
  const credential = parseAsterCredential(blob)
  if (credential.signer.toLowerCase() === accountAddress.toLowerCase()) {
    throw new Error("ASTER_KEY_MATCHES_ACCOUNT")
  }
  try {
    await fetchAsterAccount(network, accountAddress, () => blob)
  } catch (error) {
    const message = scrubbedMessage(error)
    if (message.startsWith("ASTER_AUTH:")) {
      throw new Error(`KEY_NOT_APPROVED:${WHY}`)
    }
    if (
      message.startsWith("ASTER_CLOCK:") ||
      message.startsWith("ASTER_IP_BANNED:") ||
      message === "ASTER_IP_BANNED" ||
      message.startsWith("EXCHANGE_BUSY:") ||
      message === "EXCHANGE_BUSY"
    ) {
      throw new Error(message)
    }
    throw new Error("KEY_CHECK_UNAVAILABLE")
  }
  return { validUntil: null }
}
