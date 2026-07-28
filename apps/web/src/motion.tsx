import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Key,
  type Ref,
  type ReactNode,
} from "react";

export const MOTION_EXIT_MS = 160;
export const MOTION_ENTER_MS = 420;

type MotionState = "enter" | "entered" | "exit";

function reducedMotionQuery(): MediaQueryList | null {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return null;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)");
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => reducedMotionQuery()?.matches ?? false,
  );

  useEffect(() => {
    const query = reducedMotionQuery();
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function MotionPresence({
  show,
  children,
  className = "",
  durationMs = MOTION_EXIT_MS,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
  durationMs?: number;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const lastChildren = useRef(children);
  const [rendered, setRendered] = useState(show);
  const [state, setState] = useState<MotionState>(show ? "enter" : "exit");
  if (show) lastChildren.current = children;

  useEffect(() => {
    let timer: number | undefined;
    if (show) {
      setRendered(true);
      setState("enter");
      timer = window.setTimeout(
        () => setState("entered"),
        reducedMotion ? 0 : MOTION_ENTER_MS,
      );
    } else if (rendered) {
      setState("exit");
      timer = window.setTimeout(
        () => setRendered(false),
        reducedMotion ? 0 : durationMs,
      );
    }
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, [durationMs, reducedMotion, rendered, show]);

  if (!rendered) return null;

  const exiting = state === "exit";
  return (
    <div
      className={`motion-presence ${className}`.trim()}
      data-motion-state={state}
      aria-hidden={exiting ? true : undefined}
      inert={exiting ? true : undefined}
    >
      {lastChildren.current}
    </div>
  );
}

interface MotionSnapshot {
  key: Key;
  node: ReactNode;
}

export function MotionSwap({
  motionKey,
  children,
  className = "",
  durationMs = MOTION_EXIT_MS,
  incomingRef,
}: {
  motionKey: Key;
  children: ReactNode;
  className?: string;
  durationMs?: number;
  incomingRef?: Ref<HTMLDivElement>;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const previous = useRef<MotionSnapshot>({ key: motionKey, node: children });
  const latest = useRef<MotionSnapshot>({ key: motionKey, node: children });
  const [outgoing, setOutgoing] = useState<MotionSnapshot | null>(null);
  const [incomingSequence, setIncomingSequence] = useState<0 | 1>(0);
  latest.current = { key: motionKey, node: children };

  useLayoutEffect(() => {
    if (previous.current.key !== motionKey) {
      setOutgoing(previous.current);
      previous.current = latest.current;
      setIncomingSequence((current) => (current === 0 ? 1 : 0));
    }
  }, [motionKey]);

  useLayoutEffect(() => {
    if (!outgoing) return;
    const timer = window.setTimeout(
      () => setOutgoing(null),
      reducedMotion ? 0 : durationMs,
    );
    return () => window.clearTimeout(timer);
  }, [durationMs, outgoing, reducedMotion]);

  useLayoutEffect(() => {
    if (previous.current.key === motionKey) {
      previous.current = latest.current;
    }
  }, [children, motionKey]);

  return (
    <div className={`motion-swap ${className}`.trim()}>
      {outgoing ? (
        <div
          className="motion-swap__outgoing"
          data-motion-state="exit"
          aria-hidden="true"
          inert
        >
          {outgoing.node}
        </div>
      ) : null}
      <div
        ref={incomingRef}
        className="motion-swap__incoming"
        data-motion-state="enter"
        data-motion-sequence={incomingSequence}
      >
        {children}
      </div>
    </div>
  );
}
