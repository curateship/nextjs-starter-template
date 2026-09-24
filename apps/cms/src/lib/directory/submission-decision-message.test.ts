import { describe, expect, it } from "vitest"

import {
  eventSubmissionDecisionMessage,
  submissionDecisionMessage,
} from "@/lib/directory/submission-decision-message"

/**
 * The failure this guards against is the screen telling an admin the sender was
 * emailed when the send failed. The admin then has no reason to follow up and
 * the applicant never finds out. So the two cases have to read differently, and
 * neither may suggest the decision itself did not happen.
 */
describe("what the admin is told after deciding a submission", () => {
  it("says the sender was emailed only when they were", () => {
    expect(submissionDecisionMessage("approve", true)).toBe(
      "Approved. The listing is live and the sender has been emailed."
    )
    expect(submissionDecisionMessage("reject", true)).toBe(
      "Rejected. The sender has been emailed."
    )
  })

  it("says the email failed without claiming it was sent", () => {
    for (const decision of ["approve", "reject"] as const) {
      const message = submissionDecisionMessage(decision, false)
      expect(message).toContain("could not be sent")
      expect(message).not.toContain("has been emailed")
    }
  })

  it("leads with the decision either way, so a failed email never reads as a refused decision", () => {
    expect(submissionDecisionMessage("approve", false)).toMatch(/^Approved[.,]/)
    expect(submissionDecisionMessage("reject", false)).toMatch(/^Rejected[.,]/)
    expect(submissionDecisionMessage("approve", false)).toContain(
      "The listing is live"
    )
  })
})

describe("what the admin is told after deciding a suggested event", () => {
  it("says the event is a draft, and whether the sender heard", () => {
    expect(eventSubmissionDecisionMessage("approve", true)).toBe(
      "Approved. The event is saved as a draft and the sender has been emailed."
    )
    expect(eventSubmissionDecisionMessage("approve", false)).toBe(
      "Approved. The event is saved as a draft, but the email to the sender could not be sent."
    )
    expect(eventSubmissionDecisionMessage("reject", false)).toBe(
      "Rejected, but the email to the sender could not be sent."
    )
  })
})
