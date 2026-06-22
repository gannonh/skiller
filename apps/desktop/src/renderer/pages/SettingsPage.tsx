import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import type { TargetInstallMode } from "@skiller/core";
import { skillerApi } from "../lib/api.js";

function InstallModePicker({
  label,
  description,
  value,
  disabled,
  onChange
}: {
  label: string;
  description: string;
  value: TargetInstallMode;
  disabled?: boolean;
  onChange: (value: TargetInstallMode) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={value === "symlink" ? "default" : "outline"}
          size="sm"
          disabled={disabled}
          aria-pressed={value === "symlink"}
          onClick={() => onChange("symlink")}
        >
          Symlinks
        </Button>
        <Button
          type="button"
          variant={value === "copy" ? "default" : "outline"}
          size="sm"
          disabled={disabled}
          aria-pressed={value === "copy"}
          onClick={() => onChange("copy")}
        >
          Copies
        </Button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [libraryPath, setLibraryPath] = useState("~/skiller");
  const [globalTargetInstallMode, setGlobalTargetInstallMode] = useState<TargetInstallMode>("symlink");
  const [projectTargetInstallMode, setProjectTargetInstallMode] = useState<TargetInstallMode>("symlink");
  const [status, setStatus] = useState("Loading settings");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingInstallModes, setIsSavingInstallModes] = useState(false);
  const settingsLoaded = useRef(false);

  useEffect(() => {
    void skillerApi
      .getConfig()
      .then((config) => {
        setLibraryPath(config.libraryPath);
        setGlobalTargetInstallMode(config.globalTargetInstallMode);
        setProjectTargetInstallMode(config.projectTargetInstallMode);
        settingsLoaded.current = true;
        setStatus("Settings loaded");
      })
      .catch((caught: unknown) => {
        setStatus(caught instanceof Error ? caught.message : String(caught));
      });
  }, []);

  async function persistInstallModes(
    nextGlobal: TargetInstallMode,
    nextProject: TargetInstallMode
  ): Promise<void> {
    setIsSavingInstallModes(true);
    setStatus("Saving install modes");
    try {
      const config = await skillerApi.saveConfig({
        globalTargetInstallMode: nextGlobal,
        projectTargetInstallMode: nextProject
      });
      setGlobalTargetInstallMode(config.globalTargetInstallMode);
      setProjectTargetInstallMode(config.projectTargetInstallMode);
      setStatus("Install modes saved");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSavingInstallModes(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus("Saving settings");
    try {
      const config = await skillerApi.saveConfig({
        libraryPath,
        globalTargetInstallMode,
        projectTargetInstallMode
      });
      setLibraryPath(config.libraryPath);
      setGlobalTargetInstallMode(config.globalTargetInstallMode);
      setProjectTargetInstallMode(config.projectTargetInstallMode);
      setStatus("Settings saved");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  }

  const controlsDisabled = isSaving || isSavingInstallModes;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Library, target install behavior, startup, and tray settings</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4" onSubmit={save}>
          <label className="flex flex-col gap-2 text-sm">
            <span>Master library path</span>
            <Input
              aria-label="Master library path"
              value={libraryPath}
              onChange={(event) => setLibraryPath(event.target.value)}
              disabled={controlsDisabled}
            />
          </label>
          <InstallModePicker
            label="Global targets"
            description="How skills are installed into shared global target directories."
            value={globalTargetInstallMode}
            disabled={controlsDisabled}
            onChange={(value) => {
              setGlobalTargetInstallMode(value);
              if (settingsLoaded.current) {
                void persistInstallModes(value, projectTargetInstallMode);
              }
            }}
          />
          <InstallModePicker
            label="Project targets"
            description="How skills are installed into per-skill-set project target directories."
            value={projectTargetInstallMode}
            disabled={controlsDisabled}
            onChange={(value) => {
              setProjectTargetInstallMode(value);
              if (settingsLoaded.current) {
                void persistInstallModes(globalTargetInstallMode, value);
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={controlsDisabled}>
              {isSaving ? "Saving" : "Save Settings"}
            </Button>
            <span className="text-sm text-muted-foreground">{status}</span>
          </div>
        </form>
        <Separator />
        <p className="text-sm text-muted-foreground">
          Install mode changes save immediately. Use copies when a coding agent does not follow symlinks. Changing
          install mode takes effect on the next target sync.
        </p>
      </CardContent>
    </Card>
  );
}
