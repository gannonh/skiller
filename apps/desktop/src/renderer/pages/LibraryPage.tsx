import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Delete02Icon, Sorting01Icon, SortingDownIcon, SortingUpIcon } from "@hugeicons/core-free-icons";
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
import { skillerApi, type SkillMetadata } from "../lib/api.js";
import type { DiscoveredGithubSkill } from "@skiller/core";

type SortColumn = "name" | "source" | "status" | "updates" | "enabled" | "actions";
type SortDirection = "asc" | "desc";

function sourceLabel(skill: SkillMetadata): string {
  if (skill.source.type === "skills.sh") return "Registry";
  if (skill.source.type === "github") return "GitHub";
  if (skill.source.type === "local") return "Local";
  return "Unknown";
}

function sourceDetail(skill: SkillMetadata): string {
  if (skill.source.type === "local") return skill.source.path;
  if (skill.source.type === "unknown") return skill.source.discoveredFrom ?? "Untracked source";
  if (skill.source.githubPath) return `${skill.source.githubUrl}/${skill.source.githubPath}`;
  return skill.source.githubUrl;
}

function isUpdateable(skill: SkillMetadata): boolean {
  return (
    (skill.source.type === "github" || skill.source.type === "skills.sh") &&
    Boolean(skill.source.githubUrl && skill.source.ref && skill.source.commit)
  );
}

function statusLabel(skill: SkillMetadata): string {
  return skill.validation?.valid ? "valid" : "invalid";
}

function updatesLabel(skill: SkillMetadata): string {
  return isUpdateable(skill) ? "updateable" : "manual";
}

function sortValue(skill: SkillMetadata, column: SortColumn): string {
  if (column === "name") return skill.name || skill.id;
  if (column === "source") return `${sourceLabel(skill)} ${sourceDetail(skill)}`;
  if (column === "status") return statusLabel(skill);
  if (column === "updates") return updatesLabel(skill);
  if (column === "enabled") return skill.enabled ? "enabled" : "disabled";
  return `${skill.name || skill.id} ${skill.id}`;
}

function sortSkills(skills: SkillMetadata[], column: SortColumn, direction: SortDirection): SkillMetadata[] {
  return [...skills].sort((left, right) => {
    const primary = sortValue(left, column).localeCompare(sortValue(right, column), undefined, {
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
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
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

  const invalidSkills = useMemo(() => skills.filter((skill) => !skill.validation?.valid), [skills]);
  const sortedSkills = useMemo(() => sortSkills(skills, sortColumn, sortDirection), [skills, sortColumn, sortDirection]);
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

  async function refreshLibrary() {
    const result = await skillerApi.listLibrary();
    setSkills([...result]);
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
      const updatedSkills = await skillerApi.setSkillEnabled(skillId, enabled);
      setSkills([...updatedSkills]);
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
      const updatedSkills = await skillerApi.deleteSkill(skillId);
      setSkills([...updatedSkills]);
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
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="name">Name</SortableTableHead>
                <SortableTableHead column="source">Source</SortableTableHead>
                <SortableTableHead column="status">Status</SortableTableHead>
                <SortableTableHead column="updates">Updates</SortableTableHead>
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
                    {skill.validation?.valid ? (
                      <Badge variant="outline">{statusLabel(skill)}</Badge>
                    ) : (
                      <Badge variant="destructive">{statusLabel(skill)}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isUpdateable(skill) ? "outline" : "secondary"}>
                      {updatesLabel(skill)}
                    </Badge>
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
              {sortedSkills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No skills installed.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Sheet open={isGithubSheetOpen} onOpenChange={setIsGithubSheetOpen}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>GitHub Skills</SheetTitle>
            <SheetDescription>Select skills to install from this repository.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-6">
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
          <SheetFooter>
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
