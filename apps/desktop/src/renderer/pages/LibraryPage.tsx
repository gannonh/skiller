import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Switch } from "@workspace/ui/components/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { skillerApi, type SkillMetadata } from "../lib/api.js";

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

export function LibraryPage({ onBrowseRegistry }: { onBrowseRegistry?: () => void }) {
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingSkillIds, setPendingSkillIds] = useState<Set<string>>(() => new Set());
  const [githubUrl, setGithubUrl] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);

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

  async function refreshLibrary() {
    const result = await skillerApi.listLibrary();
    setSkills(result);
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

  async function setSkillEnabled(skillId: string, enabled: boolean) {
    setPendingSkillIds((current) => new Set(current).add(skillId));
    setError(null);
    try {
      const updatedSkills = await skillerApi.setSkillEnabled(skillId, enabled);
      setSkills(updatedSkills);
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
      setSkills(updatedSkills);
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
            Browse registry
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
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updates</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.map((skill) => (
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
                      <Badge variant="outline">valid</Badge>
                    ) : (
                      <Badge variant="destructive">invalid</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isUpdateable(skill) ? "outline" : "secondary"}>
                      {isUpdateable(skill) ? "updateable" : "manual"}
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
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {skills.length === 0 ? (
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
    </Card>
  );
}
