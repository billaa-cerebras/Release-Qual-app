"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Package, GitBranch, Tag, GitBranchPlus, User, Tags, Rocket, Send, PlusCircle, Trash2, FileInput, Server, CheckCircle, XCircle, ExternalLink, Info, RefreshCw } from "lucide-react";
import { importFromConfluence, type ConfluenceImportResult } from "@/app/actions";
import { triggerJenkinsJobs } from "@/ai/flows/trigger-jenkins-flow";
import { checkJenkinsJobStatus } from "@/ai/flows/check-jenkins-flow";
import { modelReleaseSchema, type TriggerJenkinsJobsOutput, type ModelRelease } from "@/lib/schemas";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  releases: z.array(modelReleaseSchema),
});

type FormValues = z.infer<typeof formSchema>;

interface JobStatus {
  modelName: string;
  status: string; // e.g. QUEUED, BUILDING, SUCCESS, FAILURE
  message: string;
  url?: string; // Can be queueUrl or buildUrl
  buildUrl?: string; // The final build URL
}

const models = [
    { value: 'k2-think', label: 'k2-think' },
    { value: 'llama3.1-8b', label: 'llama3.1-8b' },
    { value: 'llama3.1-8b-pc', label: 'llama3.1-8b-pc' },
    { value: 'llama-3.3-70b', label: 'llama-3.3-70b' },
    { value: 'llama-3.3-1b-draft', label: 'llama-3.3-1b-draft' },
    { value: 'llama-4-scout-17b-16e-instruct', label: 'llama-4-scout-17b-16e-instruct' },
    { value: 'llama-4-maverick-17b-128e-instruct', label: 'llama-4-maverick-17b-128e-instruct' },
    { value: 'deepseek-r1-distill-llama-70b', label: 'deepseek-r1-distill-llama-70b' },
    { value: 'deepseek-r1-1b-draft', label: 'deepseek-r1-1b-draft' },
    { value: 'deepseek-v2-lite', label: 'deepseek-v2-lite' },
    { value: 'deepseek-v3-greedy', label: 'deepseek-v3-greedy' },
    { value: 'deepseek-v3.1-greedy', label: 'deepseek-v3.1-greedy' },
    { value: 'deepseek-v3.1-Terminus-greedy', label: 'deepseek-v3.1-Terminus-greedy' },
    { value: 'deepseek-v3-greedy-pc', label: 'deepseek-v3-greedy-pc' },
    { value: 'deepseek-v3-E64-greedy', label: 'deepseek-v3-E64-greedy' },
    { value: 'glm-4.5', label: 'glm-4.5' },
    { value: 'glm-4.5-air-pc', label: 'glm-4.5-air-pc' },
    { value: 'glm-4.5-pc', label: 'glm-4.5-pc' },
    { value: 'glm-4.6-pc', label: 'glm-4.6-pc' },
    { value: 'mistral-small-24b-instruct-2501', label: 'mistral-small-24b-instruct-2501' },
    { value: 'mistral-large-instruct-latest', label: 'mistral-large-instruct-latest' },
    { value: 'mistral-small-3.1-24b-instruct-2503', label: 'mistral-small-3.1-24b-instruct-2503' },
    { value: 'mistral-small-3.1-24b-instruct-2503-text', label: 'mistral-small-3.1-24b-instruct-2503-text' },
    { value: 'mistral-medium-latest', label: 'mistral-medium-latest' },
    { value: 'mistral-medium-3.1', label: 'mistral-medium-3.1' },
    { value: 'mistral-medium-3.1-yarn', label: 'mistral-medium-3.1-yarn' },
    { value: 'mistral-deepresearch-latest', label: 'mistral-deepresearch-latest' },
    { value: 'mistral-magistral-latest', label: 'mistral-magistral-latest' },
    { value: 'mistral-magistral-multimodal-latest', label: 'mistral-magistral-multimodal-latest' },
    { value: 'mbzuai-k2-think-2508', label: 'mbzuai-k2-think-2508' },
    { value: 'devstral-small-2507', label: 'devstral-small-2507' },
    { value: 'devstral-small-2507-pc', label: 'devstral-small-2507-pc' },
    { value: 'cognition-devstral-small-2508', label: 'cognition-devstral-small-2508' },
    { value: 'cognition-devstral-small-2508-pc', label: 'cognition-devstral-small-2508-pc' },
    { value: 'qwen-3-32b', label: 'qwen-3-32b' },
    { value: 'qwen-3-32b-yarn', label: 'qwen-3-32b-yarn' },
    { value: 'qwen-3-32b-yarn-pc', label: 'qwen-3-32b-yarn-pc' },
    { value: 'cohere-command-r-7b', label: 'cohere-command-r-7b' },
    { value: 'cohere-command-x', label: 'cohere-command-x' },
    { value: 'poolside-malibu', label: 'poolside-malibu' },
    { value: 'qwen-3-235b-a22b', label: 'qwen-3-235b-a22b' },
    { value: 'qwen-3-235b-a22b-yarn', label: 'qwen-3-235b-a22b-yarn' },
    { value: 'qwen-3-235b-a22b-instruct-2507', label: 'qwen-3-235b-a22b-instruct-2507' },
    { value: 'qwen-3-235b-a22b-thinking-2507', label: 'qwen-3-235b-a22b-thinking-2507' },
    { value: 'cognition-qwen-3-235b-a22b-thinking-2507', label: 'cognition-qwen-3-235b-a22b-thinking-2507' },
    { value: 'qwen-3-coder-480b', label: 'qwen-3-coder-480b' },
    { value: 'qwen-3-coder-480b-1b-draft', label: 'qwen-3-coder-480b-1b-draft' },
    { value: 'qwen-3-coder-30b-a3b-instruct', label: 'qwen-3-coder-30b-a3b-instruct' },
    { value: 'openai-gpt-oss-20b', label: 'openai-gpt-oss-20b' },
    { value: 'openai-gpt-oss-120b', label: 'openai-gpt-oss-120b' },
    { value: 'gpt-oss-20b', label: 'gpt-oss-20b' },
    { value: 'gpt-oss-120b', label: 'gpt-oss-120b' },
    { value: 'qwen-3-coder-480b-pc', label: 'qwen-3-coder-480b-pc' },
];

const tableHeaders = [
    { key: "modelName", label: "Model Name", required: true, icon: Package, description: "", isEditable: true },
    { key: "owner", label: "Owner", required: false, icon: User, description: "", isEditable: false },
    { key: "cs", label: "CS", required: false, icon: Server, description: "Systems", isEditable: false },
    { key: "branch", label: "Branch", required: true, icon: GitBranch, description: "e.g. inference/*", isEditable: true },
    { key: "appTag", label: "App-Tag", required: true, icon: Tag, description: "", isEditable: true },
    { key: "miqBranch", label: "MIQ Branch", required: false, icon: GitBranchPlus, description: "e.g. main", isEditable: true },
    { key: "profile", label: "Profile", required: false, icon: User, description: "e.g. /cb/home/user/ws/llama.yaml", isEditable: true },
    { key: "labels", label: "Labels", required: true, icon: Tags, description: "e.g. prp=rel-2542,etime=8h", isEditable: true },
    { key: "releaseTarget", label: "Release Target", required: true, icon: Rocket, description: "e.g. r2542", isEditable: true },
];

const initialFormValues: ModelRelease = { selected: true, modelName: "", branch: "", appTag: "", miqBranch: "main", profile: "", labels: "", releaseTarget: "", owner: "", cs: "" };

export default function BatchReleaseForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [confluenceUrl, setConfluenceUrl] = useState("");
  const { toast } = useToast();
  const [jobStatuses, setJobStatuses] = useState<JobStatus[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      releases: [initialFormValues],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "releases",
  });
  
  // Polling logic
  useEffect(() => {
    const jobsToPoll = jobStatuses.filter(job => 
        job.url && (job.status === 'QUEUED' || job.status === 'BUILDING')
    );
    
    if (jobsToPoll.length === 0) {
      return;
    }

    const intervalId = setInterval(async () => {
        const newStatuses = await Promise.all(jobStatuses.map(async (job) => {
            if (job.url && (job.status === 'QUEUED' || job.status === 'BUILDING')) {
                try {
                    const result = await checkJenkinsJobStatus({ url: job.url });
                    let newStatus = job.status;
                    let newUrl = job.url;
                    let finalBuildUrl = job.buildUrl;

                    if(result.status === 'QUEUED') {
                        newStatus = 'QUEUED';
                    } else if (result.building) {
                        newStatus = 'BUILDING';
                    } else {
                        newStatus = result.result || 'UNKNOWN';
                    }
                    
                    if (result.buildUrl) {
                        newUrl = result.buildUrl;
                        finalBuildUrl = result.buildUrl;
                    }
                    
                    return { ...job, status: newStatus, url: newUrl, buildUrl: finalBuildUrl };
                } catch(e) {
                    console.error("Polling failed for", job.modelName, e);
                    return { ...job, status: 'POLL_ERROR', message: "Polling failed." };
                }
            }
            return job;
        }));

        setJobStatuses(newStatuses);

    }, 10000); // 10 seconds

    return () => clearInterval(intervalId);
  }, [jobStatuses]);


  const watchedReleases = form.watch('releases');
  const selectedCount = watchedReleases.filter(r => r.selected).length;
  const isAllSelected = watchedReleases.length > 0 && selectedCount === watchedReleases.length;

  const onInvalid = (errors: any) => {
    const selectedIndices = form.getValues().releases.map((r, i) => r.selected ? i : -1).filter(i => i !== -1);
    const hasErrorsInSelected = selectedIndices.some(index => errors.releases?.[index]);

    if (hasErrorsInSelected) {
        toast({
          variant: "destructive",
          title: "Missing Information",
          description: "Please fill out all required fields for the selected models.",
        });
    }
  };

  async function onSubmit(values: FormValues) {
    const selectedReleases = values.releases.filter(release => release.selected);
    
    if (selectedReleases.length === 0) {
      toast({
        variant: "destructive",
        title: "No Models Selected",
        description: "Please select at least one model to submit.",
      });
      return;
    }

    setIsSubmitting(true);
    // Set initial status to QUEUED for immediate feedback
    setJobStatuses(selectedReleases.map(r => ({ modelName: r.modelName, status: 'QUEUED', message: 'Job is being submitted...' })));
    
    try {
      const result = await triggerJenkinsJobs(selectedReleases);
      
      // Update statuses with the result from the trigger flow
      setJobStatuses(result.details.map(d => ({ 
          modelName: d.modelName, 
          status: d.status,
          message: d.message, 
          url: d.url 
      })));
      
      if (result.success) {
        toast({
          title: "Batch Submitted!",
          description: `${selectedReleases.length} model release job(s) have been successfully triggered and are now being monitored.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Submission Error",
          description: `Some jobs failed to trigger. Check the results below for details.`,
        });
      }

    } catch (error: any) {
      console.error("Error submitting to Jenkins:", error);
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: error.message || "An unexpected error occurred while triggering Jenkins jobs.",
      });
      // Update table to show failure for all selected models on catastrophic failure
      setJobStatuses(selectedReleases.map(r => ({ modelName: r.modelName, status: 'FAILURE', message: error.message || "An unknown error occurred." })));
    } finally {
      setIsSubmitting(false);
    }
  }
  
  const getFieldClass = (fieldName: string) => {
     switch(fieldName) {
        case "modelName": return "w-60";
        case "owner": return "w-40";
        case "cs": return "w-20";
        case "labels": return "w-64";
        case "branch": return "w-48";
        case "releaseTarget": return "w-32";
        default: return "w-48";
     }
  }

  const handleImport = async () => {
    if (!confluenceUrl) {
      toast({
        variant: "destructive",
        title: "URL Required",
        description: "Please enter a Confluence URL to import.",
      });
      return;
    }
    setIsImporting(true);
    try {
      const result: ConfluenceImportResult = await importFromConfluence(confluenceUrl);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (result.data && result.data.models) {
        const importedModels = result.data.models;
        const releaseTarget = result.data.releaseTarget || "";
        
        const releaseNumberMatch = releaseTarget.match(/\d{4}/);
        const releaseNumber = releaseNumberMatch ? releaseNumberMatch[0] : '';
        const labels = releaseNumber ? `prp=rel-${releaseNumber},etime=8h` : "";
        
        if (importedModels.length === 0) {
            toast({
              variant: "destructive",
              title: "Import Failed",
              description: "No valid models with both a 'Model' and 'Branch' found in the 'Overview' table.",
            });
            setIsImporting(false);
            return;
        }

        const validModelValues = models.map(m => m.value);

        const newReleases = importedModels.map((model) => ({
          ...initialFormValues,
          modelName: validModelValues.includes(model.modelName) ? model.modelName : "",
          branch: model.branch || "",
          owner: model.owner || "",
          cs: model.cs || "",
          releaseTarget: releaseTarget,
          labels: labels,
          selected: true,
        }));

        replace(newReleases);

        toast({
          title: "Import Successful",
          description: `Successfully imported ${newReleases.length} models. Please verify the model names.`,
        });
      } else {
        throw new Error("No models found on the page or the data was malformed.");
      }

    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Import Error",
        description: e.message || "An unexpected error occurred while importing from Confluence.",
      });
    } finally {
      setIsImporting(false);
    }
  }

  const allSelected = form.watch('releases').every(r => r.selected);
  const toggleSelectAll = () => {
    const currentValues = form.getValues().releases;
    const newValues = currentValues.map(r => ({ ...r, selected: !allSelected }));
    replace(newValues);
  }
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <Badge variant="default" className="bg-green-600 hover:bg-green-700"><CheckCircle className="mr-1 h-3 w-3" /> SUCCESS</Badge>;
      case 'FAILURE':
      case 'POLL_ERROR':
        return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" /> FAILURE</Badge>;
      case 'ABORTED':
        return <Badge variant="secondary"><XCircle className="mr-1 h-3 w-3" /> ABORTED</Badge>;
      case 'QUEUED':
        return <Badge variant="secondary" className="bg-yellow-500/80 text-white hover:bg-yellow-600/80"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> QUEUED</Badge>;
      case 'BUILDING':
        return <Badge variant="secondary" className="bg-blue-500 hover:bg-blue-600"><RefreshCw className="mr-1 h-3 w-3 animate-spin" /> BUILDING</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };


  return (
    <>
      <Card className="w-full shadow-lg border-2 border-transparent hover:border-primary/20 transition-all duration-300">
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Confluence Import</CardTitle>
          <CardDescription>
            Paste a Confluence URL below to automatically populate the release queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex w-full max-w-2xl items-center space-x-2">
              <Input
                type="url"
                placeholder="https://.../..."
                value={confluenceUrl}
                onChange={(e) => setConfluenceUrl(e.target.value)}
                disabled={isImporting}
                className="text-base"
              />
              <Button type="button" onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <FileInput className="mr-2 h-4 w-4" />
                     Import
                  </>
                )}
              </Button>
          </div>

          <Separator />

          <div>
            <h3 className="font-headline text-2xl mb-4">Release Queue</h3>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                           <Checkbox
                                checked={isAllSelected}
                                onCheckedChange={toggleSelectAll}
                                aria-label="Select all rows"
                            />
                        </TableHead>
                        {tableHeaders.map(header => (
                          <TableHead key={header.key} className={cn(getFieldClass(header.key))}>
                            <div className="flex items-center gap-2">
                              <header.icon className="h-4 w-4 text-muted-foreground" />
                              {header.label}
                              {header.required && <span className="text-destructive">*</span>}
                            </div>
                          </TableHead>
                        ))}
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.map((field, index) => (
                        <TableRow key={field.id} className={cn("align-top", !form.watch(`releases.${index}.selected`) && "bg-muted/30 hover:bg-muted/40 text-muted-foreground")}>
                          <TableCell className="p-2">
                              <FormField
                                  control={form.control}
                                  name={`releases.${index}.selected`}
                                  render={({ field }) => (
                                      <FormItem>
                                          <FormControl>
                                              <Checkbox
                                                  checked={field.value}
                                                  onCheckedChange={field.onChange}
                                                  className="translate-y-[2px]"
                                              />
                                          </FormControl>
                                      </FormItem>
                                  )}
                              />
                          </TableCell>
                          {tableHeaders.map(header => (
                            <TableCell key={header.key} className="p-2">
                              <FormField
                                  control={form.control}
                                  name={`releases.${index}.${header.key as keyof z.infer<typeof modelReleaseSchema>}`}
                                  render={({ field }) => (
                                    <FormItem>
                                      {header.key === 'modelName' ? (
                                        <Combobox
                                          options={models}
                                          value={field.value as string}
                                          onChange={field.onChange}
                                          placeholder="Select a model"
                                          searchPlaceholder="Search models..."
                                          notFoundText="No models found."
                                        />
                                      ) : (
                                         <FormControl>
                                          <div className="space-y-1">
                                            <Input 
                                              {...field}
                                              value={field.value as string}
                                              autoComplete="off"
                                              readOnly={!header.isEditable}
                                              className={cn(!header.isEditable && "bg-muted/50 border-none")}
                                            />
                                            {header.description && (
                                              <FormDescription className="text-xs">
                                                {header.description}
                                              </FormDescription>
                                            )}
                                          </div>
                                        </FormControl>
                                      )}
                                      <FormMessage className="text-xs" />
                                    </FormItem>
                                  )}
                                />
                            </TableCell>
                          ))}
                          <TableCell className="p-2">
                            <Button variant="ghost" size="icon" onClick={() => remove(index)} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-5 w-5" />
                            </Button>                        
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="mt-4"
                    onClick={() => append(initialFormValues)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Model
                </Button>
                
                <div className="flex justify-end mt-8">
                  <Button type="submit" size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground text-base font-bold" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        {isAllSelected ? 'Submit All' : `Submit ${selectedCount} Selected`}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </CardContent>
      </Card>
      
      <Card className="w-full shadow-lg mt-8">
          <CardHeader>
              <CardTitle className="font-headline text-2xl">Submission Results</CardTitle>
              <CardDescription>
                  Live status of the batch submission. Click the URL to see the build in Jenkins.
              </CardDescription>
          </CardHeader>
          <CardContent>
            {jobStatuses.length === 0 ? (
                 <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Awaiting Submission</AlertTitle>
                    <AlertDescription>
                        Submit models in the queue to see their job status and build URLs here.
                    </AlertDescription>
                </Alert>
            ) : (
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead className="w-[250px]">Model Name</TableHead>
                          <TableHead className="w-[150px]">Status</TableHead>
                          <TableHead>Details</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {jobStatuses.map((job, index) => (
                          <TableRow key={index}>
                              <TableCell className="font-medium">{job.modelName}</TableCell>
                              <TableCell>
                                {getStatusBadge(job.status)}
                              </TableCell>
                              <TableCell>
                                  {job.buildUrl ? (
                                      <a href={job.buildUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                                          View Build <ExternalLink className="h-4 w-4" />
                                      </a>
                                  ) : (
                                      <span className="text-sm text-muted-foreground">{job.message}</span>
                                  )}
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
            )}
          </CardContent>
      </Card>
    </>
  );
}
