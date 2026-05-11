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

function normalizeTargetPath(targetPath: string): string {
  const trimmed = targetPath.trim();
  if (trimmed === "/" || trimmed === "~") return trimmed;
  return trimmed.replace(/[\\/]+$/g, "");
}

function mergeTouchedTargets(
  currentTargets: TargetConfig[],
  serverTargets: TargetConfig[],
  touchedPaths: string[]
): TargetConfig[] {
  const touched = new Set(touchedPaths);
  const currentPaths = new Set(currentTargets.map((target) => target.path));
  const serverByPath = new Map(serverTargets.map((target) => [target.path, target]));
  const mergedTargets = currentTargets.flatMap((target) => {
    if (!touched.has(target.path)) return [target];
    const serverTarget = serverByPath.get(target.path);
    return serverTarget ? [serverTarget] : [];
  });
  const addedTouchedTargets = serverTargets.filter((target) => touched.has(target.path) && !currentPaths.has(target.path));
  return [...mergedTargets, ...addedTouchedTargets];
}

export function TargetsPage() {
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<TargetConfig[]>([]);
  const [newTarget, setNewTarget] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [pendingTargets, setPendingTargets] = useState<Set<string>>(() => new Set());

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

  async function saveTargets(nextTargets: TargetConfig[], nextStatus: string, pendingPaths: string[]) {
    const previousTargets = targets;
    setTargets(nextTargets);
    setPendingTargets((current) => new Set([...current, ...pendingPaths]));
    setError(null);
    try {
      const config = await skillerApi.saveTargets(nextTargets);
      setTargets((current) => mergeTouchedTargets(current, config.targets, pendingPaths));
      setStatus(nextStatus);
    } catch (caught) {
      setTargets((current) => mergeTouchedTargets(current, previousTargets, pendingPaths));
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Save failed");
    } finally {
      setPendingTargets((current) => {
        const next = new Set(current);
        for (const pendingPath of pendingPaths) {
          next.delete(pendingPath);
        }
        return next;
      });
    }
  }

  async function addTarget() {
    const targetPath = normalizeTargetPath(newTarget);
    if (targetPath === "" || targets.some((target) => target.path === targetPath)) return;

    await saveTargets([...targets, { path: targetPath, enabled: true }], "Target added", [targetPath]);
    setNewTarget("");
  }

  async function setTargetEnabled(targetPath: string, enabled: boolean) {
    await saveTargets(
      targets.map((target) => (target.path === targetPath ? { ...target, enabled } : target)),
      enabled ? "Target enabled" : "Target disabled",
      [targetPath]
    );
  }

  async function removeTarget(targetPath: string) {
    await saveTargets(
      targets.filter((target) => target.path !== targetPath),
      "Target removed",
      [targetPath]
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
                disabled={pendingTargets.has(target.path)}
                aria-label={`${target.enabled ? "Disable" : "Enable"} ${target.path}`}
              />
              <div className="min-w-0 flex-1 truncate font-mono text-sm">{target.path}</div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void removeTarget(target.path)}
                disabled={pendingTargets.has(target.path)}
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
            disabled={pendingTargets.has(normalizeTargetPath(newTarget))}
          />
          <Button
            onClick={() => void addTarget()}
            disabled={normalizeTargetPath(newTarget) === "" || pendingTargets.has(normalizeTargetPath(newTarget))}
          >
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
