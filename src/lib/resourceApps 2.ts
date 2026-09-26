export const RESOURCE_APPS = {
  my_church_resource: {
    key: "my_church_resource",
    name: "My Church Resource",
    shortName: "MCR",
    description: "Manage your church resource apps, ministry teams, and admin tools.",
    host: "mychurchresource.com",
    pathPrefix: "/admin",
    isAdminOnly: true,
    themeColor: "#0f172a",
    iconPath: "/app-icon-512.png",
    manifestPath: "/manifest.json",
  },
  worship: {
    key: "worship",
    name: "Worship Resource",
    shortName: "Worship",
    description: "Manage your worship team, organize schedules, track songs, and keep everyone connected.",
    host: "worship.mychurchresource.com",
    pathPrefix: "/",
    isAdminOnly: false,
    // Card color, not black: bootstrap writes this into the theme-color meta,
    // and iOS paints it into the band it exposes below the short cold-start
    // viewport — so the strip reads as a continuation of the tab bar.
    themeColor: "#1c1f21",
    iconPath: "/app-icon-512.png",
    manifestPath: "/manifest.json",
  },
  students_hs: {
    key: "students_hs",
    name: "Experience Students HS",
    shortName: "Students HS",
    description: "The central hub for Experience Students high school ministry teams, follow-up, and connection.",
    host: "students.mychurchresource.com",
    pathPrefix: "/hs",
    isAdminOnly: false,
    themeColor: "#1d4ed8",
    iconPath: "/students-resource-icon.png",
    manifestPath: "/students-hs-manifest.json",
  },
  students_ms: {
    key: "students_ms",
    name: "Experience Students MS",
    shortName: "Students MS",
    description: "The central hub for Experience Students middle school ministry teams, follow-up, and connection.",
    host: "students.mychurchresource.com",
    pathPrefix: "/ms",
    isAdminOnly: false,
    themeColor: "#7c3aed",
    iconPath: "/students-resource-icon.png",
    manifestPath: "/students-ms-manifest.json",
  },
} as const;

export type ResourceAppKey = keyof typeof RESOURCE_APPS;

export const DEFAULT_RESOURCE_APP_KEY: ResourceAppKey = "worship";
export const STUDENT_RESOURCE_APP_KEYS: ResourceAppKey[] = ["students_hs", "students_ms"];

function normalizePathPrefix(prefix: string) {
  if (!prefix || prefix === "/") return "/";
  return prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
}

function pathnameMatchesPrefix(pathname: string, prefix: string) {
  const normalizedPrefix = normalizePathPrefix(prefix);
  if (normalizedPrefix === "/") return true;
  return pathname === normalizedPrefix || pathname.startsWith(`${normalizedPrefix}/`);
}

export function getResourceAppForLocation(
  hostname = typeof window !== "undefined" ? window.location.hostname : "",
  pathname = typeof window !== "undefined" ? window.location.pathname : "/",
) {
  const normalizedHostname = hostname.replace(/^www\./, "");
  const apps = Object.values(RESOURCE_APPS).sort(
    (a, b) => normalizePathPrefix(b.pathPrefix).length - normalizePathPrefix(a.pathPrefix).length,
  );

  const appForHostAndPath = apps.find(
    (app) =>
      app.host.replace(/^www\./, "") === normalizedHostname &&
      pathnameMatchesPrefix(pathname, app.pathPrefix),
  );

  return (
    appForHostAndPath ??
    apps.find((app) => app.pathPrefix !== "/" && pathnameMatchesPrefix(pathname, app.pathPrefix)) ??
    RESOURCE_APPS[DEFAULT_RESOURCE_APP_KEY]
  );
}

export function getRouterBasename() {
  const prefix = normalizePathPrefix(getResourceAppForLocation().pathPrefix);
  return prefix === "/" ? undefined : prefix;
}

export function getAppPath(path: string) {
  const prefix = getRouterBasename();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return prefix ? `${prefix}${normalizedPath === "/" ? "" : normalizedPath}` : normalizedPath;
}

export function getAppUrl(path: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${getAppPath(path)}`;
}
