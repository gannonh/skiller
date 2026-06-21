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

export function SkillSetEditorDialog({
  open,
  skillSet,
  skills,
  disabled = false,
  onOpenChange,
  onSave
}: {
  open: boolean;
  skillSet: SkillSetMetadata | null;
  skills: SkillMetadata[];
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: SaveSkillSetInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(() => new Set());
  const [targets, setTargets] = useState<TargetConfig[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(skillSet?.name ?? "");
    setSelectedSkillIds(new Set(skillSet?.skillIds ?? []));
    setTargets(skillSet?.targets.map((target) => ({ ...target })) ?? []);
  }, [open, skillSet]);

  async function handleSave() {
    if (name.trim() === "" || isSaving || disabled) return;
    setIsSaving(true);
    try {
      await onSave({
        ...(skillSet ? { id: skillSet.id } : {}),
        name,
        skillIds: [...selectedSkillIds],
        targets
      });
      onOpenChange(false);
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
            <TargetListEditor targets={targets} disabled={disabled || isSaving} onChange={setTargets} />
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
