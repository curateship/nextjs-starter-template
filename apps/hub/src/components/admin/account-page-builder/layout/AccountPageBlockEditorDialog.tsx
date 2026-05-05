"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { ModalTabs, ModalTabsProvider } from "@/components/admin/layout/dashboard/modal-tabs"
import {
  AdminModalContent,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalScrollBody,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
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
        <AdminModalContent size="wide">
          <AdminModalHeader>
            <div className="flex min-w-0 items-center gap-4 pr-10">
              <AdminModalTitle className="shrink-0">
                Edit {selectedBlock.title || getBlockName(selectedBlock.type)}
              </AdminModalTitle>
              <ModalTabs />
            </div>
          </AdminModalHeader>

          <AdminModalScrollBody>
            {selectedBlock.type === "account-edit-profile" && (
              <AccountEditProfileBlock
                content={draftContent}
                onContentChange={onContentChange}
              />
            )}
          </AdminModalScrollBody>

          <AdminModalFooter className="sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={onSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </AdminModalFooter>
        </AdminModalContent>
      </ModalTabsProvider>
    </Dialog>
  )
}
