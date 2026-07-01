import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ExternalLink, FileUp, Loader2, MapPinned, Paperclip, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  type CampAttachment,
  type CampAudience,
  type CampInstance,
  type CampContentSection,
  type CampStatus,
  getCampAttachmentUrl,
  useCampAttachments,
  useCampContentSections,
  useCampInstances,
  useDeleteCampAttachment,
  useDeleteCampContentSection,
  useSaveCampContentSection,
  useSaveCampInstance,
  useUploadCampAttachment,
} from "@/hooks/useCampMode";
import { useCampuses } from "@/hooks/useCampuses";
import { toast } from "sonner";

const APP_OPTIONS = [
  { value: "students_ms", label: "Middle School" },
  { value: "students_hs", label: "High School" },
] as const;

const AUDIENCE_OPTIONS: { value: CampAudience; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "ms", label: "MS only" },
  { value: "hs", label: "HS only" },
  { value: "leaders", label: "Leaders only" },
];

type CampFormState = {
  id?: string;
  name: string;
  status: CampStatus;
  start_date: string;
  end_date: string;
  resource_app_keys: string[];
  campus_ids: string[];
};

type SectionFormState = {
  id?: string;
  title: string;
  body: string;
  link_url: string;
  audience: CampAudience;
  sort_order: number;
};

const emptyCampForm: CampFormState = {
  name: "Student Camp",
  status: "draft",
  start_date: "",
  end_date: "",
  resource_app_keys: ["students_ms", "students_hs"],
  campus_ids: [],
};

const emptySectionForm: SectionFormState = {
  title: "",
  body: "",
  link_url: "",
  audience: "everyone",
  sort_order: 0,
};

function toggleString(values: string[], value: string, checked: boolean) {
  return checked ? Array.from(new Set([...values, value])) : values.filter((entry) => entry !== value);
}

function buildCampForm(instance: CampInstance | null | undefined): CampFormState {
  if (!instance) return emptyCampForm;
  return {
    id: instance.id,
    name: instance.name,
    status: instance.status,
    start_date: instance.start_date,
    end_date: instance.end_date,
    resource_app_keys: instance.resource_app_keys?.length
      ? instance.resource_app_keys
      : ["students_ms", "students_hs"],
    campus_ids: instance.campus_ids || [],
  };
}

function buildSectionForm(section: CampContentSection): SectionFormState {
  return {
    id: section.id,
    title: section.title,
    body: section.body || "",
    link_url: section.link_url || "",
    audience: section.audience,
    sort_order: section.sort_order,
  };
}

export function CampModeAdminCard() {
  const { data: campInstances = [], isLoading } = useCampInstances();
  const { data: campuses = [] } = useCampuses();
  const saveCamp = useSaveCampInstance();
  const saveSection = useSaveCampContentSection();
  const deleteSection = useDeleteCampContentSection();
  const selectedCamp = useMemo(
    () => campInstances.find((camp) => camp.status === "active") || campInstances[0] || null,
    [campInstances],
  );
  const uploadAttachment = useUploadCampAttachment();
  const deleteAttachment = useDeleteCampAttachment();
  const [campForm, setCampForm] = useState<CampFormState>(emptyCampForm);
  const [sectionForm, setSectionForm] = useState<SectionFormState>(emptySectionForm);
  const [attachmentForm, setAttachmentForm] = useState<{ title: string; audience: CampAudience }>({
    title: "",
    audience: "everyone",
  });
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const { data: sections = [] } = useCampContentSections(campForm.id);
  const { data: attachments = [] } = useCampAttachments(campForm.id);

  useEffect(() => {
    setCampForm(buildCampForm(selectedCamp));
  }, [selectedCamp]);

  const handleSaveCamp = async () => {
    if (!campForm.name.trim() || !campForm.start_date || !campForm.end_date) {
      toast.error("Add a camp name, start date, and end date.");
      return;
    }
    if (campForm.resource_app_keys.length === 0) {
      toast.error("Choose at least one student app.");
      return;
    }

    try {
      const saved = await saveCamp.mutateAsync(campForm);
      setCampForm(buildCampForm(saved));
      toast.success("Camp Mode saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save Camp Mode.");
    }
  };

  const handleSaveSection = async () => {
    if (!campForm.id) {
      toast.error("Save the camp before adding info sections.");
      return;
    }
    if (!sectionForm.title.trim()) {
      toast.error("Add a section title.");
      return;
    }

    try {
      await saveSection.mutateAsync({
        ...sectionForm,
        camp_instance_id: campForm.id,
        is_published: true,
      });
      setSectionForm(emptySectionForm);
      toast.success("Camp info saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save camp info.");
    }
  };

  const handleDeleteSection = async (section: CampContentSection) => {
    if (!window.confirm(`Delete "${section.title}" from Camp Mode?`)) return;
    try {
      await deleteSection.mutateAsync(section);
      toast.success("Camp info deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete camp info.");
    }
  };

  const handleUploadAttachment = async () => {
    if (!campForm.id) {
      toast.error("Save the camp before uploading files.");
      return;
    }
    if (!attachmentFile) {
      toast.error("Choose a file to upload.");
      return;
    }

    try {
      await uploadAttachment.mutateAsync({
        camp_instance_id: campForm.id,
        title: attachmentForm.title.trim() || attachmentFile.name,
        audience: attachmentForm.audience,
        sort_order: attachments.length,
        file: attachmentFile,
      });
      setAttachmentForm({ title: "", audience: "everyone" });
      setAttachmentFile(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      toast.success("Camp file uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to upload file.");
    }
  };

  const handleOpenAttachment = async (attachment: CampAttachment) => {
    try {
      const url = await getCampAttachmentUrl(attachment.file_path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open file.");
    }
  };

  const handleDeleteAttachment = async (attachment: CampAttachment) => {
    if (!window.confirm(`Delete "${attachment.title}" from Camp Mode?`)) return;
    try {
      await deleteAttachment.mutateAsync(attachment);
      toast.success("Camp file deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete file.");
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <CalendarDays className="h-5 w-5 text-primary" />
              Camp Mode
            </CardTitle>
            <CardDescription>
              Share camp info, feed posts, chat, and pings across the MS and HS student apps.
            </CardDescription>
          </div>
          <Badge variant={campForm.status === "active" ? "default" : "secondary"} className="capitalize">
            {campForm.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Camp Mode...
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Camp Name</Label>
                <Input
                  value={campForm.name}
                  onChange={(event) => setCampForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Student Camp"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={campForm.status}
                  onValueChange={(status) => setCampForm((current) => ({ ...current, status: status as CampStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={campForm.start_date}
                  onChange={(event) => setCampForm((current) => ({ ...current, start_date: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={campForm.end_date}
                  onChange={(event) => setCampForm((current) => ({ ...current, end_date: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <Label>Participating Student Apps</Label>
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {APP_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={campForm.resource_app_keys.includes(option.value)}
                        onCheckedChange={(checked) =>
                          setCampForm((current) => ({
                            ...current,
                            resource_app_keys: toggleString(current.resource_app_keys, option.value, checked === true),
                          }))
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Participating Campuses</Label>
                <div className="max-h-44 space-y-2 overflow-auto rounded-lg border border-border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={campForm.campus_ids.length === 0}
                      onCheckedChange={(checked) =>
                        checked === true && setCampForm((current) => ({ ...current, campus_ids: [] }))
                      }
                    />
                    All campuses
                  </label>
                  {campuses.map((campus) => (
                    <label key={campus.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={campForm.campus_ids.includes(campus.id)}
                        onCheckedChange={(checked) =>
                          setCampForm((current) => ({
                            ...current,
                            campus_ids: toggleString(current.campus_ids, campus.id, checked === true),
                          }))
                        }
                      />
                      {campus.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveCamp} disabled={saveCamp.isPending}>
                {saveCamp.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Camp Mode
              </Button>
            </div>

            <div className="space-y-4 border-t border-border pt-5">
              <div>
                <h3 className="font-semibold">Camp Info Sections</h3>
                <p className="text-sm text-muted-foreground">
                  Publish map links, packing lists, rules, emergency details, and daily notes.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <Input
                  value={sectionForm.title}
                  onChange={(event) => setSectionForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Packing List"
                />
                <Select
                  value={sectionForm.audience}
                  onValueChange={(audience) =>
                    setSectionForm((current) => ({ ...current, audience: audience as CampAudience }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={sectionForm.body}
                onChange={(event) => setSectionForm((current) => ({ ...current, body: event.target.value }))}
                placeholder="Details students and leaders need during camp..."
                className="min-h-[120px]"
              />
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_auto]">
                <Input
                  value={sectionForm.link_url}
                  onChange={(event) => setSectionForm((current) => ({ ...current, link_url: event.target.value }))}
                  placeholder="Optional link URL"
                />
                <Input
                  type="number"
                  value={sectionForm.sort_order}
                  onChange={(event) =>
                    setSectionForm((current) => ({ ...current, sort_order: Number(event.target.value) || 0 }))
                  }
                  placeholder="Sort"
                />
                <Button onClick={handleSaveSection} disabled={saveSection.isPending}>
                  {saveSection.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {sectionForm.id ? "Update" : "Add"}
                </Button>
              </div>

              <div className="space-y-2">
                {sections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No info sections yet.</p>
                ) : (
                  sections.map((section) => (
                    <div key={section.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => setSectionForm(buildSectionForm(section))}
                      >
                        <p className="truncate text-sm font-medium">{section.title}</p>
                        <p className="text-xs capitalize text-muted-foreground">{section.audience}</p>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteSection(section)}
                        disabled={deleteSection.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-4 border-t border-border pt-5">
              <div>
                <h3 className="flex items-center gap-2 font-semibold">
                  <MapPinned className="h-4 w-4 text-primary" />
                  Camp Map &amp; Files
                </h3>
                <p className="text-sm text-muted-foreground">
                  Upload the camp map, packing PDFs, forms, and other file attachments. Images and PDFs preview in Camp Mode.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <Input
                  value={attachmentForm.title}
                  onChange={(event) => setAttachmentForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Camp Map"
                />
                <Select
                  value={attachmentForm.audience}
                  onValueChange={(audience) =>
                    setAttachmentForm((current) => ({ ...current, audience: audience as CampAudience }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  ref={attachmentInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)}
                />
                <Button onClick={handleUploadAttachment} disabled={uploadAttachment.isPending || !attachmentFile}>
                  {uploadAttachment.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="mr-2 h-4 w-4" />
                  )}
                  Upload
                </Button>
              </div>

              <div className="space-y-2">
                {attachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
                ) : (
                  attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-2 text-left"
                        onClick={() => handleOpenAttachment(attachment)}
                      >
                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{attachment.title}</span>
                          <span className="block text-xs capitalize text-muted-foreground">
                            {attachment.audience} • {attachment.file_name}
                          </span>
                        </span>
                      </button>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground"
                          onClick={() => handleOpenAttachment(attachment)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteAttachment(attachment)}
                          disabled={deleteAttachment.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
