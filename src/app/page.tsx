"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BatchReleaseForm } from "@/components/batch-release-form";
import { SubmissionDetails } from "@/components/submission-details";
import { ReleaseReport } from "@/components/release-report";
import { Rocket, GitPullRequest, FileText } from "lucide-react";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState("release-queue");
  const [viewingReleaseId, setViewingReleaseId] = useState("");

  const handleSubmission = (releaseId: string) => {
    setViewingReleaseId(releaseId);
    setActiveTab("observability");
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold tracking-tight mb-6">Core Release Qualification Center</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 md:w-1/2">
          <TabsTrigger value="release-queue">
            <Rocket className="mr-2 h-4 w-4" /> Release Execution
          </TabsTrigger>
          <TabsTrigger value="observability">
            <GitPullRequest className="mr-2 h-4 w-4" /> Release Observability
          </TabsTrigger>
          <TabsTrigger value="release-report">
            <FileText className="mr-2 h-4 w-4" /> Release Report
          </TabsTrigger>
        </TabsList>
        <TabsContent value="release-queue" forceMount className="mt-6 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=inactive]:hidden">
          <BatchReleaseForm onSubmission={handleSubmission} />
        </TabsContent>
        <TabsContent value="observability" forceMount className="mt-6 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=inactive]:hidden">
          <SubmissionDetails initialReleaseId={viewingReleaseId} />
        </TabsContent>
        <TabsContent value="release-report" forceMount className="mt-6 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=inactive]:hidden">
          <ReleaseReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}