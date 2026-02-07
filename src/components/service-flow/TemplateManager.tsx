import { useState, useEffect } from "react";
import { Plus, Trash2, GripVertical, Save, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCampuses } from "@/hooks/useCampuses";
import { MINISTRY_TYPES } from "@/lib/constants";
import {
  useServiceFlowTemplate,
  useServiceFlowTemplateItems,
  useSaveServiceFlowTemplate,
  useDeleteServiceFlowTemplate,
  useSaveServiceFlowTemplateItem,
  useDeleteServiceFlowTemplateItem,
  useReorderServiceFlowTemplateItems,
  ServiceFlowTemplateItem,
} from "@/hooks/useServiceFlowTemplates";
import { AddItemDialog } from "./AddItemDialog";
import { EditItemDialog } from "./EditItemDialog";
import { formatDuration } from "./DurationInput";
import { cn } from "@/lib/utils";

export function TemplateManager() {
  const { user } = useAuth();
  const { data: campuses, isLoading: campusesLoading } = useCampuses();
  const { toast } = useToast();

  const [selectedCampusId, setSelectedCampusId] = useState<string | null>(null);
  const [ministryType, setMinistryType] = useState("weekend");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<ServiceFlowTemplateItem | null>(null);
  const [isEditItemDialogOpen, setIsEditItemDialogOpen] = useState(false);
  const [isEditTemplateNameOpen, setIsEditTemplateNameOpen] = useState(false);
  const [editedTemplateName, setEditedTemplateName] = useState("");
  
  // Drag and drop state
  const [localItems, setLocalItems] = useState<ServiceFlowTemplateItem[]>([]);
  const [draggedItem, setDraggedItem] = useState<ServiceFlowTemplateItem | null>(null);

  const { data: template, isLoading: templateLoading } = useServiceFlowTemplate(
    selectedCampusId,
    ministryType
  );

  const { data: templateItems = [], isLoading: itemsLoading } =
    useServiceFlowTemplateItems(template?.id || null);

  // Sync local items with fetched items when not dragging
  useEffect(() => {
    if (!draggedItem) {
      setLocalItems(templateItems);
    }
  }, [templateItems, draggedItem]);

  const saveTemplate = useSaveServiceFlowTemplate();
  const deleteTemplate = useDeleteServiceFlowTemplate();
  const saveTemplateItem = useSaveServiceFlowTemplateItem();
  const deleteTemplateItem = useDeleteServiceFlowTemplateItem();
  const reorderItems = useReorderServiceFlowTemplateItems();

  const handleCreateTemplate = async () => {
    if (!selectedCampusId || !templateName.trim() || !user?.id) return;

    await saveTemplate.mutateAsync({
      campus_id: selectedCampusId,
      ministry_type: ministryType,
      name: templateName.trim(),
      created_by: user.id,
    });

    setTemplateName("");
    setIsCreateDialogOpen(false);
  };

  const handleDeleteTemplate = async () => {
    if (!template?.id) return;
    await deleteTemplate.mutateAsync(template.id);
    setDeleteConfirmOpen(false);
  };

  const handleAddItem = async (newItem: {
    item_type: "header" | "item" | "song";
    title: string;
    duration_seconds: number | null;
  }) => {
    if (!template?.id) return;

    // Map song to song_placeholder for templates
    const itemType = newItem.item_type === "song" ? "song_placeholder" : newItem.item_type;

    await saveTemplateItem.mutateAsync({
      template_id: template.id,
      item_type: itemType as "header" | "item" | "song_placeholder",
      title: newItem.title,
      default_duration_seconds: newItem.duration_seconds,
      sequence_order: localItems.length,
    });
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!template?.id) return;
    await deleteTemplateItem.mutateAsync({ id: itemId, templateId: template.id });
  };

  const handleStartEditItem = (item: ServiceFlowTemplateItem) => {
    setEditingItem(item);
    setIsEditItemDialogOpen(true);
  };

  const handleSaveItemEdit = async (updatedItem: {
    id: string;
    item_type: "header" | "item" | "song_placeholder";
    title: string;
    default_duration_seconds: number | null;
  }) => {
    if (!template?.id) return;
    
    const existingItem = localItems.find(i => i.id === updatedItem.id);
    if (!existingItem) return;

    await saveTemplateItem.mutateAsync({
      id: updatedItem.id,
      template_id: template.id,
      item_type: updatedItem.item_type,
      title: updatedItem.title,
      default_duration_seconds: updatedItem.default_duration_seconds,
      sequence_order: existingItem.sequence_order,
    });

    setEditingItem(null);
    setIsEditItemDialogOpen(false);
  };

  const handleOpenEditTemplateName = () => {
    if (template) {
      setEditedTemplateName(template.name);
      setIsEditTemplateNameOpen(true);
    }
  };

  const handleSaveTemplateName = async () => {
    if (!template?.id || !editedTemplateName.trim()) return;

    await saveTemplate.mutateAsync({
      id: template.id,
      campus_id: template.campus_id,
      ministry_type: template.ministry_type,
      name: editedTemplateName.trim(),
    });

    setIsEditTemplateNameOpen(false);
  };

  const handleDragStart = (e: React.DragEvent, item: ServiceFlowTemplateItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!draggedItem) return;
    
    const draggedIndex = localItems.findIndex(i => i.id === draggedItem.id);
    if (draggedIndex === targetIndex) return;

    // Reorder locally for visual feedback
    const newItems = [...localItems];
    newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);
    setLocalItems(newItems);
  };

  const handleDragEnd = async () => {
    if (!draggedItem || !template?.id) {
      setDraggedItem(null);
      return;
    }

    // Update sequence orders based on current local order
    const reorderedItems = localItems.map((item, index) => ({
      id: item.id,
      sequence_order: index,
    }));

    await reorderItems.mutateAsync({
      templateId: template.id,
      items: reorderedItems,
    });

    setDraggedItem(null);
  };

  const handleSaveTemplate = async () => {
    if (!template) return;
    
    setIsSaving(true);
    // Small delay for visual feedback since data is already saved
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsSaving(false);
    
    const campusName = campuses?.find(c => c.id === selectedCampusId)?.name || "Selected campus";
    const ministryLabel = MINISTRY_TYPES.find(m => m.value === ministryType)?.label || ministryType;
    
    toast({
      title: "Template Saved",
      description: `${template.name} saved for ${campusName} - ${ministryLabel}`,
    });
  };

  const getItemTypeLabel = (type: string) => {
    switch (type) {
      case "header":
        return "Header";
      case "item":
        return "Item";
      case "song_placeholder":
        return "Song";
      default:
        return type;
    }
  };

  const getItemTypeBadgeVariant = (type: string) => {
    switch (type) {
      case "header":
        return "secondary";
      case "song_placeholder":
        return "default";
      default:
        return "outline";
    }
  };

  const isLoading = campusesLoading || templateLoading || itemsLoading;

  return (
    <div className="space-y-6">
      {/* Selection Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={selectedCampusId || ""} onValueChange={setSelectedCampusId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select Campus" />
          </SelectTrigger>
          <SelectContent>
            {campuses?.map((campus) => (
              <SelectItem key={campus.id} value={campus.id}>
                {campus.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ministryType} onValueChange={setMinistryType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MINISTRY_TYPES.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedCampusId ? (
        <div className="text-center py-12 text-muted-foreground">
          Select a campus and ministry to view or create a template.
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !template ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">
              No template exists for this campus and ministry.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{template.name}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleOpenEditTemplateName}
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveTemplate}
                disabled={isSaving || templateItems.length === 0}
              >
                {isSaving ? (
                  <>
                    <Check className="h-4 w-4 mr-1 animate-pulse" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1" />
                    Save Template
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {localItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No items in this template yet.</p>
                <p className="text-sm">Add headers, items, and song placeholders.</p>
              </div>
            ) : (
              localItems.map((item, index) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-md border bg-card transition-transform",
                    item.item_type === "header" && "bg-muted",
                    draggedItem?.id === item.id && "opacity-50"
                  )}
                >
                  <div className="cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </div>
                  
                  <span
                    className={cn(
                      "flex-1 cursor-pointer hover:text-primary",
                      item.item_type === "header" && "font-semibold uppercase"
                    )}
                    onClick={() => handleStartEditItem(item)}
                  >
                    {item.title}
                  </span>
                  {item.item_type !== "header" && (
                    <span 
                      className="text-sm text-muted-foreground w-12 text-right cursor-pointer hover:text-primary"
                      onClick={() => handleStartEditItem(item)}
                    >
                      {formatDuration(item.default_duration_seconds)}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleStartEditItem(item)}
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDeleteItem(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              ))
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddItemDialogOpen(true)}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Template Item
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Template Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={`e.g., ${campuses?.find((c) => c.id === selectedCampusId)?.name} Weekend Template`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={!templateName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <AddItemDialog
        open={isAddItemDialogOpen}
        onOpenChange={setIsAddItemDialogOpen}
        onAdd={handleAddItem}
        isTemplate
      />

      {/* Edit Template Name Dialog */}
      <Dialog open={isEditTemplateNameOpen} onOpenChange={setIsEditTemplateNameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Template Name</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={editedTemplateName}
                onChange={(e) => setEditedTemplateName(e.target.value)}
                placeholder="Template name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditTemplateNameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplateName} disabled={!editedTemplateName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <EditItemDialog
        open={isEditItemDialogOpen}
        onOpenChange={(open) => {
          setIsEditItemDialogOpen(open);
          if (!open) setEditingItem(null);
        }}
        item={editingItem ? {
          id: editingItem.id,
          item_type: editingItem.item_type as "header" | "item" | "song_placeholder",
          title: editingItem.title,
          default_duration_seconds: editingItem.default_duration_seconds,
        } : null}
        onSave={handleSaveItemEdit}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the template and all its items. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTemplate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
