"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminLayout } from "@/components/admin/layout/admin-layout";
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader";
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader";
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider";
import {
  AdminListSkeleton,
  AdminTableShell,
  AdminTableSummaryFooter,
} from "@/components/admin/layout/list";
import {
  TableRightActions,
  TableRightActionsSearch,
} from "@/components/admin/layout/content/table-right-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  getSiteIntegration,
  type SiteIntegration,
} from "@/lib/actions/integrations/integration-actions";
import { Mail } from "lucide-react";

interface SenderRow {
  name: string;
  email: string;
  provider: string;
  status: "Connected";
  updatedAt: string | null;
}

function buildSenderRows(integration: SiteIntegration | null): SenderRow[] {
  const fromEmail = integration?.config?.from_email?.trim();
  if (!fromEmail) {
    return [];
  }

  return [
    {
      name: integration?.config?.from_name?.trim() || "Unnamed Sender",
      email: fromEmail,
      provider: "Resend",
      status: "Connected",
      updatedAt: integration?.updatedAt?.toISOString?.() ?? null,
    },
  ];
}

export default function PlatformSenderEmailsPage() {
  const { currentSite } = useSiteSwitcher();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [senders, setSenders] = useState<SenderRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const loadPage = useCallback(async () => {
    if (!currentSite?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);

    const resendIntegration = await getSiteIntegration(
      currentSite.id,
      "resend",
    );
    const rows = buildSenderRows(resendIntegration);

    setSenders(rows);
    if (rows.length === 0) {
      setMessage("No sender email is configured for this site.");
    }

    setLoading(false);
  }, [currentSite?.id]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSenders = normalizedSearchQuery
    ? senders.filter((sender) => {
        const searchText = [
          sender.name,
          sender.email,
          sender.provider,
          sender.status,
        ]
          .join(" ")
          .toLowerCase();

        return searchText.includes(normalizedSearchQuery);
      })
    : senders;

  if (!currentSite) {
    return (
      <AdminLayout>
        <div className="p-8 text-sm text-muted-foreground">
          Choose a site to manage emails.
        </div>
      </AdminLayout>
    );
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full pb-8">
          <DashboardSubheader items={[{ label: "Email Accounts" }]} />

          {message && (
            <div className="mb-6 rounded-md border px-4 py-3 text-sm">
              {message}
            </div>
          )}

          <AdminTableShell
            title="Email Accounts"
            icon={<Mail className="text-muted-foreground" />}
            count={filteredSenders.length}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search email accounts"
                />
              </TableRightActions>
            }
            footer={!loading ? <AdminTableSummaryFooter count={filteredSenders.length} label="email accounts" /> : null}
          >

            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="main">Sender</TableHead>
                    <TableHead column="meta">Provider</TableHead>
                    <TableHead column="meta">Status</TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton
                      columns={4}
                      rowCount={1}
                      showCheckbox={false}
                      showThumbnail={false}
                    />
                  ) : filteredSenders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-32 text-center text-sm text-muted-foreground"
                      >
                        {normalizedSearchQuery
                          ? "No email accounts match your search."
                          : "No email accounts found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSenders.map((sender) => (
                      <TableRow key={sender.email} className="group">
                        <TableCell column="main">
                          <Link
                            href={`/admin/site-health/email?sender=${encodeURIComponent(sender.email)}`}
                            className="block hover:underline"
                          >
                            <p className="truncate text-sm font-medium sm:text-base">
                              {sender.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground sm:text-sm">
                              {sender.email}
                            </p>
                          </Link>
                        </TableCell>
                        <TableCell column="meta">{sender.provider}</TableCell>
                        <TableCell column="meta">
                          <Badge
                            variant={
                              sender.status === "Connected"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {sender.status}
                          </Badge>
                        </TableCell>
                        <TableCell column="meta">
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={`/admin/site-health/email?sender=${encodeURIComponent(sender.email)}`}
                            >
                              View Health
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>
        </div>
      </AdminLayout>
    </>
  );
}
