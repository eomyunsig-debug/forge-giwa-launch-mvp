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
import { useWallet } from "../wallet";

const client = createPublicClient({
  chain: targetChain,
  transport: http(targetChain.rpcUrls.default.http[0]),
});

export function CreatorPage() {
  const address = useParams().address ?? "";
  const query = useQuery({
    queryKey: ["creator", address],
    queryFn: () => fetchCreator(address),
    enabled: /^0x[a-fA-F0-9]{40}$/.test(address),
  });

  if (query.isLoading) return <div className="page skeleton-card" />;
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
      <header className="profile-header glass-panel">
        <div className="profile-avatar" aria-hidden="true">
          {creator.address.slice(2, 4).toUpperCase()}
        </div>
        <div>
          <span className="eyebrow">CREATOR PROFILE</span>
          <h1>{shortenAddress(creator.address)}</h1>
          <div className="profile-badges">
            {creator.socialOwnershipVerified ? (
              <Badge status="confirmed">Social Ownership Verified</Badge>
            ) : (
              <Badge status="muted">소셜 소유권 검증할 수 없음</Badge>
            )}
            <Badge status="muted">신원 KYC 아님</Badge>
          </div>
        </div>
        <DataFreshness meta={query.data.meta} />
      </header>

      <div className="metric-strip profile-metrics">
        <Metric label="과거 launch" value={creator.launches.length} />
        <Metric
          label="현재 유동성 유지"
          value={creator.launchesWithLiquidity ?? "—"}
        />
        <Metric
          label="소셜 증거"
          value={
            creator.socialProofStatus === "verified"
              ? "소유권 확인됨"
              : creator.socialProofStatus === "collecting"
                ? "데이터 수집 중"
                : "검증할 수 없음"
          }
        />
      </div>

      <div className="section-heading">
        <div>
          <span className="eyebrow">LAUNCH HISTORY</span>
          <h2>프로젝트별 온체인 상태</h2>
        </div>
      </div>
      {creator.launches.length ? (
        <div className="launch-grid">
          {creator.launches.map((launch) => (
            <LaunchCard key={launch.tokenAddress} launch={launch} />
          ))}
        </div>
      ) : (
        <div className="empty-state">인덱싱된 launch가 없습니다.</div>
      )}
      <div className="inline-alert">
        Social Ownership Verified는 해당 소셜 계정과 지갑의 연결만 의미하며,
        신원 또는 프로젝트 신뢰성을 보증하지 않습니다.
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

  return (
    <section className="page portfolio-page">
      <header className="page-header">
        <span className="eyebrow">PORTFOLIO</span>
        <h1>내 테스트넷 자산</h1>
        <p>
          {shortenAddress(wallet.account)} · 평균 매수가는 신뢰성 있게 계산될
          때만 표시합니다.
        </p>
      </header>
      <DataFreshness meta={query.data?.meta ?? null} />
      {query.isLoading ? <div className="skeleton-card" /> : null}
      {query.data?.data.holdings.length ? (
        <div className="portfolio-list">
          {query.data.data.holdings.map((holding) => (
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
      {query.data?.data.claimableVestings.length ? (
        <div className="portfolio-list">
          {query.data.data.claimableVestings.map((item) => (
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
      {claimMessage ? <div className="inline-alert">{claimMessage}</div> : null}

      <div className="section-heading">
        <div>
          <span className="eyebrow">RECENT TRANSACTIONS</span>
          <h2>최근 트랜잭션</h2>
        </div>
      </div>
      {query.data?.data.recentTransactions.length ? (
        <ul className="transaction-list">
          {query.data.data.recentTransactions.map((hash) => (
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
    title: "소셜 계정 소유권",
    body: "검증 시 계정과 지갑 연결만 의미합니다. KYC·신원·신뢰성 검증이 아닙니다.",
    tone: "muted" as const,
  },
];

export function RiskPage() {
  return (
    <section className="page risk-page">
      <header className="page-header">
        <span className="eyebrow">RISK, WITHOUT THE SCORE</span>
        <h1>점수 대신 사실을 보여줍니다</h1>
        <p>
          단일한 “안전 점수”는 복잡한 위험을 숨깁니다. Forge는 컨트랙트와
          인덱서로 확인 가능한 항목을 분리해 표시합니다.
        </p>
      </header>

      <div className="risk-principles">
        {guaranteeRows.map((row) => (
          <article className="glass-panel" key={row.title}>
            <Badge status={row.tone}>{row.title}</Badge>
            <p>{row.body}</p>
          </article>
        ))}
      </div>

      <section className="document-section">
        <h2>배지의 정확한 의미</h2>
        <dl>
          <div>
            <dt>Contract Template Verified</dt>
            <dd>
              설정된 Forge factory의 런치 기록과 explorer 소스 검증이 모두
              확인됐을 때만 표시합니다. 수익성과 창작자 행동을 보증하지
              않습니다.
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
            <dt>Creator Social Verified</dt>
            <dd>
              nonce·도메인·체인·지갑·만료 시각이 결합된 서명으로 소셜 계정 소유
              증거를 확인했다는 의미입니다. 신원 KYC가 아닙니다.
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

      <section className="document-section">
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

      <section className="document-section warning-section">
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
    <section className="page empty-state">
      <h1>페이지를 찾지 못했습니다</h1>
      <Link to="/">런치 피드로 돌아가기</Link>
    </section>
  );
}
