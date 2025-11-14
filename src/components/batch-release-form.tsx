// src/components/batch-release-form.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Loader2,
  Package,
  GitBranch,
  GitMerge,
  Tag,
  User,
  Tags,
  Rocket,
  Send,
  PlusCircle,
  Trash2,
  FileInput,
  Server,
  ShieldQuestion,
  Blocks,
  Boxes,
  Link,
  Edit,
  XCircle,
  LayoutDashboard,
  ClipboardCheck,
  // +++ NEW ICONS +++
  CheckCircle,
  Hourglass,
  AlertCircle 
} from "lucide-react";
import { importFromConfluence, type ConfluenceImportResult } from "@/app/actions";
import { getModels, addModel } from "@/app/model-actions";
import {
  triggerPrecheckJobsAction,
  triggerReleaseJobsAction,
  getPrecheckStatusForModels,
  initializeReleaseSetupAction, // This is now our "check" and "save" action
  isDashboardInitializedForRelease,
  editReleaseDashboardAction,
  cloneJenkinsJobAction,        // <-- Import clone action
  initializeDashboardAction,  // <-- Import new dashboard action
  createJiraTicketsAction     // <-- Import new Jira action
} from "@/app/flow-actions";
import { modelReleaseSchema, type ModelRelease } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
// +++ Import Dialog for the progress pop-up +++
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formSchema = z.object({
  releases: z.array(modelReleaseSchema),
});

type FormValues = z.infer<typeof formSchema>;

// ... (tableHeaders and initialFormValues are unchanged from your file) ...
const tableHeaders = [
  { key: "modelName", label: "Model Name", required: true, icon: Package, isEditable: true },
  { key: "owner", label: "Owner", required: true, icon: User, isEditable: true },
  { key: "cs", label: "CS", required: false, icon: Server, isEditable: true },
  { key: "branch", label: "Branch", required: true, icon: GitBranch, isEditable: true },
  { key: "miqBranch", label: "MIQ Branch", required: true, icon: GitMerge, isEditable: true },
  { key: "customProfile", label: "Custom Profile", required: false, icon: FileInput, isEditable: true },
  { key: "appTag", label: "App-Tag", required: true, icon: Tag, isEditable: true },
  { key: "multibox", label: "MULTIBOX", required: true, icon: Boxes, isEditable: true },
  { key: "usernoode", label: "Usernode", required: true, icon: Blocks, isEditable: true }, 
  { key: "monitorLink", label: "Monitor Link", required: false, icon: Link, isEditable: true },
  { key: "labels", label: "Labels", required: true, icon: Tags, isEditable: true },
  { key: "releaseTarget", label: "Release Target", required: true, icon: Rocket, isEditable: true },
];

const initialFormValues: ModelRelease = {
  selected: true, modelName: "", branch: "", appTag: "none", miqBranch: "main",
  multibox: "dh1", usernoode: "net004-us-sr04.sck2.cerebrascloud.com", 
  monitorLink: "mohitk-dev:5000", profile: "", labels: "", releaseTarget: "",
  owner: "", cs: "", customProfile: "",
};

// +++ NEW TYPE for Progress State +++
type TaskStatus = 'pending' | 'loading' | 'success' | 'failed';
interface TaskState {
  status: TaskStatus;
  message: string;
}
interface ProgressState {
  dashboard: TaskState;
  jenkins: TaskState;
  jira: TaskState;
  save: TaskState;
}

// +++ NEW HELPER: Get initial progress state +++
const getInitialProgressState = (): ProgressState => ({
  dashboard: { status: 'pending', message: 'Initialize Dashboard' },
  jenkins: { status: 'pending', message: 'Clone Jenkins Job' },
  jira: { status: 'pending', message: 'Create Jira Tickets' },
  save: { status: 'pending', message: 'Save Release Links' },
});

// +++ NEW HELPER: Render status icon +++
const ProgressStatusIcon = ({ status }: { status: TaskStatus }) => {
  switch (status) {
    case 'loading':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case 'pending':
    default:
      return <Hourglass className="h-4 w-4 text-muted-foreground" />;
  }
};


interface BatchReleaseFormProps {
  onSubmission: (releaseId: string) => void;
}

export function BatchReleaseForm({ onSubmission }: BatchReleaseFormProps) {
  const [isSubmittingPrecheck, setIsSubmittingPrecheck] = useState(false);
  const [isSubmittingRelease, setIsSubmittingRelease] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isInitializingRelease, setIsInitializingRelease] = useState(false);
  const [isSubmittingPostcheck, setIsSubmittingPostcheck] = useState(false);
  const [isSubmittingDashboardEdit, setIsSubmittingDashboardEdit] = useState(false);
  const [confluenceUrl, setConfluenceUrl] = useState("");
  const { toast } = useToast();
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [modelToCreate, setModelToCreate] = useState<string | null>(null);
  const [precheckStatus, setPrecheckStatus] = useState<Record<string, string>>({});
  const [releaseConfirmation, setReleaseConfirmation] = useState(false);
  const [dashboardValidationAlert, setDashboardValidationAlert] = useState(false);
  const [dashboardValidationAlertMsg, setDashboardValidationAlertMsg] = useState("");
  const [showEditConfirmation, setShowEditConfirmation] = useState(false);
  const [globalFillField, setGlobalFillField] = useState<string>("");
  const [globalFillValue, setGlobalFillValue] = useState<string>("");
  
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [progress, setProgress] = useState<ProgressState>(getInitialProgressState());

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { releases: [initialFormValues] }
  });

  const { control, watch, setValue, getValues, clearErrors, trigger } = form;

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "releases"
  });

  // ... (all helper functions like fetchModels, handleAddNewModelRequest, confirmAddNewModel, handleImport, getFieldClass, handleGlobalFill, handleGlobalClear, ensureDashboardInitialized remain UNCHANGED) ...
  const fetchModels = useCallback(async () => {
    try {
      const dbModels = await getModels();
      setModels(dbModels.map((m: { name: string }) => ({ value: m.name, label: m.name })));
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not fetch models." });
    }
  }, [toast]);
  useEffect(() => { fetchModels(); }, [fetchModels]);
  const handleAddNewModelRequest = (newModelName: string) => setModelToCreate(newModelName);
  const confirmAddNewModel = async () => {
    if (!modelToCreate) return;
    try {
      await addModel(modelToCreate);
      await fetchModels();
      toast({ title: "Model Added", description: `"${modelToCreate}" has been added.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Adding Model", description: error.message });
    } finally {
      setModelToCreate(null);
    }
  };
  const handleImport = async () => {
    if (!confluenceUrl) {
      toast({ variant: "destructive", title: "URL Required", description: "Please enter a Confluence URL." });
      return;
    }
    setIsImporting(true);
    try {
      const result: ConfluenceImportResult = await importFromConfluence(confluenceUrl);
      if (result.error) throw new Error(result.error);
      if (result.data?.models) {
        const { models: importedModels, releaseTarget } = result.data;
        const releaseNumber = releaseTarget?.match(/\d{4}/)?.[0] || "";
        const labels = releaseNumber ? `prp=rel-${releaseNumber},etime=8h` : "";
        const newReleases = importedModels.map(model => ({
          ...initialFormValues,
          ...model,
          releaseTarget: releaseTarget || "",
          labels: labels || model.labels || initialFormValues.labels,
          profile: model.profile || initialFormValues.profile,
          selected: true,
        }));
        replace(newReleases);
        clearErrors();
        toast({ title: "Import Successful", description: `Imported ${newReleases.length} models for ${releaseTarget || 'unknown release'}.` });
      } else {
        throw new Error("No valid models found in the Confluence page table.");
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Import Error", description: e.message });
    } finally {
      setIsImporting(false);
    }
  };
  const getFieldClass = (fieldName: string) =>
    ({
      "w-60": fieldName === "modelName" || fieldName === "monitorLink",
      "w-40": fieldName === "owner",
      "w-20": fieldName === "cs",
      "w-64": fieldName === "labels",
      "w-48": ["branch", "miqBranch", "multibox", "appTag", "usernoode"].includes(fieldName),
      "w-32": fieldName === "releaseTarget"
    }[fieldName] || "w-48");
  const handleGlobalFill = () => {
    if (!globalFillField) {
      toast({ variant: "destructive", title: "Field Not Selected", description: "Please select a field to fill." });
      return;
    }
    const currentReleases = getValues().releases;
    let filledCount = 0;
    currentReleases.forEach((release, index) => {
      if (release.selected) {
        setValue(`releases.${index}.${globalFillField as keyof ModelRelease}`, globalFillValue);
        filledCount++;
      }
    });
    if (filledCount > 0) {
      toast({ title: "Batch Edit Successful", description: `Updated '${tableHeaders.find(h => h.key === globalFillField)?.label || globalFillField}' for ${filledCount} selected rows.` });
    } else {
      toast({ variant: "destructive", title: "No Rows Selected", description: "Please select at least one row to fill." });
    }
  };
  const handleGlobalClear = () => {
    if (!globalFillField) {
      toast({ variant: "destructive", title: "Field Not Selected", description: "Please select a field to clear." });
      return;
    }
    const currentReleases = getValues().releases;
    let clearedCount = 0;
    currentReleases.forEach((release, index) => {
      if (release.selected) {
        setValue(`releases.${index}.${globalFillField as keyof ModelRelease}`, "");
        clearedCount++;
      }
    });
    if (clearedCount > 0) {
      toast({ title: "Batch Edit Successful", description: `Cleared '${tableHeaders.find(h => h.key === globalFillField)?.label || globalFillField}' for ${clearedCount} selected rows.` });
    } else {
      toast({ variant: "destructive", title: "No Rows Selected", description: "Please select at least one row to clear." });
    }
  };
  const ensureDashboardInitialized = async (
    selectedReleases: ModelRelease[],
    actionLabel: string
  ): Promise<boolean> => {
    const releaseTarget = selectedReleases[0]?.releaseTarget;
    if (!releaseTarget) {
      setDashboardValidationAlertMsg("Release Target missing. Please fill 'Release Target' for selected models before triggering jobs.");
      setDashboardValidationAlert(true);
      return false;
    }
    try {
      const ready = await isDashboardInitializedForRelease(releaseTarget);
      if (!ready) {
        setDashboardValidationAlertMsg(`Dashboard not initialized for release: ${releaseTarget}. Please initialize the release first via the 'Initialize Release' button. (${actionLabel} blocked)`);
        setDashboardValidationAlert(true);
        return false;
      }
      return true;
    } catch (e: any) {
      setDashboardValidationAlertMsg(`Dashboard check failed: ${e.message}. (${actionLabel} blocked until resolved)`);
      setDashboardValidationAlert(true);
      return false;
    }
  };


  // --- Main Submit Handler (Unchanged) ---
  const handleSubmit = async (type: 'PRECHECK' | 'RELEASE' | 'POSTCHECK' | 'INITIALIZE_RELEASE') => {
    // ... (This function remains exactly as it was in your working file) ...
    const formValues = getValues();
    const selectedReleases = formValues.releases.filter(r => r.selected);

    if (type === 'INITIALIZE_RELEASE') {
      const releaseTarget = selectedReleases[0]?.releaseTarget;
      if (selectedReleases.length === 0 || !releaseTarget) {
        setDashboardValidationAlertMsg("Please select models and ensure 'Release Target' is filled before initializing the release setup.");
        setDashboardValidationAlert(true);
        return;
      }
    }
    await trigger();
    if (selectedReleases.length === 0) {
      toast({ variant: "destructive", title: "No Models Selected", description: "Please select at least one model row using the checkbox." });
      return;
    }
    const invalidModels = selectedReleases.filter(r => !models.some(m => m.value === r.modelName));
    if (invalidModels.length > 0) {
      toast({
        variant: "destructive",
        title: "Invalid Models Found",
        description: `The following selected models are not recognized: ${invalidModels.map(r => r.modelName).join(', ')}. Please add them first or correct the names.`
      });
      return;
    }
    const firstReleaseId = selectedReleases[0].releaseTarget;
    if (!selectedReleases.every(r => r.releaseTarget === firstReleaseId)) {
      toast({
        variant: "destructive",
        title: "Multiple Release Targets",
        description: "All selected models must have the same Release Target for a batch submission or initialization."
      });
      return;
    }
    if (type === 'PRECHECK' || type === 'RELEASE' || type === 'POSTCHECK') {
      const actionLabel = type === 'PRECHECK' ? 'Pre-checks' : type === 'RELEASE' ? 'Release Jobs' : 'Post-checks';
      const ok = await ensureDashboardInitialized(selectedReleases, actionLabel);
      if (!ok) return;
    }
    if (type === 'RELEASE') {
      const modelsWithoutSuccess = selectedReleases.filter(r => precheckStatus[r.modelName] !== 'SUCCESS');
      if (modelsWithoutSuccess.length > 0) {
        setReleaseConfirmation(true);
        return;
      }
    }
    await executeSubmission(type);
  };

  // --- Edit Dashboard Handler (Unchanged) ---
  const handleEditDashboard = async () => {
    // ... (This function remains exactly as it was)
    setIsSubmittingDashboardEdit(true);
    const selectedReleases = getValues().releases.filter(r => r.selected);
    const firstReleaseId = selectedReleases[0]?.releaseTarget || "unknown";
    try {
      const result = await editReleaseDashboardAction(selectedReleases);
      if (result.success) {
        toast({ title: `Dashboard Edit Successful for ${firstReleaseId}`, description: result.message });
      } else {
        throw new Error(result.message || "Failed to edit dashboard.");
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Edit Failed", description: e.message });
    } finally {
      setIsSubmittingDashboardEdit(false);
    }
  };

  // +++ The main initialization sequence (MODIFIED) +++
  const runInitializationSequence = async () => {
    setIsInitializingRelease(true);
    setProgress(getInitialProgressState());
    setShowProgressDialog(true);

    const selectedReleases = getValues().releases.filter(r => r.selected);
    const releaseTarget = selectedReleases[0]?.releaseTarget;
    
    let jenkinsJobUrl = "", jenkinsJobName = "", jiraEpicKey = "", jiraEpicUrl = "";

    try {
      // Step 0: Check if dashboard exists
      const checkResult = await initializeReleaseSetupAction(selectedReleases);
      
      if (checkResult.alreadyInitialized) {
        setShowProgressDialog(false);
        setShowEditConfirmation(true);
        return;
      }
      
      // Step 1: Initialize Dashboard
      setProgress(p => ({ ...p, dashboard: { ...p.dashboard, status: 'loading' } }));
      const dashResult = await initializeDashboardAction(selectedReleases);
      if (!dashResult.success) {
        throw new Error(`Dashboard Failed: ${dashResult.message}`);
      }
      setProgress(p => ({ ...p, dashboard: { status: 'success', message: "Dashboard Initialized." } }));

      // Step 2: Clone Jenkins Job
      setProgress(p => ({ ...p, jenkins: { ...p.jenkins, status: 'loading' } }));
      const jenkinsResult = await cloneJenkinsJobAction({ releaseTarget: releaseTarget! });
      if (!jenkinsResult.success) {
        throw new Error(`Jenkins Failed: ${jenkinsResult.message}`);
      }
      jenkinsJobName = jenkinsResult.newJobName || "";
      jenkinsJobUrl = jenkinsResult.newJobUrl || "";
      setProgress(p => ({ ...p, jenkins: { status: 'success', message: `${jenkinsJobName} created.` } }));

      // Step 3: Create Jira Tickets
      setProgress(p => ({ ...p, jira: { ...p.jira, status: 'loading' } }));
      const jiraResult = await createJiraTicketsAction(selectedReleases, releaseTarget!);
      if (jiraResult.epicKey) {
        jiraEpicKey = jiraResult.epicKey;
        // Use the hardcoded prefix as requested.
        jiraEpicUrl = `https://cerebras.atlassian.net/browse/${jiraEpicKey}`;
      }
      if (!jiraResult.success) {
        setProgress(p => ({ ...p, jira: { status: 'failed', message: jiraResult.message } }));
      } else {
        setProgress(p => ({ ...p, jira: { status: 'success', message: jiraResult.message } }));
      }

      // Step 4: Save all links to DB
      setProgress(p => ({ ...p, save: { ...p.save, status: 'loading' } }));
      const saveResult = await initializeReleaseSetupAction(selectedReleases, {
        jenkinsJobUrl, jenkinsJobName, jiraEpicKey, jiraEpicUrl
      });
      if (!saveResult.success) {
        throw new Error(`Save Failed: ${saveResult.message}`);
      }
      setProgress(p => ({ ...p, save: { status: 'success', message: "Links saved." } }));

      toast({ title: "Initialization Complete", description: "All steps finished successfully." });

      // +++ THIS IS THE NEW LINE +++
      // On full success, call onSubmission to switch tabs
      onSubmission(releaseTarget!);
      
    } catch (error: any) {
      console.error("Initialization sequence failed:", error);
      setProgress(p => {
        const newState = { ...p };
        if (p.dashboard.status === 'loading') newState.dashboard = { status: 'failed', message: error.message };
        else if (p.jenkins.status === 'loading') newState.jenkins = { status: 'failed', message: error.message };
        else if (p.jira.status === 'loading') newState.jira = { status: 'failed', message: error.message };
        else if (p.save.status === 'loading') newState.save = { status: 'failed', message: error.message };
        return newState;
      });
      toast({ variant: "destructive", title: "Initialization Failed", description: error.message });
    } finally {
      setIsInitializingRelease(false);
      // Close the dialog automatically *only* on success
      if (progress.save.status === 'success' || progress.jira.status === 'success') {
         setShowProgressDialog(false);
      }
      // If it failed, the dialog stays open for the user to see the error.
    }
  };


  // --- Execute Submission (MODIFIED) ---
  const executeSubmission = async (type: 'PRECHECK' | 'RELEASE' | 'POSTCHECK' | 'INITIALIZE_RELEASE') => {
    const isSubmitting = isSubmittingPrecheck || isSubmittingRelease || isSubmittingPostcheck || isInitializingRelease || isSubmittingDashboardEdit;
    if (isSubmitting) return;

    if (type === 'PRECHECK') setIsSubmittingPrecheck(true);
    else if (type === 'RELEASE') setIsSubmittingRelease(true);
    else if (type === 'POSTCHECK') setIsSubmittingPostcheck(true);
    // isInitializingRelease is handled by runInitializationSequence

    const selectedReleases = getValues().releases.filter(r => r.selected);
    const firstReleaseId = selectedReleases[0]?.releaseTarget || "unknown";
    const payload = { releases: selectedReleases };

    try {
      if (type === 'PRECHECK') {
        // ... (this logic is unchanged)
        const result = await triggerPrecheckJobsAction(payload);
        if (!result.success) { toast({ variant: "destructive", title: `Pre-check Submit Failed for ${firstReleaseId}`, description: result.message }); }
        else { toast({ title: `Pre-checks Triggered for ${firstReleaseId}`, description: `Jobs started for ${selectedReleases.length} models. ${result.message}` });
          const modelNames = selectedReleases.map(r => r.modelName);
          const statuses = await getPrecheckStatusForModels(modelNames, firstReleaseId);
          setPrecheckStatus(statuses);
        }
      } else if (type === 'RELEASE') {
        // ... (this logic is unchanged)
        const result = await triggerReleaseJobsAction(payload);
        if (!result.success) { toast({ variant: "destructive", title: `Release Submit Failed for ${firstReleaseId}`, description: result.message }); }
        else { toast({ title: `Release Jobs Triggered for ${firstReleaseId}`, description: `Jobs started for ${selectedReleases.length} models. ${result.message}` });
          onSubmission(firstReleaseId);
        }
      } else if (type === 'POSTCHECK') {
        // ... (this logic is unchanged)
        toast({ title: `[WIP] Post-checks Triggered for ${firstReleaseId}`, description: `Post-check jobs simulation for ${selectedReleases.length} models.` });
      
      } else if (type === 'INITIALIZE_RELEASE') {
        // +++ MODIFIED: Call the new sequence function +++
        await runInitializationSequence();
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: `${type} Action Failed`, description: e.message || "An unexpected network or server error occurred." });
    } finally {
      // Reset states *except* for initialize, which is handled by its own sequence
      if (type === 'PRECHECK') setIsSubmittingPrecheck(false);
      else if (type === 'RELEASE') setIsSubmittingRelease(false);
      else if (type === 'POSTCHECK') setIsSubmittingPostcheck(false);
      setReleaseConfirmation(false);
    }
  };

  const editableFields = tableHeaders.filter(h => h.isEditable);
  const isAnyJobRunning = isSubmittingPrecheck || isSubmittingRelease || isSubmittingPostcheck || isInitializingRelease || isSubmittingDashboardEdit;

  return (
    <>
      {/* --- Dialogs --- */}
      <AlertDialog open={!!modelToCreate} onOpenChange={(open) => !open && setModelToCreate(null)}>
         <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add New Model?</AlertDialogTitle>
            <AlertDialogDescription>
              The model <strong className="text-foreground">{modelToCreate}</strong> is not in the list. Add it permanently?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAnyJobRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAddNewModel} disabled={isAnyJobRunning}>Add Model</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={releaseConfirmation} onOpenChange={setReleaseConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Release Submission</AlertDialogTitle>
            <AlertDialogDescription>
              Some selected models have not passed pre-checks or their status is unknown. Submitting them might lead to failures. Are you sure you want to trigger the release jobs?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAnyJobRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => executeSubmission('RELEASE')} disabled={isAnyJobRunning}>Submit Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dashboardValidationAlert} onOpenChange={setDashboardValidationAlert}>
       <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Action Blocked</AlertDialogTitle>
            <AlertDialogDescription>
              {dashboardValidationAlertMsg}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDashboardValidationAlert(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showEditConfirmation} onOpenChange={setShowEditConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dashboard Already Initialized</AlertDialogTitle>
            <AlertDialogDescription>
              The dashboard for release <strong className="text-foreground">{getValues().releases.find(r => r.selected)?.releaseTarget}</strong> is already set up.
              <br/><br/>
              Do you want to update it with the currently selected models?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAnyJobRunning} onClick={() => setShowEditConfirmation(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              disabled={isAnyJobRunning}
              onClick={() => {
                setShowEditConfirmation(false);
                handleEditDashboard();
              }}
            >
              {isSubmittingDashboardEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Yes, Edit Dashboard"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* +++ Progress Dialog +++ */}
      <Dialog open={showProgressDialog} onOpenChange={(open) => {
        if (!isInitializingRelease) {
          setShowProgressDialog(open);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Initializing Release: {getValues().releases.find(r => r.selected)?.releaseTarget}</DialogTitle>
            <DialogDescription>
              {isInitializingRelease ? "Running initialization tasks. Please wait..." : "Initialization tasks finished."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col space-y-4 py-4">
            {/* Task 1: Dashboard */}
            <div className="flex items-start space-x-3">
              <ProgressStatusIcon status={progress.dashboard.status} />
              <div className="flex-1">
                <p className={cn("font-medium", progress.dashboard.status === 'failed' && "text-destructive", progress.dashboard.status === 'success' && "text-green-600")}>
                  {progress.dashboard.message}
                </p>
                {progress.dashboard.status === 'loading' && (<p className="text-sm text-muted-foreground">Creating and populating dashboard...</p>)}
              </div>
            </div>
            {/* Task 2: Jenkins */}
            <div className="flex items-start space-x-3">
              <ProgressStatusIcon status={progress.jenkins.status} />
              <div className="flex-1">
                <p className={cn("font-medium", progress.jenkins.status === 'failed' && "text-destructive", progress.jenkins.status === 'success' && "text-green-600")}>
                  {progress.jenkins.message}
                </p>
                {progress.jenkins.status === 'loading' && (<p className="text-sm text-muted-foreground">Cloning template job via API...</p>)}
              </div>
            </div>
            {/* Task 3: Jira */}
            <div className="flex items-start space-x-3">
              <ProgressStatusIcon status={progress.jira.status} />
              <div className="flex-1">
                <p className={cn("font-medium", progress.jira.status === 'failed' && "text-destructive", progress.jira.status === 'success' && "text-green-600")}>
                  {progress.jira.message}
                </p>
                {progress.jira.status === 'loading' && (<p className="text-sm text-muted-foreground">Creating Epic and Tasks...</p>)}
              </div>
            </div>
            {/* Task 4: Save */}
            <div className="flex items-start space-x-3">
              <ProgressStatusIcon status={progress.save.status} />
              <div className="flex-1">
                <p className={cn("font-medium", progress.save.status === 'failed' && "text-destructive", progress.save.status === 'success' && "text-green-600")}>
                  {progress.save.message}
                </p>
                {progress.save.status === 'loading' && (<p className="text-sm text-muted-foreground">Saving links to database...</p>)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              onClick={() => setShowProgressDialog(false)}
              disabled={isInitializingRelease}
            >
              {isInitializingRelease ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* --- Form Sections (Unchanged) --- */}
      <Card>
        <CardHeader>
          <CardTitle>Release Test Plan Import</CardTitle>
          <CardDescription>Paste a Release Test plan to populate the release queue.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex w-full items-center space-x-2">
            <Input
              type="url"
              placeholder="https://your-confluence-instance/wiki/spaces/.../pages/..."
              value={confluenceUrl}
              onChange={(e) => setConfluenceUrl(e.target.value)}
              disabled={isImporting || isAnyJobRunning}
            />
            <Button type="button" onClick={handleImport} disabled={isImporting || isAnyJobRunning || !confluenceUrl}>
              {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileInput className="mr-2 h-4 w-4" />}
              Import
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      <Card>
        <CardHeader>
          <CardTitle>Batch Edit</CardTitle>
          <CardDescription>Apply a value to a specific field for all currently checked rows below.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={globalFillField} onValueChange={setGlobalFillField} disabled={isAnyJobRunning}>
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue placeholder="Select field to edit..." />
              </SelectTrigger>
              <SelectContent>
                {editableFields.map(field =>
                  <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Input
              className="flex-1 min-w-[200px]"
              placeholder="Enter value to apply..."
              value={globalFillValue}
              onChange={(e) => setGlobalFillValue(e.target.value)}
              disabled={!globalFillField || isAnyJobRunning}
            />
            <div className="flex gap-2">
              <Button onClick={handleGlobalFill} disabled={!globalFillField || isAnyJobRunning}>
                <Edit className="mr-2 h-4 w-4" /> Fill
              </Button>
              <Button variant="outline" onClick={handleGlobalClear} disabled={!globalFillField || isAnyJobRunning}>
                <XCircle className="mr-2 h-4 w-4" /> Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      {/* --- Release Queue Table (Unchanged) --- */}
      <Card>
        <CardHeader>
          <CardTitle>Release Queue</CardTitle>
          <CardDescription>Manage models for release qualification. Use checkboxes to select models for batch actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="overflow-x-auto pb-4">
                <Table>
                  {/* ... (Table Header) ... */}
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      {tableHeaders.map(h => (
                        <TableHead key={h.key} className={cn(getFieldClass(h.key))}>
                          <div className="flex items-center gap-2">
                            <h.icon className="h-4 w-4 text-muted-foreground" />
                            {h.label}
                            {h.required && <span className="text-destructive">*</span>}
                          </div>
                        </TableHead>
                      ))}
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  {/* ... (Table Body) ... */}
                  <TableBody>
                     {fields.length === 0 && (
                       <TableRow>
                         <TableCell colSpan={tableHeaders.length + 2} className="h-24 text-center text-muted-foreground">
                           No models added yet. Import from Confluence or add manually.
                         </TableCell>
                       </TableRow>
                     )}
                    {fields.map((item, index) => (
                      <TableRow
                        key={item.id}
                        className={cn(
                          "align-top",
                          !watch(`releases.${index}.selected`) && "bg-muted/30 text-muted-foreground"
                        )}
                      >
                        {/* Checkbox Cell */}
                        <TableCell className="p-2 pt-4">
                          <FormField
                            control={control}
                            name={`releases.${index}.selected`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    aria-label={`Select row ${index + 1}`}
                                   />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        {/* Data Cells */}
                        {tableHeaders.map(header => (
                          <TableCell key={header.key} className="p-2">
                            <FormField
                              control={control}
                              name={`releases.${index}.${header.key as keyof ModelRelease}`}
                              render={({ field: formField }) => (
                                <FormItem>
                                  <FormControl>
                                    {header.key === 'modelName' ? (
                                      <Combobox
                                        options={models}
                                        {...formField}
                                        value={formField.value || ""}
                                        onChange={formField.onChange}
                                        placeholder="Select or add model"
                                        searchPlaceholder="Search models..."
                                        notFoundText="No model found."
                                        allowCustom
                                        onCustomAdd={handleAddNewModelRequest}
                                      />
                                    ) : (
                                      <Input
                                        {...formField}
                                        value={formField.value ?? ""}
                                        readOnly={!header.isEditable || isAnyJobRunning}
                                      />
                                    )}
                                  </FormControl>
                                  <FormMessage className="text-xs text-red-600" />
                                </FormItem>
                              )}
                            />
                          </TableCell>
                        ))}
                        {/* Delete Cell */}
                        <TableCell className="p-2 pt-3">
                          <Button variant="ghost" size="icon" onClick={() => remove(index)} disabled={isAnyJobRunning}>
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Add Model Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => append(initialFormValues)}
                disabled={isAnyJobRunning}
              >
                <PlusCircle className="mr-2 h-4 w-4" /> Add Model Row
              </Button>

              {/* Action Buttons Group */}
              <div className="flex flex-wrap justify-end mt-8 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => handleSubmit('INITIALIZE_RELEASE')}
                  disabled={isAnyJobRunning} 
                  title="Initialize dashboard and clone Jenkins job for the selected release target"
                >
                  {isInitializingRelease ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LayoutDashboard className="mr-2 h-4 w-4" />}
                  Initialize Release
                </Button>
                {/* ... (Other buttons remain unchanged) ... */}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => handleSubmit('PRECHECK')}
                  disabled={isAnyJobRunning}
                  title="Run pre-check validation jobs on Jenkins for selected models"
                >
                  {isSubmittingPrecheck ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldQuestion className="mr-2 h-4 w-4" />}
                  Run Pre-checks
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => handleSubmit('RELEASE')}
                  disabled={isAnyJobRunning}
                  title="Trigger the main release qualification jobs on the release-specific Jenkins job"
                >
                  {isSubmittingRelease ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Trigger Release
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => handleSubmit('POSTCHECK')}
                  disabled={isAnyJobRunning}
                  title="Run post-release check jobs (if applicable)"
                >
                  {isSubmittingPostcheck ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />}
                  Run Post-checks
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}