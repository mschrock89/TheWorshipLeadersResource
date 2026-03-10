import { useMemo } from "react";
import { renderChordChartText, RENDERED_CHART_FONT_FAMILY } from "@/lib/chordChart";

interface RenderedChordChartProps {
  title: string;
  author: string | null;
  chordChartText: string;
  className?: string;
  scaleClassName?: string;
}

export function RenderedChordChart({
  title,
  author,
  chordChartText,
  className,
  scaleClassName = "text-[20px] leading-[1.45] sm:text-[22px]",
}: RenderedChordChartProps) {
  const renderedLines = useMemo(() => renderChordChartText(chordChartText), [chordChartText]);

  return (
    <div
      className={`rounded-md border bg-background p-4 ${scaleClassName} ${className || ""}`.trim()}
      style={{ fontFamily: RENDERED_CHART_FONT_FAMILY }}
    >
      <div className="mb-5 border-b pb-3">
        <h3 className="text-xl font-bold">{title}</h3>
        {author ? <p className="text-sm text-muted-foreground">{author}</p> : null}
      </div>

      <div className="space-y-0.5">
        {renderedLines.map((line, index) => {
          if (line.kind === "empty") {
            return <div key={index} className="h-4" />;
          }

          if (line.kind === "section") {
            return (
              <pre key={index} className="mt-2 whitespace-pre font-bold">
                {line.text}
              </pre>
            );
          }

          if (line.kind === "chords") {
            return (
              <pre key={index} className="whitespace-pre font-bold">
                {line.text}
              </pre>
            );
          }

          if (line.kind === "lyricWithChords") {
            return (
              <div key={index} className="space-y-0">
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
            <pre key={index} className="whitespace-pre">
              {line.text}
            </pre>
          );
        })}
      </div>
    </div>
  );
}
