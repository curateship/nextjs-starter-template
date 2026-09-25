import { createServerFn } from "@tanstack/react-start"
import { decideAutomationApprovalImpl } from "./approval-actions.server"

export const decideAutomationApproval = createServerFn({ method: "POST" })
  .inputValidator((data: { approvalId: string; decision: 'approve' | 'reject' }) => data)
  .handler(async ({ data }) => decideAutomationApprovalImpl(data.approvalId, data.decision))
