import { useEffect, useState } from "react";
import type { SkillSetMetadata } from "../../lib/api.js";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@workspace/ui/components/dialog";
import { Label } from "@workspace/ui/components/label";

export function SkillMembershipDialog({
  open,
  skillId,
  skillName,
  skillSets,
  disabled = false,
  onOpenChange,
  onSave
}: {
  open: boolean;
  skillId: string | null;
  skillName: string;
  skillSets: SkillSetMetadata[];
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (skillId: string, skillSetIds: string[]) => Promise<void>;
}) {
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(() => new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !skillId) return;
    setSelectedSetIds(new Set(skillSets.filter((skillSet) => skillSet.skillIds.includes(skillId)).map((skillSet) => skillSet.id)));
  }, [open, skillId, skillSets]);

  function toggleSet(skillSetId: string, selected: boolean) {
    setSelectedSetIds((current) => {
      const next = new Set(current);
      if (selected) next.add(skillSetId);
      else next.delete(skillSetId);
      return next;
    });
  }

  async function handleSave() {
    if (!skillId || isSaving || disabled) return;
    setIsSaving(true);
    try {
      await onSave(skillId, [...selectedSetIds]);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Skill Sets</DialogTitle>
          <DialogDescription>Add {skillName} to skill sets or remove it from existing sets.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {skillSets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No skill sets yet. Create one from the library page.</p>
          ) : (
            skillSets.map((skillSet) => {
              const id = `membership-${skillSet.id}`;
              return (
                <div key={skillSet.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                  <Label htmlFor={id} className="flex flex-1 items-center gap-3">
                    <Checkbox
                      id={id}
                      checked={selectedSetIds.has(skillSet.id)}
                      disabled={disabled || isSaving}
                      onCheckedChange={(checked) => toggleSet(skillSet.id, Boolean(checked))}
                    />
                    <span className="flex-1">{skillSet.name}</span>
                    <span className="text-xs text-muted-foreground">{skillSet.skillIds.length} members</span>
                  </Label>
                </div>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isSaving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={disabled || isSaving || !skillId} onClick={() => void handleSave()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
