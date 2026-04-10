import { api } from "@app/backend";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function Dashboard() {
  const projects = useQuery(api.projects.listProjects, {});
  const createProject = useMutation(api.projects.createProjectFromTemplate);
  const navigate = useNavigate();

  async function handleCreateProject() {
    const title = window.prompt("Project title", "New Deck");
    if (!title) return;
    const projectId = await createProject({ title });
    void navigate({ to: "/projects/$projectId", params: { projectId } });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">Your presentation projects</p>
        </div>
        <Button onClick={() => void handleCreateProject()} type="button">
          New Project
        </Button>
      </div>

      {projects === undefined ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <p className="text-muted-foreground">No projects yet.</p>
          <Button
            className="mt-4"
            onClick={() => void handleCreateProject()}
            type="button"
            variant="outline"
          >
            Create your first project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <button
              key={project._id}
              className="text-left"
              onClick={() =>
                void navigate({
                  to: "/projects/$projectId",
                  params: { projectId: project._id },
                })
              }
              type="button"
            >
              <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
                <CardHeader>
                  <CardTitle>{project.title}</CardTitle>
                  <CardDescription>{project.slug}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Click to open editor</p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
