import { lazy, type ComponentType } from "react";
import type { RouteDefinition } from "@/app/AppShell";

const Auth = lazy(() => import("@/pages/Auth"));
const Home = lazy(() => import("@/pages/Home"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Team = lazy(() => import("@/pages/Team"));
const Profile = lazy(() => import("@/pages/Profile"));
const Chat = lazy(() => import("@/pages/Chat"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Schedule = lazy(() => import("@/pages/Schedule"));
const PlanningCenter = lazy(() => import("@/pages/PlanningCenter"));
const SwapRequests = lazy(() => import("@/pages/SwapRequests"));
const SetPlanner = lazy(() => import("@/pages/SetPlanner"));
const AuditionSetPlanner = lazy(() => import("@/pages/AuditionSetPlanner"));
const Auditions = lazy(() => import("@/pages/Auditions"));
const ManageSets = lazy(() => import("@/pages/ManageSets"));
const MySetlists = lazy(() => import("@/pages/MySetlists"));
const TeamBuilder = lazy(() => import("@/pages/TeamBuilder"));
const LifeGroups = lazy(() => import("@/pages/LifeGroups"));
const Approvals = lazy(() => import("@/pages/Approvals"));
const AdminTools = lazy(() => import("@/pages/AdminTools"));
const PermissionsAdmin = lazy(() => import("@/pages/PermissionsAdmin"));
const Resources = lazy(() => import("@/pages/Resources"));
const ServiceFlow = lazy(() => import("@/pages/ServiceFlow"));
const DrumTech = lazy(() => import("@/pages/DrumTech"));
const Bible = lazy(() => import("@/pages/Bible"));
const Feed = lazy(() => import("@/pages/Feed"));
const CampMode = lazy(() => import("@/pages/CampMode"));
const Attendance = lazy(() => import("@/pages/Attendance"));
const Snake = lazy(() => import("@/pages/Snake"));
const Pong = lazy(() => import("@/pages/Pong"));
const Galaga = lazy(() => import("@/pages/Galaga"));
const Games = lazy(() => import("@/pages/Games"));
const WeekendRundown = lazy(() => import("@/pages/WeekendRundown"));
const WeekendRundownHistory = lazy(() => import("@/pages/WeekendRundownHistory"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));

function route(path: string, component: ComponentType): RouteDefinition {
  return { path, component };
}

export const publicRoutes: RouteDefinition[] = [
  route("/", Home),
  route("/auth", Auth),
  route("/privacy", Privacy),
  route("/terms", Terms),
];

// The Students HS/MS route list: everything the worship app has except the
// song library, plus the student-only Camp Mode and Attendance pages.
export const protectedRoutes: RouteDefinition[] = [
  route("/chat", Chat),
  route("/calendar", Calendar),
  route("/camp", CampMode),
  route("/schedule", Schedule),
  route("/dashboard", Dashboard),
  route("/team", Team),
  route("/team/:id", Profile),
  route("/profile", Profile),
  route("/settings/planning-center", PlanningCenter),
  route("/swaps", SwapRequests),
  route("/my-setlists", MySetlists),
  route("/set-planner", SetPlanner),
  route("/weekend-rundown", WeekendRundown),
  route("/weekend-rundown/history", WeekendRundownHistory),
  route("/auditions", Auditions),
  route("/set-planner/audition/:candidateId", AuditionSetPlanner),
  route("/manage-sets", ManageSets),
  route("/team-builder", TeamBuilder),
  route("/life-groups", LifeGroups),
  route("/approvals", Approvals),
  route("/admin-tools", AdminTools),
  route("/permissions", PermissionsAdmin),
  route("/resources", Resources),
  route("/feed", Feed),
  route("/attendance", Attendance),
  route("/drum-tech", DrumTech),
  route("/bible", Bible),
  route("/service-flow", ServiceFlow),
  route("/snake", Snake),
  route("/pong", Pong),
  route("/galaga", Galaga),
  route("/games", Games),
];
