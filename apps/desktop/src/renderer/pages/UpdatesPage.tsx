import { useEffect, useState } from "react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Switch } from "@workspace/ui/components/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { skillerApi, type SkillMetadata, type UpdateCheckSkill } from "../lib/api.js";

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

export function UpdatesPage() {
  const [keepUpdated, setKeepUpdated] = useState(false);
  const [status, setStatus] = useState("Loading update settings");
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [available, setAvailable] = useState<UpdateCheckSkill[]>([]);

  useEffect(() => {
    void skillerApi
      .getConfig()
      .then((config) => {
        setKeepUpdated(config.keepAllSkillsUpdated);
        setStatus("Waiting for update check");
      })
      .catch((caught: unknown) => {
        setStatus(caught instanceof Error ? caught.message : String(caught));
      });

    void skillerApi.listLibrary().then((result) => setSkills(result));

    return skillerApi.onCheckUpdates(() => {
      void checkUpdates();
    });
  }, []);

  async function changeKeepUpdated(checked: boolean) {
    if (isSaving) return;

    setKeepUpdated(checked);
    setIsSaving(true);
    setStatus("Saving update settings");
    try {
      const config = await skillerApi.saveConfig({ keepAllSkillsUpdated: checked });
      setKeepUpdated(config.keepAllSkillsUpdated);
      setStatus("Update settings saved");
    } catch (caught) {
      setKeepUpdated(!checked);
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function checkUpdates() {
    setIsChecking(true);
    setStatus("Checking for updates");
    try {
      const result = await skillerApi.checkUpdates();
      setAvailable(result.available);
      setSkills(await skillerApi.listLibrary());
      const parsedCheckedAt = new Date(result.checkedAt);
      const checkedAt = Number.isNaN(parsedCheckedAt.getTime()) ? "unknown time" : parsedCheckedAt.toLocaleString();
      setStatus(
        `Checked ${result.considered.length} skills at ${checkedAt}: ${result.available.length} available, ${result.updated.length} updated`
      );
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsChecking(false);
    }
  }

  const availableById = new Map(available.map((skill) => [skill.id, skill]));
  const updateableSkills = skills.filter(isUpdateable);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Updates</CardTitle>
        <CardDescription>Available updates and automatic update settings</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Switch id="keep-all-updated" checked={keepUpdated} onCheckedChange={changeKeepUpdated} disabled={isSaving} />
          <label htmlFor="keep-all-updated" className="text-sm">
            Keep all skills updated
          </label>
          <Badge variant="outline">{keepUpdated ? "Enabled" : "Disabled"}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={checkUpdates} disabled={isChecking}>
            {isChecking ? "Checking" : "Check for Updates"}
          </Button>
          <span className="text-sm text-muted-foreground">{status}</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {updateableSkills.map((skill) => {
              const update = availableById.get(skill.id);
              return (
                <TableRow key={skill.id}>
                  <TableCell>{skill.name || skill.id}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="secondary">{sourceLabel(skill)}</Badge>
                      <span className="max-w-80 truncate text-xs text-muted-foreground">{sourceDetail(skill)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={update ? "default" : "outline"}>
                      {update ? `${update.currentCommit} -> ${update.remoteCommit}` : "current"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {updateableSkills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
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
