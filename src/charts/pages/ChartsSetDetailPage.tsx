import { Link, Navigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Expand, FileText, Loader2, MapPin, Music2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAssignedChartsSetlists } from "@/charts/hooks/useAssignedChartsSetlists";

export function ChartsSetDetailPage() {
  const { setlistId } = useParams<{ setlistId: string }>();
  const { data: setlists = [], isLoading } = useAssignedChartsSetlists();
  const setlist = setlists.find((entry) => entry.id === setlistId);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading setlist...</span>
      </div>
    );
  }

  if (!setlist) {
    return <Navigate to="/setlists" replace />;
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="lg" className="h-11 w-fit rounded-xl px-3">
        <Link to="/setlists">
          <ArrowLeft className="mr-2 h-5 w-5" />
          Back to setlists
        </Link>
      </Button>

      <section className="rounded-3xl border border-border bg-card/85 p-6 shadow-ecc">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Assigned set</p>
            <h2 className="text-4xl font-semibold tracking-tight">
              {format(parseISO(setlist.plan_date), "EEEE, MMMM d, yyyy")}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {setlist.campuses?.name || "Campus"}
              </span>
              <Badge variant="secondary" className="px-3 py-1 text-sm">
                {setlist.songs.length} songs
              </Badge>
            </div>
          </div>

          {setlist.notes ? (
            <div className="max-w-xl rounded-2xl border border-border bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-primary" />
                Set notes
              </div>
              <p className="text-sm text-muted-foreground">{setlist.notes}</p>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4">
        {setlist.songs.map((song, index) => (
          <Card key={song.id} className="rounded-3xl bg-card/90 shadow-ecc">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary/50 text-lg font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <CardTitle className="text-2xl">{song.song?.title || "Untitled Song"}</CardTitle>
                      <p className="text-sm text-muted-foreground">{song.song?.author || "Unknown author"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {song.song_key ? <Badge variant="outline">Key: {song.song_key}</Badge> : null}
                    {song.vocalists?.length ? (
                      <Badge variant="outline">
                        Vocal: {song.vocalists.map((vocalist) => vocalist.full_name || "Unknown").join(", ")}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <Button asChild size="lg" className="h-14 rounded-2xl px-6 text-base">
                  <Link to={`/setlists/${setlist.id}/songs/${song.id}`}>
                    Open Full Screen
                    <Expand className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                Tap to open the chart in live mode and swipe through songs from there.
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {setlist.songs.length === 0 ? (
        <Card className="rounded-3xl border-dashed">
          <CardContent className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center">
            <Music2 className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-lg font-medium">No songs in this setlist yet</p>
              <p className="text-sm text-muted-foreground">Charts will appear once songs are added.</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
