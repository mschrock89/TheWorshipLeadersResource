import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Play, PlayCircle } from "lucide-react";

type Tutorial = {
  title: string;
  src: string;
  poster: string;
};

const TUTORIALS: Tutorial[] = [
  { title: "Where things live", src: "out/where-things-live-mobile.mp4", poster: "out/poster.jpg" },
  { title: "Turn on push notifications", src: "out/turn-on-push-mobile.mp4", poster: "out/turn-on-push-poster.jpg" },
  { title: "Find my schedule", src: "out/find-my-schedule-mobile.mp4", poster: "out/find-my-schedule-poster.jpg" },
  { title: "Confirm a setlist", src: "out/confirm-setlist-mobile.mp4", poster: "out/confirm-setlist-poster.jpg" },
  { title: "Complete a swap", src: "out/complete-a-swap-mobile.mp4", poster: "out/complete-a-swap-poster.jpg" },
  { title: "Request a break", src: "out/request-a-break-mobile.mp4", poster: "out/request-a-break-poster.jpg" },
  { title: "Open chat", src: "out/open-chat-mobile.mp4", poster: "out/open-chat-poster.jpg" },
];

function playerUrl(tutorial: Tutorial) {
  const params = new URLSearchParams({
    src: tutorial.src,
    poster: tutorial.poster,
    title: tutorial.title,
  });
  return `/watch/index.html?${params.toString()}`;
}

export function TutorialVideosWidget() {
  const [active, setActive] = useState<Tutorial | null>(null);

  return (
    <>
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <PlayCircle className="h-5 w-5 text-primary" />
            Video Tutorials
          </CardTitle>
          <CardDescription>Quick walkthroughs of the app — tap one to watch</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
            {TUTORIALS.map((tutorial) => (
              <button
                key={tutorial.src}
                type="button"
                onClick={() => setActive(tutorial)}
                className="group w-32 shrink-0 snap-start text-left sm:w-36"
              >
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl border bg-black">
                  <img
                    src={`/watch/${tutorial.poster}`}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover object-top transition-transform duration-200 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-lg">
                      <Play className="ml-0.5 h-4 w-4 fill-current" />
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm font-medium leading-snug text-foreground">{tutorial.title}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!active}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      >
        <DialogContent className="w-auto max-w-[95vw] justify-items-center gap-0 sm:w-auto overflow-hidden border-0 bg-black p-0">
          <DialogTitle className="sr-only">{active?.title}</DialogTitle>
          {active ? (
            <iframe
              key={active.src}
              src={playerUrl(active)}
              title={active.title}
              allow="autoplay; fullscreen"
              className="block aspect-[1080/2338] h-[min(85dvh,760px)] max-w-[95vw] border-0"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
