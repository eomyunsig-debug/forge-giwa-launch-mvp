import { Badge, Button, Metric } from "@forge/ui";
import {
  formatBps,
  formatElapsed,
  formatUnits,
  shortenAddress,
  type DataMeta,
  type LaunchSummary,
  type Trade,
} from "@forge/shared";
import { Link, NavLink } from "react-router";

import { appBrand, isLocalFixture, isPublicDemo, targetChain } from "./config";
import { useWallet } from "./wallet";

export function AppShell({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <div className="testnet-ribbon" role="status">
        <span aria-hidden="true">◆</span>
        {isPublicDemo
          ? "공개 읽기 전용 데모 · 기록된 로컬 Anvil 상태 · GIWA 배포 아님"
          : isLocalFixture
            ? "로컬 테스트 환경 · 실제 자산 아님"
            : "GIWA Sepolia 테스트넷 · 실제 자산 아님"}
      </div>
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label={`${appBrand.appName} 홈`}>
          <span className="wordmark__mark" aria-hidden="true">
            F
          </span>
          <span>{appBrand.appName}</span>
          <small>{isPublicDemo ? "PUBLIC DEMO" : "TESTNET"}</small>
        </Link>
        <nav className="desktop-nav" aria-label="주요 메뉴">
          <NavLink to="/">런치</NavLink>
          <NavLink to="/create">만들기</NavLink>
          <NavLink to="/portfolio">포트폴리오</NavLink>
          <NavLink to="/about/risk">위험 안내</NavLink>
        </nav>
        <div className="wallet-area">
          {isPublicDemo ? (
            <span className="public-demo-chip" role="status">
              읽기 전용
            </span>
          ) : wallet.account ? (
            <>
              {wallet.chainId !== targetChain.id ? (
                <Button
                  tone="danger"
                  onClick={() => void wallet.switchToTargetChain()}
                >
                  네트워크 전환
                </Button>
              ) : null}
              <button
                className="account-chip"
                onClick={wallet.disconnect}
                aria-label="지갑 연결 해제"
              >
                <span className="account-dot" aria-hidden="true" />
                {shortenAddress(wallet.account)}
              </button>
            </>
          ) : (
            <Button
              tone="neutral"
              busy={wallet.connecting}
              onClick={() => void wallet.connect()}
              data-testid="connect-wallet"
            >
              지갑 연결
            </Button>
          )}
        </div>
      </header>
      {!isPublicDemo && wallet.error ? (
        <div className="inline-alert inline-alert--danger" role="alert">
          {wallet.error}
        </div>
      ) : null}
      <main id="main">{children}</main>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        <NavLink to="/">
          <span aria-hidden="true">⌁</span>
          런치
        </NavLink>
        <NavLink to="/create">
          <span aria-hidden="true">＋</span>
          만들기
        </NavLink>
        <NavLink to="/portfolio">
          <span aria-hidden="true">◫</span>
          보유
        </NavLink>
        <NavLink to="/about/risk">
          <span aria-hidden="true">!</span>
          위험
        </NavLink>
      </nav>
      <footer className="site-footer">
        <p>
          누구나 토큰을 만들 수 있습니다. 표시된 검증 항목은 수익 또는 안전을
          보증하지 않습니다.
        </p>
        <p>
          {appBrand.appName}는 GIWA, 두나무, 업비트의 공식 서비스가 아닙니다.
        </p>
      </footer>
    </div>
  );
}

export function DataFreshness({ meta }: { meta: DataMeta | null }) {
  if (!meta) return <Badge status="collecting">데이터 수집 중</Badge>;
  if (isPublicDemo) {
    return (
      <div className="freshness">
        <Badge status="muted">기록된 로컬 실행</Badge>
        <span>
          블록 {meta.indexedBlock ?? "—"} ·{" "}
          {meta.updatedAt
            ? new Date(meta.updatedAt).toLocaleString("ko-KR")
            : "기록 시각 —"}
        </span>
      </div>
    );
  }
  const status =
    meta.status === "synced"
      ? "confirmed"
      : meta.status === "error"
        ? "danger"
        : "collecting";
  return (
    <div className="freshness">
      <Badge status={status}>
        {meta.status === "synced"
          ? "인덱서 동기화"
          : meta.status === "error"
            ? "마지막 정상 데이터"
            : "동기화 중"}
      </Badge>
      <span>
        블록 {meta.indexedBlock ?? "—"} ·{" "}
        {meta.updatedAt
          ? new Date(meta.updatedAt).toLocaleTimeString("ko-KR")
          : "갱신 시각 —"}
      </span>
    </div>
  );
}

export function LaunchCard({ launch }: { launch: LaunchSummary }) {
  return (
    <article className="launch-card" data-testid="launch-card">
      <Link
        className="launch-card__link"
        to={`/token/${launch.chainId}/${launch.tokenAddress}`}
      >
        <div className="token-identity">
          <span className="token-image" aria-hidden="true">
            {launch.imageUrl ? (
              <img
                src={launch.imageUrl}
                alt=""
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            ) : null}
            <span>F</span>
          </span>
          <div>
            <h3>{launch.name}</h3>
            <p>${launch.symbol}</p>
          </div>
          <span className="elapsed">{formatElapsed(launch.createdAt)}</span>
        </div>
        <div className="card-metrics">
          <Metric
            label="실제 유동성"
            value={`${formatUnits(
              launch.actualLiquidityNative
                ? BigInt(launch.actualLiquidityNative)
                : null,
            )} ${targetChain.nativeCurrency.symbol}`}
          />
          <Metric
            label="고유 홀더"
            value={launch.uniqueHolders?.toLocaleString("ko-KR") ?? "—"}
          />
          <Metric
            label="최근 거래량"
            value={
              launch.recentVolumeNative == null
                ? "—"
                : `${formatUnits(BigInt(launch.recentVolumeNative))} ${targetChain.nativeCurrency.symbol}`
            }
          />
          <Metric
            label="창작자 배정"
            value={formatBps(launch.creatorAllocationBps)}
          />
        </div>
        <div className="card-facts">
          <Badge status="confirmed">LP 원금 잠금</Badge>
          <Badge
            status={
              launch.topTenOrdinaryHolderBps != null &&
              launch.topTenOrdinaryHolderBps >= 5_000
                ? "caution"
                : "muted"
            }
          >
            상위 지갑 {formatBps(launch.topTenOrdinaryHolderBps)}
          </Badge>
          {launch.socialOwnershipVerified ? (
            <Badge status="confirmed">소셜 소유권</Badge>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

export function PriceChart({ trades }: { trades: Trade[] }) {
  if (trades.length < 2) {
    return (
      <div className="chart-empty">
        <span aria-hidden="true">⌁</span>
        <p>가격 차트 데이터 수집 중</p>
        <small>실제 체결이 2건 이상 쌓이면 표시됩니다.</small>
      </div>
    );
  }
  const prices = trades
    .slice()
    .reverse()
    .map((trade) => {
      const token = BigInt(trade.tokenAmount);
      return token === 0n
        ? 0n
        : (BigInt(trade.nativeAmount) * 1_000_000_000n) / token;
    });
  const min = prices.reduce((value, price) => (price < value ? price : value));
  const max = prices.reduce((value, price) => (price > value ? price : value));
  const range = max - min || 1n;
  const points = prices
    .map((price, index) => {
      const x = prices.length === 1 ? 0 : (index * 1000) / (prices.length - 1);
      const y = 280 - Number(((price - min) * 240n) / range);
      return `${x.toFixed(2)},${y}`;
    })
    .join(" ");
  return (
    <figure className="price-chart">
      <svg
        role="img"
        aria-label={`실제 거래 ${prices.length}건으로 계산한 상대 가격 차트`}
        viewBox="0 0 1000 320"
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption>
        실제 인덱싱 체결 기준 · 보간 또는 모의 데이터 없음
      </figcaption>
    </figure>
  );
}

export function AsyncBoundary({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: unknown;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="skeleton-grid" aria-label="데이터 불러오는 중">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="empty-state" role="alert">
        <span aria-hidden="true">!</span>
        <h2>마지막 정상 데이터를 불러오지 못했습니다</h2>
        <p>인덱서 연결을 확인한 뒤 다시 시도해 주세요.</p>
      </div>
    );
  }
  return children;
}
