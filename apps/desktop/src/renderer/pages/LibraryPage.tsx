import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { skillerApi, type SkillMetadata } from "../lib/api.js";

export function LibraryPage() {
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void skillerApi
      .listLibrary()
      .then((result) => {
        setSkills(result);
        setError(null);
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setIsLoading(false));
  }, []);

  const invalidSkills = useMemo(() => skills.filter((skill) => !skill.validation?.valid), [skills]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Library</CardTitle>
        <CardDescription>Installed master skills</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Library unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{skills.length} master skills</Badge>
          {invalidSkills.length > 0 ? <Badge variant="destructive">{invalidSkills.length} invalid</Badge> : null}
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enabled Targets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.map((skill) => (
                <TableRow key={skill.id}>
                  <TableCell>{skill.name || skill.id}</TableCell>
                  <TableCell>
                    {skill.validation?.valid ? (
                      <Badge variant="outline">valid</Badge>
                    ) : (
                      <Badge variant="destructive">invalid</Badge>
                    )}
                  </TableCell>
                  <TableCell>{skill.enabledTargets.length}</TableCell>
                </TableRow>
              ))}
              {skills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No skills installed.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
