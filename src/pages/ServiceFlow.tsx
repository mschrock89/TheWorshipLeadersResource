import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServiceFlowEditor } from "@/components/service-flow/ServiceFlowEditor";
import { useAuth } from "@/hooks/useAuth";
import emLogo from "@/assets/em-logo-print.png";

export default function ServiceFlow() {
  const { isLeader } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "editor";
  
  // Get initial values from URL query params (from Calendar LIVE button)
  const initialDate = searchParams.get("date") || undefined;
  const initialCampus = searchParams.get("campus") || undefined;
  const initialMinistry = searchParams.get("ministry") || undefined;

  // Format date for print header
  const formatPrintDate = () => {
    if (!initialDate) return "";
    const date = new Date(initialDate + "T00:00:00");
    // Get Saturday and Sunday of the weekend
    const dayOfWeek = date.getDay();
    let saturday = new Date(date);
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
    // Navigate back to calendar with the same date if available
    if (initialDate) {
      navigate(`/calendar?date=${initialDate}`);
    } else {
      navigate(-1);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    // Trigger print dialog which allows saving as PDF
    window.print();
  };

  return (
    <div className="service-flow-page space-y-6 p-4 md:p-6">
      {/* Print-only header - hidden on screen, uses print-specific colors in CSS */}
      <div className="print-header hidden print:flex flex-row items-center justify-between mb-8 pb-4 border-b-2">
        <img 
          src={emLogo} 
          alt="Experience Music" 
          className="h-16 w-auto object-contain"
        />
        <div className="text-right">
          <h1 className="text-3xl font-bold print-title">Service Flow</h1>
          <p className="text-2xl font-semibold print-date mt-1">
            {formatPrintDate()}
          </p>
        </div>
      </div>

      {/* Screen-only header - hidden on print */}
      <div className="screen-header flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Service Flow</h1>
            <p className="text-muted-foreground">
              Plan your order of service with timing and song integration.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Print</span>
          </Button>
        </div>
      </div>

      <ServiceFlowEditor 
        initialDate={initialDate}
        initialCampusId={initialCampus}
        initialMinistryType={initialMinistry}
      />
    </div>
  );
}
