import { useState } from "react";
import type { TargetConfig } from "@skiller/core";
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";

function normalizeTargetPath(targetPath: string): string {
  const trimmed = targetPath.trim();
  if (trimmed === "/" || trimmed === "~") return trimmed;
  return trimmed.replace(/[\\/]+$/g, "");
}

function asProjectTarget(target: TargetConfig): TargetConfig {
  return { ...target, scope: "project" };
}

function asGlobalTarget(target: TargetConfig): TargetConfig {
  return { ...target, scope: "global" };
}

function isProjectTarget(target: TargetConfig): boolean {
  return target.scope !== "global";
}

export function TargetListEditor({
  targets,
  globalTargets = [],
  disabled = false,
  onChange,
  onManageGlobalTargets,
  onBrowseTarget
}: {
  targets: TargetConfig[];
  globalTargets?: TargetConfig[];
  disabled?: boolean;
  onChange: (targets: TargetConfig[]) => void;
  onManageGlobalTargets?: () => void;
  onBrowseTarget?: () => Promise<string | null>;
}) {
  const [newTarget, setNewTarget] = useState("");
  const projectTargets = targets.filter(isProjectTarget).map(asProjectTarget);
  const globalTargetSelections = globalTargets.map((globalTarget) => {
    const saved = targets.find((target) => target.scope === "global" && target.path === globalTarget.path);
    return asGlobalTarget({ path: globalTarget.path, enabled: saved?.enabled ?? globalTarget.enabled });
  });
  const knownPaths = new Set(targets.map((target) => target.path));

  function emit(nextProjectTargets: TargetConfig[], nextGlobalTargets = globalTargetSelections) {
    onChange([...nextProjectTargets.map(asProjectTarget), ...nextGlobalTargets.map(asGlobalTarget)]);
  }

  function addProjectTarget() {
    const targetPath = normalizeTargetPath(newTarget);
    if (targetPath === "" || knownPaths.has(targetPath)) return;
    emit([...projectTargets, { path: targetPath, enabled: true, scope: "project" }]);
    setNewTarget("");
  }

  async function browseProjectTarget() {
    const selectedPath = await onBrowseTarget?.();
    if (selectedPath) setNewTarget(normalizeTargetPath(selectedPath));
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Project targets</h3>
            <p className="text-xs text-muted-foreground">Targets used only by this skill set.</p>
          </div>
        </div>
        {projectTargets.map((target) => (
          <div key={target.path} className="flex items-center gap-3 rounded-md border px-3 py-2">
            <Switch
              checked={target.enabled}
              disabled={disabled}
              onCheckedChange={(checked) =>
                emit(projectTargets.map((candidate) => (candidate.path === target.path ? { ...candidate, enabled: checked } : candidate)))
              }
              aria-label={`${target.enabled ? "Disable" : "Enable"} project target ${target.path}`}
            />
            <div className="min-w-0 flex-1 truncate font-mono text-sm">{target.path}</div>
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => emit(projectTargets.filter((candidate) => candidate.path !== target.path))}
              aria-label={`Remove project target ${target.path}`}
              title="Remove target"
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
            </Button>
          </div>
        ))}
        {projectTargets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No project targets configured for this skill set.</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={newTarget}
            onChange={(event) => setNewTarget(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addProjectTarget();
              }
            }}
            placeholder="~/path/to/project/skills"
            disabled={disabled}
            aria-label="New project target path"
          />
          <Button type="button" variant="outline" disabled={disabled || !onBrowseTarget} onClick={() => void browseProjectTarget()}>
            Browse…
          </Button>
          <Button type="button" variant="outline" disabled={disabled || newTarget.trim() === ""} onClick={addProjectTarget}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Add Project Target
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Global targets</h3>
            <p className="text-xs text-muted-foreground">Shared targets configured in Global Targets.</p>
          </div>
          {onManageGlobalTargets ? (
            <Button type="button" variant="link" className="h-auto p-0" onClick={onManageGlobalTargets}>
              Update Global Targets
            </Button>
          ) : null}
        </div>
        {globalTargetSelections.map((target) => {
          const globalTarget = globalTargets.find((candidate) => candidate.path === target.path);
          return (
            <div key={target.path} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <Switch
                checked={target.enabled}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  emit(
                    projectTargets,
                    globalTargetSelections.map((candidate) =>
                      candidate.path === target.path ? { ...candidate, enabled: checked } : candidate
                    )
                  )
                }
                aria-label={`${target.enabled ? "Disable" : "Enable"} global target ${target.path}`}
              />
              <div className="min-w-0 flex-1 truncate font-mono text-sm">{target.path}</div>
              {globalTarget?.enabled ? null : <Badge variant="outline">globally off</Badge>}
            </div>
          );
        })}
        {globalTargetSelections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No global target directories configured.</p>
        ) : null}
      </section>
    </div>
  );
}
