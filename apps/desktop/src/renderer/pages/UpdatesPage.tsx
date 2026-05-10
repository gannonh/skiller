import { useEffect, useState } from "react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Switch } from "@workspace/ui/components/switch";
import { skillerApi } from "../lib/api.js";

export function UpdatesPage() {
  const [keepUpdated, setKeepUpdated] = useState(false);
  const [status, setStatus] = useState("Loading update settings");
  const [isChecking, setIsChecking] = useState(false);

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

    return skillerApi.onCheckUpdates(() => {
      void checkUpdates();
    });
  }, []);

  async function changeKeepUpdated(checked: boolean) {
    setKeepUpdated(checked);
    setStatus("Saving update settings");
    await skillerApi
      .saveConfig({ keepAllSkillsUpdated: checked })
      .then((config) => {
        setKeepUpdated(config.keepAllSkillsUpdated);
        setStatus("Update settings saved");
      })
      .catch((caught: unknown) => {
        setKeepUpdated(!checked);
        setStatus(caught instanceof Error ? caught.message : String(caught));
      });
  }

  async function checkUpdates() {
    setIsChecking(true);
    setStatus("Checking for updates");
    await skillerApi
      .checkUpdates()
      .then((result) => {
        const checkedAt = new Date(result.checkedAt).toLocaleString();
        setStatus(
          `Checked ${result.considered.length} skills at ${checkedAt}: ${result.available.length} available, ${result.updated.length} updated`
        );
      })
      .catch((caught: unknown) => {
        setStatus(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => setIsChecking(false));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Updates</CardTitle>
        <CardDescription>Available updates and automatic update settings</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Switch id="keep-all-updated" checked={keepUpdated} onCheckedChange={changeKeepUpdated} />
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
      </CardContent>
    </Card>
  );
}
