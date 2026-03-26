import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Music, KeyRound, MailCheck, ArrowLeft } from "lucide-react";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email"),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function Auth() {
  const { user, isLoading: authLoading, signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [hasResolvedMustChangePassword, setHasResolvedMustChangePassword] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Password reset state
  const [resetEmail, setResetEmail] = useState("");

  // Signup form state
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupEmailSentTo, setSignupEmailSentTo] = useState("");

  // Change password form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Handle magic link / invite token from URL
  useEffect(() => {
    const handleAuthCallback = async () => {
      // Check if there's an access_token or error in the URL hash (magic link flow)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const searchParams = new URLSearchParams(window.location.search);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const error = hashParams.get('error');
      const errorDescription = hashParams.get('error_description');
      const mode = searchParams.get("mode");

      if (error) {
        toast({
          title: "Authentication Error",
          description: errorDescription || error,
          variant: "destructive",
        });
        // Clear the hash
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }

      if (accessToken && refreshToken) {
        // Set the session from the tokens
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          toast({
            title: "Sign in failed",
            description: sessionError.message,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Email confirmed",
            description:
              mode === "confirm-signup"
                ? "Your email is confirmed and you're signed in. Add a password from your profile whenever you're ready."
                : "You've been signed in successfully.",
          });
        }

        // Clear the hash from URL
        window.history.replaceState(null, '', window.location.pathname);
      }
    };

    handleAuthCallback();
  }, [toast]);

  // Check if user must change password after login
  useEffect(() => {
    if (user && !authLoading) {
      setHasResolvedMustChangePassword(false);
      supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          setMustChangePassword(Boolean(data?.must_change_password));
          setHasResolvedMustChangePassword(true);
        });
      return;
    }

    setMustChangePassword(false);
    setHasResolvedMustChangePassword(!authLoading);
  }, [user, authLoading]);

  // Redirect if logged in and doesn't need to change password
  if (user && !authLoading && hasResolvedMustChangePassword && !mustChangePassword) {
    return <Navigate to="/" replace />;
  }

  const handleResetPassword = async () => {
    const emailToUse = (resetEmail || loginEmail).trim();
    const validation = z.string().email("Please enter a valid email").safeParse(emailToUse);

    if (!validation.success) {
      toast({
        title: "Validation error",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsResetting(true);
    const redirectTo = `${window.location.origin}/auth`;
    const { error } = await supabase.auth.resetPasswordForEmail(emailToUse, { redirectTo });
    setIsResetting(false);

    if (error) {
      toast({
        title: "Reset failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Check your email",
      description: "We sent a password reset link if an account exists for that email.",
    });
    setIsResetOpen(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!validation.success) {
      toast({
        title: "Validation error",
        description: validation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsLoading(false);

    if (error) {
      toast({
        title: "Sign in failed",
        description: error.message === "Invalid login credentials" 
          ? "Invalid email or password. Please try again."
          : error.message,
        variant: "destructive",
      });
    }
    // Note: mustChangePassword check happens via useEffect after user state updates
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = changePasswordSchema.safeParse({ newPassword, confirmPassword });
    if (!validation.success) {
      toast({
        title: "Validation error",
        description: validation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);
    
    try {
      // Update password
      const { data, error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      
      console.log("Password update response:", { data, error: updateError });
      
      if (updateError) {
        setIsChangingPassword(false);
        toast({
          title: "Failed to update password",
          description: updateError.message || "An error occurred while updating your password. Please try again.",
          variant: "destructive",
        });
        return;
      }

      if (!data?.user) {
        setIsChangingPassword(false);
        toast({
          title: "Failed to update password",
          description: "Session may have expired. Please sign out and sign in again.",
          variant: "destructive",
        });
        return;
      }
    } catch (err) {
      console.error("Password update exception:", err);
      setIsChangingPassword(false);
      toast({
        title: "Failed to update password",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      return;
    }

    // Clear the must_change_password flag
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user!.id);

    setIsChangingPassword(false);

    if (profileError) {
      toast({
        title: "Password updated",
        description: "Your password was changed, but there was an issue updating your profile.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Password changed",
      description: "Your password has been updated successfully.",
    });
    
    setMustChangePassword(false);
  };

  const submitSignup = async () => {
    const validation = signupSchema.safeParse({
      fullName: signupName,
      email: signupEmail,
    });

    if (!validation.success) {
      toast({
        title: "Validation error",
        description: validation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(signupEmail, signupName);
    setIsLoading(false);

    if (error) {
      if (error.message.includes("already registered")) {
        toast({
          title: "Account exists",
          description: "An account with this email already exists. Please sign in or reset your password instead.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sign up failed",
          description: error.message,
          variant: "destructive",
        });
      }
      return;
    }

    setSignupEmailSentTo(signupEmail.trim());
    toast({
      title: "Check your email",
      description: "We sent a confirmation link to finish setting up your account.",
    });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitSignup();
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show change password screen if required
  if (mustChangePassword && user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-warm px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-worship">
              <KeyRound className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="font-display text-3xl font-bold text-foreground">Change Password</h1>
            <p className="mt-2 text-muted-foreground">Please set a new password to continue</p>
          </div>

          <Card className="shadow-worship">
            <CardHeader>
              <CardTitle>Set Your Password</CardTitle>
              <CardDescription>
                Your account was created with a temporary password. Please choose a new secure password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isChangingPassword}>
                  {isChangingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Update Password
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-warm px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo and title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-worship">
            <Music className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">Worship Leader</h1>
          <p className="mt-2 text-muted-foreground">Manage your worship team with ease</p>
        </div>

        <Card className="shadow-worship">
          <Tabs defaultValue="login">
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="login" className="mt-0">
                <CardTitle className="mb-1 text-xl">Welcome back</CardTitle>
                <CardDescription className="mb-6">
                  Sign in to access your team dashboard
                </CardDescription>
                <Dialog
                  open={isResetOpen}
                  onOpenChange={(open) => {
                    setIsResetOpen(open);
                    if (open) setResetEmail(loginEmail);
                  }}
                >
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="you@church.org"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password">Password</Label>
                        <DialogTrigger asChild>
                          <Button type="button" variant="link" size="sm" className="h-auto p-0">
                            Forgot password?
                          </Button>
                        </DialogTrigger>
                      </div>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Sign In
                    </Button>
                  </form>

                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Reset your password</DialogTitle>
                      <DialogDescription>
                        Enter your email and we’ll send a password reset link.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                      <Label htmlFor="reset-email">Email</Label>
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="you@church.org"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                      />
                    </div>

                    <DialogFooter>
                      <Button type="button" variant="secondary" onClick={() => setIsResetOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="button" onClick={handleResetPassword} disabled={isResetting}>
                        {isResetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Send reset link
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <CardTitle className="mb-1 text-xl">Join the team</CardTitle>
                <CardDescription className="mb-6">
                  Start with your name and email, then confirm your address to finish joining
                </CardDescription>
                {signupEmailSentTo ? (
                  <div className="space-y-5 rounded-2xl border border-border/70 bg-muted/30 p-5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-worship">
                        <MailCheck className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">Confirm your email address</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          We sent a confirmation email to <span className="font-medium text-foreground">{signupEmailSentTo}</span>.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-4">
                      <p className="text-sm font-medium text-foreground">Next steps</p>
                      <ol className="space-y-2 text-sm text-muted-foreground">
                        <li>1. Open the email from Supabase Auth and click the confirmation button.</li>
                        <li>2. Return to this app. We&apos;ll sign you in automatically after your email is confirmed.</li>
                        <li>3. After you&apos;re in, you can add a password later from your profile if you want.</li>
                      </ol>
                    </div>

                    <div className="flex flex-col gap-2 md:flex-row">
                      <Button
                        type="button"
                        className="h-auto w-full min-w-0 whitespace-normal py-3 text-center md:flex-1"
                        onClick={() => void submitSignup()}
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Resend confirmation email
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto w-full min-w-0 whitespace-normal py-3 text-center md:flex-1"
                        onClick={() => {
                          setSignupEmailSentTo("");
                        }}
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Use a different email
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="John Smith"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@church.org"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
                      <p className="text-sm font-medium text-foreground">No password needed right now</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        We&apos;ll email you a confirmation link so you can verify your address first.
                      </p>
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Continue with Email
                    </Button>
                  </form>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          The first user to sign up will become a team leader with full access.
        </p>
      </div>
    </div>
  );
}
