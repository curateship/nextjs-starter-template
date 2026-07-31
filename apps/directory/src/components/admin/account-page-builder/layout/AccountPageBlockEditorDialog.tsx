"use client"

import { Button } from "@/components/ui/button"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { AccountClaimedListingsBlock } from "../blocks/claimed-listings/AccountClaimedListingsBlock"
import { AccountCoreBlock } from "../blocks/core/AccountCoreBlock"
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
          busy={isSaving}
          title={`Edit ${selectedBlock.title || getBlockName(selectedBlock.type)}`}
          titleAccessory={<ModalTabs />}
          className="h-[calc(100vh-4rem)] max-h-[820px] max-w-[960px]"
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button form="account-page-block-editor-form" type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
            </>
          }
        >
          <form
            noValidate
            id="account-page-block-editor-form"
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              onSave()
            }}
          >
          {selectedBlock.type === "account-core" && (
            <AccountCoreBlock
              content={draftContent}
              onContentChange={onContentChange}
            />
          )}
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
          </form>
        </DashboardModalContent>
      </ModalTabsProvider>
    </Dialog>
  )
}
