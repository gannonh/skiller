import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@workspace/ui/components/badge";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import type { SkillMetadata } from "../../lib/api.js";
import { sourceDetail, sourceLabel } from "../../lib/skill-source.js";
import { skillStatusLabel, sortSkills, type SkillPickerSortColumn } from "./library-helpers.js";
import { SortableTableHead } from "./SortableTableHead.js";

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
  const [sortColumn, setSortColumn] = useState<SkillPickerSortColumn>("included");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [nameFilter, setNameFilter] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // The native clear (x) button on <input type="search"> fires a `search` DOM
  // event that React's onChange does not receive, so sync it explicitly.
  useEffect(() => {
    const el = searchRef.current;
    if (!el) return;
    const onSearchClear = () => setNameFilter(el.value);
    el.addEventListener("search", onSearchClear);
    return () => el.removeEventListener("search", onSearchClear);
  }, []);

  const filteredSkills = useMemo(() => {
    const query = nameFilter.trim().toLowerCase();
    if (!query) return skills;
    return skills.filter((skill) => (skill.name || skill.id).toLowerCase().includes(query));
  }, [skills, nameFilter]);

  const sortedSkills = useMemo(
    () => sortSkills(filteredSkills, sortColumn, sortDirection, selectedSkillIds),
    [filteredSkills, sortColumn, sortDirection, selectedSkillIds]
  );

  function updateSort(column: SkillPickerSortColumn) {
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  }

  function setSkillSelected(skillId: string, selected: boolean) {
    const next = new Set(selectedSkillIds);
    if (selected) next.add(skillId);
    else next.delete(skillId);
    onSelectedSkillIdsChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        ref={searchRef}
        type="search"
        placeholder="Filter skills by name"
        value={nameFilter}
        onChange={(event) => setNameFilter(event.target.value)}
        disabled={disabled || skills.length === 0}
        aria-label="Filter skills by name"
        className="max-w-64"
      />
      <div className="max-h-80 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="included" activeColumn={sortColumn} direction={sortDirection} onSort={updateSort}>
                Included
              </SortableTableHead>
              <SortableTableHead column="name" activeColumn={sortColumn} direction={sortDirection} onSort={updateSort}>
                Name
              </SortableTableHead>
              <SortableTableHead column="source" activeColumn={sortColumn} direction={sortDirection} onSort={updateSort}>
                Source
              </SortableTableHead>
              <SortableTableHead column="status" activeColumn={sortColumn} direction={sortDirection} onSort={updateSort}>
                Status
              </SortableTableHead>
              <SortableTableHead column="enabled" activeColumn={sortColumn} direction={sortDirection} onSort={updateSort}>
                Enabled
              </SortableTableHead>
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
                      <Badge variant="outline">{skillStatusLabel(skill)}</Badge>
                    ) : (
                      <Badge variant="destructive">{skillStatusLabel(skill)}</Badge>
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
                  {skills.length === 0 ? "No skills in library." : "No skills match your filter."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
