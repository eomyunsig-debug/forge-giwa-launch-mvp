import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Route, Routes, useLocation, type Location } from "react-router";

import { AppShell } from "./components";
import { isPublicDemo } from "./config";
import {
  MOTION_ENTER_MS,
  MOTION_EXIT_MS,
  usePrefersReducedMotion,
} from "./motion";

const HomePage = lazy(async () => {
  const module = await import("./pages/HomePage");
  return { default: module.HomePage };
});
const CreatePage = lazy(async () => {
  const module = await import("./pages/CreatePage");
  return { default: module.CreatePage };
});
const TokenPage = lazy(async () => {
  const module = await import("./pages/TokenPage");
  return { default: module.TokenPage };
});
const CreatorPage = lazy(async () => {
  const module = await import("./pages/OtherPages");
  return { default: module.CreatorPage };
});
const PortfolioPage = lazy(async () => {
  const module = await import("./pages/OtherPages");
  return { default: module.PortfolioPage };
});
const RiskPage = lazy(async () => {
  const module = await import("./pages/OtherPages");
  return { default: module.RiskPage };
});
const NotFoundPage = lazy(async () => {
  const module = await import("./pages/OtherPages");
  return { default: module.NotFoundPage };
});
const PublicDemoActionPage = lazy(async () => {
  const module = await import("./pages/OtherPages");
  return { default: module.PublicDemoActionPage };
});

interface RuntimeErrorBoundaryProps {
  children: ReactNode;
}

interface RuntimeErrorBoundaryState {
  hasError: boolean;
}

export class RuntimeErrorBoundary extends Component<
  RuntimeErrorBoundaryProps,
  RuntimeErrorBoundaryState
> {
  override state: RuntimeErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RuntimeErrorBoundaryState {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <main className="runtime-error-shell">
          <section
            className="runtime-error-card glass-panel"
            role="alert"
            aria-labelledby="runtime-error-title"
          >
            <span className="eyebrow">RECOVERY MODE</span>
            <h1 id="runtime-error-title">
              페이지를 안전하게 불러오지 못했습니다
            </h1>
            <p>
              일시적인 네트워크 오류이거나 새 배포로 화면 파일이 바뀌었을 수
              있습니다. 이 상태에서는 거래나 데이터 로딩이 완료됐다고 판단하지
              않습니다.
            </p>
            <div className="runtime-error-actions">
              <button
                type="button"
                className="forge-button forge-button--primary"
                onClick={() => window.location.reload()}
              >
                페이지 다시 불러오기
              </button>
              <a className="forge-button forge-button--neutral" href="/">
                런치 피드로 이동
              </a>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

function ForgeRoutes({ location }: { location: Location }) {
  return (
    <Suspense
      fallback={
        <div
          className="page skeleton-card"
          role="status"
          aria-label="페이지 불러오는 중"
        />
      }
    >
      <Routes location={location}>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/create"
          element={
            isPublicDemo ? (
              <PublicDemoActionPage action="create" />
            ) : (
              <CreatePage />
            )
          }
        />
        <Route path="/token/:chainId/:address" element={<TokenPage />} />
        <Route path="/creator/:address" element={<CreatorPage />} />
        <Route
          path="/portfolio"
          element={
            isPublicDemo ? (
              <PublicDemoActionPage action="portfolio" />
            ) : (
              <PortfolioPage />
            )
          }
        />
        <Route path="/about/risk" element={<RiskPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export function RouteMotion() {
  const location = useLocation();
  const reducedMotion = usePrefersReducedMotion();
  const pendingLocation = useRef(location);
  const initialRender = useRef(true);
  const [displayLocation, setDisplayLocation] = useState(location);
  const [state, setState] = useState<"enter" | "entered" | "exit">("enter");
  pendingLocation.current = location;

  useEffect(() => {
    if (location.key === displayLocation.key) {
      setState((current) => (current === "exit" ? "enter" : current));
      return;
    }
    setState("exit");
    const timer = window.setTimeout(
      () => {
        setDisplayLocation(pendingLocation.current);
        setState("enter");
      },
      reducedMotion ? 0 : MOTION_EXIT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [displayLocation.key, location, reducedMotion]);

  useEffect(() => {
    if (state !== "enter") return;
    const timer = window.setTimeout(
      () => setState("entered"),
      reducedMotion ? 0 : MOTION_ENTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [displayLocation.key, reducedMotion, state]);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [displayLocation.key]);

  const exiting = state === "exit";
  return (
    <div
      className="route-stage"
      data-motion-state={state}
      data-route={displayLocation.pathname}
      aria-hidden={exiting ? true : undefined}
      inert={exiting ? true : undefined}
    >
      <ForgeRoutes location={displayLocation} />
    </div>
  );
}

export function App() {
  return (
    <RuntimeErrorBoundary>
      <AppShell>
        <RouteMotion />
      </AppShell>
    </RuntimeErrorBoundary>
  );
}
