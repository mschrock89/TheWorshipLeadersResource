import { Eye } from "lucide-react";
import DOMPurify from "dompurify";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const STUDENT_EMAIL_BACKGROUND_URL =
  "https://fgemlokxbugfihaxbfyp.supabase.co/storage/v1/object/public/email-assets/experience-students-email-background.png";

interface EmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewName?: string;
  previewEmail?: string;
  previewCampus?: string;
  isResend?: boolean;
  resourceAppKey?: ResourceAppKey;
}

type ResourceAppKey = "my_church_resource" | "worship" | "students_hs" | "students_ms";

interface PreviewEmailTheme {
  resourceAppKey: ResourceAppKey;
  appName: string;
  appLabel: string;
  portalLabel: string;
  familyLabel: string;
  teamDescription: string;
  contactLabel: string;
  signature: string;
  footerReason: string;
  accent: string;
  accentDark: string;
  warmAccent: string;
  pageBackground: string;
  tableBackground: string;
  headerBackground: string;
  headerText: string;
  bodyText: string;
  mutedText: string;
  borderColor: string;
  credentialsBackground: string;
  backgroundImageUrl?: string;
}

function isStudentResourceAppKey(resourceAppKey: ResourceAppKey) {
  return resourceAppKey === "students_hs" || resourceAppKey === "students_ms";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getPreviewEmailTheme(resourceAppKey: ResourceAppKey): PreviewEmailTheme {
  if (isStudentResourceAppKey(resourceAppKey)) {
    const gradeLabel = resourceAppKey === "students_hs" ? "HS" : "MS";

    return {
      resourceAppKey,
      appName: `Experience Students ${gradeLabel}`,
      appLabel: "Experience Students",
      portalLabel: `${gradeLabel} Resource`,
      familyLabel: `Experience Students ${gradeLabel}`,
      teamDescription: "student ministry team",
      contactLabel: "student pastor",
      signature: "The ECC Students Team",
      footerReason: "student ministry team",
      accent: "#FF7A1A",
      accentDark: "#E23A12",
      warmAccent: "#FFB21A",
      pageBackground: "#ffffff",
      tableBackground: "#170B05",
      headerBackground: "#FF7A1A",
      headerText: "#ffffff",
      bodyText: "#F8E9DD",
      mutedText: "#F6C7A5",
      borderColor: "#763114",
      credentialsBackground: "#241007",
      backgroundImageUrl: STUDENT_EMAIL_BACKGROUND_URL,
    };
  }

  return {
    resourceAppKey: "worship",
    appName: "Experience Music",
    appLabel: "Experience Music",
    portalLabel: "Worship Leader's Resource",
    familyLabel: "Experience Community Worship",
    teamDescription: "worship team",
    contactLabel: "campus worship pastor",
    signature: "The ECC Worship Team",
    footerReason: "worship team",
    accent: "#35B0E5",
    accentDark: "#27749D",
    warmAccent: "#FFB838",
    pageBackground: "#000000",
    tableBackground: "#000000",
    headerBackground: "#000000",
    headerText: "#ffffff",
    bodyText: "#a3a3a3",
    mutedText: "#a3a3a3",
    borderColor: "#262626",
    credentialsBackground: "#1a1a1a",
  };
}

// Generate the same email HTML as the edge function (client-side preview)
function generatePreviewHtml(
  firstName: string,
  campusName: string | undefined,
  userEmail: string,
  isResend: boolean,
  resourceAppKey: ResourceAppKey
): string {
  const loginUrl = "#"; // Placeholder for preview
  const theme = getPreviewEmailTheme(resourceAppKey);
  const safeFirstName = escapeHtml(firstName);
  const safeCampusName = campusName ? escapeHtml(campusName) : undefined;
  const safeUserEmail = escapeHtml(userEmail);
  const headerBackgroundImageAttributes = theme.backgroundImageUrl
    ? ` background="${escapeHtml(theme.backgroundImageUrl)}"`
    : "";
  const headerBackgroundImageStyle = theme.backgroundImageUrl
    ? ` background-image: url('${escapeHtml(theme.backgroundImageUrl)}'); background-size: cover; background-position: center 8%;`
    : "";
  const isStudentEmail = isStudentResourceAppKey(theme.resourceAppKey);
  const headerHtml = isStudentEmail
    ? `
    <!-- Brand Header -->
    <tr>
      <td${headerBackgroundImageAttributes} height="400" style="height: 400px; padding: 0; text-align: center; background-color: ${theme.headerBackground};${headerBackgroundImageStyle} line-height: 0; font-size: 0;">
        &nbsp;
      </td>
    </tr>
    `
    : `
    <!-- Brand Header -->
    <tr>
      <td style="padding: 32px 48px 16px; text-align: center; background-color: ${theme.headerBackground};">
        <div style="color: ${theme.headerText}; font-size: 34px; font-weight: 800; letter-spacing: 0.01em; line-height: 1.1; margin: 0;">
          ${theme.appLabel}
        </div>
      </td>
    </tr>
    
    <!-- Header Text -->
    <tr>
      <td style="padding: 0 48px 24px; text-align: center;">
        <p style="color: ${theme.accent}; font-size: 12px; font-weight: 600; letter-spacing: 3px; margin: 0; text-transform: uppercase;">${theme.portalLabel}</p>
      </td>
    </tr>
    
    <!-- Accent Line -->
    <tr>
      <td style="padding: 0 48px;">
        <div style="height: 2px; background: linear-gradient(90deg, transparent, ${theme.accent}, transparent);"></div>
      </td>
    </tr>
    `;

  return `
<!DOCTYPE html>
<html style="background-color: ${theme.pageBackground};">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body bgcolor="${theme.pageBackground}" style="margin: 0; padding: 0; font-family: 'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; background-color: ${theme.pageBackground};">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${theme.pageBackground}" style="max-width: 600px; margin: 0 auto; background-color: ${theme.pageBackground};">
    <tr>
      <td align="center" bgcolor="${theme.pageBackground}" style="background-color: ${theme.pageBackground}; padding: 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.tableBackground}" style="width: 600px; max-width: 600px; background-color: ${theme.tableBackground};">
    ${headerHtml}
    
    <!-- Main Content -->
    <tr>
      <td style="padding: 32px 48px;">
        <h2 style="color: ${theme.headerText}; font-size: 26px; font-weight: 700; line-height: 1.3; margin: 0 0 24px;">
          ${isResend ? `Hey ${safeFirstName}, just a reminder!` : `Welcome to the team, ${safeFirstName}!`}
        </h2>
        
        <p style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          ${isResend 
            ? `We wanted to make sure you got set up with the ${theme.familyLabel} team portal${safeCampusName ? ` at our <span style="color: ${theme.accent}; font-weight: 600;">${safeCampusName}</span> campus` : ''}.`
            : `We're thrilled to have you join the ${theme.familyLabel} family${safeCampusName ? ` at our <span style="color: ${theme.accent}; font-weight: 600;">${safeCampusName}</span> campus` : ''}!`
          }
        </p>

        <p style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          As a member of our ${theme.teamDescription}, you'll have access to our team portal where you can:
        </p>

        <ul style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 0 0 24px; padding-left: 24px;">
          <li style="margin-bottom: 8px;">View upcoming schedules and events</li>
          <li style="margin-bottom: 8px;">Connect with other team members</li>
          <li style="margin-bottom: 8px;">Update your profile and availability</li>
        </ul>

        <p style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          To get started, use these credentials to sign in:
        </p>

        <!-- Credentials Box -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
          <tr>
            <td style="background-color: ${theme.credentialsBackground}; border: 1px solid ${theme.borderColor}; border-radius: 12px; padding: 20px;">
              <p style="color: #d4d4d4; font-size: 14px; margin: 0 0 8px;">
                <strong style="color: ${theme.mutedText};">Email:</strong> <span style="color: ${theme.accent};">${safeUserEmail}</span>
              </p>
              <p style="color: #d4d4d4; font-size: 14px; margin: 0;">
                <strong style="color: ${theme.mutedText};">Temporary Password:</strong> <code style="background: ${theme.borderColor}; padding: 4px 10px; border-radius: 6px; font-family: monospace; color: ${theme.warmAccent}; font-weight: 600;">123456</code>
              </p>
            </td>
          </tr>
        </table>

        <p style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          You'll be asked to create a new password when you first log in.
        </p>

        <!-- Button -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
          <tr>
            <td align="center">
              <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, ${theme.accent}, ${theme.accentDark}); border-radius: 10px; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 16px 40px; box-shadow: 0 4px 20px rgba(255, 122, 26, 0.3);">
                Sign In Now
              </a>
            </td>
          </tr>
        </table>

        <p style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          If you have any questions or need assistance, don't hesitate to reach out to your ${theme.contactLabel}. We're here to help you settle in and thrive!
        </p>

        <p style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 32px 0 0;">
          See you soon,<br>
          <strong style="color: ${theme.headerText};">${theme.signature}</strong>
        </p>
      </td>
    </tr>
    
    <!-- Accent Line -->
    <tr>
      <td style="padding: 0 48px;">
        <div style="height: 1px; background: linear-gradient(90deg, transparent, ${theme.borderColor}, transparent);"></div>
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="padding: 24px 48px; text-align: center;">
        <p style="color: ${theme.mutedText}; font-size: 14px; margin: 0 0 8px;">Experience Community Church</p>
        <p style="color: ${theme.mutedText}; font-size: 12px; line-height: 18px; margin: 0;">
          This email was sent because you were added to the ${theme.footerReason}.<br>
          If you believe this was a mistake, please contact your ${theme.contactLabel}.
        </p>
      </td>
    </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function EmailPreviewDialog({
  open,
  onOpenChange,
  previewName = "John",
  previewEmail = "john.smith@example.com",
  previewCampus,
  isResend = false,
  resourceAppKey = "worship",
}: EmailPreviewDialogProps) {
  const rawHtml = generatePreviewHtml(previewName, previewCampus, previewEmail, isResend, resourceAppKey);
  const emailHtml = DOMPurify.sanitize(rawHtml);
  const previewBackground = isStudentResourceAppKey(resourceAppKey) ? "bg-white" : "bg-[#0a0a0a]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Email Preview
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[70vh] rounded-md border border-border">
          <div
            className={`${previewBackground} p-4`}
            dangerouslySetInnerHTML={{ __html: emailHtml }}
          />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
