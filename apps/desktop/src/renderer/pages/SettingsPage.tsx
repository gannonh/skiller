import { FormEvent, useEffect, useRef, useState } from "react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import type { ImportableSkill, TargetInstallMode } from "@skiller/core";
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

function RepairSection() {
  const [status, setStatus] = useState("");
  const [isRepairing, setIsRepairing] = useState(false);

  async function repair() {
    setIsRepairing(true);
    setStatus("Checking library health");
    try {
      const { report } = await skillerApi.repairLibrary();
      const parts: string[] = [];
      parts.push(`${report.repaired.length} repaired`);
      if (report.skipped.length > 0) parts.push(`${report.skipped.length} skipped`);
      if (report.errors.length > 0) parts.push(`${report.errors.length} failed`);
      const summary =
        report.repaired.length === 0 && report.skipped.length === 0 && report.errors.length === 0
          ? "Library is healthy"
          : parts.join(", ");
      setStatus(summary);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsRepairing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Library health</div>
          <p className="text-xs text-muted-foreground">
            Re-fetch any tracked skill whose library copy is missing, empty, invalid, or out of date with its recorded
            source. Runs automatically on startup.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={isRepairing} onClick={() => void repair()}>
          {isRepairing ? "Repairing" : "Repair library"}
        </Button>
      </div>
      {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
    </div>
  );
}

function ImportSection() {
  const [skills, setSkills] = useState<ImportableSkill[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  async function scan() {
    setIsScanning(true);
    setStatus("Scanning global targets");
    try {
      const found = await skillerApi.discoverImportableSkills();
      setSkills(found);
      setSelected(new Set());
      setStatus(found.length === 0 ? "No unmanaged skills found in global targets" : `Found ${found.length} unmanaged skill${found.length === 1 ? "" : "s"}`);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsScanning(false);
    }
  }

  useEffect(() => {
    void scan();
    // Scan once on mount; further scans are user-triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importSkills(sourcePaths: string[]) {
    if (sourcePaths.length === 0) return;
    setIsImporting(true);
    setStatus(`Importing ${sourcePaths.length} skill${sourcePaths.length === 1 ? "" : "s"}`);
    try {
      const imported = await skillerApi.importSkills(sourcePaths);
      setStatus(`Imported ${imported.length} skill${imported.length === 1 ? "" : "s"}`);
      await scan();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsImporting(false);
    }
  }

  function toggle(sourcePath: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(sourcePath);
      else next.delete(sourcePath);
      return next;
    });
  }

  const busy = isScanning || isImporting;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Import</div>
          <p className="text-xs text-muted-foreground">
            Skills found in your global targets that Skiller does not manage. Import to bring them into your library.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void scan()}>
          {isScanning ? "Scanning" : "Scan"}
        </Button>
      </div>

      {skills.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void importSkills(skills.map((skill) => skill.sourcePath))}
            >
              Import all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || selected.size === 0}
              onClick={() => void importSkills([...selected])}
            >
              Import selected{selected.size > 0 ? ` (${selected.size})` : ""}
            </Button>
          </div>
          <ul className="flex flex-col gap-1">
            {skills.map((skill) => (
              <li
                key={skill.sourcePath}
                className="flex items-center gap-2 rounded-md border p-2"
              >
                <Checkbox
                  checked={selected.has(skill.sourcePath)}
                  disabled={busy}
                  onCheckedChange={(checked) => toggle(skill.sourcePath, Boolean(checked))}
                  aria-label={`Select ${skill.name}`}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{skill.name}</span>
                {!skill.valid ? <Badge variant="destructive">invalid</Badge> : null}
                <span className="truncate text-xs text-muted-foreground">{skill.targetPath}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  aria-label={`Import ${skill.name}`}
                  onClick={() => void importSkills([skill.sourcePath])}
                >
                  Import
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
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
        <Separator />
        <RepairSection />
        <Separator />
        <ImportSection />
      </CardContent>
    </Card>
  );
}
