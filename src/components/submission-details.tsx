"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  GitPullRequest,
  ShieldAlert,
  Info,
  ExternalLink,
  Beaker,
  Activity,
  Clock,
  Monitor
} from "lucide-react";
import { getJobsByReleaseId, checkJenkinsJobStatusAction } from "@/app/flow-actions";
import { type IJob, JobType, JobStatus, PrecheckStatus } from "@/models/Job";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";

interface SubmissionDetailsProps {
  initialReleaseId?: string;
}

const getStatusBadge = (status: JobStatus) => {
  switch (status) {
    case "SUCCESS":
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
          <CheckCircle className="mr-1 h-3 w-3" /> SUCCESS
        </Badge>
      );
    case "FAILURE":
    case "POLL_ERROR":
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" /> FAILURE
        </Badge>
      );
    case "ABORTED":
      return (
        <Badge variant="secondary">
          <XCircle className="mr-1 h-3 w-3" /> ABORTED
        </Badge>
      );
    case "QUEUED":
      return (
        <Badge
          variant="secondary"
          className="bg-yellow-500/80 text-white hover:bg-yellow-600/80"
        >
          <Loader2 className="mr-1 h-3 w-3 animate-spin" /> QUEUED
        </Badge>
      );
    case "BUILDING":
      return (
        <Badge variant="secondary" className="bg-blue-500 hover:bg-blue-600">
          <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> BUILDING
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getPrecheckStatusBadge = (status: PrecheckStatus) => {
  switch (status) {
    case "SUCCESS":
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
          <CheckCircle className="mr-1 h-3 w-3" /> SUCCESS
        </Badge>
      );
    case "FAILURE":
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" /> FAILURE
        </Badge>
      );
    case "PENDING":
      return (
        <Badge variant="secondary" className="bg-blue-500 hover:bg-blue-600">
          <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> PENDING
        </Badge>
      );
    case "BUILDING":
      return (
        <Badge variant="secondary" className="bg-blue-500 hover:bg-blue-600">
          <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> BUILDING
        </Badge>
      );
    case "NOT_STARTED":
    default:
      return <Badge variant="outline">{status || "NOT_STARTED"}</Badge>;
  }
};

const isTerminalStatus = (status: JobStatus | PrecheckStatus) =>
  ["SUCCESS", "FAILURE", "ABORTED", "POLL_ERROR"].includes(status as string);

const releaseIdRegex = /^r\d{4}$/;

export function SubmissionDetails({ initialReleaseId = "" }: SubmissionDetailsProps) {
  const [inputValue, setInputValue] = useState(initialReleaseId);
  const [releaseIdToFetch, setReleaseIdToFetch] = useState(initialReleaseId);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [releaseJobs, setReleaseJobs] = useState<IJob[]>([]);
  const [precheckJobs, setPrecheckJobs] = useState<IJob[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleRefresh = useCallback(
    async (id: string, isAutoPoll = false) => {
      if (!id) return;
      if (!isAutoPoll) setIsRefreshing(true);

      try {
        await checkJenkinsJobStatusAction({ releaseId: id });
        const [releases, prechecks] = await Promise.all([
          getJobsByReleaseId(id, "RELEASE"),
          getJobsByReleaseId(id, "PRECHECK")
        ]);
        setReleaseJobs(releases);
        setPrecheckJobs(prechecks);

        if (!isAutoPoll) {
          toast({ title: "Details Refreshed", description: `Fetched latest status for '${id}'.` });
        }

        const hasActiveJobs = [...releases, ...prechecks].some((job) =>
          !isTerminalStatus(job.type === "RELEASE" ? job.status : job.precheckStatus)
        );

        if (!hasActiveJobs && pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      } catch (error) {
        console.error(`Failed to fetch jobs:`, error);
        if (!isAutoPoll) {
          toast({ variant: "destructive", title: "Error", description: "Could not fetch job details." });
        }
      } finally {
        if (!isAutoPoll) setIsRefreshing(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (releaseIdToFetch && releaseIdRegex.test(releaseIdToFetch)) {
      handleRefresh(releaseIdToFetch);
      pollingIntervalRef.current = setInterval(() => {
        handleRefresh(releaseIdToFetch, true);
      }, 10000);
    }
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [releaseIdToFetch, handleRefresh]);

  useEffect(() => {
    setInputValue(initialReleaseId);
    setReleaseIdToFetch(initialReleaseId);
    setValidationError(null);
  }, [initialReleaseId]);

  const onRefreshClick = () => {
    if (!releaseIdRegex.test(inputValue)) {
      setValidationError('"Release-ID : rXXXX", Eg : r2540');
      return;
    }
    setValidationError(null);
    setReleaseIdToFetch(inputValue);
  };

  const renderJobsTable = (jobs: IJob[], type: JobType) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[250px]">Model Name</TableHead>
          <TableHead className="w-[150px]">Status</TableHead>
          <TableHead>Details</TableHead>
          <TableHead className="w-[200px]">Submitted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job._id}>
            <TableCell className="font-medium">{job.modelName}</TableCell>
            <TableCell>
              {type === "RELEASE" ? getStatusBadge(job.status) : getPrecheckStatusBadge(job.precheckStatus)}
            </TableCell>
            <TableCell>
              {job.jenkinsUrl && !job.jenkinsUrl.includes("/queue/item/") ? (
                <a
                  href={job.jenkinsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  View Build <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {job.precheckResult || job.message || "No details available."}
                </span>
              )}
            </TableCell>
            <TableCell>{new Date(job.submittedAt).toLocaleString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const releaseTimeHref = releaseIdRegex.test(releaseIdToFetch)
    ? `http://dashboards.cerebras.aws:3006/?release=${releaseIdToFetch}`
    : "http://dashboards.cerebras.aws:3006/";
  const releaseTimeDisabled = !releaseIdRegex.test(releaseIdToFetch);

  return (
    <Card>
      <CardHeader>

        {/* Uniform 4-button row, full width, centered content */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Button
            asChild
            variant="outline"
            className="w-full justify-center text-center"
            size="sm"
          >
            <Link href="http://dashboards.cerebras.aws:5002/release_qual_status" target="_blank">
              <Beaker className="mr-2 h-4 w-4" />
              Release Qual Status
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="w-full justify-center text-center"
            size="sm"
          >
            <Link href="http://dashboards.cerebras.aws:3001/" target="_blank">
              <Activity className="mr-2 h-4 w-4" />
              Release Metrics
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="w-full justify-center text-center"
            size="sm"
            disabled={releaseTimeDisabled}
            title={
              releaseTimeDisabled
                ? "Enter a valid Release ID (r####) to enable"
                : "Open Release Time dashboard"
            }
          >
            <a href={releaseTimeHref} target="_blank" rel="noopener noreferrer">
              <Clock className="mr-2 h-4 w-4" />
              Release Runtime
            </a>
          </Button>

          <Button
            asChild
            variant="outline"
            className="w-full justify-center text-center"
            size="sm"
          >
            <Link href="http://mohitk-dev:5000" target="_blank">
              <Monitor className="mr-2 h-4 w-4" />
              Job Monitor
            </Link>
          </Button>
        </div>

        {/* Input / Fetch */}
        <div>
          <div className="flex w-full max-w-sm items-center space-x-2">
            <Input
              type="text"
              placeholder="e.g., r2540"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (validationError) setValidationError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && onRefreshClick()}
            />
            <Button onClick={onRefreshClick} disabled={isRefreshing || !inputValue}>
              {isRefreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Fetch
            </Button>
          </div>
          {validationError && (
            <p className="text-sm text-destructive mt-2">{validationError}</p>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {!releaseIdToFetch || validationError ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Enter a Release ID</AlertTitle>
            <AlertDescription>
              Please provide a valid Release ID above (e.g., r2540) to see job details.
            </AlertDescription>
          </Alert>
        ) : (
          <Tabs defaultValue="releases">
            <TabsList>
              <TabsTrigger value="releases">
                <GitPullRequest className="mr-2 h-4 w-4" />
                Release Jobs
              </TabsTrigger>
              <TabsTrigger value="pre-checks">
                <ShieldAlert className="mr-2 h-4 w-4" />
                Pre-check Jobs
              </TabsTrigger>
            </TabsList>
            <TabsContent value="releases">
              {releaseJobs.length > 0 ? (
                renderJobsTable(releaseJobs, "RELEASE")
              ) : (
                <p className="text-sm text-muted-foreground mt-4">
                  No release jobs found for this ID.
                </p>
              )}
            </TabsContent>
            <TabsContent value="pre-checks">
              {precheckJobs.length > 0 ? (
                renderJobsTable(precheckJobs, "PRECHECK")
              ) : (
                <p className="text-sm text-muted-foreground mt-4">
                  No pre-check jobs found for this ID.
                </p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}