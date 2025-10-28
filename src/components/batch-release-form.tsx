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
  BoxSelect,
  Link,
  Edit,
  XCircle,
  LayoutDashboard,
  ClipboardCheck
} from "lucide-react";
import { importFromConfluence, type ConfluenceImportResult } from "@/app/actions";
import { getModels, addModel } from "@/app/model-actions";
import {
  triggerPrecheckJobsAction,
  triggerReleaseJobsAction,
  getPrecheckStatusForModels,
  initializeReleaseSetupAction, // Use the renamed server action
  isDashboardInitializedForRelease
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formSchema = z.object({
  releases: z.array(modelReleaseSchema),
});

type FormValues = z.infer<typeof formSchema>;

// Original table headers structure
const tableHeaders = [
  { key: "modelName", label: "Model Name", required: true, icon: Package, isEditable: true },
  { key: "owner", label: "Owner", required: false, icon: User, isEditable: true },
  { key: "cs", label: "CS", required: false, icon: Server, isEditable: true },
  { key: "branch", label: "Branch", required: true, icon: GitBranch, isEditable: true },
  { key: "miqBranch", label: "MIQ Branch", required: true, icon: GitMerge, isEditable: true },
  { key: "appTag", label: "App-Tag", required: true, icon: Tag, isEditable: true },
  { key: "multibox", label: "MULTIBOX", required: true, icon: BoxSelect, isEditable: true },
  { key: "monitorLink", label: "Monitor Link", required: false, icon: Link, isEditable: true },
  { key: "labels", label: "Labels", required: true, icon: Tags, isEditable: true },
  { key: "releaseTarget", label: "Release Target", required: true, icon: Rocket, isEditable: true },
];

const initialFormValues: ModelRelease = {
  selected: true,
  modelName: "",
  branch: "",
  appTag: "",
  miqBranch: "main",
  multibox: "dh1",
  monitorLink: "",
  profile: "", // Required by schema
  labels: "",
  releaseTarget: "",
  owner: "",
  cs: ""
};

interface BatchReleaseFormProps {
  onSubmission: (releaseId: string) => void;
}

export function BatchReleaseForm({ onSubmission }: BatchReleaseFormProps) {
  const [isSubmittingPrecheck, setIsSubmittingPrecheck] = useState(false);
  const [isSubmittingRelease, setIsSubmittingRelease] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isInitializingRelease, setIsInitializingRelease] = useState(false); // Renamed state
  const [isSubmittingPostcheck, setIsSubmittingPostcheck] = useState(false);
  const [confluenceUrl, setConfluenceUrl] = useState("");
  const { toast } = useToast();
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [modelToCreate, setModelToCreate] = useState<string | null>(null);
  const [precheckStatus, setPrecheckStatus] = useState<Record<string, string>>({});
  const [releaseConfirmation, setReleaseConfirmation] = useState(false);
  const [dashboardValidationAlert, setDashboardValidationAlert] = useState(false);
  const [dashboardValidationAlertMsg, setDashboardValidationAlertMsg] = useState("");
  const [globalFillField, setGlobalFillField] = useState<string>("");
  const [globalFillValue, setGlobalFillValue] = useState<string>("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { releases: [initialFormValues] }
  });

  // Destructure form methods correctly
  // +++ THIS IS THE FIX +++
  const { control, watch, setValue, getValues, clearErrors, trigger } = form; // Added 'watch' back

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "releases"
  });

  const fetchModels = useCallback(async () => {
    try {
      const dbModels = await getModels();
      setModels(dbModels.map((m: { name: string }) => ({ value: m.name, label: m.name })));
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not fetch models." });
    }
  }, [toast]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

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

  // Original width calculation
  const getFieldClass = (fieldName: string) =>
    ({
      "w-60": fieldName === "modelName" || fieldName === "monitorLink",
      "w-40": fieldName === "owner",
      "w-20": fieldName === "cs",
      "w-64": fieldName === "labels",
      "w-48": ["branch", "miqBranch", "multibox", "appTag"].includes(fieldName),
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

  // --- Main Submit Handler ---
  const handleSubmit = async (type: 'PRECHECK' | 'RELEASE' | 'POSTCHECK' | 'INITIALIZE_RELEASE') => {
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

  // --- Execute Submission ---
  const executeSubmission = async (type: 'PRECHECK' | 'RELEASE' | 'POSTCHECK' | 'INITIALIZE_RELEASE') => {
    const isSubmitting = isSubmittingPrecheck || isSubmittingRelease || isSubmittingPostcheck || isInitializingRelease;
    if (isSubmitting) return;

    if (type === 'PRECHECK') setIsSubmittingPrecheck(true);
    else if (type === 'RELEASE') setIsSubmittingRelease(true);
    else if (type === 'POSTCHECK') setIsSubmittingPostcheck(true);
    else if (type === 'INITIALIZE_RELEASE') setIsInitializingRelease(true);

    const selectedReleases = getValues().releases.filter(r => r.selected);
    const firstReleaseId = selectedReleases[0]?.releaseTarget || "unknown";
    const payload = { releases: selectedReleases };

    try {
      if (type === 'PRECHECK') {
        const result = await triggerPrecheckJobsAction(payload);
        if (!result.success) {
          toast({ variant: "destructive", title: `Pre-check Submit Failed for ${firstReleaseId}`, description: result.message });
        } else {
          toast({ title: `Pre-checks Triggered for ${firstReleaseId}`, description: `Jobs started for ${selectedReleases.length} models. ${result.message}` });
          const modelNames = selectedReleases.map(r => r.modelName);
          const statuses = await getPrecheckStatusForModels(modelNames, firstReleaseId);
          setPrecheckStatus(statuses);
        }
      } else if (type === 'RELEASE') {
        const result = await triggerReleaseJobsAction(payload);
        if (!result.success) {
          toast({ variant: "destructive", title: `Release Submit Failed for ${firstReleaseId}`, description: result.message });
        } else {
          toast({ title: `Release Jobs Triggered for ${firstReleaseId}`, description: `Jobs started for ${selectedReleases.length} models. ${result.message}` });
          onSubmission(firstReleaseId);
        }
      } else if (type === 'POSTCHECK') {
        toast({ title: `[WIP] Post-checks Triggered for ${firstReleaseId}`, description: `Post-check jobs simulation for ${selectedReleases.length} models.` });
      } else if (type === 'INITIALIZE_RELEASE') {
        // Call the combined server action
        const result = await initializeReleaseSetupAction(selectedReleases);
        if (result.success) {
          toast({ title: `Release Initialized Successfully for ${firstReleaseId}`, description: result.message });
        } else {
          toast({ variant: "destructive", title: `Release Initialization Failed for ${firstReleaseId}`, description: result.message || "An unknown error occurred during setup." });
        }
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: `${type} Action Failed`, description: e.message || "An unexpected network or server error occurred." });
    } finally {
      if (type === 'PRECHECK') setIsSubmittingPrecheck(false);
      else if (type === 'RELEASE') setIsSubmittingRelease(false);
      else if (type === 'POSTCHECK') setIsSubmittingPostcheck(false);
      else if (type === 'INITIALIZE_RELEASE') setIsInitializingRelease(false);
      setReleaseConfirmation(false);
    }
  };

  // Filter out the 'selected' pseudo-header for batch edit options
  const editableFields = tableHeaders.filter(h => h.isEditable); // No isCheckbox check needed if 'selected' isn't in headers
  const isAnyJobRunning = isSubmittingPrecheck || isSubmittingRelease || isSubmittingPostcheck || isInitializingRelease;

  return (
    <>
      {/* --- Dialogs (No Changes) --- */}
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

      {/* --- Form Sections (No structural changes) --- */}
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

      {/* --- Release Queue Table (Original Structure) --- */}
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
                          // +++ THIS IS THE FIX +++
                          // Use the 'watch' function (now correctly in scope) to get the *current* value
                          !watch(`releases.${index}.selected`) && "bg-muted/30 text-muted-foreground"
                        )}
                      >
                        {/* Original Checkbox Cell */}
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
                        {/* Original Data Cells */}
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
                        {/* Original Delete Cell */}
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
                {/* --- UPDATED BUTTON --- */}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => handleSubmit('INITIALIZE_RELEASE')}
                  disabled={isAnyJobRunning}
                  title="Initialize dashboard and clone Jenkins job for the selected release target"
                >
                  {isInitializingRelease ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LayoutDashboard className="mr-2 h-4 w-4" />}
                  Initialize Release {/* <-- Text Changed */}
                </Button>
                {/* --- Other Buttons (Unchanged) --- */}
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