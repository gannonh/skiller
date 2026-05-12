import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  Edit02Icon,
  Sorting01Icon,
  SortingDownIcon,
  SortingUpIcon
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Switch } from "@workspace/ui/components/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { skillerApi, type LibraryState, type SetSkillSetEnabledResult, type SkillMetadata, type SkillSetMetadata } from "../lib/api.js";
import { sourceDetail, sourceLabel } from "../lib/skill-source.js";
import type { DiscoveredGithubSkill } from "@skiller/core";

type SortColumn = "name" | "source" | "skillSet" | "status" | "enabled" | "actions";
type SortDirection = "asc" | "desc";

export type SetFilter = { type: "all" } | { type: "ungrouped" } | { type: "set"; skillSetId: string };

const emptyLibraryState: LibraryState = {
  skills: [],
  skillSets: [],
  tags: []
};

export function parseTagInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().replace(/\s+/g, " ").toLowerCase())
        .filter(Boolean)
    )
  );
}

export function skillSetState(skills: SkillMetadata[], skillSetId: string): "on" | "off" | "mixed" {
  const members = skills.filter((skill) => skill.skillSetId === skillSetId);
  if (members.length === 0 || members.every((skill) => !skill.enabled)) return "off";
  if (members.every((skill) => skill.enabled)) return "on";
  return "mixed";
}

export function filterLibrarySkills(
  skills: SkillMetadata[],
  setFilter: SetFilter,
  selectedTags: string[]
): SkillMetadata[] {
  return skills.filter((skill) => {
    if (setFilter.type === "ungrouped" && skill.skillSetId) return false;
    if (setFilter.type === "set" && skill.skillSetId !== setFilter.skillSetId) return false;
    return selectedTags.every((tag) => skill.tags.includes(tag));
  });
}

export function filterAfterDeletingSkillSet(currentFilter: SetFilter, skillSetId: string): SetFilter {
  if (currentFilter.type === "set" && currentFilter.skillSetId === skillSetId) return { type: "all" };
  return currentFilter;
}

export function reconcileSelectedTags(selectedTags: string[], knownTags: string[]): string[] {
  return selectedTags.filter((tag) => knownTags.includes(tag));
}

export function setSkillSetEnabledScanErrorMessage(result: SetSkillSetEnabledResult): string | null {
  if (result.scanErrors.length === 0) return null;
  const firstError = result.scanErrors[0];
  const suffix = result.scanErrors.length === 1 ? "" : ` and ${result.scanErrors.length - 1} more`;
  return `Target sync failed for ${firstError.path}: ${firstError.message}${suffix}`;
}

function statusLabel(skill: SkillMetadata): string {
  return skill.validation?.valid ? "valid" : "invalid";
}

function skillSetSortLabel(skill: SkillMetadata, skillSets: SkillSetMetadata[]): string {
  if (!skill.skillSetId) return "none";
  return skillSets.find((skillSet) => skillSet.id === skill.skillSetId)?.name ?? skill.skillSetId;
}

function sortValue(skill: SkillMetadata, column: SortColumn, skillSets: SkillSetMetadata[]): string {
  if (column === "name") return skill.name || skill.id;
  if (column === "source") return `${sourceLabel(skill)} ${sourceDetail(skill)}`;
  if (column === "skillSet") return skillSetSortLabel(skill, skillSets);
  if (column === "status") return statusLabel(skill);
  if (column === "enabled") return skill.enabled ? "enabled" : "disabled";
  return `${skill.name || skill.id} ${skill.id}`;
}

export function sortSkills(
  skills: SkillMetadata[],
  column: SortColumn,
  direction: SortDirection,
  skillSets: SkillSetMetadata[] = []
): SkillMetadata[] {
  return [...skills].sort((left, right) => {
    const primary = sortValue(left, column, skillSets).localeCompare(sortValue(right, column, skillSets), undefined, {
      numeric: true,
      sensitivity: "base"
    });
    const fallback = (left.name || left.id).localeCompare(right.name || right.id, undefined, {
      numeric: true,
      sensitivity: "base"
    });
    const result = primary || fallback || left.id.localeCompare(right.id);
    return direction === "asc" ? result : -result;
  });
}

export function LibraryPage({ onBrowseRegistry }: { onBrowseRegistry?: () => void }) {
  const [libraryState, setLibraryState] = useState<LibraryState>(emptyLibraryState);
  const skills = libraryState.skills;
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingSkillIds, setPendingSkillIds] = useState<Set<string>>(() => new Set());
  const [githubUrl, setGithubUrl] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [githubChoices, setGithubChoices] = useState<DiscoveredGithubSkill[]>([]);
  const [selectedGithubPaths, setSelectedGithubPaths] = useState<Set<string>>(() => new Set());
  const [isGithubSheetOpen, setIsGithubSheetOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [setFilter, setSetFilter] = useState<SetFilter>({ type: "all" });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newSkillSetName, setNewSkillSetName] = useState("");
  const [renamingSkillSetId, setRenamingSkillSetId] = useState<string | null>(null);
  const [renamingSkillSetName, setRenamingSkillSetName] = useState("");
  const [editingTagSkillId, setEditingTagSkillId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [isOrganizing, setIsOrganizing] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const isOrganizingRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    void refreshLibrary()
      .then((result) => {
        if (!mounted) return;
      })
      .catch((caught: unknown) => {
        if (mounted) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setSelectedTags((current) => reconcileSelectedTags(current, libraryState.tags));
  }, [libraryState.tags]);

  useEffect(() => {
    if (editingTagSkillId) tagInputRef.current?.focus();
  }, [editingTagSkillId]);

  const invalidSkills = useMemo(() => skills.filter((skill) => !skill.validation?.valid), [skills]);
  const filteredSkills = useMemo(
    () => filterLibrarySkills(skills, setFilter, selectedTags),
    [skills, setFilter, selectedTags]
  );
  const sortedSkills = useMemo(
    () => sortSkills(filteredSkills, sortColumn, sortDirection, libraryState.skillSets),
    [filteredSkills, sortColumn, sortDirection, libraryState.skillSets]
  );
  const selectedGithubSkills = useMemo(
    () => githubChoices.filter((skill) => selectedGithubPaths.has(skill.path)),
    [githubChoices, selectedGithubPaths]
  );

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

  function isSetFilterActive(skillSetId: string): boolean {
    return setFilter.type === "set" && setFilter.skillSetId === skillSetId;
  }

  function toggleSelectedTag(tag: string) {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  function beginRenamingSkillSet(skillSetId: string, name: string) {
    setRenamingSkillSetId(skillSetId);
    setRenamingSkillSetName(name);
  }

  async function refreshLibrary() {
    const result = await skillerApi.listLibrary();
    setLibraryState(result);
    setError(null);
    return result;
  }

  async function installLocal() {
    if (isInstalling) return;
    setIsInstalling(true);
    setError(null);
    try {
      await skillerApi.installLocal();
      await refreshLibrary();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsInstalling(false);
    }
  }

  async function installGithub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isInstalling || githubUrl.trim() === "") return;
    setIsInstalling(true);
    setError(null);
    try {
      const discovery = await skillerApi.discoverGithub(githubUrl.trim());
      if (discovery.repositoryOnly) {
        setGithubChoices(discovery.skills);
        setSelectedGithubPaths(new Set(discovery.skills.map((skill) => skill.path)));
        setIsGithubSheetOpen(true);
        return;
      }

      await skillerApi.installGithub({
        githubUrl: githubUrl.trim()
      });
      setGithubUrl("");
      await refreshLibrary();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsInstalling(false);
    }
  }

  async function installSelectedGithubSkills() {
    if (isInstalling || selectedGithubSkills.length === 0) return;
    setIsInstalling(true);
    setError(null);
    try {
      for (const skill of selectedGithubSkills) {
        await skillerApi.installGithub({
          githubUrl: skill.githubUrl,
          ...(skill.githubPath ? { githubPath: skill.githubPath } : {}),
          ref: skill.ref
        });
      }
      setGithubUrl("");
      setIsGithubSheetOpen(false);
      setGithubChoices([]);
      setSelectedGithubPaths(new Set());
      await refreshLibrary();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsInstalling(false);
    }
  }

  function setGithubSkillSelected(path: string, selected: boolean) {
    setSelectedGithubPaths((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  }

  async function setSkillEnabled(skillId: string, enabled: boolean) {
    setPendingSkillIds((current) => new Set(current).add(skillId));
    setError(null);
    try {
      const updatedState = await skillerApi.setSkillEnabled(skillId, enabled);
      setLibraryState(updatedState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPendingSkillIds((current) => {
        const next = new Set(current);
        next.delete(skillId);
        return next;
      });
    }
  }

  async function deleteSkill(skillId: string) {
    setPendingSkillIds((current) => new Set(current).add(skillId));
    setError(null);
    try {
      const updatedState = await skillerApi.deleteSkill(skillId);
      setLibraryState(updatedState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPendingSkillIds((current) => {
        const next = new Set(current);
        next.delete(skillId);
        return next;
      });
    }
  }

  function beginOrganizationMutation(): boolean {
    if (isOrganizing || isOrganizingRef.current) return false;
    isOrganizingRef.current = true;
    setIsOrganizing(true);
    return true;
  }

  function finishOrganizationMutation() {
    isOrganizingRef.current = false;
    setIsOrganizing(false);
  }

  async function createSkillSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newSkillSetName.trim() === "") return;
    if (!beginOrganizationMutation()) return;
    setError(null);
    try {
      const updatedState = await skillerApi.createSkillSet(newSkillSetName);
      setLibraryState(updatedState);
      setNewSkillSetName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      finishOrganizationMutation();
    }
  }

  async function renameSkillSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renamingSkillSetId || renamingSkillSetName.trim() === "") return;
    if (!beginOrganizationMutation()) return;
    setError(null);
    try {
      const updatedState = await skillerApi.renameSkillSet(renamingSkillSetId, renamingSkillSetName);
      setLibraryState(updatedState);
      setRenamingSkillSetId(null);
      setRenamingSkillSetName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      finishOrganizationMutation();
    }
  }

  async function deleteSkillSet(skillSetId: string) {
    if (!beginOrganizationMutation()) return;
    setError(null);
    try {
      const updatedState = await skillerApi.deleteSkillSet(skillSetId);
      setLibraryState(updatedState);
      setSetFilter((current) => filterAfterDeletingSkillSet(current, skillSetId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      finishOrganizationMutation();
    }
  }

  async function assignSkillSet(skillId: string, skillSetId: string) {
    if (!beginOrganizationMutation()) return;
    setError(null);
    try {
      const updatedState = await skillerApi.assignSkillSet(skillId, skillSetId === "none" ? undefined : skillSetId);
      setLibraryState(updatedState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      finishOrganizationMutation();
    }
  }

  async function saveSkillTags(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTagSkillId) return;
    if (!beginOrganizationMutation()) return;
    setError(null);
    try {
      const updatedState = await skillerApi.replaceSkillTags(editingTagSkillId, parseTagInput(tagInput));
      setLibraryState(updatedState);
      setEditingTagSkillId(null);
      setTagInput("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      finishOrganizationMutation();
    }
  }

  async function setWholeSetEnabled(skillSetId: string, enabled: boolean) {
    if (!beginOrganizationMutation()) return;
    const memberIds = skills.filter((skill) => skill.skillSetId === skillSetId).map((skill) => skill.id);
    setPendingSkillIds((current) => new Set([...current, ...memberIds]));
    setError(null);
    try {
      const result = await skillerApi.setSkillSetEnabled(skillSetId, enabled);
      setLibraryState(result.state);
      setError(setSkillSetEnabledScanErrorMessage(result));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPendingSkillIds((current) => {
        const next = new Set(current);
        memberIds.forEach((skillId) => next.delete(skillId));
        return next;
      });
      finishOrganizationMutation();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Library</CardTitle>
        <CardDescription>Installed master skills</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Library unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {!error ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{skills.length} master skills</Badge>
            {invalidSkills.length > 0 ? <Badge variant="destructive">{invalidSkills.length} invalid</Badge> : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={installLocal} disabled={isInstalling}>
            Add from local folder
          </Button>
          <Button variant="outline" onClick={onBrowseRegistry}>
            Browse skills.sh registry
          </Button>
        </div>
        <form className="grid gap-2 md:grid-cols-[minmax(16rem,1fr)_auto]" onSubmit={installGithub}>
          <Input
            value={githubUrl}
            onChange={(event) => setGithubUrl(event.target.value)}
            aria-label="GitHub URL"
            placeholder="GitHub repo, skill folder, or SKILL.md URL"
          />
          <Button type="submit" disabled={isInstalling || githubUrl.trim() === ""}>
            Add from GitHub
          </Button>
        </form>
        {error ? null : isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={setFilter.type === "all" ? "default" : "outline"}
                  size="sm"
                  aria-pressed={setFilter.type === "all"}
                  onClick={() => setSetFilter({ type: "all" })}
                >
                  All
                </Button>
                <Button
                  type="button"
                  variant={setFilter.type === "ungrouped" ? "default" : "outline"}
                  size="sm"
                  aria-pressed={setFilter.type === "ungrouped"}
                  onClick={() => setSetFilter({ type: "ungrouped" })}
                >
                  Ungrouped
                </Button>
                {libraryState.skillSets.map((skillSet) => (
                  <Button
                    key={skillSet.id}
                    type="button"
                    variant={isSetFilterActive(skillSet.id) ? "default" : "outline"}
                    size="sm"
                    aria-pressed={isSetFilterActive(skillSet.id)}
                    onClick={() => setSetFilter({ type: "set", skillSetId: skillSet.id })}
                  >
                    {skillSet.name}
                  </Button>
                ))}
              </div>
              {libraryState.tags.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {libraryState.tags.map((tag) => (
                    <Button
                      key={tag}
                      type="button"
                      variant={selectedTags.includes(tag) ? "default" : "outline"}
                      size="sm"
                      aria-pressed={selectedTags.includes(tag)}
                      onClick={() => toggleSelectedTag(tag)}
                    >
                      {tag}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <form className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_auto]" onSubmit={createSkillSet}>
                <Input
                  value={newSkillSetName}
                  onChange={(event) => setNewSkillSetName(event.target.value)}
                  aria-label="New skill set name"
                  placeholder="New skill set"
                  disabled={isOrganizing}
                />
                <Button type="submit" disabled={isOrganizing || newSkillSetName.trim() === ""}>
                  Create set
                </Button>
              </form>
              {renamingSkillSetId ? (
                <form className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_auto_auto]" onSubmit={renameSkillSet}>
                  <Input
                    value={renamingSkillSetName}
                    onChange={(event) => setRenamingSkillSetName(event.target.value)}
                    aria-label="Rename skill set"
                    disabled={isOrganizing}
                  />
                  <Button type="submit" disabled={isOrganizing || renamingSkillSetName.trim() === ""}>
                    Rename
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isOrganizing}
                    onClick={() => {
                      setRenamingSkillSetId(null);
                      setRenamingSkillSetName("");
                    }}
                  >
                    Cancel
                  </Button>
                </form>
              ) : null}
              {libraryState.skillSets.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {libraryState.skillSets.map((skillSet) => {
                    const members = skills.filter((skill) => skill.skillSetId === skillSet.id);
                    const state = skillSetState(skills, skillSet.id);
                    const hasPendingMember = members.some((skill) => pendingSkillIds.has(skill.id));
                    const disabled = members.length === 0 || hasPendingMember || isOrganizing;

                    return (
                      <div
                        key={skillSet.id}
                        className="grid gap-2 rounded-md border p-2 md:grid-cols-[minmax(10rem,1fr)_auto_auto_auto_auto]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{skillSet.name}</span>
                          <Badge variant="secondary">{members.length === 0 ? "empty" : `${members.length} members`}</Badge>
                          <Badge variant="outline">{state}</Badge>
                        </div>
                        <Switch
                          checked={state === "on"}
                          disabled={disabled}
                          onCheckedChange={(checked) => void setWholeSetEnabled(skillSet.id, checked)}
                          aria-label={`${state === "on" ? "Disable" : "Enable"} ${skillSet.name}`}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isOrganizing}
                          aria-label={`Rename ${skillSet.name}`}
                          onClick={() => beginRenamingSkillSet(skillSet.id, skillSet.name)}
                        >
                          Rename
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isOrganizing}
                          aria-label={`Delete ${skillSet.name}`}
                          onClick={() => void deleteSkillSet(skillSet.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead column="name">Name</SortableTableHead>
                  <SortableTableHead column="source">Source</SortableTableHead>
                  <SortableTableHead column="skillSet">Skill Set</SortableTableHead>
                  <TableHead>Tags</TableHead>
                  <SortableTableHead column="status">Status</SortableTableHead>
                  <SortableTableHead column="enabled">Enabled</SortableTableHead>
                  <SortableTableHead column="actions">Actions</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedSkills.map((skill) => (
                  <TableRow key={skill.id}>
                    <TableCell>{skill.name || skill.id}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="secondary">{sourceLabel(skill)}</Badge>
                        <span className="max-w-80 truncate text-xs text-muted-foreground">{sourceDetail(skill)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={skill.skillSetId ?? "none"}
                        disabled={isOrganizing || pendingSkillIds.has(skill.id)}
                        aria-label={`Set for ${skill.name || skill.id}`}
                        onChange={(event) => void assignSkillSet(skill.id, event.target.value)}
                      >
                        <option value="none">none</option>
                        {libraryState.skillSets.map((skillSet) => (
                          <option key={skillSet.id} value={skillSet.id}>
                            {skillSet.name}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      {editingTagSkillId === skill.id ? (
                        <form className="flex min-w-72 items-center gap-1" onSubmit={saveSkillTags}>
                          <Input
                            ref={tagInputRef}
                            value={tagInput}
                            onChange={(event) => setTagInput(event.target.value)}
                            aria-label={`Tags for ${skill.name || skill.id}`}
                            placeholder="browser, testing"
                            disabled={isOrganizing}
                            className="h-8 min-w-48"
                          />
                          <Button
                            type="submit"
                            variant="outline"
                            size="icon"
                            disabled={isOrganizing}
                            aria-label={`Save tags for ${skill.name || skill.id}`}
                          >
                            <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={2} data-icon="inline-start" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={isOrganizing}
                            aria-label={`Cancel editing tags for ${skill.name || skill.id}`}
                            onClick={() => {
                              setEditingTagSkillId(null);
                              setTagInput("");
                            }}
                          >
                            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} data-icon="inline-start" />
                          </Button>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {skill.tags.map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={isOrganizing}
                            aria-label={`Edit tags for ${skill.name || skill.id}`}
                            onClick={() => {
                              setEditingTagSkillId(skill.id);
                              setTagInput(skill.tags.join(", "));
                            }}
                          >
                            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} data-icon="inline-start" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {skill.validation?.valid ? (
                        <Badge variant="outline">{statusLabel(skill)}</Badge>
                      ) : (
                        <Badge variant="destructive">{statusLabel(skill)}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={skill.enabled}
                        onCheckedChange={(checked) => void setSkillEnabled(skill.id, checked)}
                        disabled={pendingSkillIds.has(skill.id)}
                        aria-label={`${skill.enabled ? "Disable" : "Enable"} ${skill.name || skill.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={pendingSkillIds.has(skill.id)}
                        aria-label={`Delete ${skill.name || skill.id}`}
                        onClick={() => void deleteSkill(skill.id)}
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredSkills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      {skills.length > 0 ? "No skills match the current filters." : "No skills installed."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
      <Sheet open={isGithubSheetOpen} onOpenChange={setIsGithubSheetOpen}>
        <SheetContent className="overflow-hidden sm:max-w-xl">
          <SheetHeader className="shrink-0">
            <SheetTitle>GitHub Skills</SheetTitle>
            <SheetDescription>Select skills to install from this repository.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6">
            {githubChoices.length === 0 ? (
              <Alert>
                <AlertTitle>No skills found</AlertTitle>
                <AlertDescription>No SKILL.md files were found in this repository.</AlertDescription>
              </Alert>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Install</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Path</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {githubChoices.map((skill) => {
                    const id = `github-skill-${skill.path.replace(/[^a-z0-9_-]+/gi, "-")}`;
                    return (
                      <TableRow key={skill.path}>
                        <TableCell>
                          <Label htmlFor={id}>
                            <Checkbox
                              id={id}
                              checked={selectedGithubPaths.has(skill.path)}
                              onCheckedChange={(checked) => setGithubSkillSelected(skill.path, Boolean(checked))}
                            />
                            <span className="sr-only">Install {skill.name}</span>
                          </Label>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span>{skill.name}</span>
                            {skill.description ? (
                              <span className="max-w-80 truncate text-xs text-muted-foreground">
                                {skill.description}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{skill.path}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          <SheetFooter className="shrink-0 border-t bg-popover">
            <Button
              onClick={() => void installSelectedGithubSkills()}
              disabled={isInstalling || selectedGithubSkills.length === 0}
            >
              Install selected
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
