export const BACKLINK_PROSPECT_STATUSES = [
  "new",
  "qualified",
  "contacted",
  "replied",
  "won",
  "rejected",
] as const
export type BacklinkProspectStatus =
  (typeof BACKLINK_PROSPECT_STATUSES)[number]

export const backlinkProspectStatusLabels: Record<
  BacklinkProspectStatus,
  string
> = {
  new: "New",
  qualified: "Qualified",
  contacted: "Contacted",
  replied: "Replied",
  won: "Won",
  rejected: "Rejected",
}
