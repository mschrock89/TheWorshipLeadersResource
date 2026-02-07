import { useState, useRef, ReactNode, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface RefreshableContainerProps {
  children: ReactNode;
  className?: string;
  queryKeys?: string[][];
  onRefresh?: () => Promise<void>;
}

// Trigger haptic feedback if supported
const triggerHaptic = (style: "light" | "medium" | "heavy" = "medium") => {
  if ("vibrate" in navigator) {
    const duration = style === "light" ? 10 : style === "medium" ? 20 : 30;
    navigator.vibrate(duration);
  }
};

export function RefreshableContainer({
  children,
  className,
  queryKeys = [],
  onRefresh,
}: RefreshableContainerProps) {
  const queryClient = useQueryClient();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasTriggeredHaptic, setHasTriggeredHaptic] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const threshold = 80;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setPullDistance(threshold / 2);
    triggerHaptic("light");

    try {
      // Invalidate all provided query keys
      const invalidations = queryKeys.map((key) =>
        queryClient.invalidateQueries({ queryKey: key })
      );

      // Also run custom refresh if provided
      if (onRefresh) {
        invalidations.push(onRefresh());
      }

      await Promise.all(invalidations);
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [queryClient, queryKeys, onRefresh]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only activate if at top of scroll
    const isAtTop = window.scrollY === 0;
    if (isAtTop) {
      startY.current = e.touches[0].clientY;
      setHasTriggeredHaptic(false);
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isRefreshing) return;
    if (window.scrollY !== 0) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    if (diff > 0 && startY.current > 0) {
      // Prevent default to stop body scroll while pulling
      e.preventDefault();
      
      // Apply resistance to make it feel natural
      const resistance = 0.4;
      const newDistance = Math.min(diff * resistance, threshold * 1.5);
      setPullDistance(newDistance);

      // Trigger haptic when crossing threshold
      if (newDistance >= threshold && !hasTriggeredHaptic) {
        triggerHaptic("medium");
        setHasTriggeredHaptic(true);
      }
    }
  }, [isRefreshing, hasTriggeredHaptic, threshold]);

  const handleTouchEnd = useCallback(() => {
    if (pullDistance >= threshold && !isRefreshing) {
      handleRefresh();
    } else {
      setPullDistance(0);
    }
    startY.current = 0;
    setHasTriggeredHaptic(false);
  }, [pullDistance, threshold, isRefreshing, handleRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use passive: false to allow preventDefault
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Pull indicator */}
      <div
        className="absolute left-0 right-0 top-0 flex items-center justify-center overflow-hidden transition-all duration-200 z-50"
        style={{ 
          height: pullDistance,
          transform: `translateY(-${threshold / 2}px)`,
          marginTop: pullDistance > 0 ? threshold / 2 : 0
        }}
      >
        <div
          className={cn(
            "flex items-center justify-center transition-transform",
            isRefreshing && "animate-spin"
          )}
          style={{
            transform: `rotate(${(pullDistance / threshold) * 360}deg)`,
            opacity: Math.min(pullDistance / threshold, 1),
          }}
        >
          <Loader2 className="h-6 w-6 text-primary" />
        </div>
      </div>
      
      {/* Content with offset when pulling */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isRefreshing ? "none" : pullDistance === 0 ? "transform 0.2s ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
