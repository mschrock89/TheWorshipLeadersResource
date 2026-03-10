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
  scaleClassName = "text-[20px] leading-[1.45] sm:text-[22px]",
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
      className={`rounded-md border bg-background p-4 overflow-hidden ${scaleClassName} ${className || ""}`.trim()}
      style={{ fontFamily: RENDERED_CHART_FONT_FAMILY, ...style }}
    >
      {showHeader ? (
        <div className="mb-5 border-b pb-3">
          <h3 className="text-xl font-bold">{title}</h3>
          {author ? <p className="text-sm text-muted-foreground">{author}</p> : null}
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
    <div className="h-full max-w-full space-y-0.5 overflow-hidden pr-1">
      {lines.map((line, index) => {
        const lineIndex = lineOffset + index;

        if (line.kind === "empty") {
          return <div key={index} data-line-index={lineIndex} className="h-4" />;
        }

        if (line.kind === "section") {
          return (
            <pre key={index} data-line-index={lineIndex} className="mt-2 max-w-full whitespace-pre-wrap break-words font-bold [overflow-wrap:anywhere]">
              {line.text}
            </pre>
          );
        }

        if (line.kind === "chords") {
          return (
            <pre key={index} data-line-index={lineIndex} className="max-w-full whitespace-pre-wrap break-words font-bold [overflow-wrap:anywhere]">
              {line.text}
            </pre>
          );
        }

        if (line.kind === "lyricWithChords") {
          return (
            <div key={index} data-line-index={lineIndex} className="max-w-full space-y-0 overflow-hidden">
              {line.chords.trim().length > 0 ? (
                <pre className="max-w-full whitespace-pre-wrap break-words font-bold [overflow-wrap:anywhere]">{line.chords}</pre>
              ) : (
                <div className="h-[1.45em]" />
              )}
              <pre className="max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{line.lyric}</pre>
            </div>
          );
        }

        return (
          <pre key={index} data-line-index={lineIndex} className="max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {line.text}
          </pre>
        );
      })}
    </div>
  );
}
