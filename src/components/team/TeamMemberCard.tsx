import { useLocation, useNavigate } from "react-router-dom";
import { Profile } from "@/hooks/useProfiles";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Cake, Heart, MapPin, Mail, CheckCircle, MessageCircle, KeyRound, Trash2 } from "lucide-react";
import { format, isValid } from "date-fns";
import { parseLocalDate } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TeamMemberCardProps {
  member: Profile;
  campusNames?: string[];
  onSendEmail?: (member: Profile) => void;
  onResetPassword?: (member: Profile) => void;
  onDelete?: (member: Profile) => void;
}

export function TeamMemberCard({
  member,
  campusNames = [],
  onSendEmail,
  onResetPassword,
  onDelete,
}: TeamMemberCardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const scrollStorageKey = `team-directory-scroll:${location.search || "default"}`;
  const birthdayDate = member.birthday ? parseLocalDate(member.birthday) : null;
  const anniversaryDate = member.anniversary ? parseLocalDate(member.anniversary) : null;
  const hasValidBirthday = Boolean(birthdayDate && isValid(birthdayDate));
  const hasValidAnniversary = Boolean(anniversaryDate && isValid(anniversaryDate));
  const welcomeEmailDate = member.welcome_email_sent_at ? new Date(member.welcome_email_sent_at) : null;
  const hasValidWelcomeEmailDate = Boolean(welcomeEmailDate && isValid(welcomeEmailDate));
  
  const initials = member.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || (member.email ?? "").substring(0, 2).toUpperCase() || "TM";

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    sessionStorage.setItem(scrollStorageKey, String(window.scrollY));
    navigate(`/team/${member.id}${location.search}`);
  };

  const handleEmailClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSendEmail?.(member);
  };

  const handlePhoneClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (member.phone) {
      window.open(`tel:${member.phone}`, '_self');
    }
  };

  const handleSmsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (member.phone) {
      window.open(`sms:${member.phone}`, '_self');
    }
  };

  const handleMailtoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(`mailto:${member.email}`, '_self');
  };

  const handleResetPasswordClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onResetPassword?.(member);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(member);
  };
  return (
    <div onClick={handleCardClick} className="cursor-pointer">
      <Card className="group h-full transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 animate-fade-in border-0 shadow-lg bg-card">
        <CardContent className="p-0">
          {/* Header with bold gradient */}
          <div className="relative h-24 bg-gradient-to-br from-primary via-primary/90 to-primary/70">
            
            {/* Campus badge */}
            {campusNames.length > 0 && (
              <div className="absolute top-3 right-3">
                <Badge className="bg-white text-primary shadow-md text-xs font-semibold border-0">
                  <MapPin className="h-3 w-3 mr-1" />
                  {campusNames.length === 1 ? campusNames[0] : `${campusNames.length} campuses`}
                </Badge>
              </div>
            )}
            
            {/* Leader action buttons */}
            {(onSendEmail || onResetPassword || onDelete) && (
              <div className="absolute top-3 left-3 flex gap-1">
                {onSendEmail && (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white"
                          onClick={handleEmailClick}
                        >
                          {member.welcome_email_sent_at ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <Mail className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="z-50">
                        <p>{member.welcome_email_sent_at 
                          ? hasValidWelcomeEmailDate && welcomeEmailDate
                            ? `Emailed ${format(welcomeEmailDate, "MMM d, yyyy")} - Click to resend`
                            : "Welcome email already sent - Click to resend"
                          : "Send welcome email with login instructions"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {onResetPassword && (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white"
                          onClick={handleResetPasswordClick}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="z-50">
                        <p>Reset this member's password to the default (123456)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {onDelete && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 bg-red-500/80 hover:bg-red-600 backdrop-blur-sm text-white"
                          onClick={handleDeleteClick}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete profile</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
            
            {/* Avatar - positioned to overlap */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
              <div className="relative">
                <Avatar className="h-20 w-20 border-4 border-card shadow-xl ring-4 ring-primary/20 transition-transform duration-300 group-hover:scale-105">
                  <AvatarImage src={member.avatar_url || undefined} />
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-xl font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {/* Online/status indicator could go here */}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-5 pb-5 pt-14 text-center">
            <h3 className="font-display text-xl font-bold text-foreground group-hover:text-primary transition-colors">
              {member.full_name || "Unnamed"}
            </h3>

            {/* Divider */}
            <div className="my-4 h-px bg-border" />

            {/* Quick contact actions */}
            <div className="flex items-center justify-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-full hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200"
                      onClick={handleMailtoClick}
                    >
                      <Mail className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Email {member.full_name?.split(' ')[0] || 'member'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {member.phone && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-full hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200"
                          onClick={handlePhoneClick}
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Call {member.phone}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-full hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200"
                          onClick={handleSmsClick}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Text {member.full_name?.split(' ')[0] || 'member'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}
            </div>

            {/* Special dates */}
            {(hasValidBirthday || hasValidAnniversary) && (
              <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                {hasValidBirthday && birthdayDate && (
                  <div className="flex items-center gap-1">
                    <Cake className="h-3.5 w-3.5 text-pink-500" />
                    <span>{format(birthdayDate, "MMM d")}</span>
                  </div>
                )}
                {hasValidAnniversary && anniversaryDate && (
                  <div className="flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5 text-red-500" />
                    <span>{format(anniversaryDate, "MMM d")}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
