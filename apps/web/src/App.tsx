import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

import { AppShell } from "./components";

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

export function App() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="page skeleton-card" aria-label="페이지 불러오는 중" />
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/token/:chainId/:address" element={<TokenPage />} />
          <Route path="/creator/:address" element={<CreatorPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/about/risk" element={<RiskPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
