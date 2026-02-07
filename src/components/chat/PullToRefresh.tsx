import { useState, useRef, ReactNode, useCallback, useImperativeHandle, forwardRef, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
  onScrollChange?: (isAtBottom: boolean) => void;
}

export interface PullToRefreshRef {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

// Detect if we're on iOS
function isIOS(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Trigger haptic feedback if supported
const triggerHaptic = (style: "light" | "medium" | "heavy" = "medium") => {
  if ("vibrate" in navigator) {
    const duration = style === "light" ? 10 : style === "medium" ? 20 : 30;
    navigator.vibrate(duration);
  }
};

// Dismiss keyboard by blurring active element
const dismissKeyboard = () => {
  const activeElement = document.activeElement as HTMLElement;
  if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
    activeElement.blur();
    triggerHaptic("light");
  }
};

export const PullToRefresh = forwardRef<PullToRefreshRef, PullToRefreshProps>(
  ({ onRefresh, children, className, onScrollChange }, ref) => {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [hasTriggeredHaptic, setHasTriggeredHaptic] = useState(false);
    const startY = useRef(0);
    const startScrollTop = useRef(0);
    const isDismissGesture = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const isIOSDevice = useMemo(() => isIOS(), []);

    const threshold = 80;
    const dismissThreshold = 50; // Threshold for keyboard dismiss gesture

    useImperativeHandle(ref, () => ({
      scrollToBottom: (behavior: ScrollBehavior = "smooth") => {
        if (containerRef.current) {
          containerRef.current.scrollTo({
            top: containerRef.current.scrollHeight,
            behavior,
          });
        }
      },
    }));

    const handleScroll = useCallback(() => {
      if (!containerRef.current || !onScrollChange) return;
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 30;
      onScrollChange(isAtBottom);
    }, [onScrollChange]);

    const handleTouchStart = (e: React.TouchEvent) => {
      startY.current = e.touches[0].clientY;
      startScrollTop.current = containerRef.current?.scrollTop ?? 0;
      isDismissGesture.current = false;
      setHasTriggeredHaptic(false);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      if (isRefreshing) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;
      const currentScrollTop = containerRef.current?.scrollTop ?? 0;

      // Pull-to-refresh: only when at the very top and pulling down
      if (startScrollTop.current === 0 && currentScrollTop === 0 && diff > 0) {
        const resistance = 0.4;
        const newDistance = Math.min(diff * resistance, threshold * 1.5);
        setPullDistance(newDistance);

        if (newDistance >= threshold && !hasTriggeredHaptic) {
          triggerHaptic("medium");
          setHasTriggeredHaptic(true);
        }
        return;
      }

      // Pull-down-to-dismiss keyboard on iOS: when swiping down anywhere (not at top)
      if (isIOSDevice && diff > dismissThreshold && !isDismissGesture.current) {
        // Check if keyboard is likely open (an input/textarea is focused)
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
          isDismissGesture.current = true;
          dismissKeyboard();
        }
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(threshold / 2);
        triggerHaptic("light");
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
      startY.current = 0;
      startScrollTop.current = 0;
      isDismissGesture.current = false;
      setHasTriggeredHaptic(false);
    };

  // Expose the container for scroll position checks
  return (
      <div
        ref={containerRef}
        data-pull-to-refresh-container
        className={cn("overflow-y-auto overscroll-none", className)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onScroll={handleScroll}
      >
        {/* Pull indicator */}
        <div
          className="flex items-center justify-center overflow-hidden transition-all duration-200"
          style={{ height: pullDistance }}
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
            <Loader2 className="h-6 w-6 text-zinc-400" />
          </div>
        </div>
        {children}
      </div>
    );
  }
);

PullToRefresh.displayName = "PullToRefresh";
