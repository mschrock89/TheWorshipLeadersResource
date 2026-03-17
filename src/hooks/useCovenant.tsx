import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export interface CovenantDocument {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  storage_path: string;
  version_label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CovenantSignature {
  id: string;
  document_id: string;
  user_id: string;
  typed_name: string;
  signed_at: string;
  created_at: string;
  updated_at: string;
  user_agent: string | null;
}

export interface ActiveCovenantPayload {
  document: CovenantDocument;
  signature: CovenantSignature | null;
  signedUrl: string | null;
}

export function useActiveCovenant(userId?: string) {
  const { user, isLoading } = useAuth();

  return useQuery({
    queryKey: ["active-covenant", userId],
    enabled: !!user && !isLoading,
    queryFn: async () => {
      const db = supabase as any;
      const { data: document, error: documentError } = await db
        .from("covenant_documents")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (documentError) throw documentError;
      if (!document) return null as ActiveCovenantPayload | null;

      const [signedUrlResult, signatureResult] = await Promise.all([
        supabase.storage
          .from("covenant_documents")
          .createSignedUrl(document.storage_path, 60 * 60),
        userId
          ? db
              .from("covenant_signatures")
              .select("*")
              .eq("document_id", document.id)
              .eq("user_id", userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (signedUrlResult.error) throw signedUrlResult.error;
      if (signatureResult.error) throw signatureResult.error;

      return {
        document: document as CovenantDocument,
        signature: (signatureResult.data ?? null) as CovenantSignature | null,
        signedUrl: signedUrlResult.data?.signedUrl ?? null,
      } satisfies ActiveCovenantPayload;
    },
  });
}

export function useCovenantSignatureCount(documentId?: string) {
  const { user, isLoading } = useAuth();

  return useQuery({
    queryKey: ["covenant-signature-count", documentId],
    enabled: !!user && !isLoading && !!documentId,
    queryFn: async () => {
      const db = supabase as any;
      const { count, error } = await db
        .from("covenant_signatures")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId);

      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useSignCovenant() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      documentId,
      typedName,
      userId,
    }: {
      documentId: string;
      typedName: string;
      userId: string;
    }) => {
      const db = supabase as any;
      const { data, error } = await db
        .from("covenant_signatures")
        .upsert(
          {
            document_id: documentId,
            user_id: userId,
            typed_name: typedName.trim(),
            signed_at: new Date().toISOString(),
            user_agent: navigator.userAgent,
          },
          {
            onConflict: "document_id,user_id",
          }
        )
        .select("*")
        .single();

      if (error) throw error;
      return data as CovenantSignature;
    },
    onSuccess: (signature) => {
      queryClient.invalidateQueries({ queryKey: ["active-covenant", signature.user_id] });
      queryClient.invalidateQueries({ queryKey: ["covenant-signature-count", signature.document_id] });
      toast({
        title: "Covenant signed",
        description: "Your Covenant acknowledgment has been saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to sign Covenant",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUploadCovenantDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      file,
      title,
      description,
      versionLabel,
      userId,
    }: {
      file: File;
      title: string;
      description?: string;
      versionLabel: string;
      userId: string;
    }) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("covenant_documents")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: "application/pdf",
        });

      if (uploadError) throw uploadError;

      const db = supabase as any;
      const { error: clearError } = await db
        .from("covenant_documents")
        .update({ is_active: false })
        .eq("is_active", true);

      if (clearError) throw clearError;

      const { data, error } = await db
        .from("covenant_documents")
        .insert({
          title: title.trim(),
          description: description?.trim() || null,
          file_name: file.name,
          storage_path: path,
          version_label: versionLabel.trim(),
          is_active: true,
          created_by: userId,
        })
        .select("*")
        .single();

      if (error) throw error;
      return data as CovenantDocument;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-covenant"] });
      queryClient.invalidateQueries({ queryKey: ["covenant-signature-count"] });
      toast({
        title: "Covenant published",
        description: "The new Covenant PDF is now live on every dashboard.",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to publish Covenant",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
