import { useState, type ComponentType } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowReloadHorizontalIcon,
  BookOpenIcon,
  DiscoverSquareIcon,
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

type Page = "library" | "discover" | "targets" | "updates" | "settings";

const pages: Array<{ id: Page; label: string; icon: typeof BookOpenIcon }> = [
  { id: "library", label: "Library", icon: BookOpenIcon },
  { id: "discover", label: "Discover", icon: DiscoverSquareIcon },
  { id: "targets", label: "Targets", icon: FolderTreeIcon },
  { id: "updates", label: "Updates", icon: ArrowReloadHorizontalIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const pageComponents: Record<Page, ComponentType> = {
  library: LibraryPage,
  discover: DiscoverPage,
  targets: TargetsPage,
  updates: UpdatesPage,
  settings: SettingsPage,
};

export function App() {
  const [page, setPage] = useState<Page>("library");
  const ActivePage = pageComponents[page];

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="none" className="min-h-svh">
          <SidebarHeader>
            <div className="flex items-start justify-between gap-2 px-2 py-1">
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="text-lg font-semibold">Skiller</h1>
                <p className="text-sm text-muted-foreground">Agent skill manager</p>
              </div>
              <ModeToggle />
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
            <ActivePage />
          </main>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}
