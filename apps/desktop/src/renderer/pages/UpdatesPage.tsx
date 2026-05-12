import { useEffect, useMemo, useState } from "react";
import { Sorting01Icon, SortingDownIcon, SortingUpIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { skillerApi, type SkillMetadata, type UpdateCheckError, type UpdateCheckSkill } from "../lib/api.js";
import { isUpdateable, sourceDetail, sourceLabel } from "../lib/skill-source.js";

type SortColumn = "name" | "source" | "status" | "lastUpdated";
type SortDirection = "asc" | "desc";

function lastUpdatedDate(skill: SkillMetadata): Date | null {
  const value = skill.updatedAt ?? skill.installedAt;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function lastUpdatedLabel(skill: SkillMetadata): string {
  return lastUpdatedDate(skill)?.toLocaleString() ?? "unknown";
}

function rowStatus(input: {
  update?: UpdateCheckSkill;
  error?: UpdateCheckError;
  isUpdated: boolean;
  isUpdating: boolean;
}): string {
  if (input.error) return "error";
  if (input.isUpdating) return "updating";
  if (input.isUpdated) return "updated";
  if (input.update) return "update available";
  return "current";
}

function sortValue(input: {
  skill: SkillMetadata;
  column: SortColumn;
  update?: UpdateCheckSkill;
  error?: UpdateCheckError;
  isUpdated: boolean;
  isUpdating: boolean;
}): string | number {
  if (input.column === "name") return input.skill.name || input.skill.id;
  if (input.column === "source") return `${sourceLabel(input.skill)} ${sourceDetail(input.skill)}`;
  if (input.column === "status") return rowStatus(input);
  return lastUpdatedDate(input.skill)?.getTime() ?? 0;
}

function errorLabel(error: UpdateCheckError, skillsById: Map<string, SkillMetadata>): string {
  if (!error.id) return error.message;
  const skill = skillsById.get(error.id);
  return `${skill?.name || error.id}: ${error.message}`;
}

export function UpdatesPage() {
  const [status, setStatus] = useState("Loading updateable skills");
  const [isChecking, setIsChecking] = useState(false);
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [available, setAvailable] = useState<UpdateCheckSkill[]>([]);
  const [updateErrors, setUpdateErrors] = useState<UpdateCheckError[]>([]);
  const [updatingSkillIds, setUpdatingSkillIds] = useState<Set<string>>(() => new Set());
  const [updatedSkillIds, setUpdatedSkillIds] = useState<Set<string>>(() => new Set());
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    void skillerApi
      .listLibrary()
      .then((result) => {
        setSkills(result);
        setStatus("Waiting for update check");
      })
      .catch((caught: unknown) => {
        setSkills([]);
        setStatus(caught instanceof Error ? caught.message : String(caught));
      });

    return skillerApi.onCheckUpdates(() => {
      void checkUpdates();
    });
  }, []);

  async function checkUpdates() {
    setIsChecking(true);
    setStatus("Checking for updates");
    try {
      const result = await skillerApi.checkUpdates();
      setAvailable(result.available);
      setUpdateErrors(result.errors);
      setUpdatedSkillIds(new Set(result.updated.map((skill) => skill.id)));
      setSkills(await skillerApi.listLibrary());
      const parsedCheckedAt = new Date(result.checkedAt);
      const checkedAt = Number.isNaN(parsedCheckedAt.getTime()) ? "unknown time" : parsedCheckedAt.toLocaleString();
      setStatus(
        `Checked ${result.considered.length} skills at ${checkedAt}: ${result.available.length} available, ${result.updated.length} updated, ${result.errors.length} errors`
      );
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsChecking(false);
    }
  }

  async function updateSkill(skill: UpdateCheckSkill) {
    if (updatingSkillIds.has(skill.id) || updatedSkillIds.has(skill.id)) return;

    setUpdatingSkillIds((current) => new Set(current).add(skill.id));
    setStatus(`Updating ${skill.name || skill.id}`);
    try {
      const metadata = await skillerApi.updateSkill(skill.id);
      setSkills((current) => current.map((candidate) => (candidate.id === metadata.id ? metadata : candidate)));
      setAvailable((current) => current.filter((candidate) => candidate.id !== skill.id));
      setUpdateErrors((current) => current.filter((candidate) => candidate.id !== skill.id));
      setUpdatedSkillIds((current) => new Set(current).add(skill.id));
      setStatus(`Updated ${skill.name || skill.id}`);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setUpdatingSkillIds((current) => {
        const next = new Set(current);
        next.delete(skill.id);
        return next;
      });
    }
  }

  const availableById = new Map(available.map((skill) => [skill.id, skill]));
  const errorsById = new Map(updateErrors.flatMap((error) => (error.id ? [[error.id, error]] : [])));
  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
  const updateableSkills = useMemo(() => skills.filter(isUpdateable), [skills]);
  const sortedSkills = useMemo(() => {
    return [...updateableSkills].sort((left, right) => {
      const leftInput = {
        skill: left,
        column: sortColumn,
        update: availableById.get(left.id),
        error: errorsById.get(left.id),
        isUpdated: updatedSkillIds.has(left.id),
        isUpdating: updatingSkillIds.has(left.id)
      };
      const rightInput = {
        skill: right,
        column: sortColumn,
        update: availableById.get(right.id),
        error: errorsById.get(right.id),
        isUpdated: updatedSkillIds.has(right.id),
        isUpdating: updatingSkillIds.has(right.id)
      };
      const leftValue = sortValue(leftInput);
      const rightValue = sortValue(rightInput);
      const primary =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
      const fallback = (left.name || left.id).localeCompare(right.name || right.id, undefined, {
        numeric: true,
        sensitivity: "base"
      });
      const result = primary || fallback || left.id.localeCompare(right.id);
      return sortDirection === "asc" ? result : -result;
    });
  }, [available, updateErrors, updateableSkills, updatedSkillIds, updatingSkillIds, sortColumn, sortDirection]);

  function updateSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  }

  function sortIcon(column: SortColumn) {
    if (column !== sortColumn) return Sorting01Icon;
    return sortDirection === "asc" ? SortingUpIcon : SortingDownIcon;
  }

  function SortableTableHead({ column, children }: { column: SortColumn; children: string }) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Updates</CardTitle>
        <CardDescription>Skills added from GitHub or skills.sh can be updated when a newer commit is available.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={checkUpdates} disabled={isChecking}>
            {isChecking ? "Checking" : "Check for Updates"}
          </Button>
          <span className="text-sm text-muted-foreground">{status}</span>
        </div>
        {updateErrors.length > 0 ? (
          <Alert variant="destructive">
            <AlertTitle>Update check errors</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4">
                {updateErrors.map((error, index) => (
                  <li key={`${error.id ?? "error"}-${index}`}>{errorLabel(error, skillsById)}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="name">Name</SortableTableHead>
              <SortableTableHead column="source">Source</SortableTableHead>
              <SortableTableHead column="lastUpdated">Last Updated</SortableTableHead>
              <SortableTableHead column="status">Status</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSkills.map((skill) => {
              const update = availableById.get(skill.id);
              const error = errorsById.get(skill.id);
              const isUpdating = updatingSkillIds.has(skill.id);
              const isUpdated = updatedSkillIds.has(skill.id);
              return (
                <TableRow key={skill.id}>
                  <TableCell>{skill.name || skill.id}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="secondary">{sourceLabel(skill)}</Badge>
                      <span className="max-w-80 truncate text-xs text-muted-foreground">{sourceDetail(skill)}</span>
                    </div>
                  </TableCell>
                  <TableCell>{lastUpdatedLabel(skill)}</TableCell>
                  <TableCell>
                    {error ? (
                      <Badge variant="destructive" title={error.message}>
                        error
                      </Badge>
                    ) : isUpdated ? (
                      <Button variant="outline" size="sm" disabled>
                        updated
                      </Button>
                    ) : update ? (
                      <Button
                        size="sm"
                        aria-label={`Update ${skill.name || skill.id}`}
                        disabled={isUpdating}
                        onClick={() => void updateSkill(update)}
                      >
                        {isUpdating ? "updating" : "update"}
                      </Button>
                    ) : (
                      <Badge variant="outline">current</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {updateableSkills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No updateable skills.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
