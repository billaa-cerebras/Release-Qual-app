"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText } from "lucide-react";

export function ReleaseReport() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <FileText className="mr-2 h-5 w-5" />
          Release Report
        </CardTitle>
        <CardDescription>
          This section will display detailed reports for completed releases.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">[WIP] : Once ready we will integrate here</p>
        </div>
      </CardContent>
    </Card>
  );
}