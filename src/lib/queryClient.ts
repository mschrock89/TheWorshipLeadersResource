import { QueryClient } from "@tanstack/react-query";

function retryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 1) return false;
  const status =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status?: number }).status)
      : 0;
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code)
      : "";
  if (status === 401 || status === 403 || status === 404 || status === 429) return false;
  if (code === "42501" || code === "PGRST301" || code === "PGRST116") return false;
  return true;
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        // A room of phones locking and unlocking together was refetching
        // every query at the same moment. Navigation still refreshes stale data.
        refetchOnWindowFocus: false,
        retry: retryQuery,
        retryDelay: (attempt) => 800 * (attempt + 1) + Math.floor(Math.random() * 700),
      },
    },
  });
}
