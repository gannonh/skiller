import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";

export function SettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Library, scan, startup, and tray behavior</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm">
          <span>Master library path</span>
          <Input aria-label="Master library path" defaultValue="~/skiller" />
        </label>
        <Separator />
        <p className="text-sm text-muted-foreground">Default library path: ~/skiller</p>
      </CardContent>
    </Card>
  );
}
