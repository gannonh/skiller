import { useState, type ComponentType } from "react";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@workspace/ui/components/sidebar";
import { Toaster } from "@workspace/ui/components/sonner";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { DiscoverPage } from "./pages/DiscoverPage.js";
import { LibraryPage } from "./pages/LibraryPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { TargetsPage } from "./pages/TargetsPage.js";
import { UpdatesPage } from "./pages/UpdatesPage.js";

type Page = "library" | "discover" | "targets" | "updates" | "settings";

const pages: Array<{ id: Page; label: string }> = [
  { id: "library", label: "Library" },
  { id: "discover", label: "Discover" },
  { id: "targets", label: "Targets" },
  { id: "updates", label: "Updates" },
  { id: "settings", label: "Settings" },
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
        <Sidebar collapsible="none">
          <SidebarHeader>
            <div className="flex flex-col gap-1 px-2 py-1">
              <h1 className="text-lg font-semibold">Skiller</h1>
              <p className="text-sm text-muted-foreground">Agent skill manager</p>
            </div>
          </SidebarHeader>
          <Separator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {pages.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton isActive={page === item.id} render={<Button variant="ghost" onClick={() => setPage(item.id)} />}>
                        {item.label}
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
