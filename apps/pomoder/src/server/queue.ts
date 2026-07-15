import { PgBoss } from "pg-boss"

import { getDatabaseUrl } from "@/server/db"
import type { GenerationKind } from "@/server/generation"

export const GENERATE_MEDIA_QUEUE = "pomoder-generate-media"
export const PROCESS_MEDIA_QUEUE = "pomoder-process-media"
export const ROOM_TRANSITION_QUEUE = "pomoder-room-transition"

let bossPromise: Promise<PgBoss> | null = null

export function getBoss() {
  bossPromise ??= startBoss()
  return bossPromise
}

export async function enqueueGeneration(data: { assetId: string; userId: string; kind: GenerationKind; prompt: string; month: string }) {
  const boss = await getBoss()
  return boss.send(GENERATE_MEDIA_QUEUE, data, { retryLimit: 3, retryDelay: 30, retryBackoff: true, expireInSeconds: 600, singletonKey: data.assetId })
}

export async function enqueueMediaProcessing(assetId: string) {
  const boss = await getBoss()
  return boss.send(PROCESS_MEDIA_QUEUE, { assetId }, { retryLimit: 2, retryDelay: 20, retryBackoff: true, expireInSeconds: 300, singletonKey: assetId })
}

export async function enqueueRoomTransition(roomId: string, sequence: number, runAt: Date) {
  const boss = await getBoss()
  return boss.sendAfter(ROOM_TRANSITION_QUEUE, { roomId, sequence }, { singletonKey: `${roomId}:${sequence}` }, runAt)
}

async function startBoss() {
  const boss = new PgBoss({ connectionString: getDatabaseUrl(), application_name: "pomoder" })
  boss.on("error", (error) => console.error(JSON.stringify({ level: "error", event: "queue_error", message: error.message })))
  await boss.start()
  for (const name of [GENERATE_MEDIA_QUEUE, PROCESS_MEDIA_QUEUE, ROOM_TRANSITION_QUEUE]) {
    if (!(await boss.getQueue(name))) await boss.createQueue(name)
  }
  return boss
}
