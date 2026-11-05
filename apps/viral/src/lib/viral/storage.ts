/**
 * Storage clean-up (`workspace/docs/storage.md`): the space Viral's
 * downloaded copies use, and the button that deletes copies nobody has opened
 * for this many days. Vault copies are never touched.
 */
export const STORAGE_UNOPENED_DAYS = 30

export type StorageSummary = {
  /** Every saved video that still has its downloaded file. */
  copies: number
  bytes: number
  /** The ones a vault idea keeps. The button never deletes these. */
  vaultCopies: number
  vaultBytes: number
  /** What the button would delete now. */
  freeableCopies: number
  freeableBytes: number
}
