import { useMemo, useState } from "react";
import { Sorting01Icon, SortingDownIcon, SortingUpIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import type { SkillMetadata } from "../../lib/api.js";
import { sourceDetail, sourceLabel } from "../../lib/skill-source.js";
import { sortSkills, type SkillPickerSortColumn } from "./library-helpers.js";

function statusLabel(skill: SkillMetadata): string {
  return skill.validation?.valid ? "valid" : "invalid";
}

export function SkillPickerTable({
  skills,
  selectedSkillIds,
  disabled = false,
  onSelectedSkillIdsChange
}: {
  skills: SkillMetadata[];
  selectedSkillIds: Set<string>;
  disabled?: boolean;
  onSelectedSkillIdsChange: (selectedSkillIds: Set<string>) => void;
}) {
  const [sortColumn, setSortColumn] = useState<SkillPickerSortColumn>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const sortedSkills = useMemo(
    () => sortSkills(skills, sortColumn, sortDirection),
    [skills, sortColumn, sortDirection]
  );

  const selectAllState = useMemo(() => {
    if (skills.length === 0) return false;
    const selectedCount = skills.filter((skill) => selectedSkillIds.has(skill.id)).length;
    if (selectedCount === 0) return false;
    return selectedCount === skills.length ? true : "indeterminate";
  }, [skills, selectedSkillIds]);

  function updateSort(column: SkillPickerSortColumn) {
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  }

  function sortIcon(column: SkillPickerSortColumn) {
    if (column !== sortColumn) return Sorting01Icon;
    return sortDirection === "asc" ? SortingUpIcon : SortingDownIcon;
  }

  function SortableTableHead({ column, children }: { column: SkillPickerSortColumn; children: string }) {
    const active = column === sortColumn;
    return (
      <TableHead aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 px-2"
          aria-label={`Sort by ${children}`}
          onClick={() => updateSort(column)}
        >
          {children}
          <HugeiconsIcon icon={sortIcon(column)} strokeWidth={2} data-icon="inline-end" />
        </Button>
      </TableHead>
    );
  }

  function setSkillSelected(skillId: string, selected: boolean) {
    const next = new Set(selectedSkillIds);
    if (selected) next.add(skillId);
    else next.delete(skillId);
    onSelectedSkillIdsChange(next);
  }

  function setAllSelected(selected: boolean) {
    onSelectedSkillIdsChange(new Set(selected ? skills.map((skill) => skill.id) : []));
  }

  return (
    <div className="max-h-80 overflow-y-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Label htmlFor="skill-picker-select-all" className="flex items-center gap-2">
                <Checkbox
                  id="skill-picker-select-all"
                  checked={selectAllState === true}
                  indeterminate={selectAllState === "indeterminate"}
                  disabled={disabled || skills.length === 0}
                  onCheckedChange={(checked) => setAllSelected(Boolean(checked))}
                />
                Include
              </Label>
            </TableHead>
            <SortableTableHead column="name">Name</SortableTableHead>
            <SortableTableHead column="source">Source</SortableTableHead>
            <SortableTableHead column="status">Status</SortableTableHead>
            <SortableTableHead column="enabled">Enabled</SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedSkills.map((skill) => {
            const id = `skill-picker-${skill.id}`;
            return (
              <TableRow key={skill.id}>
                <TableCell>
                  <Label htmlFor={id}>
                    <Checkbox
                      id={id}
                      checked={selectedSkillIds.has(skill.id)}
                      disabled={disabled}
                      onCheckedChange={(checked) => setSkillSelected(skill.id, Boolean(checked))}
                    />
                    <span className="sr-only">Include {skill.name || skill.id}</span>
                  </Label>
                </TableCell>
                <TableCell>{skill.name || skill.id}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant="secondary">{sourceLabel(skill)}</Badge>
                    <span className="max-w-56 truncate text-xs text-muted-foreground">{sourceDetail(skill)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {skill.validation?.valid ? (
                    <Badge variant="outline">{statusLabel(skill)}</Badge>
                  ) : (
                    <Badge variant="destructive">{statusLabel(skill)}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Switch checked={skill.enabled} disabled aria-label={`${skill.enabled ? "Enabled" : "Disabled"} ${skill.name || skill.id}`} />
                </TableCell>
              </TableRow>
            );
          })}
          {sortedSkills.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No skills in library.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
