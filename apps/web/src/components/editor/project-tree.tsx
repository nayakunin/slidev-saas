import type { ProjectTreeNode } from "@app/backend";

function TreeBranch({
  nodes,
  depth,
  selectedPath,
  onSelect,
}: {
  nodes: ProjectTreeNode[];
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => {
        if (node.type === "directory") {
          return (
            <li key={node.path}>
              <div
                className="px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/75"
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
              >
                {node.name}
              </div>
              {node.children ? (
                <TreeBranch
                  nodes={node.children}
                  depth={depth + 1}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                />
              ) : null}
            </li>
          );
        }

        const isSelected = node.path === selectedPath;

        return (
          <li key={node.path}>
            <button
              className={`flex w-full items-center justify-between border px-2 py-2 text-left text-sm transition ${
                isSelected
                  ? "border-amber-300/70 bg-amber-300/10 text-foreground"
                  : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground"
              }`}
              onClick={() => onSelect(node.path)}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              type="button"
            >
              <span className="truncate">{node.name}</span>
              <span className="ml-2 shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {node.kind}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ProjectTree({
  nodes,
  selectedPath,
  onSelect,
}: {
  nodes: ProjectTreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  if (nodes.length === 0) {
    return (
      <div className="border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
        No files yet.
      </div>
    );
  }

  return (
    <nav aria-label="Project files">
      <TreeBranch nodes={nodes} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
    </nav>
  );
}
