type CapabilityClient = {
  rpc: (
    fn: string,
    args: { _user_id: string; _cap: string; _app: string },
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
};

export function resourceAppFromRequest(req: Request) {
  return req.headers.get("x-resource-app-key") || "worship";
}

export async function userHasAnyCapability(
  client: CapabilityClient,
  userId: string,
  capabilities: string[],
  app: string,
) {
  for (const capability of capabilities) {
    const { data, error } = await client.rpc("has_capability", {
      _user_id: userId,
      _cap: capability,
      _app: app,
    });
    if (error) throw error;
    if (data) return true;
  }
  return false;
}
