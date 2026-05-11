import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { skillerApi, type DiscoverSkill, type LeaderboardType, type SkillMetadata } from "../lib/api.js";

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

export function DiscoverPage() {
  const [skills, setSkills] = useState<DiscoverSkill[]>([]);
  const [librarySkills, setLibrarySkills] = useState<SkillMetadata[]>([]);
  const [pendingSkillIds, setPendingSkillIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [leaderboardType, setLeaderboardType] = useState<LeaderboardType>("trending");
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("Trending skills from skills.sh");

  useEffect(() => {
    let mounted = true;

    setIsLoading(true);
    void skillerApi
      .leaderboard(leaderboardType)
      .then((result) => {
        if (!mounted) return;
        setSkills(result.skills);
        setStatus(`${leaderboardType} leaderboard`);
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

  const rows = useMemo(() => skills.slice(0, 10), [skills]);
  const installedRegistryIds = useMemo(
    () =>
      new Set(
        librarySkills.flatMap((skill) => (skill.source.type === "skills.sh" ? [skill.source.skillsShId] : []))
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
      setStatus(trimmed ? `Search results for ${trimmed}` : `${leaderboardType} leaderboard`);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function installRegistry(id: string) {
    setPendingSkillIds((current) => new Set(current).add(id));
    setStatus(`Installing ${id}`);
    try {
      const metadata = await skillerApi.installRegistry(id);
      setLibrarySkills((current) => [...current.filter((skill) => skill.id !== metadata.id), metadata]);
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
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={leaderboardType} onValueChange={(value) => setLeaderboardType(value as LeaderboardType)}>
            <TabsList>
              <TabsTrigger value="trending">Trending</TabsTrigger>
              <TabsTrigger value="hot">Hot</TabsTrigger>
              <TabsTrigger value="all-time">All Time</TabsTrigger>
            </TabsList>
          </Tabs>
          <form className="flex min-w-72 flex-1 items-center gap-2" onSubmit={search}>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills" />
            <Button type="submit">Search</Button>
          </form>
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
                <TableHead>Skill</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((skill, index) => {
                const id = skillId(skill, `skill-${index}`);
                const installed = installedRegistryIds.has(id);
                const pending = pendingSkillIds.has(id);
                return (
                  <TableRow key={id}>
                    <TableCell>{skillText(skill, ["name", "title", "id", "slug"], "Untitled skill")}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {skillText(skill, ["description", "summary"], "No description")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Registry</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant={installed ? "outline" : "default"}
                        disabled={installed || pending}
                        onClick={() => void installRegistry(id)}
                      >
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
      </CardContent>
    </Card>
  );
}
