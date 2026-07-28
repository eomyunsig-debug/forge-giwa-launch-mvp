import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Metric } from "@forge/ui";
import { formatUnits, shortenAddress } from "@forge/shared";
import { vestingVaultAbi } from "@forge/sdk";
import { useState } from "react";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  type Address,
} from "viem";
import { Link, useParams } from "react-router";

import { fetchCreator, fetchPortfolio } from "../api";
import { DataFreshness, LaunchCard } from "../components";
import { targetChain } from "../config";
import { MotionPresence } from "../motion";
import { publicDemoLaunch } from "../publicDemoSnapshot";
import { useWallet } from "../wallet";

const client = createPublicClient({
  chain: targetChain,
  transport: http(targetChain.rpcUrls.default.http[0]),
});

function IndexerLoadError({
  title,
  onRetry,
}: {
  title: string;
  onRetry: () => void;
}) {
  return (
    <section
      className="page empty-state data-error-state motion-reveal"
      role="alert"
    >
      <Badge status="caution">인덱서 연결 오류</Badge>
      <h1>{title}</h1>
      <p>
        응답 실패를 빈 데이터나 잔액 0으로 표시하지 않았습니다. 연결이 복구된 뒤
        다시 불러오세요.
      </p>
      <Button onClick={onRetry}>다시 불러오기</Button>
      <Link className="text-link" to="/">
        런치 피드로 이동 →
      </Link>
    </section>
  );
}

export function PublicDemoActionPage({
  action,
}: {
  action: "create" | "portfolio";
}) {
  const creating = action === "create";
  return (
    <section className="page empty-state public-demo-action motion-reveal">
      <span aria-hidden="true">{creating ? "＋" : "◫"}</span>
      <Badge status="muted">공개 읽기 전용 데모</Badge>
      <h1>
        {creating
          ? "외부 데모에서는 토큰을 생성하지 않습니다"
          : "외부 데모에서는 지갑을 연결하지 않습니다"}
      </h1>
      <p>
        이 사이트는 2026년 7월 28일 로컬 Anvil 수직 흐름에서 기록한 온체인
        결과를 검토하기 위한 공개 화면입니다. GIWA 배포나 실시간 거래를 의미하지
        않습니다.
      </p>
      <div className="hero__actions">
        <Link
          className="forge-button forge-button--primary"
          to={`/token/${publicDemoLaunch.chainId}/${publicDemoLaunch.tokenAddress}`}
        >
          기록된 런치 보기
        </Link>
        <Link className="text-link" to="/about/risk">
          보장 범위 확인 →
        </Link>
      </div>
    </section>
  );
}

export function CreatorPage() {
  const address = useParams().address ?? "";
  const hasValidAddress = /^0x[a-fA-F0-9]{40}$/.test(address);
  const query = useQuery({
    queryKey: ["creator", address],
    queryFn: () => fetchCreator(address),
    enabled: hasValidAddress,
  });

  if (!hasValidAddress) {
    return (
      <section className="page empty-state">
        <h1>올바른 창작자 주소가 아닙니다</h1>
        <p>0x로 시작하는 40자리 EVM 주소를 확인하세요.</p>
      </section>
    );
  }
  if (query.isLoading) {
    return (
      <div
        className="page skeleton-card"
        role="status"
        aria-label="창작자 데이터 불러오는 중"
      />
    );
  }
  if (query.isError && !query.data) {
    return (
      <IndexerLoadError
        title="창작자 데이터를 불러오지 못했습니다"
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!query.data) {
    return (
      <section className="page empty-state">
        <h1>창작자 데이터를 찾지 못했습니다</h1>
        <p>인덱싱된 launch가 없거나 주소 형식이 잘못되었습니다.</p>
      </section>
    );
  }

  const creator = query.data.data;
  return (
    <section className="page creator-page">
      <header className="profile-header glass-panel motion-reveal motion-reveal--1">
        <div className="profile-avatar" aria-hidden="true">
          {creator.address.slice(2, 4).toUpperCase()}
        </div>
        <div>
          <span className="eyebrow">CREATOR PROFILE</span>
          <h1>{shortenAddress(creator.address)}</h1>
          <div className="profile-badges">
            <Badge status="muted">소셜 검증 지원되지 않음</Badge>
            <Badge status="muted">신원 KYC 아님</Badge>
          </div>
        </div>
        <DataFreshness meta={query.data.meta} />
      </header>

      <MotionPresence show={query.isError} className="creator-alert-motion">
        <div className="inline-alert inline-alert--danger" role="alert">
          최신 창작자 데이터를 갱신하지 못했습니다. 마지막 정상 응답을
          유지합니다.
        </div>
      </MotionPresence>

      <div className="metric-strip profile-metrics motion-reveal motion-reveal--2">
        <Metric label="과거 launch" value={creator.launches.length} />
        <Metric
          label="현재 유동성 유지"
          value={creator.launchesWithLiquidity ?? "—"}
        />
        <Metric label="소셜 소유권 검증" value="지원되지 않음" />
      </div>

      <div className="section-heading">
        <div>
          <span className="eyebrow">LAUNCH HISTORY</span>
          <h2>프로젝트별 온체인 상태</h2>
        </div>
      </div>
      {creator.launches.length ? (
        <div className="launch-grid motion-stagger">
          {creator.launches.map((launch) => (
            <LaunchCard key={launch.tokenAddress} launch={launch} />
          ))}
        </div>
      ) : (
        <div className="empty-state">인덱싱된 launch가 없습니다.</div>
      )}
      <div className="inline-alert">
        현재 MVP에는 소셜 소유권 증명의 발급·검증·재사용 방지 경로가 연결되어
        있지 않습니다. 구현과 검증이 완료되기 전까지 소셜 검증 배지를 표시하지
        않습니다.
      </div>
    </section>
  );
}

export function PortfolioPage() {
  const wallet = useWallet();
  const query = useQuery({
    queryKey: ["portfolio", targetChain.id, wallet.account],
    queryFn: () => fetchPortfolio(targetChain.id, wallet.account ?? ""),
    enabled: Boolean(wallet.account),
    refetchInterval: 10_000,
  });
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);

  async function claim(vault: Address) {
    if (!wallet.account) return;
    setClaiming(vault);
    setClaimMessage(null);
    try {
      await wallet.assertCurrentIntent(wallet.account, targetChain.id);
      const hash = await wallet.sendTransaction({
        account: wallet.account,
        to: vault,
        value: 0n,
        data: encodeFunctionData({
          abi: vestingVaultAbi,
          functionName: "claim",
        }),
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("CLAIM_REVERTED");
      setClaimMessage(
        "claim 영수증이 확인되었습니다. 인덱서 반영을 기다립니다.",
      );
      await query.refetch();
    } catch (cause) {
      setClaimMessage(
        cause instanceof Error ? cause.message : "claim에 실패했습니다.",
      );
    } finally {
      setClaiming(null);
    }
  }

  if (!wallet.account) {
    return (
      <section className="page empty-state">
        <span aria-hidden="true">◫</span>
        <h1>내 테스트넷 자산</h1>
        <p>
          페이지 로드만으로 서명하지 않습니다. 지갑을 연결해 온체인 주소를
          조회하세요.
        </p>
        <Button onClick={() => void wallet.connect()}>지갑 연결</Button>
      </section>
    );
  }

  if (query.isError && !query.data) {
    return (
      <IndexerLoadError
        title="포트폴리오 데이터를 불러오지 못했습니다"
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (query.isLoading || !query.data) {
    return (
      <section className="page portfolio-page">
        <header className="page-header">
          <span className="eyebrow">PORTFOLIO</span>
          <h1>내 테스트넷 자산</h1>
          <p>{shortenAddress(wallet.account)} · 인덱서 응답을 기다립니다.</p>
        </header>
        <div
          className="skeleton-card"
          role="status"
          aria-label="포트폴리오 데이터 불러오는 중"
        />
      </section>
    );
  }

  const portfolio = query.data.data;

  return (
    <section className="page portfolio-page">
      <header className="page-header motion-reveal motion-reveal--1">
        <span className="eyebrow">PORTFOLIO</span>
        <h1>내 테스트넷 자산</h1>
        <p>
          {shortenAddress(wallet.account)} · 평균 매수가는 신뢰성 있게 계산될
          때만 표시합니다.
        </p>
      </header>
      <DataFreshness meta={query.data.meta} />
      <MotionPresence show={query.isError} className="portfolio-alert-motion">
        <div className="inline-alert inline-alert--danger" role="alert">
          최신 포트폴리오 갱신에 실패했습니다. 아래에는 마지막 정상 응답을
          표시합니다.
        </div>
      </MotionPresence>
      {portfolio.holdings.length ? (
        <div className="portfolio-list motion-stagger">
          {portfolio.holdings.map((holding) => (
            <article
              className="glass-panel portfolio-row"
              key={holding.launch.tokenAddress}
            >
              <div>
                <strong>{holding.launch.name}</strong>
                <span>${holding.launch.symbol}</span>
              </div>
              <Metric
                label="보유량"
                value={formatUnits(BigInt(holding.balance), 18, true)}
              />
              <Metric
                label="현재 평가액"
                value={
                  holding.currentValueNative == null
                    ? "—"
                    : `${formatUnits(BigInt(holding.currentValueNative))} ${targetChain.nativeCurrency.symbol}`
                }
              />
              <Metric
                label="평균 매수가"
                value={
                  holding.averageEntryNative == null
                    ? "지원되지 않음"
                    : formatUnits(BigInt(holding.averageEntryNative))
                }
              />
              <Link
                to={`/token/${holding.launch.chainId}/${holding.launch.tokenAddress}`}
              >
                상세 →
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>인덱싱된 보유 토큰이 없습니다</h2>
          <p>잔액 0과 데이터 미수집을 구분하여 표시합니다.</p>
        </div>
      )}

      <div className="section-heading">
        <div>
          <span className="eyebrow">CREATOR CLAIMS</span>
          <h2>인출 가능한 창작자 베스팅</h2>
        </div>
      </div>
      {portfolio.claimableVestings.length ? (
        <div className="portfolio-list motion-stagger">
          {portfolio.claimableVestings.map((item) => (
            <article
              className="glass-panel portfolio-row"
              key={item.launch.vestingVaultAddress}
            >
              <strong>{item.launch.name}</strong>
              <Metric
                label="현재 claim 가능"
                value={formatUnits(BigInt(item.claimable), 18, true)}
              />
              <Button
                busy={claiming === item.launch.vestingVaultAddress}
                onClick={() =>
                  void claim(item.launch.vestingVaultAddress as Address)
                }
              >
                claim 트랜잭션 확인
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <p>현재 claim 가능한 스케줄이 없습니다.</p>
      )}
      <MotionPresence
        show={Boolean(claimMessage)}
        className="claim-message-motion"
      >
        {claimMessage ? (
          <div className="inline-alert">{claimMessage}</div>
        ) : null}
      </MotionPresence>

      <div className="section-heading">
        <div>
          <span className="eyebrow">RECENT TRANSACTIONS</span>
          <h2>최근 트랜잭션</h2>
        </div>
      </div>
      {portfolio.recentTransactions.length ? (
        <ul className="transaction-list motion-stagger">
          {portfolio.recentTransactions.map((hash) => (
            <li key={hash}>
              <code>{hash}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p>인덱싱된 최근 트랜잭션이 없습니다.</p>
      )}
    </section>
  );
}

const guaranteeRows = [
  {
    title: "추가 민팅 불가",
    body: "표준 토큰은 생성자에서 전량 발행되며 외부 mint 함수와 owner가 없습니다.",
    tone: "confirmed" as const,
  },
  {
    title: "창작자 베스팅",
    body: "창작자 주소·배정량·cliff·종료 시각은 각 launch 볼트에 고정됩니다.",
    tone: "confirmed" as const,
  },
  {
    title: "표시 LP 원금 인출 경로 없음",
    body: "Locker에는 원금 withdrawal 또는 emergency escape 함수가 없습니다.",
    tone: "confirmed" as const,
  },
  {
    title: "가격·수익·창작자 정직성",
    body: "Forge가 보장하지 않습니다. 런치 가격과 유동성은 조작될 수 있습니다.",
    tone: "caution" as const,
  },
  {
    title: "소셜 계정 소유권 검증",
    body: "현재 MVP에서는 지원되지 않습니다. 발급·검증·재사용 방지 경로가 구현되기 전까지 배지를 표시하지 않습니다.",
    tone: "muted" as const,
  },
  {
    title: "컨트랙트 소스 검증",
    body: "현재 MVP는 explorer의 소스 검증 결과를 수집하지 않습니다. Forge factory의 런치 기록만으로 Verified라고 표시하지 않습니다.",
    tone: "muted" as const,
  },
];

const guaranteeGroups = [
  {
    eyebrow: "CONTRACT ENFORCED",
    title: "컨트랙트가 강제하는 것",
    description: "관리자나 창작자가 나중에 되돌릴 수 없는 템플릿 규칙입니다.",
    rows: guaranteeRows.slice(0, 3),
  },
  {
    eyebrow: "LIMITS & UNSUPPORTED",
    title: "보장하지 않거나 지원하지 않는 것",
    description: "온체인 사실과 신뢰·수익 보장을 명확히 분리합니다.",
    rows: guaranteeRows.slice(3),
  },
] as const;

export function RiskPage() {
  return (
    <section className="page risk-page">
      <header className="page-header motion-reveal motion-reveal--1">
        <span className="eyebrow">RISK, WITHOUT THE SCORE</span>
        <h1>점수 대신 사실을 보여줍니다</h1>
        <p>
          단일한 “안전 점수”는 복잡한 위험을 숨깁니다. Forge는 컨트랙트와
          인덱서로 확인 가능한 항목을 분리해 표시합니다.
        </p>
      </header>

      <div className="risk-principle-groups">
        {guaranteeGroups.map((group, index) => (
          <section
            className={`risk-principle-group glass-panel motion-reveal motion-reveal--${index + 2}`}
            key={group.title}
          >
            <header>
              <span className="eyebrow">{group.eyebrow}</span>
              <h2>{group.title}</h2>
              <p>{group.description}</p>
            </header>
            <div className="risk-principles motion-stagger">
              {group.rows.map((row) => (
                <article key={row.title}>
                  <Badge status={row.tone}>{row.title}</Badge>
                  <p>{row.body}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="document-section motion-reveal motion-reveal--4">
        <h2>배지의 정확한 의미</h2>
        <dl>
          <div>
            <dt>컨트랙트 소스 검증 — 지원되지 않음</dt>
            <dd>
              현재 인덱서는 explorer의 소스 검증 결과를 수집하지 않습니다.
              설정된 Forge factory의 런치 이벤트는 별도 온체인 사실로
              표시하지만, 이를 소스 검증 배지로 바꾸지 않습니다.
            </dd>
          </div>
          <div>
            <dt>Liquidity Locked</dt>
            <dd>
              표시된 LP 원금이 인출 함수 없는 locker에 있다는 의미입니다. AMM
              운영자 pause·fee·프로토콜 버그는 별도 위험입니다.
            </dd>
          </div>
          <div>
            <dt>소셜 소유권 검증 — 지원되지 않음</dt>
            <dd>
              현재 MVP에는 소셜 계정과 지갑의 연결을 발급·검증하는 완성된 경로가
              없습니다. 재사용·replay 방지까지 구현되고 검증되기 전에는 관련
              배지를 표시하지 않습니다.
            </dd>
          </div>
          <div>
            <dt>Allocation Disclosed</dt>
            <dd>
              창작자 배정량과 베스팅 주소·일정을 온체인에서 읽을 수 있다는
              의미입니다.
            </dd>
          </div>
        </dl>
      </section>

      <section className="document-section motion-reveal motion-reveal--5">
        <h2>관리자 권한</h2>
        <ul>
          <li>향후 launch의 bounded 생성 수수료 변경</li>
          <li>향후 생성 수수료 수령 주소 변경</li>
          <li>향후 launch에서 사용할 AMM adapter 허용/해제</li>
        </ul>
        <p>
          관리자는 이미 생성된 토큰을 mint·pause·blacklist·tax할 수 없고, 창작자
          볼트나 LP locker 원금을 가져갈 수 없습니다. MVP는 proxy가 아니며
          upgrade admin이 없습니다.
        </p>
      </section>

      <section className="document-section warning-section motion-reveal motion-reveal--5">
        <h2>테스트넷 상태</h2>
        <p>
          이 서비스는 테스트넷용이며 실제 자산 거래를 지원하지 않습니다.
          테스트넷은 reorg·reset·상태 소실이 발생할 수 있습니다. 테스트 토큰과
          테스트 ETH에는 금전적 가치가 없습니다.
        </p>
        <p>
          Forge는 GIWA, 두나무, 업비트의 공식 서비스 또는 승인·제휴 프로젝트가
          아닙니다.
        </p>
      </section>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="page empty-state motion-reveal">
      <h1>페이지를 찾지 못했습니다</h1>
      <Link to="/">런치 피드로 돌아가기</Link>
    </section>
  );
}
