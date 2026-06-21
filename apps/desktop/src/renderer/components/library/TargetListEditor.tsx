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
  disabled = false,
  onChange
}: {
  targets: TargetConfig[];
  disabled?: boolean;
  onChange: (targets: TargetConfig[]) => void;
}) {
  const [newTarget, setNewTarget] = useState("");

  function addTarget() {
    const targetPath = normalizeTargetPath(newTarget);
    if (targetPath === "" || targets.some((target) => target.path === targetPath)) return;
    onChange([...targets, { path: targetPath, enabled: true }]);
    setNewTarget("");
  }

  return (
    <div className="flex flex-col gap-2">
      {targets.map((target) => (
        <div key={target.path} className="flex items-center gap-3 rounded-md border px-3 py-2">
          <Switch
            checked={target.enabled}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange(targets.map((candidate) => (candidate.path === target.path ? { ...candidate, enabled: checked } : candidate)))
            }
            aria-label={`${target.enabled ? "Disable" : "Enable"} ${target.path}`}
          />
          <div className="min-w-0 flex-1 truncate font-mono text-sm">{target.path}</div>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={() => onChange(targets.filter((candidate) => candidate.path !== target.path))}
            aria-label={`Remove ${target.path}`}
            title="Remove target"
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={newTarget}
          onChange={(event) => setNewTarget(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTarget();
            }
          }}
          placeholder="~/path/to/skills"
          disabled={disabled}
          aria-label="New target path"
        />
        <Button type="button" variant="outline" disabled={disabled || newTarget.trim() === ""} onClick={addTarget}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          Add Target
        </Button>
      </div>
    </div>
  );
}
