import { FormEvent, useEffect, useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { skillerApi } from "../lib/api.js";

export function SettingsPage() {
  const [libraryPath, setLibraryPath] = useState("~/skiller");
  const [status, setStatus] = useState("Loading settings");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void skillerApi
      .getConfig()
      .then((config) => {
        setLibraryPath(config.libraryPath);
        setStatus("Settings loaded");
      })
      .catch((caught: unknown) => {
        setStatus(caught instanceof Error ? caught.message : String(caught));
      });
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus("Saving settings");
    await skillerApi
      .saveConfig({ libraryPath })
      .then((config) => {
        setLibraryPath(config.libraryPath);
        setStatus("Settings saved");
      })
      .catch((caught: unknown) => {
        setStatus(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => setIsSaving(false));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Library, scan, startup, and tray behavior</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-3" onSubmit={save}>
          <label className="flex flex-col gap-2 text-sm">
            <span>Master library path</span>
            <Input
              aria-label="Master library path"
              value={libraryPath}
              onChange={(event) => setLibraryPath(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving" : "Save Settings"}
            </Button>
            <span className="text-sm text-muted-foreground">{status}</span>
          </div>
        </form>
        <Separator />
        <p className="text-sm text-muted-foreground">Default library path: ~/skiller</p>
      </CardContent>
    </Card>
  );
}
