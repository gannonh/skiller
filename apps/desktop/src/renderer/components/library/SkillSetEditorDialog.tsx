import { useEffect, useState } from "react";
import type { SaveSkillSetInput, SkillMetadata, SkillSetMetadata } from "../../lib/api.js";
import type { TargetConfig } from "@skiller/core";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { SkillPickerTable } from "./SkillPickerTable.js";
import { TargetListEditor } from "./TargetListEditor.js";
import { computeSkillSetEditorState } from "./skill-set-editor-state.js";

export function SkillSetEditorDialog({
  open,
  skillSet,
  skills,
  disabled = false,
  globalTargets = [],
  onOpenChange,
  onSave,
  onManageGlobalTargets,
  onBrowseTarget
}: {
  open: boolean;
  skillSet: SkillSetMetadata | null;
  skills: SkillMetadata[];
  disabled?: boolean;
  globalTargets?: TargetConfig[];
  onOpenChange: (open: boolean) => void;
  onSave: (input: SaveSkillSetInput) => Promise<boolean>;
  onManageGlobalTargets?: () => void;
  onBrowseTarget?: () => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(() => new Set());
  const [targets, setTargets] = useState<TargetConfig[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const initial = computeSkillSetEditorState(skillSet, globalTargets);
    setName(initial.name);
    setSelectedSkillIds(initial.selectedSkillIds);
    setTargets(initial.targets);
    setError(null);
  }, [open, skillSet, globalTargets]);

  async function handleSave() {
    if (name.trim() === "" || isSaving || disabled) return;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await onSave({
        ...(skillSet ? { id: skillSet.id } : {}),
        name,
        skillIds: [...selectedSkillIds],
        targets
      });
      if (saved) onOpenChange(false);
      else setError("Failed to save skill set.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{skillSet ? "Edit Skill Set" : "Create New Skill Set"}</DialogTitle>
          <DialogDescription>
            Choose a name, select skills from your library, and configure sync targets for this set.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="grid gap-2">
            <Label htmlFor="skill-set-name">Name</Label>
            <Input
              id="skill-set-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Automation"
              disabled={disabled || isSaving}
              maxLength={128}
            />
          </div>
          <div className="grid gap-2">
            <Label>Skills</Label>
            <SkillPickerTable
              skills={skills}
              selectedSkillIds={selectedSkillIds}
              disabled={disabled || isSaving}
              onSelectedSkillIdsChange={setSelectedSkillIds}
            />
          </div>
          <div className="grid gap-2">
            <Label>Targets</Label>
            <TargetListEditor
              targets={targets}
              globalTargets={globalTargets}
              disabled={disabled || isSaving}
              onChange={setTargets}
              onManageGlobalTargets={onManageGlobalTargets}
              onBrowseTarget={onBrowseTarget}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isSaving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={disabled || isSaving || name.trim() === ""} onClick={() => void handleSave()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
