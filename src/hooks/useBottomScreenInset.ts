import { useEffect, useState } from "react";
import { bottomScreenInset } from "@/lib/screenSafeArea";

function currentBottomInset() {
  if (typeof navigator === "undefined") return 0;
  return bottomScreenInset(0, navigator.userAgent);
}

export function useBottomScreenInset() {
  const [inset, setInset] = useState(currentBottomInset);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );

  useEffect(() => {
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px);";
    document.body.appendChild(probe);

    const read = () => {
      const measured = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      setInset(bottomScreenInset(measured, navigator.userAgent));
      setViewportHeight(window.innerHeight);
    };

    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    window.visualViewport?.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
      window.visualViewport?.removeEventListener("resize", read);
      probe.remove();
    };
  }, []);

  return { inset, viewportHeight };
}
