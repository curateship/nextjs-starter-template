"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { AccountClaimedListingsBlock } from "../blocks/claimed-listings/AccountClaimedListingsBlock"
import { AccountEditProfileBlock } from "../blocks/edit-profile/AccountEditProfileBlock"
import { getBlockName } from "../config/account-page-block-types"
import type { ContentBlock as AccountPageBlock } from "@/lib/utils/block-utils"

interface AccountPageBlockEditorDialogProps {
  selectedBlock: AccountPageBlock | null
  draftContent: Record<string, any>
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onContentChange: (field: string, value: any) => void
  onSave: () => void
}

export function AccountPageBlockEditorDialog({
  selectedBlock,
  draftContent,
  isSaving,
  onOpenChange,
  onContentChange,
  onSave,
}: AccountPageBlockEditorDialogProps) {
  if (!selectedBlock) return null

  return (
    <Dialog open={!!selectedBlock} onOpenChange={onOpenChange}>
      <ModalTabsProvider>
        <DashboardModalContent
          title={`Edit ${selectedBlock.title || getBlockName(selectedBlock.type)}`}
          titleAccessory={<ModalTabs />}
          className="h-[calc(100vh-4rem)] max-h-[820px] max-w-[960px]"
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="button" onClick={onSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          {selectedBlock.type === "account-edit-profile" && (
            <AccountEditProfileBlock
              content={draftContent}
              onContentChange={onContentChange}
            />
          )}
          {selectedBlock.type === "account-claimed-listings" && (
            <AccountClaimedListingsBlock
              content={draftContent}
              onContentChange={onContentChange}
            />
          )}
        </DashboardModalContent>
      </ModalTabsProvider>
    </Dialog>
  )
}
