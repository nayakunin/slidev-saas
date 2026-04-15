import { WorkspaceShell } from "@/layouts/workspace-shell";

import { DashboardContent } from "./components/dashboard-page";

export function DashboardPage() {
  return (
    <WorkspaceShell breadcrumb="Dashboard">
      <DashboardContent />
    </WorkspaceShell>
  );
}
