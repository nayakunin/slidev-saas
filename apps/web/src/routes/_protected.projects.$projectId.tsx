import { createFileRoute } from "@tanstack/react-router";

import { ProjectPage } from "@/spaces/project/page";

export const Route = createFileRoute("/_protected/projects/$projectId")({
  component: ProjectPage,
});
