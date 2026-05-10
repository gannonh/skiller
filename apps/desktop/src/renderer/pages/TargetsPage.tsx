import { useEffect, useState } from "react";
import { Add01Icon, ArrowReloadHorizontalIcon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import type { TargetConfig } from "@skiller/core";
import { skillerApi } from "../lib/api.js";

export function TargetsPage() {
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<TargetConfig[]>([]);
  const [newTarget, setNewTarget] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void skillerApi
      .getConfig()
      .then((config) => setTargets(config.targets))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });

    return skillerApi.onScanError((scanError) => {
      setError(scanError.message);
      setStatus("Scan failed");
    });
  }, []);

  async function saveTargets(nextTargets: TargetConfig[], nextStatus: string) {
    setIsSaving(true);
    setError(null);
    try {
      const config = await skillerApi.saveTargets(nextTargets);
      setTargets(config.targets);
      setStatus(nextStatus);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function addTarget() {
    const targetPath = newTarget.trim();
    if (targetPath === "" || targets.some((target) => target.path === targetPath)) return;

    await saveTargets([...targets, { path: targetPath, enabled: true }], "Target added");
    setNewTarget("");
  }

  async function setTargetEnabled(targetPath: string, enabled: boolean) {
    await saveTargets(
      targets.map((target) => (target.path === targetPath ? { ...target, enabled } : target)),
      enabled ? "Target enabled" : "Target disabled"
    );
  }

  async function removeTarget(targetPath: string) {
    await saveTargets(
      targets.filter((target) => target.path !== targetPath),
      "Target removed"
    );
  }

  async function scan() {
    setIsScanning(true);
    setStatus("Syncing");
    setError(null);
    try {
      const result = await skillerApi.scanTargets();
      const changed = result.imported.length + result.enabled.length + result.disabled.length;
      setStatus(`Sync complete: ${changed} changes, ${result.errors.length} errors`);
      setError(result.errors[0]?.message ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Sync failed");
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Targets</CardTitle>
        <CardDescription>Default and custom agent skill directories</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {targets.map((target) => (
            <div key={target.path} className="flex items-center gap-3 rounded-md border px-3 py-2">
              <Switch
                checked={target.enabled}
                onCheckedChange={(checked) => void setTargetEnabled(target.path, checked)}
                disabled={isSaving}
                aria-label={`${target.enabled ? "Disable" : "Enable"} ${target.path}`}
              />
              <div className="min-w-0 flex-1 truncate font-mono text-sm">{target.path}</div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void removeTarget(target.path)}
                disabled={isSaving}
                aria-label={`Remove ${target.path}`}
                title="Remove target"
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
              </Button>
            </div>
          ))}
          {targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No target directories configured.</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={newTarget}
            onChange={(event) => setNewTarget(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addTarget();
            }}
            placeholder="~/path/to/skills"
            disabled={isSaving}
          />
          <Button onClick={() => void addTarget()} disabled={isSaving || newTarget.trim() === ""}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Add Target
          </Button>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Sync issue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">{status}</Badge>
          <Button onClick={scan} disabled={isScanning}>
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} strokeWidth={2} data-icon="inline-start" />
            {isScanning ? "Syncing" : "Sync Targets"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
