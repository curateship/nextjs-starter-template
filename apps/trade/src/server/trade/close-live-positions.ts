import { closeLivePosition } from "@/server/trade/live-orders"

type PositionToClose = { walletId: string; marketKey: string }
type ClosePosition = (
  userId: string,
  position: PositionToClose
) => Promise<unknown>

/** Closes one confirmed list together and reports each refusal. */
export async function closeLivePositions(
  userId: string,
  positions: PositionToClose[],
  close: ClosePosition = closeLivePosition
): Promise<{ closed: number; refused: string[] }> {
  const unique = [
    ...new Map(
      positions.map((position) => [
        `${position.walletId}:${position.marketKey}`,
        position,
      ])
    ).values(),
  ]
  const answers = await Promise.allSettled(
    unique.map((position) => close(userId, position))
  )
  return {
    closed: answers.filter((answer) => answer.status === "fulfilled").length,
    refused: answers
      .filter((answer) => answer.status === "rejected")
      .map((answer) =>
        answer.reason instanceof Error
          ? answer.reason.message
          : String(answer.reason)
      ),
  }
}
