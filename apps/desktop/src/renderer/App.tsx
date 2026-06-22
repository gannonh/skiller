import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowReloadHorizontalIcon,
  BookOpenIcon,
  DiscoverSquareIcon,
  DownloadCircle01Icon,
  FolderTreeIcon,
  SettingsIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@workspace/ui/components/sidebar";
import { Toaster } from "@workspace/ui/components/sonner";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { ModeToggle } from "./components/mode-toggle.js";
import { DiscoverPage } from "./pages/DiscoverPage.js";
import { LibraryPage } from "./pages/LibraryPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { TargetsPage } from "./pages/TargetsPage.js";
import { UpdatesPage } from "./pages/UpdatesPage.js";
import { skillerApi, type AppUpdateState } from "./lib/api.js";

type Page = "library" | "discover" | "targets" | "updates" | "settings";

const pages: Array<{ id: Page; label: string; icon: typeof BookOpenIcon }> = [
  { id: "library", label: "Library", icon: BookOpenIcon },
  { id: "targets", label: "Global Targets", icon: FolderTreeIcon },
  { id: "updates", label: "Updates", icon: ArrowReloadHorizontalIcon },
  { id: "discover", label: "Discover", icon: DiscoverSquareIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

function renderPage(page: Page, setPage: (page: Page) => void) {
  if (page === "library") return <LibraryPage onBrowseRegistry={() => setPage("discover")} onManageGlobalTargets={() => setPage("targets")} />;
  if (page === "discover") return <DiscoverPage />;
  if (page === "targets") return <TargetsPage />;
  if (page === "updates") return <UpdatesPage />;
  return <SettingsPage />;
}

function AppUpdateButton({ state, onError }: { state: AppUpdateState; onError: (message: string) => void }) {
  if (state.status !== "ready") return null;

  const label = state.version ? `Install app update ${state.version}` : "Install app update";

  const installAppUpdate = async () => {
    try {
      if (typeof skillerApi.installAppUpdate !== "function") {
        throw new Error("App update install is unavailable");
      }
      await skillerApi.installAppUpdate();
    } catch {
      onError("App update install failed");
    }
  };

  return (
    <Button type="button" size="sm" aria-label={label} onClick={() => void installAppUpdate()}>
      <HugeiconsIcon icon={DownloadCircle01Icon} strokeWidth={2} data-icon="inline-start" />
      Update
    </Button>
  );
}

export function App() {
  const [page, setPage] = useState<Page>("library");
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>({ status: "idle" });
  const [appUpdateMessage, setAppUpdateMessage] = useState<string | null>(null);
  const hasAppUpdateEvent = useRef(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        if (typeof skillerApi.getAppUpdateState !== "function") {
          throw new Error("App update state is unavailable");
        }
        const state = await skillerApi.getAppUpdateState();
        if (mounted && !hasAppUpdateEvent.current) {
          setAppUpdateState(state);
          setAppUpdateMessage(null);
        }
      } catch {
        if (mounted && !hasAppUpdateEvent.current) setAppUpdateMessage("App update check failed");
      }
    })();
    const removeListener =
      typeof skillerApi.onAppUpdateState === "function"
        ? skillerApi.onAppUpdateState((state) => {
            hasAppUpdateEvent.current = true;
            setAppUpdateState(state);
            setAppUpdateMessage(null);
          })
        : () => undefined;
    return () => {
      mounted = false;
      removeListener();
    };
  }, []);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="none" className="h-auto min-h-svh self-stretch">
          <SidebarHeader>
            <div className="flex items-start justify-between gap-2 px-2 py-1">
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="text-lg font-semibold">Skiller</h1>
                <p className="text-sm text-muted-foreground">Agent skill manager</p>
                {appUpdateMessage ? (
                  <p role="status" className="text-xs text-destructive">
                    {appUpdateMessage}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <AppUpdateButton state={appUpdateState} onError={setAppUpdateMessage} />
                <ModeToggle />
              </div>
            </div>
          </SidebarHeader>
          <Separator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {pages.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={page === item.id}
                        render={<Button variant="ghost" className="justify-start" onClick={() => setPage(item.id)} />}
                      >
                        <HugeiconsIcon icon={item.icon} strokeWidth={2} data-icon="inline-start" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <main className="min-h-svh bg-background p-6 text-foreground">
            {page === "updates" ? <h2 className="sr-only">Updates</h2> : null}
            {renderPage(page, setPage)}
          </main>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}
