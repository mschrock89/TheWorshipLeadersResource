import { useLayoutEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ServiceFlowEditor,
  type ServiceFlowEditorHandle,
} from "@/components/service-flow/ServiceFlowEditor";
import { cn } from "@/lib/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const EXPORT_MODE_CLASS = "service-flow-export-mode";

function clearServiceFlowExportMode() {
  document.documentElement.classList.remove(EXPORT_MODE_CLASS);
}

export default function ServiceFlow() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab === "view" ? "view" : "editor";
  const editorRef = useRef<ServiceFlowEditorHandle>(null);
  
  // Get initial values from URL query params (from Calendar LIVE button)
  const initialDate = searchParams.get("date") || undefined;
  const initialCampus = searchParams.get("campus") || undefined;
  const initialMinistry = searchParams.get("ministry") || undefined;
  const initialDraftSetId = searchParams.get("draftSetId") || undefined;
  const initialCustomServiceId = searchParams.get("customServiceId") || undefined;

  // Print/export CSS can stick if afterprint never fires and blanks the editor.
  // Clear before paint on enter/leave so the full page is never stuck empty.
  useLayoutEffect(() => {
    clearServiceFlowExportMode();
    return () => {
      clearServiceFlowExportMode();
    };
  }, []);

  // Format date for print header
  const formatPrintDate = () => {
    if (!initialDate) return "";
    const date = new Date(initialDate + "T00:00:00");
    // Get Saturday and Sunday of the weekend
    const dayOfWeek = date.getDay();
    const saturday = new Date(date);
    if (dayOfWeek === 0) {
      // If Sunday, go back to Saturday
      saturday.setDate(date.getDate() - 1);
    } else if (dayOfWeek !== 6) {
      // If not Saturday or Sunday, find next Saturday
      saturday.setDate(date.getDate() + (6 - dayOfWeek));
    }
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    
    const options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };
    const satStr = saturday.toLocaleDateString("en-US", options);
    const sunStr = sunday.toLocaleDateString("en-US", { day: "numeric" });
    const year = saturday.getFullYear();
    
    return `${satStr}-${sunStr}, ${year}`;
  };

  const handleTabChange = (value: string) => {
    // Preserve other params when changing tabs
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", value);
    setSearchParams(newParams);
  };

  const handleBack = () => {
    clearServiceFlowExportMode();
    editorRef.current?.releasePrint();

    // Always go to Calendar explicitly — history back can bounce oddly in the PWA
    // and leave export-mode CSS stuck on a blank Service Flow screen.
    const params = new URLSearchParams();
    if (initialDate) params.set("date", initialDate);
    if (initialCampus) params.set("campus", initialCampus);
    if (initialMinistry) params.set("ministry", initialMinistry);
    navigate(params.toString() ? `/calendar?${params.toString()}` : "/calendar");
  };

  const printWithExportMode = async () => {
    await editorRef.current?.preparePrint();

    const printableNode = document.querySelector(".service-flow-print-render");
    if (!printableNode || !(printableNode instanceof HTMLElement)) {
      editorRef.current?.releasePrint();
      window.print();
      return;
    }

    // Print from the live page so Tailwind + print CSS are already loaded.
    const html = document.documentElement;
    const previousTitle = document.title;
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearServiceFlowExportMode();
      document.title = previousTitle;
      editorRef.current?.releasePrint();
      window.removeEventListener("afterprint", cleanup);
    };

    document.title = "Service Flow Print";
    html.classList.add(EXPORT_MODE_CLASS);
    window.addEventListener("afterprint", cleanup);

    window.setTimeout(() => {
      window.print();
      // Fallback if afterprint does not fire in this browser.
      window.setTimeout(cleanup, 1500);
    }, 50);
  };

  const handlePrint = () => {
    void printWithExportMode();
  };

  const handleExport = () => {
    // Trigger print/share flow which allows saving as PDF
    void printWithExportMode();
  };

  return (
    <div className="service-flow-page service-flow-print-fit service-flow-half-sheet space-y-6 p-4 md:p-6">
      {/* Legacy print header kept for non-dual layouts; hidden for current half-sheet print mode */}
      <div className="print-header hidden mb-8 pb-4 border-b-2">
        <div className="print-header-copy">
          <h1 className="text-3xl font-bold print-title">Service Flow</h1>
          <p className="text-2xl font-semibold print-date mt-1">
            {formatPrintDate()}
          </p>
        </div>
      </div>

      {/* Back stays outside .screen-header so it remains usable if export-mode CSS sticks. */}
      <div className="service-flow-back-row flex items-center gap-2 print:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          aria-label="Back to calendar"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <button
          type="button"
          onClick={handleBack}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Back
        </button>
      </div>

      {/* Screen-only header - hidden on print */}
      <div className="screen-header flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Service Flow</h1>
            <p className="text-muted-foreground">
              Plan your order of service with timing and song integration.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-start">
          <div className="hidden rounded-full border border-border bg-muted/40 p-1 sm:flex">
            <button
              type="button"
              onClick={() => handleTabChange("view")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === "view"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              View
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("editor")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === "editor"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Edit
            </button>
          </div>
          <TooltipProvider delayDuration={150}>
            <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-background/50 p-1 shadow-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleExport}
                    aria-label="Export service flow"
                    className="h-9 w-9 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Export</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrint}
                    aria-label="Print service flow"
                    className="h-9 w-9 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Print</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>

      <ServiceFlowEditor
        ref={editorRef}
        initialDate={initialDate}
        initialCampusId={initialCampus}
        initialMinistryType={initialMinistry}
        initialDraftSetId={initialDraftSetId}
        initialCustomServiceId={initialCustomServiceId}
        mode={activeTab}
      />
    </div>
  );
}
