import { Eye } from "lucide-react";
import DOMPurify from "dompurify";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
interface EmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewName?: string;
  previewEmail?: string;
  previewCampus?: string;
  isResend?: boolean;
}

// Generate the same email HTML as the edge function (client-side preview)
// ECC Brand Colors: Blue #35B0E5, Dark Blue #27749D, Yellow #FFB838
function generatePreviewHtml(
  firstName: string,
  campusName: string | undefined,
  userEmail: string,
  isResend: boolean
): string {
  const loginUrl = "#"; // Placeholder for preview
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; background-color: #0a0a0a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #0d0d0d;">
    <!-- Logo Header -->
    <tr>
      <td style="padding: 32px 48px 16px; text-align: center; background: linear-gradient(180deg, #141414 0%, #0d0d0d 100%);">
        <img src="https://worshipleadersresource.lovable.app/lovable-uploads/c439528b-da42-46da-b665-52d1dfe138fb.png" alt="Experience Music" style="height: 60px; width: auto;" />
      </td>
    </tr>
    
    <!-- Header Text -->
    <tr>
      <td style="padding: 0 48px 24px; text-align: center;">
        <p style="color: #35B0E5; font-size: 12px; font-weight: 600; letter-spacing: 3px; margin: 0; text-transform: uppercase;">Worship Team Portal</p>
      </td>
    </tr>
    
    <!-- Accent Line -->
    <tr>
      <td style="padding: 0 48px;">
        <div style="height: 2px; background: linear-gradient(90deg, transparent, #35B0E5, transparent);"></div>
      </td>
    </tr>
    
    <!-- Main Content -->
    <tr>
      <td style="padding: 32px 48px;">
        <h2 style="color: #ffffff; font-size: 26px; font-weight: 700; line-height: 1.3; margin: 0 0 24px;">
          ${isResend ? `Hey ${firstName}, just a reminder! 🎵` : `Welcome to the team, ${firstName}! 🎵`}
        </h2>
        
        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          ${isResend 
            ? `We wanted to make sure you got set up with the Experience Community Worship team portal${campusName ? ` at our <span style="color: #35B0E5; font-weight: 600;">${campusName}</span> campus` : ''}.`
            : `We're thrilled to have you join the Experience Community Worship family${campusName ? ` at our <span style="color: #35B0E5; font-weight: 600;">${campusName}</span> campus` : ''}!`
          }
        </p>

        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          As a member of our worship team, you'll have access to our team portal where you can:
        </p>

        <ul style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 24px; padding-left: 24px;">
          <li style="margin-bottom: 8px;">View upcoming schedules and events</li>
          <li style="margin-bottom: 8px;">Connect with other team members</li>
          <li style="margin-bottom: 8px;">Update your profile and availability</li>
        </ul>

        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          To get started, use these credentials to sign in:
        </p>

        <!-- Credentials Box -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
          <tr>
            <td style="background-color: #1a1a1a; border: 1px solid #262626; border-radius: 12px; padding: 20px;">
              <p style="color: #d4d4d4; font-size: 14px; margin: 0 0 8px;">
                <strong style="color: #737373;">Email:</strong> <span style="color: #35B0E5;">${userEmail}</span>
              </p>
              <p style="color: #d4d4d4; font-size: 14px; margin: 0;">
                <strong style="color: #737373;">Temporary Password:</strong> <code style="background: #262626; padding: 4px 10px; border-radius: 6px; font-family: monospace; color: #FFB838; font-weight: 600;">123456</code>
              </p>
            </td>
          </tr>
        </table>

        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          You'll be asked to create a new password when you first log in.
        </p>

        <!-- Button -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
          <tr>
            <td align="center">
              <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #35B0E5, #27749D); border-radius: 10px; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 16px 40px; box-shadow: 0 4px 20px rgba(53, 176, 229, 0.3);">
                Sign In Now
              </a>
            </td>
          </tr>
        </table>

        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          If you have any questions or need assistance, don't hesitate to reach out to your campus worship pastor. We're here to help you settle in and thrive!
        </p>

        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 32px 0 0;">
          See you soon,<br>
          <strong style="color: #ffffff;">The ECC Worship Team</strong>
        </p>
      </td>
    </tr>
    
    <!-- Accent Line -->
    <tr>
      <td style="padding: 0 48px;">
        <div style="height: 1px; background: linear-gradient(90deg, transparent, #262626, transparent);"></div>
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="padding: 24px 48px; text-align: center;">
        <p style="color: #525252; font-size: 14px; margin: 0 0 8px;">Experience Community Church</p>
        <p style="color: #404040; font-size: 12px; line-height: 18px; margin: 0;">
          This email was sent because you were added to the worship team.<br>
          If you believe this was a mistake, please contact your campus worship pastor.
        </p>
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
}: EmailPreviewDialogProps) {
  const rawHtml = generatePreviewHtml(previewName, previewCampus, previewEmail, isResend);
  const emailHtml = DOMPurify.sanitize(rawHtml);

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
            className="bg-[#0a0a0a] p-4"
            dangerouslySetInnerHTML={{ __html: emailHtml }}
          />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
