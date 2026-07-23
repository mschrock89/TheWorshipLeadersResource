import { memo, useMemo } from "react";
import { Music4, Video, Megaphone, Mic2, Circle, UserRound } from "lucide-react";

import { cn } from "@/lib/cn";

export type ServiceItem = {
  id: string;
  title: string;
  type: "song" | "video" | "announcement" | "message" | "speaker" | "other";
  duration: string;
  clockTime?: string;
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
  speaker: Mic2,
  other: Circle,
} satisfies Record<ServiceItem["type"], React.ComponentType<{ className?: string }>>;

function getItemIcon(item: ServiceItem) {
  const normalizedTitle = item.title.trim().toLowerCase();
  const shouldUsePersonIcon =
    normalizedTitle.includes("name place holder") ||
    normalizedTitle.includes("name placeholder") ||
    normalizedTitle.includes("lesson") ||
    normalizedTitle.includes("teacher") ||
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

function formatSongMeta(item: ServiceItem): string {
  const parts: string[] = [];
  if (typeof item.bpm === "number") parts.push(`${item.bpm} BPM`);
  if (item.key) parts.push(`Key ${item.key}`);
  if (item.leader) parts.push(item.leader);
  return parts.join(" · ");
}

export const ServiceFlow = memo(function ServiceFlow({
  service,
  className,
  showIcons = true,
  compactMode = false,
  showProgressBar = true,
  highlightSectionId,
  highlightItemId,
  printFitHalfSheet = false,
}: ServiceFlowProps) {
  const sectionDurations = useMemo(
    () =>
      service.sections.map((section) => ({
        id: section.id,
        title: section.title,
        seconds: getSectionRuntime(section),
      })),
    [service.sections],
  );

  const sectionRuntimeById = useMemo(
    () => new Map(sectionDurations.map((section) => [section.id, section.seconds])),
    [sectionDurations],
  );

  const totalRuntimeSeconds =
    sectionDurations.reduce((total, section) => total + section.seconds, 0) ||
    parseDurationToSeconds(service.totalTime);

  return (
    <section
      className={cn(
        "mx-auto w-full max-w-5xl print:max-w-none",
        printFitHalfSheet && "service-flow-half-sheet-card print:mx-auto print:max-w-[5.35in]",
        className,
      )}
      aria-label={`${service.title} service flow`}
    >
      <div
        className={cn(
          "rounded-[28px] border-2 border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] print:rounded-none print:border-[1.5px] print:border-black/35 print:bg-white print:shadow-none",
          printFitHalfSheet && "print:border-black/40",
        )}
      >
        <header
          className={cn(
            "service-flow-card-header border-b-2 border-slate-200 bg-slate-100 px-5 py-5 sm:px-7 sm:py-6 print:border-black/30 print:bg-slate-100",
            printFitHalfSheet && "print:px-2.5 print:py-1.5",
          )}
        >
          <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", printFitHalfSheet && "print:flex-row print:items-center print:gap-2")}>
            <div className={cn("space-y-1", printFitHalfSheet && "print:space-y-0")}>
              <p className={cn("text-xs font-bold uppercase tracking-[0.24em] text-primary print:text-black", printFitHalfSheet && "print:hidden")}>
                Service Flow
              </p>
              <h2 className={cn("text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.75rem] print:text-black", printFitHalfSheet && "print:text-[18px] print:leading-tight")}>
                {service.title}
              </h2>
              <p className={cn("text-[15px] font-medium text-slate-600 print:text-black/80", printFitHalfSheet && "print:text-[11px] print:leading-tight")}>
                {formatServiceDate(service.date)}
              </p>
            </div>

            <div className={cn("rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-left shadow-sm print:border-0 print:bg-transparent print:px-0 print:py-0 print:shadow-none sm:min-w-[160px] sm:text-right", printFitHalfSheet && "print:min-w-0")}>
              <p className={cn("text-xs font-semibold uppercase tracking-[0.22em] text-slate-600 print:text-black/70", printFitHalfSheet && "print:text-[10px] print:leading-none")}>
                Total Time
              </p>
              <p className={cn("mt-1 text-xl font-bold tracking-tight text-slate-950 print:text-black", printFitHalfSheet && "print:mt-0 print:text-[15px] print:leading-none")}>
                {service.totalTime}
              </p>
            </div>
          </div>

          {showProgressBar && totalRuntimeSeconds > 0 ? (
            <div className={cn("mt-5 flex h-3 overflow-hidden rounded-full border border-slate-200 bg-slate-200 print:bg-black/10", printFitHalfSheet && "print:mt-1 print:h-1")}>
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

        <div className={cn("px-5 py-5 sm:px-7 sm:py-7", compactMode ? "space-y-6" : "space-y-8", printFitHalfSheet && "service-flow-half-sheet-body print:space-y-0 print:px-1.5 print:py-0.5")}>
          {service.sections.map((section) => {
            const sectionRuntime = sectionRuntimeById.get(section.id) ?? 0;
            const isHighlightedSection = section.id === highlightSectionId;

            return (
              <section
                key={section.id}
                className={cn("space-y-3", compactMode ? "scroll-mt-20" : "scroll-mt-24", printFitHalfSheet && "service-flow-half-sheet-section print:space-y-0")}
                aria-labelledby={`service-flow-section-${section.id}`}
              >
                <div className={cn("flex items-center gap-3", printFitHalfSheet && "service-flow-half-sheet-section-label print:gap-1 print:py-0.5")}>
                  <div
                    className={cn(
                      "h-0.5 flex-1 bg-slate-300 print:bg-black/25",
                      printFitHalfSheet && "print:h-px",
                      isHighlightedSection && "bg-primary/60 print:bg-black/35",
                    )}
                  />
                  <div className={cn("shrink-0 rounded-lg border-2 border-slate-200 bg-slate-50 px-4 py-1.5 text-center print:border-black/30 print:bg-slate-100", printFitHalfSheet && "print:rounded-sm print:border print:px-1.5 print:py-0")}>
                    <p
                      id={`service-flow-section-${section.id}`}
                      className={cn(
                        "text-sm font-extrabold uppercase tracking-[0.2em] text-slate-800 print:text-black",
                        printFitHalfSheet && "print:text-[10.5px] print:leading-none print:tracking-[0.14em]",
                        isHighlightedSection && "text-primary print:text-black",
                      )}
                    >
                      {section.title}
                    </p>
                    <p className={cn("mt-0.5 text-xs font-semibold text-slate-600 print:text-black/70", printFitHalfSheet && "print:hidden")}>
                      {formatSeconds(sectionRuntime)}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "h-0.5 flex-1 bg-slate-300 print:bg-black/25",
                      printFitHalfSheet && "print:h-px",
                      isHighlightedSection && "bg-primary/60 print:bg-black/35",
                    )}
                  />
                </div>

                <div className={cn(compactMode ? "space-y-2.5" : "space-y-3.5", printFitHalfSheet && "service-flow-half-sheet-items print:space-y-0")}>
                  {section.items.map((item) => {
                    const Icon = getItemIcon(item);
                    const isSong = item.type === "song";
                    const isHighlightedItem = item.id === highlightItemId;
                    const songMeta = isSong ? formatSongMeta(item) : "";

                    return (
                      <article
                        key={item.id}
                        className={cn(
                          "rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base shadow-sm print:rounded-xl print:border-[1.5px] print:border-black/30 print:bg-white print:shadow-none",
                          compactMode ? "px-3.5 py-3" : "px-4 py-4",
                          printFitHalfSheet && "service-flow-half-sheet-item print:rounded-md print:border print:border-black/25 print:px-2 print:py-1",
                          isSong && "border-primary/25 bg-white",
                          isHighlightedItem && "border-primary/50 ring-2 ring-primary/20 print:border-black/35",
                        )}
                      >
                        <div className={cn("flex items-start gap-3", printFitHalfSheet && "print:items-center print:gap-1")}>
                          {showIcons ? (
                            <div
                              className={cn(
                                "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-200 bg-white text-slate-600 print:border-[1.5px] print:border-black/30 print:bg-white print:text-black/80",
                                printFitHalfSheet && "print:mt-0 print:h-5 print:w-5 print:rounded print:border",
                                isSong && "border-primary/30 bg-primary/10 text-primary print:border-black/35 print:text-black",
                              )}
                            >
                              <Icon className={cn("h-[18px] w-[18px]", printFitHalfSheet && "print:h-3 print:w-3")} />
                            </div>
                          ) : null}

                          <div className="min-w-0 flex-1">
                            {printFitHalfSheet ? (
                              <div className="print:flex print:items-center print:gap-1">
                                <p className="print:min-w-0 print:shrink print:truncate print:text-[13px] print:font-semibold print:leading-tight print:text-black">
                                  {item.title}
                                </p>
                                {songMeta ? (
                                  <p className="print:shrink-0 print:whitespace-nowrap print:text-[10px] print:leading-tight print:text-black/75">
                                    {songMeta}
                                  </p>
                                ) : null}
                                {!isSong && item.leader ? (
                                  <p className="print:shrink-0 print:text-[10px] print:leading-tight print:text-black/80">
                                    {item.leader}
                                  </p>
                                ) : null}
                                <div className="print:ml-auto print:flex print:shrink-0 print:items-center print:gap-1">
                                  {item.clockTime ? (
                                    <div className="print:rounded print:border print:border-black/30 print:px-1.5 print:py-0.5 print:text-[11px] print:font-semibold print:leading-none print:tabular-nums print:text-black">
                                      {item.clockTime}
                                    </div>
                                  ) : null}
                                  <div className="print:rounded print:border print:border-black/30 print:px-1.5 print:py-0.5 print:text-[11px] print:font-semibold print:leading-none print:tabular-nums print:text-black">
                                    {item.duration}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <p
                                      className={cn(
                                        "truncate font-semibold tracking-tight text-slate-950",
                                        isSong ? "text-[17px] sm:text-lg" : "text-[16px]",
                                      )}
                                    >
                                      {item.title}
                                    </p>
                                    <p className="mt-0.5 text-sm capitalize text-slate-600">
                                      {item.type}
                                    </p>
                                  </div>

                                  <div className="flex shrink-0 items-center gap-2">
                                    {item.clockTime ? (
                                      <div className="rounded-lg border-2 border-slate-200 bg-white px-3 py-1 text-sm font-semibold tabular-nums text-slate-800">
                                        {item.clockTime}
                                      </div>
                                    ) : null}
                                    <div className="rounded-lg border-2 border-slate-200 bg-white px-3 py-1 text-sm font-semibold tabular-nums text-slate-900">
                                      {item.duration}
                                    </div>
                                  </div>
                                </div>

                                {isSong ? (
                                  <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">
                                    {typeof item.bpm === "number" ? (
                                      <span className="rounded-lg border-2 border-primary/25 bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                                        {item.bpm} BPM
                                      </span>
                                    ) : null}
                                    {item.key ? (
                                      <span className="rounded-lg border-2 border-slate-200 bg-white px-2.5 py-1 font-semibold">
                                        Key {item.key}
                                      </span>
                                    ) : null}
                                    {item.leader ? (
                                      <span className="rounded-lg border-2 border-slate-200 bg-white px-2.5 py-1 font-medium">
                                        Leader {item.leader}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : item.leader ? (
                                  <p className="mt-2.5 text-sm font-medium text-slate-700">
                                    Lead: {item.leader}
                                  </p>
                                ) : null}
                              </>
                            )}
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
});
