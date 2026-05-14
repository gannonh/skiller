import { FormEvent, useEffect, useMemo, useState } from "react";
import { PackageAddIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { skillerApi, type DiscoverSkill, type LeaderboardType, type SkillMetadata } from "../lib/api.js";

const pageSize = 10;

function skillText(skill: DiscoverSkill, keys: Array<keyof DiscoverSkill>, fallback: string): string {
  for (const key of keys) {
    const value = skill[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function skillId(skill: DiscoverSkill, fallback: string): string {
  return skillText(skill, ["id", "slug", "name"], fallback);
}

function lastPathSegment(value: string): string {
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function skillSource(skill: DiscoverSkill): string {
  const direct = skillText(skill, ["source", "repository", "repo", "githubRepo"], "");
  if (direct) return direct.replace(/^https:\/\/github\.com\//, "");

  const githubUrl = skillText(skill, ["githubUrl", "repositoryUrl", "repoUrl", "sourceUrl"], "");
  if (!githubUrl) return "unknown source";

  try {
    const url = new URL(githubUrl);
    return url.pathname.split("/").filter(Boolean).slice(0, 2).join("/") || "unknown source";
  } catch {
    return "unknown source";
  }
}

function registryAliasesForSkill(skill: DiscoverSkill, fallback: string): string[] {
  const id = skillId(skill, fallback);
  const name = skillText(skill, ["skillId", "slug", "name"], "");
  const source = skillSource(skill);
  const baseIds = uniqueStrings([id, name, lastPathSegment(id), lastPathSegment(name)]);
  const sourceIds = source === "unknown source" ? [] : baseIds.map((candidate) => `${source}/${candidate}`);

  return uniqueStrings([...baseIds, ...sourceIds]);
}

function registryAliasesForMetadata(skill: SkillMetadata): string[] {
  if (skill.source.type !== "skills.sh") return [];

  return uniqueStrings([
    skill.source.skillsShId,
    lastPathSegment(skill.source.skillsShId),
    skill.id,
    skill.name,
    lastPathSegment(skill.id),
    lastPathSegment(skill.name)
  ]);
}

function skillInstalls(skill: DiscoverSkill): number | null {
  for (const key of ["installs", "installCount", "downloads", "downloadCount", "usageCount"]) {
    const value = skill[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function formatInstalls(value: number | null): string {
  if (value === null) return "N/A";
  if (value >= 1_000_000) return `${formatCompact(value / 1_000_000)}M`;
  if (value >= 1_000) return `${formatCompact(value / 1_000)}K`;
  return String(value);
}

function formatCompact(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function leaderboardLabel(type: LeaderboardType): string {
  if (type === "all-time") return "All Time";
  if (type === "trending") return "Trending";
  return "Hot";
}

export function DiscoverPage() {
  const [skills, setSkills] = useState<DiscoverSkill[]>([]);
  const [librarySkills, setLibrarySkills] = useState<SkillMetadata[]>([]);
  const [pendingSkillIds, setPendingSkillIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [leaderboardType, setLeaderboardType] = useState<LeaderboardType>("all-time");
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("Skills Leaderboard (skills.sh)");
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    let mounted = true;

    setIsLoading(true);
    void skillerApi
      .leaderboard(leaderboardType)
      .then((result) => {
        if (!mounted) return;
        setSkills(result.skills);
        setVisibleCount(pageSize);
        setStatus("Skills Leaderboard (skills.sh)");
      })
      .catch((caught: unknown) => {
        if (mounted) setStatus(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    void skillerApi.listLibrary().then((result) => {
      if (mounted) setLibrarySkills(result);
    });

    return () => {
      mounted = false;
    };
  }, [leaderboardType]);

  const rows = useMemo(() => skills.slice(0, visibleCount), [skills, visibleCount]);
  const installedRegistryIds = useMemo(
    () =>
      new Set(
        librarySkills.flatMap((skill) => registryAliasesForMetadata(skill))
      ),
    [librarySkills]
  );

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    setIsLoading(true);
    const request = trimmed ? skillerApi.search(trimmed) : skillerApi.leaderboard(leaderboardType);
    try {
      const result = await request;
      setSkills(result.skills);
      setVisibleCount(pageSize);
      setStatus(trimmed ? `Search results for ${trimmed}` : `${leaderboardType} leaderboard`);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function installRegistry(id: string, skill: DiscoverSkill) {
    setPendingSkillIds((current) => new Set(current).add(id));
    setStatus(`Installing ${id}`);
    try {
      const metadata = await skillerApi.installRegistry({ skillsShId: id, registrySkill: skill });
      if (!metadata) {
        setStatus(`Install cancelled for ${id}`);
        return;
      }
      setLibrarySkills((current) => [...current.filter((installed) => installed.id !== metadata.id), metadata]);
      setStatus(`Installed ${metadata.name}`);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPendingSkillIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Discover
        </CardTitle>
        <CardDescription>{status}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex min-w-72 items-center gap-2" onSubmit={search}>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills.sh..." />
          <Button type="submit" aria-label="Search">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} data-icon="inline-start" />
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={leaderboardType} onValueChange={(value) => setLeaderboardType(value as LeaderboardType)}>
            <TabsList variant="line">
              <TabsTrigger value="all-time">All Time</TabsTrigger>
              <TabsTrigger value="trending">Trending</TabsTrigger>
              <TabsTrigger value="hot">Hot</TabsTrigger>
            </TabsList>
          </Tabs>
          {query.trim() ? null : <Badge variant="secondary">{leaderboardLabel(leaderboardType)}</Badge>}
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Skill</TableHead>
                <TableHead className="text-right">Installs</TableHead>
                <TableHead className="w-28 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((skill, index) => {
                const id = skillId(skill, `skill-${index}`);
                const registryAliases = registryAliasesForSkill(skill, `skill-${index}`);
                const installed = registryAliases.some((alias) => installedRegistryIds.has(alias));
                const pending = registryAliases.some((alias) => pendingSkillIds.has(alias));
                const name = skillText(skill, ["name", "title", "id", "slug"], "Untitled skill");
                const source = skillSource(skill);
                return (
                  <TableRow key={id}>
                    <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline">
                        <span>{name}</span>
                        <span className="max-w-72 truncate text-muted-foreground">{source}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatInstalls(skillInstalls(skill))}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={installed ? "outline" : "default"}
                        disabled={installed || pending}
                        onClick={() => void installRegistry(id, skill)}
                      >
                        <HugeiconsIcon icon={PackageAddIcon} strokeWidth={2} data-icon="inline-start" />
                        {installed ? "Installed" : pending ? "Installing" : "Install"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No skills found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
        {!isLoading && rows.length < skills.length ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setVisibleCount((current) => Math.min(current + pageSize, skills.length))}
          >
            Load more skills
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
