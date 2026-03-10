import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { CalendarDays, ChevronRight, Loader2, MapPin, Music2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAssignedChartsSetlists } from "@/charts/hooks/useAssignedChartsSetlists";

export function ChartsSetlistsPage() {
  const { data: setlists = [], isLoading } = useAssignedChartsSetlists();
  const today = new Date().toISOString().split("T")[0];
  const upcoming = setlists.filter((setlist) => setlist.plan_date >= today);
  const previous = setlists.filter((setlist) => setlist.plan_date < today).slice(-6).reverse();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading your setlists...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-ecc">
        <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Live charts on iPad</p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">My Setlists</h2>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Open any assigned setlist, then launch charts full screen for live use.
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Upcoming</h3>
          <Badge variant="secondary" className="px-3 py-1 text-sm">
            {upcoming.length} setlist{upcoming.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {upcoming.length === 0 ? (
          <Card className="rounded-3xl border-dashed">
            <CardContent className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center">
              <Music2 className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">No upcoming assigned setlists</p>
                <p className="text-sm text-muted-foreground">Assigned charts will appear here automatically.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {upcoming.map((setlist) => (
              <Card key={setlist.id} className="rounded-3xl bg-card/90 shadow-ecc">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <CardTitle className="text-2xl">
                        {format(parseISO(setlist.plan_date), "EEEE, MMMM d")}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-4 w-4" />
                          {setlist.campuses?.name || "Campus"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-4 w-4" />
                          {setlist.ministry_type.replaceAll("_", " ")}
                        </span>
                      </div>
                    </div>

                    <Button asChild size="lg" className="h-12 rounded-xl px-5 text-base">
                      <Link to={`/setlists/${setlist.id}`}>
                        Open Set
                        <ChevronRight className="ml-2 h-5 w-5" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {setlist.songs.map((song) => (
                      <Badge key={song.id} variant="outline" className="rounded-full px-3 py-1 text-sm">
                        {song.sequence_order}. {song.song?.title || "Untitled Song"}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {previous.length > 0 ? (
        <section className="space-y-4">
          <h3 className="text-xl font-semibold">Recent</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {previous.map((setlist) => (
              <Card key={setlist.id} className="rounded-3xl bg-card/70">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="text-lg font-medium">
                      {format(parseISO(setlist.plan_date), "EEE, MMM d")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {setlist.campuses?.name || "Campus"} • {setlist.songs.length} songs
                    </p>
                  </div>
                  <Button asChild variant="outline" size="lg" className="h-11 rounded-xl px-4">
                    <Link to={`/setlists/${setlist.id}`}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
