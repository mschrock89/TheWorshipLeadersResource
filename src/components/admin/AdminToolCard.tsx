import * as React from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const AdminToolCard = React.forwardRef<
  React.ElementRef<typeof Card>,
  React.ComponentPropsWithoutRef<typeof Card>
>(({ className, ...props }, ref) => (
  <Card
    ref={ref}
    className={cn("mb-4 w-full overflow-hidden sm:mb-6", className)}
    {...props}
  />
));
AdminToolCard.displayName = "AdminToolCard";

const AdminToolCardHeader = React.forwardRef<
  React.ElementRef<typeof CardHeader>,
  React.ComponentPropsWithoutRef<typeof CardHeader>
>(({ className, ...props }, ref) => (
  <CardHeader
    ref={ref}
    className={cn("px-4 pt-4 sm:px-6 sm:pt-6", className)}
    {...props}
  />
));
AdminToolCardHeader.displayName = "AdminToolCardHeader";

const AdminToolCardContent = React.forwardRef<
  React.ElementRef<typeof CardContent>,
  React.ComponentPropsWithoutRef<typeof CardContent>
>(({ className, ...props }, ref) => (
  <CardContent
    ref={ref}
    className={cn("px-4 pb-4 sm:px-6 sm:pb-6", className)}
    {...props}
  />
));
AdminToolCardContent.displayName = "AdminToolCardContent";

export { AdminToolCard, AdminToolCardContent, AdminToolCardHeader };
