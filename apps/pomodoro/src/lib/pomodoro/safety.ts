/**
 * What the Warn and Suspend windows offer (admin task 05). Shared by the
 * windows and the server, which checks the same day choices.
 */
export const WARNING_STARTER =
  "Please keep room chat friendly. Further messages like this will get you suspended."

export const SUSPENSION_CHOICES = [
  { value: "1", days: 1, label: "1 day" },
  { value: "7", days: 7, label: "7 days" },
  { value: "30", days: 30, label: "30 days" },
  { value: "lifted", days: null, label: "Until lifted" },
] as const
