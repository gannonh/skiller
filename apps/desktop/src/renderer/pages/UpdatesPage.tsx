import { useEffect, useState } from "react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Switch } from "@workspace/ui/components/switch";
import { skillerApi } from "../lib/api.js";

export function UpdatesPage() {
  const [keepUpdated, setKeepUpdated] = useState(false);
  const [status, setStatus] = useState("Waiting for update check");

  useEffect(() => {
    return skillerApi.onCheckUpdates(() => {
      setStatus("Update check requested");
    });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Updates</CardTitle>
        <CardDescription>Available updates and automatic update settings</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Switch id="keep-all-updated" checked={keepUpdated} onCheckedChange={setKeepUpdated} />
          <label htmlFor="keep-all-updated" className="text-sm">
            Keep all skills updated
          </label>
          <Badge variant="outline">{keepUpdated ? "Enabled" : "Disabled"}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setStatus("Update check requested")}>Check for Updates</Button>
          <span className="text-sm text-muted-foreground">{status}</span>
        </div>
      </CardContent>
    </Card>
  );
}
