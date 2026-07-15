import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

// TEMPORARY diagnostic overlay for the iOS standalone cold-start nav-position
// bug. Prints the raw viewport measurements so we can compute the exact
// correction instead of guessing. Visible only to the owner account or when
// `?navdebug=1` has been set (persisted in localStorage). Remove once solved.
const OWNER_EMAILS = ["hey@smseyewear.com"];

type Metrics = {
  t: number;
  innerH: number;
  screenH: number;
  availH: number;
  vvH: number;
  vvTop: number;
  clientH: number;
  ty: number; // current translateY formula (visual-viewport based)
  gap: number; // candidate correction vs the physical screen bottom
  resizes: number;
};

let resizeCount = 0;

function read(startedAt: number): Metrics {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const innerH = Math.round(window.innerHeight);
  const screenH = Math.round(window.screen?.height ?? 0);
  const availH = Math.round(window.screen?.availHeight ?? 0);
  const vvH = vv ? Math.round(vv.height) : innerH;
  const vvTop = vv ? Math.round(vv.offsetTop) : 0;
  const clientH = Math.round(document.documentElement.clientHeight);
  const ty = Math.max(0, Math.round(vvTop + vvH - innerH));
  const gap = Math.max(0, Math.round(screenH - (vvTop + vvH)));
  return {
    t: Math.round(performance.now() - startedAt),
    innerH,
    screenH,
    availH,
    vvH,
    vvTop,
    clientH,
    ty,
    gap,
    resizes: resizeCount,
  };
}

export function NavViewportDebug() {
  const { user } = useAuth();
  const [initial, setInitial] = useState<Metrics | null>(null);
  const [live, setLive] = useState<Metrics | null>(null);
  const startedAt = useRef(0);

  // Allow turning on/off via ?navdebug=1 / ?navdebug=0 (persisted).
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("navdebug");
      if (p === "1") localStorage.setItem("navdebug", "1");
      if (p === "0") localStorage.removeItem("navdebug");
    } catch {
      /* ignore */
    }
  }, []);

  let flagged = false;
  try {
    flagged = localStorage.getItem("navdebug") === "1";
  } catch {
    /* ignore */
  }
  const isOwner = !!user?.email && OWNER_EMAILS.includes(user.email.toLowerCase());
  const enabled = isOwner || flagged;

  useEffect(() => {
    if (!enabled) return;
    startedAt.current = performance.now();
    const first = read(startedAt.current);
    setInitial(first);
    setLive(first);

    const tick = () => setLive(read(startedAt.current));
    const onResize = () => {
      resizeCount += 1;
      tick();
    };
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onResize);
    vv?.addEventListener("scroll", tick);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    const iv = window.setInterval(tick, 500);
    const rafs = [0, 1, 2, 3].map((i) =>
      window.setTimeout(tick, i * 60),
    );

    return () => {
      vv?.removeEventListener("resize", onResize);
      vv?.removeEventListener("scroll", tick);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.clearInterval(iv);
      rafs.forEach((id) => window.clearTimeout(id));
    };
  }, [enabled]);

  if (!enabled || !initial || !live) return null;

  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  const line = (label: string, m: Metrics) =>
    `${label} inH${m.innerH} scrH${m.screenH} avH${m.availH} vvH${m.vvH} vvTop${m.vvTop} clH${m.clientH} | ty${m.ty} gap${m.gap} (${m.t}ms r${m.resizes})`;

  return (
    <div
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 0px)",
        left: 4,
        right: 4,
        zIndex: 99999,
        background: "rgba(0,0,0,0.85)",
        color: "#39ff14",
        font: "10px/1.35 ui-monospace, Menlo, monospace",
        padding: "6px 8px",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
      }}
    >
      {`navdebug standalone=${standalone}\n${line("init", initial)}\n${line("live", live)}`}
    </div>
  );
}
