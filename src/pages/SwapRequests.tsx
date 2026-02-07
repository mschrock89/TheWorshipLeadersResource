import { Link } from "react-router-dom";
import { SwapRequestsList } from "@/components/calendar/SwapRequestsList";
import { RefreshableContainer } from "@/components/layout/RefreshableContainer";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ArrowLeftRight, Home } from "lucide-react";

export default function SwapRequests() {
  return (
    <RefreshableContainer queryKeys={[["swap-requests"], ["swap-requests-count"]]}>
      <div className="container max-w-2xl mx-auto px-4 py-6">
        {/* Breadcrumb Navigation */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/dashboard" className="flex items-center gap-1.5">
                  <Home className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Swap Requests</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-full bg-primary/10 p-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Swap Requests</h1>
            <p className="text-sm text-muted-foreground">
              Manage your swap requests with other musicians
            </p>
          </div>
        </div>

        <SwapRequestsList />
      </div>
    </RefreshableContainer>
  );
}
