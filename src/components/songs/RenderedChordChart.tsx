import { CSSProperties, Ref, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  fitToWidth?: boolean;
  style?: CSSProperties;
  containerRef?: Ref<HTMLDivElement>;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
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
  fitToWidth = true,
  style,
  containerRef,
}: RenderedChordChartProps) {
  const localContainerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [fitLayout, setFitLayout] = useState<{ scale: number; height?: number }>({ scale: 1 });
  const renderedLines = useMemo(() => renderChordChartText(chordChartText), [chordChartText]);
  const visibleLines = useMemo(() => {
    if (lines) return lines;
    if (!pageSize) return renderedLines;
    const pages = paginateRenderedChordLines(renderedLines, pageSize);
    return pages[Math.max(0, Math.min(pageIndex, pages.length - 1))] || [];
  }, [lines, pageIndex, pageSize, renderedLines]);

  useLayoutEffect(() => {
    if (!fitToWidth) {
      setFitLayout({ scale: 1 });
      return;
    }

    const container = localContainerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      content.style.transform = "none";
      content.style.width = "auto";

      const styles = window.getComputedStyle(container);
      const horizontalPadding =
        Number.parseFloat(styles.paddingLeft || "0") + Number.parseFloat(styles.paddingRight || "0");
      const availableWidth = container.clientWidth - horizontalPadding;
      const naturalWidth = content.scrollWidth;
      const naturalHeight = content.scrollHeight;

      if (availableWidth <= 0 || naturalWidth <= 0) {
        setFitLayout({ scale: 1 });
        return;
      }

      const nextScale = naturalWidth > availableWidth ? Math.max(0.45, availableWidth / naturalWidth) : 1;
      const isScaled = nextScale < 0.99;

      if (isScaled) {
        content.style.transform = `scale(${nextScale})`;
        content.style.transformOrigin = "top left";
        content.style.width = `${naturalWidth}px`;
      }

      setFitLayout({
        scale: isScaled ? nextScale : 1,
        height: isScaled ? naturalHeight * nextScale : undefined,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [fitToWidth, scaleClassName, visibleLines]);

  const isScaled = fitLayout.scale < 0.99;

  return (
    <div
      ref={(node) => {
        localContainerRef.current = node;
        assignRef(containerRef, node);
      }}
      className={`${isScaled ? "overflow-hidden" : "overflow-auto overscroll-contain touch-pan-x touch-pan-y"} rounded-md border bg-background p-3 sm:p-4 ${scaleClassName} ${className || ""}`.trim()}
      style={{ fontFamily: RENDERED_CHART_FONT_FAMILY, ...style }}
    >
      {showHeader ? (
        <div className="mb-4 border-b pb-3 sm:mb-5">
          <h3 className="text-2xl font-bold leading-tight sm:text-xl">{title}</h3>
          {author ? <p className="text-base text-muted-foreground sm:text-sm">{author}</p> : null}
        </div>
      ) : null}

      <div
        className={isScaled ? "overflow-hidden" : undefined}
        style={fitLayout.height ? { height: fitLayout.height } : undefined}
      >
        <div ref={contentRef}>
          <RenderedChartLines lines={visibleLines} />
        </div>
      </div>
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
    <div className="h-full w-max max-w-none space-y-0.5 pr-2">
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
