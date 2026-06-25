import { useState } from "react";
import type { TargetConfig } from "@skiller/core";
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";

function normalizeTargetPath(targetPath: string): string {
  const trimmed = targetPath.trim();
  if (trimmed === "/" || trimmed === "~") return trimmed;
  return trimmed.replace(/[\\/]+$/g, "");
}

export function TargetListEditor({
  targets,
  globalTargets: _globalTargets = [],
  disabled = false,
  onChange,
  onManageGlobalTargets: _onManageGlobalTargets,
  onBrowseTarget
}: {
  targets: TargetConfig[];
  /** Unused; retained for call-site compatibility. Skill sets no longer configure global targets. */
  globalTargets?: TargetConfig[];
  disabled?: boolean;
  onChange: (targets: TargetConfig[]) => void;
  /** Unused; retained for call-site compatibility. */
  onManageGlobalTargets?: () => void;
  onBrowseTarget?: () => Promise<string | null>;
}) {
  const [newTarget, setNewTarget] = useState("");
  const projectTargets = targets.map((target) => ({ ...target }));
  const knownPaths = new Set(projectTargets.map((target) => target.path));

  function emit(nextProjectTargets: TargetConfig[]) {
    onChange(nextProjectTargets);
  }

  function addProjectTarget() {
    const targetPath = normalizeTargetPath(newTarget);
    if (targetPath === "" || knownPaths.has(targetPath)) return;
    emit([...projectTargets, { path: targetPath, enabled: true }]);
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
            <p className="text-xs text-muted-foreground">
              Folders that receive only this skill set&apos;s skills. Independent of global target distribution.
            </p>
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
    </div>
  );
}
