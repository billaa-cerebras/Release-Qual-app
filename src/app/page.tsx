"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BatchReleaseForm } from "@/components/batch-release-form";
import { SubmissionDetails } from "@/components/submission-details";
import { ReleaseReport } from "@/components/release-report";
import { Rocket, GitPullRequest, FileText } from "lucide-react";

const TITLE_IMAGE_SRC =
  "https://media.licdn.com/dms/image/v2/D560BAQHNvGy6jnYPmg/company-logo_200_200/B56ZVDV63eHoAI-/0/1740591574812/cerebras_systems_logo?e=2147483647&v=beta&t=dy3IuJzO5Ui2tLfLlVcme5rAWQG5U4WsNDVJ_b4Ccpo";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState("release-execution");
  const [viewingReleaseId, setViewingReleaseId] = useState("");

  const handleSubmission = (releaseId: string) => {
    setViewingReleaseId(releaseId);
    setActiveTab("release-observability");
  };

  return (
    <div className="mx-auto w-full px-4 md:px-8 py-6">
      <div className="flex items-center gap-6 mb-10">
        <img
          src={TITLE_IMAGE_SRC}
          alt="Cerebras Logo"
          className="w-16 h-16 object-contain rounded-lg"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div className="flex flex-col">
          <h1 className="font-headline text-3xl sm:text-5xl md:text-5xl font-extrabold tracking-tight leading-tight">
            Inference Core Release Qualification Center
          </h1>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid justify-center w-full max-w-3xl grid-cols-3">
          <TabsTrigger value="release-execution" className="flex items-center gap-2 text-lg ">
            <Rocket className="h-6 w-6" />
            <span>Release Execution</span>
          </TabsTrigger>
          <TabsTrigger value="release-observability" className="flex items-center gap-2 text-lg ">
            <GitPullRequest className="h-6 w-6" />
            <span>Release Observability</span>
          </TabsTrigger>
          <TabsTrigger value="release-report" className="flex items-center gap-2 text-lg ">
            <FileText className="h-6 w-6" />
            <span>Release Report</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="release-execution"
          forceMount
          className="mt-6 data-[state=inactive]:hidden"
        >
          <BatchReleaseForm onSubmission={handleSubmission} />
        </TabsContent>

        <TabsContent
          value="release-observability"
          forceMount
          className="mt-6 data-[state=inactive]:hidden"
        >
          <SubmissionDetails initialReleaseId={viewingReleaseId} />
        </TabsContent>

        <TabsContent
          value="release-report"
          forceMount
          className="mt-6 data-[state=inactive]:hidden"
        >
          <ReleaseReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}