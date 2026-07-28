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
import { MotionPresence, MotionSwap } from "./motion";
import { useWallet } from "./wallet";

export function AppShell({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const walletState = isPublicDemo
    ? "public-demo"
    : wallet.account
      ? wallet.chainId !== targetChain.id
        ? "wrong-network"
        : "connected"
      : wallet.connecting
        ? "connecting"
        : "disconnected";
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
          <NavLink to="/" end>
            런치
          </NavLink>
          <NavLink to="/create">만들기</NavLink>
          <NavLink to="/portfolio">포트폴리오</NavLink>
          <NavLink to="/about/risk">위험 안내</NavLink>
        </nav>
        <div className="wallet-area">
          <MotionSwap motionKey={walletState} className="wallet-motion">
            {isPublicDemo ? (
              <span className="public-demo-chip" role="status">
                읽기 전용
              </span>
            ) : wallet.account ? (
              <div className="wallet-controls">
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
              </div>
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
          </MotionSwap>
        </div>
      </header>
      <MotionPresence
        show={!isPublicDemo && Boolean(wallet.error)}
        className="shell-alert-motion"
      >
        {wallet.error ? (
          <div className="inline-alert inline-alert--danger" role="alert">
            {wallet.error}
          </div>
        ) : null}
      </MotionPresence>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        <NavLink to="/" end>
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
          <Badge
            status={
              launch.topTenOrdinaryHolderBps != null &&
              launch.topTenOrdinaryHolderBps >= 5_000
                ? "caution"
                : "muted"
            }
          >
            거래 가능 일반 물량 상위 10{" "}
            {formatBps(launch.topTenOrdinaryHolderBps)}
          </Badge>
        </div>
      </Link>
    </article>
  );
}

interface PriceFraction {
  numerator: bigint;
  denominator: bigint;
}

interface TradePriceSummary {
  low: PriceFraction;
  high: PriceFraction;
  changeBps: number | null;
}

function comparePrice(left: PriceFraction, right: PriceFraction): number {
  const difference =
    left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function roundedRatio(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

function formatHundredths(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n)
    .toString()
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

export function formatInverseTradePrice(
  nativeAmount: string,
  tokenAmount: string,
): string | null {
  const native = BigInt(nativeAmount);
  const token = BigInt(tokenAmount);
  if (native <= 0n || token <= 0n) return null;

  const compactUnits = [
    { divisor: 100_000_000n, suffix: "억" },
    { divisor: 10_000n, suffix: "만" },
  ] as const;
  for (const unit of compactUnits) {
    if (token >= native * unit.divisor) {
      const hundredths = roundedRatio(token * 100n, native * unit.divisor);
      return `${formatHundredths(hundredths)}${unit.suffix}`;
    }
  }

  const scale = 1_000_000n;
  const scaled = roundedRatio(token * scale, native);
  const whole = scaled / scale;
  const fraction = (scaled % scale)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

export function summarizeTradePrices(
  trades: Trade[],
): TradePriceSummary | null {
  const prices = trades.flatMap((trade): PriceFraction[] => {
    const numerator = BigInt(trade.nativeAmount);
    const denominator = BigInt(trade.tokenAmount);
    return numerator > 0n && denominator > 0n
      ? [{ numerator, denominator }]
      : [];
  });
  if (prices.length === 0) return null;

  const low = prices.reduce((value, price) =>
    comparePrice(price, value) < 0 ? price : value,
  );
  const high = prices.reduce((value, price) =>
    comparePrice(price, value) > 0 ? price : value,
  );
  const difference =
    high.numerator * low.denominator - low.numerator * high.denominator;
  const relativeDenominator = low.numerator * high.denominator;
  const rawChangeBps =
    relativeDenominator > 0n
      ? roundedRatio(difference * 10_000n, relativeDenominator)
      : null;
  const changeBps =
    rawChangeBps != null && rawChangeBps <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(rawChangeBps)
      : null;
  return { low, high, changeBps };
}

export function relativeTradePrices(trades: Trade[]): number[] {
  const prices = trades
    .slice()
    .reverse()
    .flatMap((trade): PriceFraction[] => {
      const denominator = BigInt(trade.tokenAmount);
      if (denominator <= 0n) return [];
      return [
        {
          numerator: BigInt(trade.nativeAmount),
          denominator,
        },
      ];
    });
  if (prices.length === 0) return [];

  const min = prices.reduce((value, price) =>
    comparePrice(price, value) < 0 ? price : value,
  );
  const max = prices.reduce((value, price) =>
    comparePrice(price, value) > 0 ? price : value,
  );
  const rangeNumerator =
    max.numerator * min.denominator - min.numerator * max.denominator;
  if (rangeNumerator === 0n) return prices.map(() => 0.5);

  const scale = 1_000_000_000_000n;
  return prices.map((price) => {
    const offsetNumerator =
      (price.numerator * min.denominator - min.numerator * price.denominator) *
      max.denominator;
    const offsetDenominator = price.denominator * rangeNumerator;
    const scaled = (offsetNumerator * scale) / offsetDenominator;
    return Number(scaled) / Number(scale);
  });
}

export function PriceChart({
  trades,
  symbol = "토큰",
  nativeSymbol = targetChain.nativeCurrency.symbol,
}: {
  trades: Trade[];
  symbol?: string;
  nativeSymbol?: string;
}) {
  const relativePrices = relativeTradePrices(trades);
  const summary = summarizeTradePrices(trades);
  if (relativePrices.length < 2) {
    return (
      <div className="chart-empty">
        <span aria-hidden="true">⌁</span>
        <p>가격 차트 데이터 수집 중</p>
        <small>실제 체결이 2건 이상 쌓이면 표시됩니다.</small>
      </div>
    );
  }
  const chartPoints = relativePrices.map((price, index) => {
    const x =
      relativePrices.length === 1
        ? 0
        : (index * 1000) / (relativePrices.length - 1);
    const y = 280 - price * 240;
    return { x, y };
  });
  const points = chartPoints
    .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(4)}`)
    .join(" ");
  return (
    <figure className="price-chart">
      {summary ? (
        <div className="price-chart__range">
          <span>
            가장 싸게 체결
            <strong>
              1 {nativeSymbol} ≈{" "}
              {formatInverseTradePrice(
                summary.low.numerator.toString(),
                summary.low.denominator.toString(),
              )}{" "}
              {symbol}
            </strong>
          </span>
          <span>
            가장 비싸게 체결
            <strong>
              1 {nativeSymbol} ≈{" "}
              {formatInverseTradePrice(
                summary.high.numerator.toString(),
                summary.high.denominator.toString(),
              )}{" "}
              {symbol}
            </strong>
          </span>
        </div>
      ) : null}
      <svg
        role="img"
        aria-label={`실제 거래 ${relativePrices.length}건으로 계산한 상대 가격 차트`}
        viewBox="0 0 1000 320"
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          pathLength="1"
          vectorEffect="non-scaling-stroke"
        />
        <g className="price-chart__points" aria-hidden="true">
          {chartPoints.map(({ x, y }, index) => (
            <circle
              cx={x}
              cy={y}
              r="4.5"
              vectorEffect="non-scaling-stroke"
              style={{
                animationDelay: `${220 + Math.min(index, 8) * 24}ms`,
              }}
              key={`${x}:${y}:${index}`}
            />
          ))}
        </g>
      </svg>
      <figcaption>
        <span>실제 인덱싱 체결 기준 · 보간 또는 모의 데이터 없음</span>
        <strong>
          체결 {relativePrices.length}건 · 저점 대비{" "}
          {summary?.changeBps == null
            ? "—"
            : `+${formatBps(summary.changeBps)}`}
        </strong>
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
  const state = loading ? "loading" : error ? "error" : "ready";
  return (
    <MotionSwap motionKey={state} className="async-boundary">
      {loading ? (
        <div className="skeleton-grid" aria-label="데이터 불러오는 중">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      ) : error ? (
        <div className="empty-state" role="alert">
          <span aria-hidden="true">!</span>
          <h2>마지막 정상 데이터를 불러오지 못했습니다</h2>
          <p>인덱서 연결을 확인한 뒤 다시 시도해 주세요.</p>
        </div>
      ) : (
        children
      )}
    </MotionSwap>
  );
}
