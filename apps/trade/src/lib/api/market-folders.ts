import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  KNOWN_PROTOCOLS,
  parseMarketKey,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import type { MarketFolder } from "@/lib/trade/market-folders"
import { userGet, userPost } from "@/server/guards"
import {
  createMarketFolder,
  deleteMarketFolder,
  loadMarketFolders,
  reorderMarketFolders,
  renameMarketFolder,
  setMarketInFolder,
} from "@/server/trade/market-folders"

import { createErrorMessage } from "./error-message"

const scopeSchema = z.object({
  protocol: z.enum(KNOWN_PROTOCOLS),
  network: z.enum(["mainnet", "testnet"]),
})
const folderIdSchema = z.string().uuid()
const marketKeySchema = z
  .string()
  .max(180)
  .refine((key) => parseMarketKey(key) !== null, {
    message: "Not a market key.",
  })
const reorderFoldersSchema = z.object({
  protocol: z.enum(KNOWN_PROTOCOLS),
  network: z.enum(["mainnet", "testnet"]),
  folderIds: z.array(z.string().uuid()).max(100),
})

const loadMarketFoldersFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(scopeSchema)
  .handler(({ data, context }): Promise<MarketFolder[]> =>
    loadMarketFolders(context.user.id, data.protocol, data.network)
  )

const setMarketFolderItemFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      folderId: folderIdSchema,
      marketKey: marketKeySchema,
      saved: z.boolean(),
    })
  )
  .handler(({ data, context }) => setMarketInFolder(context.user.id, data))

const createMarketFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    scopeSchema.extend({
      name: z.string().max(80),
      marketKey: marketKeySchema.optional(),
    })
  )
  .handler(({ data, context }) => createMarketFolder(context.user.id, data))

const renameMarketFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ folderId: folderIdSchema, name: z.string().max(80) })
  )
  .handler(({ data, context }) =>
    renameMarketFolder(context.user.id, data.folderId, data.name)
  )

const reorderMarketFoldersFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reorderFoldersSchema)
  .handler(({ data, context }) => reorderMarketFolders(context.user.id, data))

const deleteMarketFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: folderIdSchema }))
  .handler(({ data, context }) =>
    deleteMarketFolder(context.user.id, data.folderId)
  )

export function loadFolders(protocol: ProtocolId, network: NetworkId) {
  return loadMarketFoldersFn({ data: { protocol, network } })
}
export function setFolderMarket(input: {
  folderId: string
  marketKey: string
  saved: boolean
}) {
  return setMarketFolderItemFn({ data: input })
}
export function createFolder(input: {
  protocol: ProtocolId
  network: NetworkId
  name: string
  marketKey?: string
}) {
  return createMarketFolderFn({ data: input })
}
export function renameFolder(folderId: string, name: string) {
  return renameMarketFolderFn({ data: { folderId, name } })
}
export function reorderFolders(input: {
  protocol: ProtocolId
  network: NetworkId
  folderIds: string[]
}) {
  return reorderMarketFoldersFn({ data: input })
}
export function deleteFolder(folderId: string) {
  return deleteMarketFolderFn({ data: { folderId } })
}

export const getMarketFolderErrorMessage = createErrorMessage(
  {
    "Give the folder a name": "Give the folder a name.",
    "Folder names can be at most 80 characters":
      "Folder names can be at most 80 characters.",
    "You already have a market folder with that name":
      "You already have a market folder with that name.",
    "A market folder can hold at most 100 coins":
      "A market folder can hold at most 100 coins.",
    "You can have at most 100 named market folders":
      "You can have at most 100 named market folders.",
    "That coin belongs to another exchange":
      "That coin belongs to another exchange.",
    "That market folder no longer exists":
      "That market folder no longer exists.",
    "Fav cannot be renamed": "Fav cannot be renamed.",
    "Fav cannot be deleted": "Fav cannot be deleted.",
    "Those market folders could not be reordered":
      "Those market folders could not be reordered.",
  },
  "That market folder change did not save. Try it again."
)

export const getMarketFoldersLoadErrorMessage = createErrorMessage(
  {},
  "Your market folders could not be loaded. Try again."
)
