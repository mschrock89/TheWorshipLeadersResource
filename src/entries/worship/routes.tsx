import type { RouteDefinition } from "@/app/AppShell";
import Auth from "@/pages/Auth";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Team from "@/pages/Team";
import Profile from "@/pages/Profile";
import Chat from "@/pages/Chat";
import Calendar from "@/pages/Calendar";
import Schedule from "@/pages/Schedule";
import PlanningCenter from "@/pages/PlanningCenter";
import SwapRequests from "@/pages/SwapRequests";
import Songs from "@/pages/Songs";
import SetPlanner from "@/pages/SetPlanner";
import AuditionSetPlanner from "@/pages/AuditionSetPlanner";
import Auditions from "@/pages/Auditions";
import ManageSets from "@/pages/ManageSets";
import MySetlists from "@/pages/MySetlists";
import TeamBuilder from "@/pages/TeamBuilder";
import LifeGroups from "@/pages/LifeGroups";
import Approvals from "@/pages/Approvals";
import AdminTools from "@/pages/AdminTools";
import PermissionsAdmin from "@/pages/PermissionsAdmin";
import Resources from "@/pages/Resources";
import ServiceFlow from "@/pages/ServiceFlow";
import DrumTech from "@/pages/DrumTech";
import Bible from "@/pages/Bible";
import Feed from "@/pages/Feed";
import Snake from "@/pages/Snake";
import Pong from "@/pages/Pong";
import Galaga from "@/pages/Galaga";
import Games from "@/pages/Games";
import WeekendRundown from "@/pages/WeekendRundown";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";

export const publicRoutes: RouteDefinition[] = [
  { path: "/", component: Home },
  { path: "/auth", component: Auth },
  { path: "/privacy", component: Privacy },
  { path: "/terms", component: Terms },
];

// The worship app's route list. Student-app-only pages (Camp Mode,
// Attendance) live in src/entries/students/routes.tsx instead.
export const protectedRoutes: RouteDefinition[] = [
  { path: "/chat", component: Chat },
  { path: "/calendar", component: Calendar },
  { path: "/schedule", component: Schedule },
  { path: "/dashboard", component: Dashboard },
  { path: "/team", component: Team },
  { path: "/team/:id", component: Profile },
  { path: "/profile", component: Profile },
  { path: "/settings/planning-center", component: PlanningCenter },
  { path: "/swaps", component: SwapRequests },
  { path: "/songs", component: Songs },
  { path: "/my-setlists", component: MySetlists },
  { path: "/set-planner", component: SetPlanner },
  { path: "/weekend-rundown", component: WeekendRundown },
  { path: "/auditions", component: Auditions },
  { path: "/set-planner/audition/:candidateId", component: AuditionSetPlanner },
  { path: "/manage-sets", component: ManageSets },
  { path: "/team-builder", component: TeamBuilder },
  { path: "/life-groups", component: LifeGroups },
  { path: "/approvals", component: Approvals },
  { path: "/admin-tools", component: AdminTools },
  { path: "/permissions", component: PermissionsAdmin },
  { path: "/resources", component: Resources },
  { path: "/feed", component: Feed },
  { path: "/drum-tech", component: DrumTech },
  { path: "/bible", component: Bible },
  { path: "/service-flow", component: ServiceFlow },
  { path: "/snake", component: Snake },
  { path: "/pong", component: Pong },
  { path: "/galaga", component: Galaga },
  { path: "/games", component: Games },
];
