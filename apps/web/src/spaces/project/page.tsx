import { api, type Id } from "@app/backend";
import { getRouteApi } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { WorkspaceShell } from "@/layouts/workspace-shell";

import { ProjectEditorScreen } from "./components/project-editor-page";

const projectRouteApi = getRouteApi("/_protected/projects/$projectId");

export function ProjectPage() {
  const { projectId } = projectRouteApi.useParams();
  const project = useQuery(api.projects.getProject, { projectId: projectId as Id<"projects"> });

  return (
    <WorkspaceShell breadcrumb={project?.title ?? "Editor"}>
      <ProjectEditorScreen projectId={projectId as Id<"projects">} />
    </WorkspaceShell>
  );
}
