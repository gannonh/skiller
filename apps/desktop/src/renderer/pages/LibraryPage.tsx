import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  Edit02Icon
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
import { skillerApi, type LibraryState, type SaveSkillSetInput, type SkillMetadata, type SkillSetMetadata } from "../lib/api.js";
import { runOrganizationAction } from "../lib/organization-mutation.js";
import { sourceDetail, sourceLabel, sourceUrl } from "../lib/skill-source.js";
import type { DiscoveredGithubSkill, TargetConfig } from "@skiller/core";
import { SkillMembershipDialog } from "../components/library/SkillMembershipDialog.js";
import { SkillSetEditorDialog } from "../components/library/SkillSetEditorDialog.js";
import { SortableTableHead } from "../components/library/SortableTableHead.js";
import {
  filterAfterDeletingSkillSet,
  filterLibrarySkills,
  setSkillSetEnabledScanErrorMessage,
  skillSetIdsForSkill,
  skillSetStateForId,
  skillStatusLabel,
  sortSkills,
  type SetFilter,
  type SkillPickerSortColumn
} from "../components/library/library-helpers.js";

type SortDirection = "asc" | "desc";

const emptyLibraryState: LibraryState = {
  skills: [],
  skillSets: [],
  tags: []
};

function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseTagInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map(normalizeTag)
        .filter(Boolean)
    )
  );
}

export function normalizeGithubInput(value: string): string {
  const trimmed = value.trim();
  const shorthand = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;

  if (!/^https?:\/\//i.test(trimmed) && /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(shorthand)) {
    return `https://github.com/${shorthand}`;
  }

  return trimmed;
}

export function mergeTags(currentTags: string[], incomingTags: string[]): string[] {
  const seen = new Set(currentTags);
  const merged = [...currentTags];

  for (const tag of incomingTags) {
    const normalized = normalizeTag(tag);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }

  return merged;
}

export function tagAutocompleteOptions(knownTags: string[], selectedTags: string[], query: string): string[] {
  const normalizedQuery = normalizeTag(query);
  if (!normalizedQuery) return [];
  const selected = new Set(selectedTags);
  return knownTags.filter((tag) => !selected.has(tag) && tag.includes(normalizedQuery)).slice(0, 6);
}

export function reconcileSelectedTags(selectedTags: string[], knownTags: string[]): string[] {
  return selectedTags.filter((tag) => knownTags.includes(tag));
}

export type GithubSelectionState = boolean | "indeterminate";

export function githubSelectionState(
  choices: DiscoveredGithubSkill[],
  selectedPaths: Set<string>
): GithubSelectionState {
  if (choices.length === 0) return false;
  const selectedCount = choices.filter((skill) => selectedPaths.has(skill.path)).length;
  if (selectedCount === 0) return false;
  return selectedCount === choices.length ? true : "indeterminate";
}

export function githubSelectionPaths(choices: DiscoveredGithubSkill[], selected: boolean): Set<string> {
  return new Set(selected ? choices.map((skill) => skill.path) : []);
}

function SourceDetail({ skill }: { skill: SkillMetadata }) {
  const detail = sourceDetail(skill);
  const url = sourceUrl(skill);

  if (!url) {
    return <span className="max-w-80 truncate text-xs text-muted-foreground">{detail}</span>;
  }

  return (
    <button
      type="button"
      className="max-w-80 truncate text-left text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      title={detail}
      aria-label={`Open source for ${skill.name || skill.id}`}
      onClick={() => void skillerApi.openExternal(url)}
    >
      {detail}
    </button>
  );
}

function TagTokenInput({
  value,
  query,
  knownTags,
  ariaLabel,
  disabled,
  inputRef,
  onValueChange,
  onQueryChange
}: {
  value: string[];
  query: string;
  knownTags: string[];
  ariaLabel: string;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onValueChange: (tags: string[]) => void;
  onQueryChange: (query: string) => void;
}) {
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const suggestions = useMemo(() => tagAutocompleteOptions(knownTags, value, query), [knownTags, value, query]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [query]);

  function commitTags(tags: string[]) {
    onValueChange(mergeTags(value, tags));
    onQueryChange("");
  }

  function commitQuery() {
    const suggestion = suggestions[activeSuggestionIndex];
    if (suggestion) {
      commitTags([suggestion]);
      return;
    }
    commitTags(parseTagInput(query));
  }

  function updateQuery(nextQuery: string) {
    if (!nextQuery.includes(",")) {
      onQueryChange(nextQuery);
      return;
    }

    const parts = nextQuery.split(",");
    commitTags(parseTagInput(parts.slice(0, -1).join(",")));
    onQueryChange(parts.at(-1) ?? "");
  }

  function removeTag(tag: string) {
    onValueChange(value.filter((candidate) => candidate !== tag));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && (query.trim() || suggestions.length > 0)) {
      event.preventDefault();
      commitQuery();
      return;
    }

    if (event.key === ",") {
      event.preventDefault();
      commitQuery();
      return;
    }

    if (event.key === "Backspace" && query === "" && value.length > 0) {
      event.preventDefault();
      onValueChange(value.slice(0, -1));
      return;
    }

    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
    }
  }

  return (
    <div className="relative min-w-72">
      <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input bg-input/20 px-1 py-1 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
        {value.map((tag) => (
          <Badge key={tag} variant="outline" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
              disabled={disabled}
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(tag)}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
            </button>
          </Badge>
        ))}
        <Input
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-label={ariaLabel}
          value={query}
          onChange={(event) => updateQuery(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? "browser, testing" : ""}
          disabled={disabled}
          className="h-6 min-w-20 flex-1 border-0 bg-transparent px-1 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
        />
      </div>
      {suggestions.length > 0 ? (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover p-1 text-popover-foreground shadow-md" role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              role="option"
              aria-selected={index === activeSuggestionIndex}
              className="flex w-full items-center rounded-sm px-2 py-1 text-left text-xs hover:bg-muted aria-selected:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commitTags([suggestion])}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LibraryPage({
  onBrowseRegistry,
  onManageGlobalTargets
}: {
  onBrowseRegistry?: () => void;
  onManageGlobalTargets?: () => void;
}) {
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
  const [sortColumn, setSortColumn] = useState<SkillPickerSortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [setFilter, setSetFilter] = useState<SetFilter>({ type: "all" });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [globalTargets, setGlobalTargets] = useState<TargetConfig[]>([]);
  const [skillSetEditorOpen, setSkillSetEditorOpen] = useState(false);
  const [editingSkillSet, setEditingSkillSet] = useState<SkillSetMetadata | null>(null);
  const [membershipDialogSkillId, setMembershipDialogSkillId] = useState<string | null>(null);
  const [editingTagSkillId, setEditingTagSkillId] = useState<string | null>(null);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [isOrganizing, setIsOrganizing] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const isOrganizingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    void refreshLibrary()
      .catch((caught: unknown) => {
        if (isMountedRef.current) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (isMountedRef.current) setIsLoading(false);
      });

    void skillerApi
      .getConfig()
      .then((config) => {
        if (isMountedRef.current) setGlobalTargets(config.targets);
      })
      .catch((caught: unknown) => {
        console.error("Failed to load global targets", caught);
      });

    return () => {
      isMountedRef.current = false;
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
    () => filterLibrarySkills(skills, setFilter, selectedTags, libraryState.skillSets),
    [skills, setFilter, selectedTags, libraryState.skillSets]
  );
  const sortedSkills = useMemo(
    () => sortSkills(filteredSkills, sortColumn, sortDirection),
    [filteredSkills, sortColumn, sortDirection]
  );
  const selectedGithubSkills = useMemo(
    () => githubChoices.filter((skill) => selectedGithubPaths.has(skill.path)),
    [githubChoices, selectedGithubPaths]
  );
  const githubSelectAllState = useMemo(
    () => githubSelectionState(githubChoices, selectedGithubPaths),
    [githubChoices, selectedGithubPaths]
  );

  function updateSort(column: SkillPickerSortColumn) {
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  }

  function isSetFilterActive(skillSetId: string): boolean {
    return setFilter.type === "set" && setFilter.skillSetId === skillSetId;
  }

  function toggleSelectedTag(tag: string) {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  function openCreateSkillSet() {
    setEditingSkillSet(null);
    setSkillSetEditorOpen(true);
  }

  function openEditSkillSet(skillSet: SkillSetMetadata) {
    setEditingSkillSet(skillSet);
    setSkillSetEditorOpen(true);
  }

  async function refreshLibrary() {
    const result = await skillerApi.listLibrary();
    if (isMountedRef.current) {
      setLibraryState(result);
      setError(null);
    }
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
    const normalizedGithubUrl = normalizeGithubInput(githubUrl);
    setIsInstalling(true);
    setError(null);
    try {
      const discovery = await skillerApi.discoverGithub(normalizedGithubUrl);
      if (discovery.repositoryOnly) {
        setGithubChoices(discovery.skills);
        setSelectedGithubPaths(new Set(discovery.skills.map((skill) => skill.path)));
        setIsGithubSheetOpen(true);
        return;
      }

      const metadata = await skillerApi.installGithub({
        githubUrl: normalizedGithubUrl
      });
      if (!metadata) return;
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
        const metadata = await skillerApi.installGithub({
          githubUrl: skill.githubUrl,
          ...(skill.githubPath ? { githubPath: skill.githubPath } : {}),
          ref: skill.ref
        });
        if (!metadata) return;
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

  function setAllGithubSkillsSelected(selected: boolean) {
    setSelectedGithubPaths(githubSelectionPaths(githubChoices, selected));
  }

  async function setSkillEnabled(skillId: string, enabled: boolean) {
    if (!beginOrganizationMutation()) return;
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
      finishOrganizationMutation();
    }
  }

  async function deleteSkill(skillId: string) {
    if (!beginOrganizationMutation()) return;
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
      finishOrganizationMutation();
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

  async function browseTargetDirectory(): Promise<string | null> {
    try {
      return await skillerApi.chooseTargetDirectory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    }
  }

  async function saveSkillSet(input: SaveSkillSetInput): Promise<boolean> {
    setError(null);
    return runOrganizationAction(
      beginOrganizationMutation,
      finishOrganizationMutation,
      (message) => setError(message),
      async () => {
        const updatedState = await skillerApi.saveSkillSet(input);
        setLibraryState(updatedState);
      }
    );
  }

  async function saveSkillMembership(skillId: string, skillSetIds: string[]): Promise<boolean> {
    setError(null);
    return runOrganizationAction(
      beginOrganizationMutation,
      finishOrganizationMutation,
      (message) => setError(message),
      async () => {
        const updatedState = await skillerApi.setSkillMembership(skillId, skillSetIds);
        setLibraryState(updatedState);
      }
    );
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

  const membershipDialogSkill = membershipDialogSkillId
    ? skills.find((skill) => skill.id === membershipDialogSkillId)
    : undefined;

  async function saveSkillTags(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTagSkillId) return;
    if (!beginOrganizationMutation()) return;
    setError(null);
    try {
      const updatedState = await skillerApi.replaceSkillTags(editingTagSkillId, mergeTags(draftTags, parseTagInput(tagQuery)));
      setLibraryState(updatedState);
      setEditingTagSkillId(null);
      setDraftTags([]);
      setTagQuery("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      finishOrganizationMutation();
    }
  }

  async function setWholeSetEnabled(skillSetId: string, enabled: boolean) {
    if (!beginOrganizationMutation()) return;
    const skillSet = libraryState.skillSets.find((candidate) => candidate.id === skillSetId);
    const memberIds = skillSet?.skillIds ?? [];
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
              <Button type="button" disabled={isOrganizing} onClick={openCreateSkillSet}>
                Create New Skill Set
              </Button>
              {libraryState.skillSets.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {libraryState.skillSets.map((skillSet) => {
                    const state = skillSetStateForId(skills, libraryState.skillSets, skillSet.id);
                    const hasPendingMember = skillSet.skillIds.some((skillId) => pendingSkillIds.has(skillId));
                    const disabled = skillSet.skillIds.length === 0 || hasPendingMember || isOrganizing;

                    return (
                      <div
                        key={skillSet.id}
                        className="grid gap-2 rounded-md border p-2 md:grid-cols-[minmax(10rem,1fr)_auto_auto_auto_auto]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{skillSet.name}</span>
                          <Badge variant="secondary">
                            {skillSet.skillIds.length === 0 ? "empty" : `${skillSet.skillIds.length} members`}
                          </Badge>
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
                          aria-label={`Edit ${skillSet.name}`}
                          onClick={() => openEditSkillSet(skillSet)}
                        >
                          Edit
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
                  <SortableTableHead column="name" activeColumn={sortColumn} direction={sortDirection} onSort={updateSort}>
                    Name
                  </SortableTableHead>
                  <SortableTableHead column="source" activeColumn={sortColumn} direction={sortDirection} onSort={updateSort}>
                    Source
                  </SortableTableHead>
                  <TableHead>Skill Sets</TableHead>
                  <TableHead>Tags</TableHead>
                  <SortableTableHead column="status" activeColumn={sortColumn} direction={sortDirection} onSort={updateSort}>
                    Status
                  </SortableTableHead>
                  <SortableTableHead column="enabled" activeColumn={sortColumn} direction={sortDirection} onSort={updateSort}>
                    Global
                  </SortableTableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedSkills.map((skill) => (
                  <TableRow key={skill.id}>
                    <TableCell>{skill.name || skill.id}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="secondary">{sourceLabel(skill)}</Badge>
                        <SourceDetail skill={skill} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isOrganizing || pendingSkillIds.has(skill.id)}
                        aria-label={`Manage skill sets for ${skill.name || skill.id}`}
                        onClick={() => setMembershipDialogSkillId(skill.id)}
                      >
                        {(() => {
                          const count = skillSetIdsForSkill(skill.id, libraryState.skillSets).length;
                          return count === 0 ? "Skill Sets" : `${count} sets`;
                        })()}
                      </Button>
                    </TableCell>
                    <TableCell>
                      {editingTagSkillId === skill.id ? (
                        <form className="flex min-w-72 items-center gap-1" onSubmit={saveSkillTags}>
                          <TagTokenInput
                            value={draftTags}
                            query={tagQuery}
                            knownTags={libraryState.tags}
                            ariaLabel={`Tags for ${skill.name || skill.id}`}
                            disabled={isOrganizing}
                            inputRef={tagInputRef}
                            onValueChange={setDraftTags}
                            onQueryChange={setTagQuery}
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
                              setDraftTags([]);
                              setTagQuery("");
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
                            variant="ghost"
                            size="icon-sm"
                            className="border border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                            disabled={isOrganizing}
                            aria-label={`Edit tags for ${skill.name || skill.id}`}
                            onClick={() => {
                              setEditingTagSkillId(skill.id);
                              setDraftTags(skill.tags);
                              setTagQuery("");
                            }}
                          >
                            <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} data-icon="inline-start" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {skill.validation?.valid ? (
                        <Badge variant="outline">{skillStatusLabel(skill)}</Badge>
                      ) : (
                        <Badge variant="destructive">{skillStatusLabel(skill)}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={skill.enabled}
                        onCheckedChange={(checked) => void setSkillEnabled(skill.id, checked)}
                        disabled={isOrganizing || pendingSkillIds.has(skill.id)}
                        aria-label={`${skill.enabled ? "Disable" : "Enable"} global distribution for ${skill.name || skill.id}`}
                        title={`${skill.enabled ? "Sync to global targets" : "Not synced to global targets"}. Skill set targets are unaffected.`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isOrganizing || pendingSkillIds.has(skill.id)}
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
                    <TableCell colSpan={8} className="text-muted-foreground">
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
                    <TableHead>
                      <Label htmlFor="github-skill-select-all" className="flex items-center gap-2">
                        <Checkbox
                          id="github-skill-select-all"
                          checked={githubSelectAllState === true}
                          indeterminate={githubSelectAllState === "indeterminate"}
                          onCheckedChange={(checked) => setAllGithubSkillsSelected(checked)}
                        />
                        Install
                      </Label>
                    </TableHead>
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
      <SkillSetEditorDialog
        open={skillSetEditorOpen}
        skillSet={editingSkillSet}
        skills={skills}
        disabled={isOrganizing}
        globalTargets={globalTargets}
        onOpenChange={setSkillSetEditorOpen}
        onSave={saveSkillSet}
        onManageGlobalTargets={onManageGlobalTargets}
        onBrowseTarget={browseTargetDirectory}
      />
      <SkillMembershipDialog
        open={membershipDialogSkillId !== null}
        skillId={membershipDialogSkillId}
        skillName={membershipDialogSkill?.name || membershipDialogSkill?.id || "skill"}
        skillSets={libraryState.skillSets}
        disabled={isOrganizing}
        onOpenChange={(open) => {
          if (!open) setMembershipDialogSkillId(null);
        }}
        onSave={saveSkillMembership}
      />
    </Card>
  );
}
