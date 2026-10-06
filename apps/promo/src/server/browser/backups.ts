import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { promisify } from "node:util"
import { gunzip as gunzipCallback, gzip as gzipCallback } from "node:zlib"

import { and, desc, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { deleteFromR2, getFromR2, uploadToR2 } from "@/server/media/storage"

import {
  dockerBytes,
  dockerConnection,
  dockerRequest,
  DockerRequestError,
  publicDockerError,
  type DockerConnection,
} from "./docker"
import { recordProfileEvent } from "./events"
import { Refusal } from "./refusal"
import { promoProfileBackups, promoProfiles } from "./schema"
import { APP_LABEL, IMAGE, liveSessionRow } from "./session"

const gzip = promisify(gzipCallback)
const gunzip = promisify(gunzipCallback)

/**
 * Backing a profile up, and restoring it.
 *
 * A profile's cookies are one Docker volume on one machine, and a signed-in,
 * aged account is the one thing in this app that cannot be rebuilt. A backup
 * is that whole volume, the cookies and the identity file beside them, packed
 * by Docker, compressed, encrypted with the server's key and kept in R2.
 *
 * **Nothing plain touches a disk.** Docker hands the volume over as an archive
 * read straight out of a container that never runs; it is compressed and
 * encrypted in this program's memory and only the encrypted bytes leave. A
 * restore is the same in reverse, and the archive is checked as untouched
 * before a byte of it is written into a volume.
 *
 * The browser program runs both, as jobs, because it is the program with
 * Docker. Both refuse while the profile's browser is open: a browser writes
 * its cookie files as it goes, and a copy taken mid-write can be torn.
 */

/** The newest this many are kept for each profile; the oldest go. */
export const KEEP_BACKUPS = 5

/**
 * Far above a real profile, which measured 155MB on 6 Oct 2026, most of it
 * Firefox's page cache. A volume past this is something gone wrong, and
 * holding it in memory would be the next thing to go wrong.
 */
const MAX_ARCHIVE_BYTES = 2 * 1024 ** 3

/** The first bytes of every backup, so a wrong file is named as one. */
const MAGIC = Buffer.from("PRB1")
const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * The server's key, made the same way the shell makes it for stored secrets
 * (`src/server/auth/encryption.ts`), from CUSTOM_SHELL_SECRET_ENCRYPTION_KEY.
 * That file's own function is for short strings and is not exported; this
 * must stay in step with it, so a backup opens wherever that key is the same.
 */
function backupKey(): Buffer {
  const secret = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  if (!secret) throw new Error("ENCRYPTION_NOT_CONFIGURED")
  return createHash("sha256").update(secret).digest()
}

/** PRB1, then the IV, then GCM's tag, then the encrypted archive. */
export function sealBackup(plain: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", backupKey(), iv)
  const sealed = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), sealed])
}

/** The archive, or a refusal when it is not a backup or this key cannot open it. */
export function openBackup(stored: Buffer): Buffer {
  const head = MAGIC.length + IV_BYTES + TAG_BYTES
  if (stored.length < head || !stored.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Refusal("That file is not a profile backup.")
  }
  const iv = stored.subarray(MAGIC.length, MAGIC.length + IV_BYTES)
  const tag = stored.subarray(MAGIC.length + IV_BYTES, head)
  try {
    const decipher = createDecipheriv("aes-256-gcm", backupKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(stored.subarray(head)), decipher.final()])
  } catch {
    // A changed key and a damaged file both land here: GCM's tag no longer
    // matches, so there is nothing safe to unpack.
    throw new Refusal(
      "This backup cannot be opened. It was made with a different server key, or it has been damaged."
    )
  }
}

export type BackupView = { id: string; sizeBytes: number; createdAt: Date }

/** A profile's backups, newest first. */
export async function listBackups(
  userId: string,
  profileId: string,
  db: CustomShellDb = defaultDb
): Promise<BackupView[]> {
  return db
    .select({
      id: promoProfileBackups.id,
      sizeBytes: promoProfileBackups.sizeBytes,
      createdAt: promoProfileBackups.createdAt,
    })
    .from(promoProfileBackups)
    .where(and(eq(promoProfileBackups.profileId, profileId), eq(promoProfileBackups.userId, userId)))
    .orderBy(desc(promoProfileBackups.createdAt))
}

export async function backupProfile(
  userId: string,
  profileId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  try {
    await takeBackup(userId, profileId, db)
  } catch (error) {
    // Docker's own reason goes to the log; the tab gets one sentence.
    throw publicDockerError(error, "be backed up")
  }
}

async function takeBackup(userId: string, profileId: string, db: CustomShellDb): Promise<void> {
  const profile = await ownedProfile(userId, profileId, db)
  await refuseWhileOpen(profile, db)

  const connection = dockerConnection()
  if (!(await volumeExists(connection, profile.volumeName))) {
    throw new Refusal(`${profile.name} has never opened a browser, so there is nothing to back up yet.`)
  }

  const archive = await withHelper(connection, profile, true, (helper) =>
    dockerBytes(connection, "GET", `/containers/${helper}/archive?path=${encodeURIComponent("/data/profile")}`, {
      maxBytes: MAX_ARCHIVE_BYTES,
    })
  )
  const sealed = sealBackup(await gzip(archive))

  const id = uuid()
  const objectKey = `promo-backups/${profileId}/${id}.bin`
  await uploadToR2(objectKey, sealed, "application/octet-stream")
  await db.insert(promoProfileBackups).values({
    id,
    userId,
    profileId,
    objectKey,
    sizeBytes: sealed.length,
  })
  await recordProfileEvent(userId, profileId, "backed_up", `${megabytes(sealed.length)} kept in R2, encrypted`, db)
  await dropOldBackups(userId, profileId, db)
}

export async function restoreProfile(
  userId: string,
  profileId: string,
  input: { backupId: string; replace: boolean },
  db: CustomShellDb = defaultDb
): Promise<void> {
  try {
    await putBack(userId, profileId, input, db)
  } catch (error) {
    throw publicDockerError(error, "be restored")
  }
}

async function putBack(
  userId: string,
  profileId: string,
  input: { backupId: string; replace: boolean },
  db: CustomShellDb
): Promise<void> {
  const profile = await ownedProfile(userId, profileId, db)
  const [backup] = await db
    .select()
    .from(promoProfileBackups)
    .where(
      and(
        eq(promoProfileBackups.id, input.backupId),
        eq(promoProfileBackups.profileId, profileId),
        eq(promoProfileBackups.userId, userId)
      )
    )
    .limit(1)
  if (!backup) throw new Refusal("That backup does not exist.")
  await refuseWhileOpen(profile, db)

  const connection = dockerConnection()
  const exists = await volumeExists(connection, profile.volumeName)
  if (exists && !input.replace) {
    throw new Refusal(
      `${profile.name} already has browser data on this machine. Restoring replaces it, so choose Replace and restore to go ahead.`
    )
  }

  // Read and checked in full before anything on this machine changes, so a
  // backup that cannot be opened leaves the volume as it was.
  const archive = await gunzip(openBackup(await readObject(backup.objectKey)))

  if (exists) {
    await dockerRequest(connection, "DELETE", `/volumes/${encodeURIComponent(profile.volumeName)}`)
  }
  await dockerRequest(connection, "POST", "/volumes/create", {
    Name: profile.volumeName,
    Labels: { [APP_LABEL]: "promo" },
  })
  // Docker named the archive's top folder after the one it read, "profile",
  // so it is unpacked one level up and lands back in /data/profile.
  await withHelper(connection, profile, false, (helper) =>
    dockerBytes(connection, "PUT", `/containers/${helper}/archive?path=${encodeURIComponent("/data")}`, {
      body: archive,
      maxBytes: 1024 * 1024,
    })
  )

  await recordProfileEvent(
    userId,
    profileId,
    "restored",
    `From the backup taken ${takenAt(backup.createdAt)}${exists ? ", replacing what was here" : ""}`,
    db
  )
}

async function ownedProfile(userId: string, profileId: string, db: CustomShellDb) {
  const [profile] = await db
    .select({ id: promoProfiles.id, name: promoProfiles.name, volumeName: promoProfiles.volumeName })
    .from(promoProfiles)
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))
    .limit(1)
  if (!profile) throw new Refusal("That browser profile does not exist.")
  return profile
}

async function refuseWhileOpen(profile: { id: string; name: string }, db: CustomShellDb): Promise<void> {
  if (await liveSessionRow(profile.id, db)) {
    throw new Refusal(
      `${profile.name}'s browser is open. Stop it first: an open browser is still writing its cookies.`
    )
  }
}

async function volumeExists(connection: DockerConnection, name: string): Promise<boolean> {
  try {
    await dockerRequest(connection, "GET", `/volumes/${encodeURIComponent(name)}`)
    return true
  } catch (error) {
    if (error instanceof DockerRequestError && error.status === 404) return false
    throw error
  }
}

/**
 * Runs `work` with a container that holds the profile's volume and is never
 * started, which is all Docker needs to read a folder out or write one in.
 *
 * Not marked as the app's browser, so the sweep that clears away unclaimed
 * browsers never takes it mid-backup. Named after the profile, so one left
 * by a crash is cleared by the next backup of that profile.
 */
async function withHelper<T>(
  connection: DockerConnection,
  profile: { id: string; volumeName: string },
  readOnly: boolean,
  work: (containerId: string) => Promise<T>
): Promise<T> {
  const name = `promo-backup-${profile.id.slice(0, 8)}`
  await removeHelper(connection, name)
  const created = await dockerRequest<{ Id?: string }>(
    connection,
    "POST",
    `/containers/create?name=${encodeURIComponent(name)}`,
    {
      Image: IMAGE,
      Entrypoint: ["true"],
      Labels: { "com.systemeverything.promo-helper": "backup" },
      HostConfig: { Binds: [`${profile.volumeName}:/data/profile${readOnly ? ":ro" : ""}`] },
    }
  )
  if (!created.Id) throw new Error("Docker made a helper container with no id.")
  try {
    return await work(encodeURIComponent(created.Id))
  } finally {
    await removeHelper(connection, created.Id)
  }
}

async function removeHelper(connection: DockerConnection, nameOrId: string): Promise<void> {
  try {
    await dockerRequest(connection, "DELETE", `/containers/${encodeURIComponent(nameOrId)}?force=true&v=false`)
  } catch (error) {
    if (error instanceof DockerRequestError && error.status === 404) return
    throw error
  }
}

async function readObject(objectKey: string): Promise<Buffer> {
  const object = await getFromR2(objectKey)
  if (!object.Body) throw new Error("R2 returned the backup with no body.")
  return Buffer.from(await object.Body.transformToByteArray())
}

/**
 * Removes every backup of a profile, from R2 and from the list, for when the
 * profile itself is deleted. Throws on the first object R2 will not delete;
 * the ones already gone have lost their rows, the rest keep theirs.
 */
export async function deleteAllBackups(userId: string, profileId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const all = await db
    .select({ id: promoProfileBackups.id, objectKey: promoProfileBackups.objectKey })
    .from(promoProfileBackups)
    .where(and(eq(promoProfileBackups.profileId, profileId), eq(promoProfileBackups.userId, userId)))
  for (const backup of all) {
    await deleteFromR2(backup.objectKey)
    await db.delete(promoProfileBackups).where(eq(promoProfileBackups.id, backup.id))
  }
}

/**
 * Keeps the newest few. An object R2 will not delete keeps its row, so it is
 * still listed and the next backup tries again, rather than a row vanishing
 * while its bytes stay in the bucket.
 */
async function dropOldBackups(userId: string, profileId: string, db: CustomShellDb): Promise<void> {
  const all = await db
    .select({ id: promoProfileBackups.id, objectKey: promoProfileBackups.objectKey })
    .from(promoProfileBackups)
    .where(and(eq(promoProfileBackups.profileId, profileId), eq(promoProfileBackups.userId, userId)))
    .orderBy(desc(promoProfileBackups.createdAt))
  for (const old of all.slice(KEEP_BACKUPS)) {
    try {
      await deleteFromR2(old.objectKey)
      await db.delete(promoProfileBackups).where(eq(promoProfileBackups.id, old.id))
    } catch (error) {
      console.error(`Could not drop old backup ${old.id}`, error)
    }
  }
}

/** "6 Oct 2026, 16:28 UTC": the history is read on any machine, so the zone is said. */
function takenAt(date: Date): string {
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
  return `${day}, ${time} UTC`
}

function megabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))}MB`
}
