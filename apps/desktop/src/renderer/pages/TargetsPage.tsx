import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { skillerApi } from "../lib/api.js";

export function TargetsPage() {
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [targetDirectories, setTargetDirectories] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    void skillerApi
      .getConfig()
      .then((config) => setTargetDirectories(config.targetDirectories))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });

    return skillerApi.onScanError((scanError) => {
      setError(scanError.message);
      setStatus("Scan failed");
    });
  }, []);

  async function scan() {
    setIsScanning(true);
    setStatus("Scanning");
    setError(null);
    try {
      const result = await skillerApi.scanTargets();
      const changed = result.imported.length + result.enabled.length;
      setStatus(`Scan complete: ${changed} changes, ${result.errors.length} errors`);
      setError(result.errors[0]?.message ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Scan failed");
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
          {targetDirectories.map((targetDirectory) => (
            <div key={targetDirectory} className="rounded-md border px-3 py-2 font-mono text-sm">
              {targetDirectory}
            </div>
          ))}
          {targetDirectories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No target directories configured.</p>
          ) : null}
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Scan issue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">{status}</Badge>
          <Button onClick={scan} disabled={isScanning}>
            {isScanning ? "Scanning" : "Refresh Scan"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
