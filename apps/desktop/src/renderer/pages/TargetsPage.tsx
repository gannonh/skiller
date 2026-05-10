import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { skillerApi } from "../lib/api.js";

export function TargetsPage() {
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    return skillerApi.onScanError((scanError) => {
      setError(scanError.message);
      setStatus("Scan failed");
    });
  }, []);

  async function scan() {
    setIsScanning(true);
    setStatus("Scanning");
    setError(null);
    await skillerApi
      .scanTargets()
      .then((result) => {
        const changed = result.imported.length + result.enabled.length;
        setStatus(`Scan complete: ${changed} changes, ${result.errors.length} errors`);
        setError(result.errors[0]?.message ?? null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught));
        setStatus("Scan failed");
      })
      .finally(() => setIsScanning(false));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Targets</CardTitle>
        <CardDescription>Default and custom agent skill directories</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
