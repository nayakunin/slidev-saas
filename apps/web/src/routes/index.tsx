import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { LandingPage } from "@/components/landing";
import { useUser } from "@/hooks/useUser";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const user = useUser();

  if (!user) {
    return <LandingPage />;
  }

  return (
    <AppShell breadcrumb="Dashboard">
      <Dashboard />
    </AppShell>
  );
}
