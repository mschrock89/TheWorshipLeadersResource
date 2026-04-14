import { Music4, Video, Megaphone, Mic2, Circle, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

export type ServiceItem = {
  id: string;
  title: string;
  type: "song" | "video" | "announcement" | "message" | "other";
  duration: string;
  bpm?: number;
  key?: string;
  leader?: string;
};

export type ServiceSection = {
  id: string;
  title: string;
  items: ServiceItem[];
};

export type Service = {
  title: string;
  date: string;
  totalTime: string;
  sections: ServiceSection[];
};

interface ServiceFlowProps {
  service: Service;
  className?: string;
  showIcons?: boolean;
  compactMode?: boolean;
  showProgressBar?: boolean;
  highlightSectionId?: string;
  highlightItemId?: string;
  printFitHalfSheet?: boolean;
}

const itemIconMap = {
  song: Music4,
  video: Video,
  announcement: Megaphone,
  message: Mic2,
  other: Circle,
} satisfies Record<ServiceItem["type"], React.ComponentType<{ className?: string }>>;

function getItemIcon(item: ServiceItem) {
  const normalizedTitle = item.title.trim().toLowerCase();
  const shouldUsePersonIcon =
    normalizedTitle.includes("name place holder") ||
    normalizedTitle.includes("lesson") ||
    normalizedTitle.includes("communion closing prayer");

  if (shouldUsePersonIcon) {
    return UserRound;
  }

  return itemIconMap[item.type];
}

function parseDurationToSeconds(value: string): number {
  const parts = value.split(":").map((part) => Number(part.trim()));

  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const [first, second] = parts;
    if (first >= 10) {
      return first * 60 + second;
    }
    return first * 3600 + second * 60;
  }

  if (parts.length === 1) {
    return parts[0] * 60;
  }

  return 0;
}

function formatSeconds(seconds: number): string {
  if (seconds <= 0) return "0m";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function formatServiceDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function getSectionRuntime(section: ServiceSection): number {
  return section.items.reduce((total, item) => total + parseDurationToSeconds(item.duration), 0);
}

export function ServiceFlow({
  service,
  className,
  showIcons = true,
  compactMode = false,
  showProgressBar = true,
  highlightSectionId,
  highlightItemId,
  printFitHalfSheet = false,
}: ServiceFlowProps) {
  const sectionDurations = service.sections.map((section) => ({
    id: section.id,
    title: section.title,
    seconds: getSectionRuntime(section),
  }));

  const totalRuntimeSeconds =
    sectionDurations.reduce((total, section) => total + section.seconds, 0) ||
    parseDurationToSeconds(service.totalTime);

  return (
      <section
      className={cn(
        "mx-auto w-full max-w-5xl print:max-w-none",
        printFitHalfSheet && "print:mx-auto print:max-w-[7.05in]",
        className,
      )}
      aria-label={`${service.title} service flow`}
    >
      <div
        className={cn(
          "rounded-[28px] border border-black/5 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.08)] print:rounded-none print:border-black/10 print:bg-white print:shadow-none",
          printFitHalfSheet && "print:border-black/15",
        )}
      >
        <header
          className={cn(
            "service-flow-card-header border-b border-black/5 bg-primary/[0.07] px-5 py-5 sm:px-7 sm:py-6 print:border-black/10 print:bg-black/[0.03]",
            printFitHalfSheet && "print:px-3 print:py-1.5",
          )}
        >
          <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", printFitHalfSheet && "print:gap-1.5")}>
            <div className="space-y-1">
              <p className={cn("text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80 print:text-black", printFitHalfSheet && "print:text-[9px]")}>
                Service Flow
              </p>
              <h2 className={cn("text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl print:text-black", printFitHalfSheet && "print:text-[17px] print:leading-tight")}>
                {service.title}
              </h2>
              <p className={cn("text-sm text-slate-500 print:text-black/70", printFitHalfSheet && "print:text-[10px]")}>
                {formatServiceDate(service.date)}
              </p>
            </div>

            <div className={cn("rounded-2xl bg-white/90 px-4 py-3 text-left shadow-sm ring-1 ring-black/5 backdrop-blur-sm print:bg-transparent print:px-0 print:py-0 print:shadow-none print:ring-0 sm:min-w-[152px] sm:text-right", printFitHalfSheet && "print:min-w-[92px]")}>
              <p className={cn("text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400 print:text-black/60", printFitHalfSheet && "print:text-[9px]")}>
                Total Time
              </p>
              <p className={cn("mt-1 text-lg font-semibold tracking-tight text-slate-900 print:text-black", printFitHalfSheet && "print:mt-0 print:text-[13px]")}>
                {service.totalTime}
              </p>
            </div>
          </div>

          {showProgressBar && totalRuntimeSeconds > 0 ? (
            <div className={cn("mt-5 flex h-2.5 overflow-hidden rounded-full bg-black/[0.06] print:bg-black/10", printFitHalfSheet && "print:mt-1.5 print:h-1")}>
              {sectionDurations.map((section) => (
                <div
                  key={section.id}
                  className={cn(
                    "h-full transition-all",
                    section.id === highlightSectionId
                      ? "bg-primary"
                      : "bg-primary/55",
                  )}
                  style={{
                    width: `${Math.max((section.seconds / totalRuntimeSeconds) * 100, 6)}%`,
                  }}
                  title={`${section.title}: ${formatSeconds(section.seconds)}`}
                />
              ))}
            </div>
          ) : null}
        </header>

        <div className={cn("px-5 py-5 sm:px-7 sm:py-7", compactMode ? "space-y-6" : "space-y-8", printFitHalfSheet && "print:space-y-2 print:px-3 print:py-1.5")}>
          {service.sections.map((section) => {
            const sectionRuntime = getSectionRuntime(section);
            const isHighlightedSection = section.id === highlightSectionId;

            return (
              <section
                key={section.id}
                className={cn("space-y-3", compactMode ? "scroll-mt-20" : "scroll-mt-24")}
                aria-labelledby={`service-flow-section-${section.id}`}
              >
                <div className={cn("flex items-center gap-3", printFitHalfSheet && "print:gap-1")}>
                  <div
                    className={cn(
                      "h-px flex-1 bg-black/10 print:bg-black/15",
                      isHighlightedSection && "bg-primary/40 print:bg-black/30",
                    )}
                  />
                  <div className="shrink-0 text-center">
                    <p
                      id={`service-flow-section-${section.id}`}
                      className={cn(
                        "text-xs font-bold uppercase tracking-[0.24em] text-slate-500 print:text-black",
                        printFitHalfSheet && "print:text-[8px]",
                        isHighlightedSection && "text-primary print:text-black",
                      )}
                    >
                      {section.title}
                    </p>
                    <p className={cn("mt-1 text-xs text-slate-400 print:text-black/60", printFitHalfSheet && "print:mt-0 print:text-[8px]")}>
                      {formatSeconds(sectionRuntime)}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "h-px flex-1 bg-black/10 print:bg-black/15",
                      isHighlightedSection && "bg-primary/40 print:bg-black/30",
                    )}
                  />
                </div>

                <div className={cn(compactMode ? "space-y-2.5" : "space-y-3.5", printFitHalfSheet && "print:space-y-1")}>
                  {section.items.map((item) => {
                    const Icon = getItemIcon(item);
                    const isSong = item.type === "song";
                    const isHighlightedItem = item.id === highlightItemId;

                    return (
                      <article
                        key={item.id}
                        className={cn(
                          "rounded-2xl bg-neutral-50 px-4 py-3 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-black/5 print:break-inside-avoid print:rounded-xl print:border print:border-black/10 print:bg-white print:shadow-none print:ring-0",
                          compactMode ? "px-3.5 py-3" : "px-4 py-4",
                          printFitHalfSheet && "print:rounded-md print:px-2.5 print:py-1",
                          isSong && "bg-white ring-primary/10",
                          isHighlightedItem && "ring-2 ring-primary/35 print:ring-1 print:ring-black/25",
                        )}
                      >
                        <div className={cn("flex items-start gap-3", printFitHalfSheet && "print:gap-1.5")}>
                          {showIcons ? (
                            <div
                              className={cn(
                                "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-black/[0.04] text-slate-400 print:border print:border-black/10 print:bg-white print:text-black/70",
                                printFitHalfSheet && "print:mt-0 print:h-6 print:w-6 print:rounded-lg",
                                isSong && "bg-primary/[0.10] text-primary print:border-black/20 print:text-black",
                              )}
                            >
                              <Icon className={cn("h-4 w-4", printFitHalfSheet && "print:h-3 print:w-3")} />
                            </div>
                          ) : null}

                          <div className="min-w-0 flex-1">
                            <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between", printFitHalfSheet && "print:gap-0.5")}>
                              <div className="min-w-0">
                                <p
                                  className={cn(
                                    "truncate font-medium tracking-tight text-slate-900 print:text-black",
                                    printFitHalfSheet && "print:text-[9.5px] print:leading-tight",
                                    isSong ? "text-[15px] sm:text-base" : "text-[15px]",
                                  )}
                                >
                                  {item.title}
                                </p>
                                <p className={cn("mt-1 text-xs capitalize text-slate-500 print:text-black/60", printFitHalfSheet && "print:hidden")}>
                                  {item.type}
                                </p>
                              </div>

                              <div className={cn("shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-black/5 print:border print:border-black/10 print:bg-transparent print:ring-0", printFitHalfSheet && "print:px-1.5 print:py-0 print:text-[8px]")}>
                                {item.duration}
                              </div>
                            </div>

                            {isSong ? (
                              <div className={cn("mt-3 flex flex-wrap gap-2.5 text-xs text-slate-500 print:text-black/70", printFitHalfSheet && "print:mt-0.5 print:gap-1 print:text-[8px]")}>
                                {typeof item.bpm === "number" ? (
                                  <span className={cn("rounded-full bg-primary/[0.08] px-2.5 py-1 text-primary print:border print:border-black/10 print:bg-transparent print:text-black", printFitHalfSheet && "print:px-1.5 print:py-0")}>
                                    {item.bpm} BPM
                                  </span>
                                ) : null}
                                {item.key ? (
                                  <span className={cn("rounded-full bg-black/[0.04] px-2.5 py-1 print:border print:border-black/10 print:bg-transparent", printFitHalfSheet && "print:px-1.5 print:py-0")}>
                                    Key {item.key}
                                  </span>
                                ) : null}
                                {item.leader ? (
                                  <span className={cn("rounded-full bg-black/[0.04] px-2.5 py-1 print:border print:border-black/10 print:bg-transparent", printFitHalfSheet && "print:px-1.5 print:py-0")}>
                                    Leader {item.leader}
                                  </span>
                                ) : null}
                              </div>
                            ) : item.leader ? (
                              <p className={cn("mt-3 text-xs text-slate-500 print:text-black/70", printFitHalfSheet && "print:mt-0.5 print:text-[8px]")}>
                                Lead: {item.leader}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export const mockServiceFlow: Service = {
  title: "Weekend Worship",
  date: "2026-04-12",
  totalTime: "1h 14m",
  sections: [
    {
      id: "pre-service",
      title: "Pre-Service",
      items: [
        {
          id: "preservice-video",
          title: "Countdown Video",
          type: "video",
          duration: "05:00",
        },
        {
          id: "welcome",
          title: "Welcome + Call to Worship",
          type: "announcement",
          duration: "03:00",
          leader: "Pastor Jen",
        },
      ],
    },
    {
      id: "worship",
      title: "Worship Set",
      items: [
        {
          id: "song-1",
          title: "Gratitude",
          type: "song",
          duration: "06:10",
          bpm: 78,
          key: "G",
          leader: "Maddie",
        },
        {
          id: "song-2",
          title: "This Is Amazing Grace",
          type: "song",
          duration: "04:45",
          bpm: 98,
          key: "A",
          leader: "Luke",
        },
        {
          id: "song-3",
          title: "Build My Life",
          type: "song",
          duration: "05:50",
          bpm: 74,
          key: "Bb",
          leader: "Maddie",
        },
      ],
    },
    {
      id: "message",
      title: "Message",
      items: [
        {
          id: "announcements",
          title: "Church News",
          type: "announcement",
          duration: "04:00",
          leader: "Host Team",
        },
        {
          id: "sermon",
          title: "Teaching: Living With Hope",
          type: "message",
          duration: "32:00",
          leader: "Pastor Mike",
        },
      ],
    },
    {
      id: "response",
      title: "Response",
      items: [
        {
          id: "song-4",
          title: "Goodness of God",
          type: "song",
          duration: "05:40",
          bpm: 64,
          key: "G",
          leader: "Luke",
        },
        {
          id: "dismissal",
          title: "Benediction + Dismissal",
          type: "other",
          duration: "02:30",
        },
      ],
    },
  ],
};

export function ServiceFlowExample() {
  return (
    <ServiceFlow
      service={mockServiceFlow}
      showIcons
      showProgressBar
      highlightSectionId="worship"
      highlightItemId="song-2"
    />
  );
}
