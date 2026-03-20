import { CSSProperties, Ref, useMemo } from "react";
import { paginateRenderedChordLines, RenderedLine, renderChordChartText, RENDERED_CHART_FONT_FAMILY } from "@/lib/chordChart";

interface RenderedChordChartProps {
  title: string;
  author: string | null;
  chordChartText: string;
  lines?: RenderedLine[];
  className?: string;
  scaleClassName?: string;
  pageIndex?: number;
  pageSize?: number;
  showHeader?: boolean;
  style?: CSSProperties;
  containerRef?: Ref<HTMLDivElement>;
}

export function RenderedChordChart({
  title,
  author,
  chordChartText,
  lines,
  className,
  scaleClassName = "text-[15px] leading-[1.35] sm:text-[20px] sm:leading-[1.45] lg:text-[22px]",
  pageIndex = 0,
  pageSize,
  showHeader = true,
  style,
  containerRef,
}: RenderedChordChartProps) {
  const renderedLines = useMemo(() => renderChordChartText(chordChartText), [chordChartText]);
  const visibleLines = useMemo(() => {
    if (lines) return lines;
    if (!pageSize) return renderedLines;
    const pages = paginateRenderedChordLines(renderedLines, pageSize);
    return pages[Math.max(0, Math.min(pageIndex, pages.length - 1))] || [];
  }, [lines, pageIndex, pageSize, renderedLines]);

  return (
    <div
      ref={containerRef}
      className={`overflow-auto overscroll-contain rounded-md border bg-background p-3 touch-pan-x touch-pan-y sm:p-4 ${scaleClassName} ${className || ""}`.trim()}
      style={{ fontFamily: RENDERED_CHART_FONT_FAMILY, ...style }}
    >
      {showHeader ? (
        <div className="mb-4 border-b pb-3 sm:mb-5">
          <h3 className="text-2xl font-bold leading-tight sm:text-xl">{title}</h3>
          {author ? <p className="text-base text-muted-foreground sm:text-sm">{author}</p> : null}
        </div>
      ) : null}

      <RenderedChartLines lines={visibleLines} />
    </div>
  );
}

export function RenderedChartLines({
  lines,
  lineOffset = 0,
}: {
  lines: RenderedLine[];
  lineOffset?: number;
}) {
  return (
    <div className="h-full min-w-max space-y-0.5 pr-2">
      {lines.map((line, index) => {
        const lineIndex = lineOffset + index;

        if (line.kind === "empty") {
          return <div key={index} data-line-index={lineIndex} className="h-4" />;
        }

        if (line.kind === "section") {
          return (
            <pre key={index} data-line-index={lineIndex} className="mt-2 whitespace-pre font-bold">
              {line.text}
            </pre>
          );
        }

        if (line.kind === "chords") {
          return (
            <pre key={index} data-line-index={lineIndex} className="whitespace-pre font-bold">
              {line.text}
            </pre>
          );
        }

        if (line.kind === "lyricWithChords") {
          return (
            <div key={index} data-line-index={lineIndex} className="space-y-0">
              {line.chords.trim().length > 0 ? (
                <pre className="whitespace-pre font-bold">{line.chords}</pre>
              ) : (
                <div className="h-[1.45em]" />
              )}
              <pre className="whitespace-pre">{line.lyric}</pre>
            </div>
          );
        }

        return (
          <pre key={index} data-line-index={lineIndex} className="whitespace-pre">
            {line.text}
          </pre>
        );
      })}
    </div>
  );
}
