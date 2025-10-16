"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Package, GitBranch, GitMerge, Tag, User, Tags, Rocket, Send, PlusCircle, Trash2, FileInput, Server, ShieldQuestion, BoxSelect, Link, Edit, XCircle, LayoutDashboard, ClipboardCheck } from "lucide-react";
import { importFromConfluence, type ConfluenceImportResult } from "@/app/actions";
import { getModels, addModel } from "@/app/model-actions";
import { triggerPrecheckJobsAction, triggerReleaseJobsAction, getPrecheckStatusForModels, initiateDashboardAction } from "@/app/flow-actions";
import { modelReleaseSchema, type ModelRelease } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formSchema = z.object({
  releases: z.array(modelReleaseSchema),
});

type FormValues = z.infer<typeof formSchema>;

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

const initialFormValues: ModelRelease = { selected: true, modelName: "", branch: "", appTag: "", miqBranch: "main", multibox: "dh1", monitorLink: "", profile: "", labels: "", releaseTarget: "", owner: "", cs: "" };

interface BatchReleaseFormProps {
  onSubmission: (releaseId: string) => void;
}

export function BatchReleaseForm({ onSubmission }: BatchReleaseFormProps) {
  const [isSubmittingPrecheck, setIsSubmittingPrecheck] = useState(false);
  const [isSubmittingRelease, setIsSubmittingRelease] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isInitiatingDashboard, setIsInitiatingDashboard] = useState(false);
  const [isSubmittingPostcheck, setIsSubmittingPostcheck] = useState(false);
  const [confluenceUrl, setConfluenceUrl] = useState("");
  const { toast } = useToast();
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [modelToCreate, setModelToCreate] = useState<string | null>(null);
  const [precheckStatus, setPrecheckStatus] = useState<Record<string, string>>({});
  const [releaseConfirmation, setReleaseConfirmation] = useState(false);
  const [dashboardValidationAlert, setDashboardValidationAlert] = useState(false);

  const [globalFillField, setGlobalFillField] = useState<string>("");
  const [globalFillValue, setGlobalFillValue] = useState<string>("");

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { releases: [initialFormValues] } });
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "releases" });

  const fetchModels = useCallback(async () => {
    try {
      const dbModels = await getModels();
      setModels(dbModels.map((m: { name: string }) => ({ value: m.name, label: m.name })));
    } catch (error) { toast({ variant: "destructive", title: "Error", description: "Could not fetch models." }); }
  }, [toast]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const handleAddNewModelRequest = (newModelName: string) => setModelToCreate(newModelName);

  const confirmAddNewModel = async () => {
    if (!modelToCreate) return;
    try {
      await addModel(modelToCreate);
      await fetchModels();
      toast({ title: "Model Added", description: `"${modelToCreate}" has been added.` });
    } catch (error: any) { toast({ variant: "destructive", title: "Error Adding Model", description: error.message });
    } finally { setModelToCreate(null); }
  };

  const handleImport = async () => {
    if (!confluenceUrl) { toast({ variant: "destructive", title: "URL Required" }); return; }
    setIsImporting(true);
    try {
      const result: ConfluenceImportResult = await importFromConfluence(confluenceUrl);
      if (result.error) throw new Error(result.error);
      if (result.data?.models) {
        const { models: importedModels, releaseTarget } = result.data;
        const releaseNumber = releaseTarget?.match(/\d{4}/)?.[0] || '';
        const labels = releaseNumber ? `prp=rel-${releaseNumber},etime=8h` : "";
        const newReleases = importedModels.map(model => ({ ...initialFormValues, ...model, releaseTarget: releaseTarget || "", labels }));
        replace(newReleases);
        form.clearErrors();
        toast({ title: "Import Successful", description: `Imported ${newReleases.length} models.` });
      } else throw new Error("No models found.");
    } catch (e: any) { toast({ variant: "destructive", title: "Import Error", description: e.message });
    } finally { setIsImporting(false); }
  };
  
  const getFieldClass = (fieldName: string) => ({ "w-60": fieldName === "modelName" || fieldName === "monitorLink", "w-40": fieldName === "owner", "w-20": fieldName === "cs", "w-64": fieldName === "labels", "w-48": fieldName === "branch" || fieldName === "miqBranch" || fieldName === "multibox", "w-32": fieldName === "releaseTarget" }[fieldName] || "w-48");

  const handleGlobalFill = () => {
    if (!globalFillField) { toast({ variant: "destructive", title: "Field Not Selected", description: "Please select a field to fill." }); return; }
    const currentReleases = form.getValues().releases;
    let filledCount = 0;
    currentReleases.forEach((release, index) => {
      if (release.selected) {
        form.setValue(`releases.${index}.${globalFillField as keyof ModelRelease}`, globalFillValue);
        filledCount++;
      }
    });
    if (filledCount > 0) { toast({ title: "Batch Edit Successful", description: `Updated ${filledCount} selected rows.` });
    } else { toast({ variant: "destructive", title: "No Rows Selected", description: "Please select at least one row to fill." }); }
  };

  const handleGlobalClear = () => {
    if (!globalFillField) { toast({ variant: "destructive", title: "Field Not Selected", description: "Please select a field to clear." }); return; }
    const currentReleases = form.getValues().releases;
    let clearedCount = 0;
    currentReleases.forEach((release, index) => {
      if (release.selected) {
        form.setValue(`releases.${index}.${globalFillField as keyof ModelRelease}`, "");
        clearedCount++;
      }
    });
    if (clearedCount > 0) { toast({ title: "Batch Edit Successful", description: `Cleared field for ${clearedCount} selected rows.` });
    } else { toast({ variant: "destructive", title: "No Rows Selected", description: "Please select at least one row to clear." }); }
  };

  const handleSubmit = async (type: 'PRECHECK' | 'RELEASE' | 'POSTCHECK' | 'DASHBOARD') => {
    const formValues = form.getValues();
    const selectedReleases = formValues.releases.filter(r => r.selected);
    
    if (type === 'DASHBOARD') {
      const releaseTarget = selectedReleases[0]?.releaseTarget;
      if (selectedReleases.length === 0 || !releaseTarget) {
        setDashboardValidationAlert(true);
        return;
      }
    }
    
    await form.trigger();
    if (selectedReleases.length === 0) { toast({ variant: "destructive", title: "No Models Selected" }); return; }

    const invalidModels = selectedReleases.filter(r => !models.some(m => m.value === r.modelName));
    if (invalidModels.length > 0) { toast({ variant: "destructive", title: "Invalid Models Found", description: `Add these models before submitting: ${invalidModels.map(r => r.modelName).join(', ')}.` }); return; }
    
    const firstReleaseId = selectedReleases[0].releaseTarget;
    if (!selectedReleases.every(r => r.releaseTarget === firstReleaseId)) { toast({ variant: "destructive", title: "Multiple Release IDs", description: "All selected models must have the same Release Target for a batch submission." }); return; }

    if (type === 'RELEASE') {
        const modelsWithoutSuccess = selectedReleases.filter(r => precheckStatus[r.modelName] !== 'SUCCESS');
        if (modelsWithoutSuccess.length > 0) { setReleaseConfirmation(true); return; }
    }

    await executeSubmission(type);
  };

  const executeSubmission = async (type: 'PRECHECK' | 'RELEASE' | 'POSTCHECK' | 'DASHBOARD') => {
    const isSubmitting = isSubmittingPrecheck || isSubmittingRelease || isSubmittingPostcheck || isInitiatingDashboard;
    if (isSubmitting) return;

    if (type === 'PRECHECK') setIsSubmittingPrecheck(true);
    else if (type === 'RELEASE') setIsSubmittingRelease(true);
    else if (type === 'POSTCHECK') setIsSubmittingPostcheck(true);
    else if (type === 'DASHBOARD') setIsInitiatingDashboard(true);

    const selectedReleases = form.getValues().releases.filter(r => r.selected);
    const firstReleaseId = selectedReleases[0].releaseTarget;
    const payload = { releases: selectedReleases };

    try {
        if (type === 'PRECHECK') {
            await triggerPrecheckJobsAction(payload);
            toast({ title: "Pre-checks Triggered", description: `Validation jobs started for ${selectedReleases.length} models.` });
            const modelNames = selectedReleases.map(r => r.modelName);
            const statuses = await getPrecheckStatusForModels(modelNames, firstReleaseId);
            setPrecheckStatus(statuses);
        } else if (type === 'RELEASE') {
            await triggerReleaseJobsAction(payload);
            toast({ title: "Release Jobs Triggered", description: `Release jobs started for ${selectedReleases.length} models.` });
            onSubmission(firstReleaseId);
        } else if (type === 'POSTCHECK') {
            toast({ title: "Post-checks Triggered", description: `Post-check jobs started for ${selectedReleases.length} models.` });
        } else if (type === 'DASHBOARD') {
            // ** UPDATED ACTION CALL **
            const result = await initiateDashboardAction(selectedReleases, "billaa-cerebras");
            if (result.success) {
              toast({ title: "Dashboard Initiated", description: result.message });
            } else {
              throw new Error(result.message);
            }
        }
    } catch (e: any) {
        toast({ variant: "destructive", title: "Action Failed", description: e.message });
    } finally {
        if (type === 'PRECHECK') setIsSubmittingPrecheck(false);
        else if (type === 'RELEASE') setIsSubmittingRelease(false);
        else if (type === 'POSTCHECK') setIsSubmittingPostcheck(false);
        else if (type === 'DASHBOARD') setIsInitiatingDashboard(false);
        setReleaseConfirmation(false);
    }
  };

  const editableFields = tableHeaders.filter(h => h.isEditable);
  const isAnyJobRunning = isSubmittingPrecheck || isSubmittingRelease || isSubmittingPostcheck || isInitiatingDashboard;

  return (
    <>
      <AlertDialog open={!!modelToCreate} onOpenChange={(open) => !open && setModelToCreate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Add New Model?</AlertDialogTitle><AlertDialogDescription>Add <strong className="text-foreground">{modelToCreate}</strong> to the permanent list of models?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmAddNewModel}>Continue</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={releaseConfirmation} onOpenChange={setReleaseConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Pre-checks Not Passed</AlertDialogTitle><AlertDialogDescription>Some selected models have not passed the pre-check validation. Submitting them may result in a failed release. Are you sure you want to proceed?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => executeSubmission('RELEASE')}>Submit Anyway</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={dashboardValidationAlert} onOpenChange={setDashboardValidationAlert}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Missing Information</AlertDialogTitle><AlertDialogDescription>Please add models to the release queue and ensure the 'Release Target' field is filled for selected models before initiating a dashboard.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogAction onClick={() => setDashboardValidationAlert(false)}>OK</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle>Confluence Import</CardTitle>
          <CardDescription>Paste a Confluence URL to populate the release queue.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="flex w-full items-center space-x-2"><Input type="url" placeholder="https://..." value={confluenceUrl} onChange={(e) => setConfluenceUrl(e.target.value)} disabled={isImporting} /><Button type="button" onClick={handleImport} disabled={isImporting}>{isImporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing...</> : <><FileInput className="mr-2 h-4 w-4" /> Import</>}</Button></div>
        </CardContent>
      </Card>
      
      <Separator className="my-6" />

      <Card>
        <CardHeader>
          <CardTitle>Batch Edit</CardTitle>
          <CardDescription>Select a field and an action to apply to all checked rows below.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex w-full items-center space-x-2">
            <Select value={globalFillField} onValueChange={setGlobalFillField}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Select a field" />
              </SelectTrigger>
              <SelectContent>
                {editableFields.map(field => (
                  <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input 
              placeholder="Enter value to fill"
              value={globalFillValue}
              onChange={(e) => setGlobalFillValue(e.target.value)}
            />
            <Button onClick={handleGlobalFill}>
              <Edit className="mr-2 h-4 w-4" /> Fill
            </Button>
            <Button variant="outline" onClick={handleGlobalClear}>
              <XCircle className="mr-2 h-4 w-4" /> Clear
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <Separator className="my-6" />

      <Card>
        <CardHeader><CardTitle>Release Queue</CardTitle></CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      {tableHeaders.map(h => <TableHead key={h.key} className={cn(getFieldClass(h.key))}><div className="flex items-center gap-2"><h.icon className="h-4 w-4 text-muted-foreground" />{h.label}{h.required && <span className="text-destructive">*</span>}</div></TableHead>)}
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id} className={cn("align-top", !form.watch(`releases.${index}.selected`) && "bg-muted/30 text-muted-foreground")}>
                        <TableCell className="p-2 pt-4"><FormField control={form.control} name={`releases.${index}.selected`} render={({ field }) => ( <FormItem><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem> )} /></TableCell>
                        {tableHeaders.map(header => (
                          <TableCell key={header.key} className="p-2">
                            <FormField control={form.control} name={`releases.${index}.${header.key as keyof ModelRelease}`} render={({ field: formField }) => (
                                <FormItem>
                                  {header.key === 'modelName' ? (
                                    <Combobox options={models} {...formField} placeholder="Select or type model" allowCustom onCustomAdd={handleAddNewModelRequest} />
                                  ) : (
                                    <FormControl><Input {...formField} readOnly={!header.isEditable} /></FormControl>
                                  )}
                                  <FormMessage className="text-xs" />
                                </FormItem>
                            )} />
                          </TableCell>
                        ))}
                        <TableCell className="p-2 pt-3"><Button variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-5 w-5" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append(initialFormValues)}><PlusCircle className="mr-2 h-4 w-4" /> Add Model</Button>
              <div className="flex justify-end mt-8 space-x-4">
                <Button type="button" variant="outline" size="lg" onClick={() => handleSubmit('DASHBOARD')} disabled={isAnyJobRunning}>
                  {isInitiatingDashboard ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LayoutDashboard className="mr-2 h-4 w-4" />}
                  Initialize Dashboard
                </Button>
                <Button type="button" variant="outline" size="lg" onClick={() => handleSubmit('PRECHECK')} disabled={isAnyJobRunning}>
                  {isSubmittingPrecheck ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldQuestion className="mr-2 h-4 w-4" />}
                  Run Pre-checks
                </Button>
                <Button type="button" size="lg" onClick={() => handleSubmit('RELEASE')} disabled={isAnyJobRunning}>
                  {isSubmittingRelease ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Trigger Release
                </Button>
                <Button type="button" variant="outline" size="lg" onClick={() => handleSubmit('POSTCHECK')} disabled={isAnyJobRunning}>
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