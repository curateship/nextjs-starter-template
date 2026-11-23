"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/admin/layout/admin-layout";
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader";
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader";
import { ApplyThemeDialog } from "@/components/admin/layout/builder/themes/ApplyThemeDialog";
import {
  ConfirmDestructive,
  AdminListSkeleton,
  AdminTableShell,
  AdminTableSummaryFooter,
  formatRelativeDate,
} from "@/components/admin/layout/list";
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
} from "@/components/admin/layout/content/table-right-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createSiteAction,
  updateSiteAction,
  type Site,
} from "@/lib/actions/sites/site-actions";
import {
  deleteTemplateAction,
  getTemplateSitesAction,
} from "@/lib/actions/themes/user-theme-actions";
import {
  Edit,
  MoreHorizontal,
  Paintbrush,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

export default function ThemesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    templateId: string;
    templateName: string;
  }>({
    open: false,
    templateId: "",
    templateName: "",
  });
  const [creating, setCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean;
    templateId: string;
    currentName: string;
  }>({
    open: false,
    templateId: "",
    currentName: "",
  });
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [applyDialog, setApplyDialog] = useState<{
    open: boolean;
    templateId: string;
    templateName: string;
  }>({
    open: false,
    templateId: "",
    templateName: "",
  });
  const [searchQuery, setSearchQuery] = useState("");

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: loadError } = await getTemplateSitesAction();
      if (loadError) {
        setError(loadError);
        return;
      }
      setTemplates(data || []);
    } catch {
      setError("Failed to load themes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleCreateTheme = async () => {
    const trimmed = createName.trim();
    if (!trimmed) return;

    try {
      setCreating(true);
      const { data, error: createError } = await createSiteAction({
        name: trimmed,
        is_template: true,
      });
      if (createError) {
        setError(`Failed to create theme: ${createError}`);
        return;
      }
      if (data) {
        setCreateDialogOpen(false);
        router.push(`/admin/pages/${data.id}`);
      }
    } catch {
      setError("Failed to create theme");
    } finally {
      setCreating(false);
    }
  };

  const handleRenameSubmit = async () => {
    const trimmed = renameName.trim();
    if (!trimmed || trimmed === renameDialog.currentName) return;

    try {
      setRenaming(true);
      const { error: renameError } = await updateSiteAction(
        renameDialog.templateId,
        { name: trimmed },
      );
      if (renameError) {
        setError(`Failed to rename theme: ${renameError}`);
        return;
      }
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === renameDialog.templateId ? { ...t, name: trimmed } : t,
        ),
      );
      setRenameDialog((prev) => ({ ...prev, open: false }));
    } catch {
      setError("Failed to rename theme");
    } finally {
      setRenaming(false);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(deleteDialog.templateId);
      const { success, error: deleteError } = await deleteTemplateAction(
        deleteDialog.templateId,
      );
      if (deleteError) {
        setError(`Failed to delete theme: ${deleteError}`);
        return;
      }
      if (success)
        setTemplates((prev) =>
          prev.filter((t) => t.id !== deleteDialog.templateId),
        );
      setDeleteDialog((prev) => ({ ...prev, open: false }));
    } catch {
      setError("Failed to delete theme");
    } finally {
      setDeleting(null);
    }
  };

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredTemplates = normalizedSearchQuery
    ? templates.filter((template) => {
        const searchText = [template.name, template.settings?.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchText.includes(normalizedSearchQuery);
      })
    : templates;

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader items={[{ label: "Themes" }]} />

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <AdminTableShell
            title="Themes"
            icon={<Paintbrush className="text-muted-foreground" />}
            count={filteredTemplates.length}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search themes"
                />
                <TableRightActionsButton
                  onClick={() => {
                    setCreateName("");
                    setCreateDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Theme</span>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={!loading ? <AdminTableSummaryFooter count={filteredTemplates.length} label="themes" /> : null}
          >

            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="main">Theme</TableHead>
                    <TableHead column="meta">Created</TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton
                      columns={3}
                      rowCount={3}
                      showCheckbox={false}
                    />
                  ) : filteredTemplates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-32 text-center">
                        <Paintbrush className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                        <p className="mb-1 text-muted-foreground">
                          {normalizedSearchQuery
                            ? "No themes match your search"
                            : "No themes yet"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {normalizedSearchQuery
                            ? "Try a different search term."
                            : 'Click "Create Theme" to start building a reusable template.'}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTemplates.map((template) => (
                      <TableRow key={template.id} className="group">
                        <TableCell column="main">
                          <Link
                            href={`/admin/pages/${template.id}`}
                            className="flex min-w-0 items-center space-x-4 transition-opacity hover:opacity-80"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                              <span className="text-sm font-medium text-muted-foreground">
                                {template.name
                                  .split(" ")
                                  .map((w) => w[0])
                                  .join("")
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-medium hover:underline sm:text-base">
                                {template.name}
                              </h4>
                              <p className="truncate text-xs text-muted-foreground sm:text-sm">
                                {template.settings?.description ||
                                  "Reusable template"}
                              </p>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell column="mutedMeta">
                          {formatRelativeDate(template.created_at)}
                        </TableCell>
                        <TableCell column="meta">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/admin/pages/${template.id}`}
                                  className="flex items-center"
                                >
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() =>
                                  setApplyDialog({
                                    open: true,
                                    templateId: template.id,
                                    templateName: template.name,
                                  })
                                }
                              >
                                <Paintbrush className="mr-2 h-4 w-4" />
                                Apply to Site
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => {
                                  setRenameName(template.name);
                                  setTimeout(
                                    () =>
                                      setRenameDialog({
                                        open: true,
                                        templateId: template.id,
                                        currentName: template.name,
                                      }),
                                    0,
                                  );
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() =>
                                  setTimeout(
                                    () =>
                                      setDeleteDialog({
                                        open: true,
                                        templateId: template.id,
                                        templateName: template.name,
                                      }),
                                    0,
                                  )
                                }
                                className="text-foreground focus:text-foreground"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Theme
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Theme</DialogTitle>
                <DialogDescription>
                  Enter a name for your new theme template.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2">
                <Label htmlFor="create-theme-name" className="sr-only">
                  Name
                </Label>
                <Input
                  id="create-theme-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && createName.trim())
                      handleCreateTheme();
                  }}
                  placeholder="Theme name"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateTheme}
                  disabled={creating || !createName.trim()}
                >
                  {creating ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={renameDialog.open}
            onOpenChange={(open) =>
              setRenameDialog((prev) => ({ ...prev, open }))
            }
          >
            <DialogContent
              className="sm:max-w-md"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle>Rename Theme</DialogTitle>
                <DialogDescription>
                  Enter a new name for this theme.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2">
                <Label htmlFor="theme-name" className="sr-only">
                  Name
                </Label>
                <Input
                  id="theme-name"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit();
                  }}
                  placeholder="Theme name"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() =>
                    setRenameDialog((prev) => ({ ...prev, open: false }))
                  }
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRenameSubmit}
                  disabled={
                    renaming ||
                    !renameName.trim() ||
                    renameName.trim() === renameDialog.currentName
                  }
                >
                  {renaming ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ConfirmDestructive
            action="delete-theme"
            open={deleteDialog.open}
            error={error}
            onCancel={() => {
              setDeleteDialog((prev) => ({ ...prev, open: false }))
              setError(null)
            }}
            onConfirm={handleDeleteConfirm}
            disabled={deleting === deleteDialog.templateId}
            title="Delete Theme"
            description={
              <>
                Are you sure you want to delete &ldquo;
                {deleteDialog.templateName}&rdquo;? This action cannot be
                undone.
              </>
            }
            confirmLabel={
              deleting === deleteDialog.templateId ? "Deleting..." : "Delete"
            }
          />

          <ApplyThemeDialog
            templateId={applyDialog.templateId}
            templateName={applyDialog.templateName}
            open={applyDialog.open}
            onOpenChange={(open) =>
              setApplyDialog((prev) => ({ ...prev, open }))
            }
          />
        </div>
      </AdminLayout>
    </>
  );
}
