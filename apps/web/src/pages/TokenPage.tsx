import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, ExternalLink, Metric } from "@forge/ui";
import {
  formatBps,
  formatUnits,
  shortenAddress,
  type LaunchDetail,
  type RiskFact,
} from "@forge/shared";
import {
  buildApprovalRequest,
  buildTradeRequest,
  erc20Abi,
  fetchTradeQuote,
  type TradeQuote,
} from "@forge/sdk";
import {
  createPublicClient,
  http,
  parseUnits,
  type Address,
  type Hash,
} from "viem";
import { Link, useParams } from "react-router";

import { fetchLaunch } from "../api";
import { DataFreshness, PriceChart } from "../components";
import { deployment, targetChain } from "../config";
import { useWallet } from "../wallet";

export type TradeStatus =
  | "idle"
  | "balance-loading"
  | "quote-loading"
  | "quoted"
  | "approval-required"
  | "signing"
  | "submitted"
  | "confirming"
  | "confirmed"
  | "rejected"
  | "reverted"
  | "quote-expired"
  | "slippage-exceeded"
  | "insufficient-gas"
  | "insufficient-balance"
  | "reconciling";

const client = createPublicClient({
  chain: targetChain,
  transport: http(targetChain.rpcUrls.default.http[0]),
});

function explorer(kind: "address" | "tx", value: string): string | null {
  const base = targetChain.blockExplorers?.default.url;
  if (!base || !/^[a-zA-Z0-9x]+$/.test(value)) return null;
  return `${base.replace(/\/$/, "")}/${kind}/${value}`;
}

function riskTone(fact: RiskFact) {
  if (fact.status === "confirmed" || fact.status === "not-applicable")
    return "confirmed" as const;
  if (fact.status === "caution" || fact.status === "high-concentration")
    return "caution" as const;
  if (fact.status === "collecting") return "collecting" as const;
  return "muted" as const;
}

function riskValue(fact: RiskFact, symbol: string): string {
  if (fact.value == null) return "—";
  try {
    if (fact.key === "actual-liquidity") {
      return `${formatUnits(BigInt(fact.value))} ${targetChain.nativeCurrency.symbol}`;
    }
    if (fact.key === "creator-locked-balance") {
      return `${formatUnits(BigInt(fact.value), 18, true)} ${symbol}`;
    }
    if (
      fact.key === "creator-allocation" ||
      fact.key === "top-ten-concentration"
    ) {
      const bps = Number.parseInt(fact.value, 10);
      return Number.isFinite(bps) ? formatBps(bps) : fact.value;
    }
    if (fact.key === "transfer-tax" && fact.value === "0") return "0%";
  } catch {
    return "검증할 수 없음";
  }
  return fact.value;
}

export function statusCopy(status: TradeStatus): string {
  const copy: Record<TradeStatus, string> = {
    idle: "금액을 입력하고 온체인 견적을 확인하세요.",
    "balance-loading": "잔액과 allowance 확인 중",
    "quote-loading": "온체인 견적 계산 중",
    quoted: "견적 확인됨",
    "approval-required": "정확한 판매 수량만 승인해야 합니다.",
    signing: "지갑 승인 대기",
    submitted: "트랜잭션 제출됨",
    confirming: "영수증 확인 중",
    confirmed: "거래 영수증 확인됨",
    rejected: "지갑에서 취소됨",
    reverted: "컨트랙트 실행 실패",
    "quote-expired": "견적이 만료되었습니다. 다시 조회하세요.",
    "slippage-exceeded": "최소 수령량 조건을 충족하지 못했습니다.",
    "insufficient-gas": "네트워크 수수료용 잔액이 부족합니다.",
    "insufficient-balance": "입력 자산 잔액이 부족합니다.",
    reconciling: "영수증 확인됨 · 인덱서 반영 대기",
  };
  return copy[status];
}

function TradePanel({
  launch,
  onReconcile,
}: {
  launch: LaunchDetail;
  onReconcile: () => Promise<unknown>;
}) {
  const wallet = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [status, setStatus] = useState<TradeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [gasCost, setGasCost] = useState<bigint | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const quoteRequestId = useRef(0);

  function invalidateQuote() {
    quoteRequestId.current += 1;
    setQuote(null);
    setGasCost(null);
    setStatus("idle");
    setError(null);
  }

  useEffect(() => {
    invalidateQuote();
  }, [wallet.account, wallet.chainId, launch.chainId, launch.tokenAddress]);

  useEffect(() => {
    if (
      status === "reconciling" &&
      txHash &&
      launch.trades.some(
        (trade) => trade.transactionHash.toLowerCase() === txHash.toLowerCase(),
      )
    ) {
      setStatus("confirmed");
      setQuote(null);
      setGasCost(null);
      setAmount("");
    }
  }, [launch.trades, status, txHash]);

  const token = launch.tokenAddress as Address;

  async function getQuote() {
    setError(null);
    if (deployment?.chainId !== launch.chainId) {
      setError("이 체인의 거래 adapter가 활성화되지 않았습니다.");
      return;
    }
    if (!wallet.account) {
      setError("견적을 계정과 결합하려면 지갑을 연결하세요.");
      return;
    }
    if (wallet.chainId !== deployment.chainId) {
      setError(`${targetChain.name} 네트워크로 전환하세요.`);
      return;
    }
    let amountIn: bigint;
    try {
      amountIn = parseUnits(amount, 18);
    } catch {
      setError("올바른 금액을 입력하세요.");
      return;
    }
    setStatus("quote-loading");
    const requestId = ++quoteRequestId.current;
    try {
      const next = await fetchTradeQuote(
        client,
        deployment,
        wallet.account,
        token,
        side,
        amountIn,
        { slippageBps },
      );
      if (requestId !== quoteRequestId.current) return;
      setQuote(next);
      const request = buildTradeRequest(next);
      try {
        const [gas, gasPrice] = await Promise.all([
          client.estimateGas({
            account: wallet.account,
            to: request.to,
            data: request.data,
            value: request.value,
          }),
          client.getGasPrice(),
        ]);
        if (requestId === quoteRequestId.current) {
          setGasCost(gas * gasPrice);
        }
      } catch {
        if (requestId === quoteRequestId.current) {
          setGasCost(null);
        }
      }
      if (requestId !== quoteRequestId.current) return;
      if (side === "sell") {
        const allowance = await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [wallet.account, deployment.adapter],
        });
        if (requestId !== quoteRequestId.current) return;
        setStatus(allowance < amountIn ? "approval-required" : "quoted");
      } else {
        setStatus("quoted");
      }
    } catch (cause) {
      if (requestId !== quoteRequestId.current) return;
      setStatus("reverted");
      setError(
        cause instanceof Error ? cause.message : "견적 조회에 실패했습니다.",
      );
    }
  }

  async function execute() {
    if (!quote || !deployment || !wallet.account) return;
    setError(null);
    if (Date.now() >= quote.expiresAt) {
      setStatus("quote-expired");
      return;
    }
    try {
      await wallet.assertCurrentIntent(quote.account, quote.chainId);
      setStatus("balance-loading");
      if (quote.side === "buy") {
        const balance = await client.getBalance({ address: quote.account });
        if (balance < quote.amountIn + (gasCost ?? 0n)) {
          setStatus(
            balance < quote.amountIn
              ? "insufficient-balance"
              : "insufficient-gas",
          );
          return;
        }
      } else {
        const balance = await client.readContract({
          address: quote.token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [quote.account],
        });
        if (balance < quote.amountIn) {
          setStatus("insufficient-balance");
          return;
        }
        const allowance = await client.readContract({
          address: quote.token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [quote.account, quote.adapter],
        });
        if (allowance < quote.amountIn) {
          setStatus("signing");
          const approval = buildApprovalRequest(
            quote.account,
            quote.token,
            quote.adapter,
            quote.amountIn,
          );
          await wallet.assertCurrentIntent(quote.account, quote.chainId);
          const approvalHash = await wallet.sendTransaction(approval);
          setStatus("confirming");
          const approvalReceipt = await client.waitForTransactionReceipt({
            hash: approvalHash,
          });
          if (approvalReceipt.status !== "success") {
            setStatus("reverted");
            setError("정확한 수량 승인 트랜잭션이 실패했습니다.");
            return;
          }
          await wallet.assertCurrentIntent(quote.account, quote.chainId);
        }
      }

      if (Date.now() >= quote.expiresAt) {
        setStatus("quote-expired");
        return;
      }
      setStatus("signing");
      const request = buildTradeRequest(quote);
      await wallet.assertCurrentIntent(quote.account, quote.chainId);
      const hash = await wallet.sendTransaction(request);
      setTxHash(hash);
      setStatus("submitted");
      setStatus("confirming");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setStatus("reverted");
        setError("거래 컨트랙트가 트랜잭션을 되돌렸습니다.");
        return;
      }
      setStatus("reconciling");
      await onReconcile();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "거래에 실패했습니다.";
      if (message.includes("취소")) setStatus("rejected");
      else if (message.toLowerCase().includes("slippage"))
        setStatus("slippage-exceeded");
      else setStatus("reverted");
      setError(message);
    }
  }

  return (
    <section className="trade-panel glass-panel" aria-labelledby="trade-title">
      <div className="trade-tabs" role="tablist" aria-label="거래 방향">
        <button
          role="tab"
          aria-selected={side === "buy"}
          className={side === "buy" ? "buy active" : "buy"}
          onClick={() => {
            if (side !== "buy") {
              setSide("buy");
              invalidateQuote();
            }
          }}
        >
          <span aria-hidden="true">↗</span> 매수
        </button>
        <button
          role="tab"
          aria-selected={side === "sell"}
          className={side === "sell" ? "sell active" : "sell"}
          onClick={() => {
            if (side !== "sell") {
              setSide("sell");
              invalidateQuote();
            }
          }}
        >
          <span aria-hidden="true">↘</span> 매도
        </button>
      </div>
      <h2 id="trade-title" className="visually-hidden">
        {launch.symbol} 거래
      </h2>
      <label className="trade-amount">
        <span>보낼 금액</span>
        <div>
          <input
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              invalidateQuote();
            }}
            inputMode="decimal"
            placeholder="0.0"
            data-testid="trade-amount"
          />
          <strong>
            {side === "buy" ? targetChain.nativeCurrency.symbol : launch.symbol}
          </strong>
        </div>
      </label>
      <div className="slippage-row">
        <span>슬리피지</span>
        {[50, 100, 300].map((bps) => (
          <button
            key={bps}
            type="button"
            aria-pressed={slippageBps === bps}
            className={slippageBps === bps ? "active" : ""}
            onClick={() => {
              if (slippageBps !== bps) {
                setSlippageBps(bps);
                invalidateQuote();
              }
            }}
          >
            {formatBps(bps)}
          </button>
        ))}
      </div>
      <div className="quote-box" aria-live="polite">
        <div>
          <span>예상 수령량</span>
          <strong>
            {quote
              ? `${formatUnits(quote.amountOut)} ${
                  side === "buy"
                    ? launch.symbol
                    : targetChain.nativeCurrency.symbol
                }`
              : "—"}
          </strong>
        </div>
        <div>
          <span>최소 수령량</span>
          <strong>{quote ? formatUnits(quote.minAmountOut) : "—"}</strong>
        </div>
        <div>
          <span>가격 영향</span>
          <strong>{formatBps(quote?.priceImpactBps)}</strong>
        </div>
        <div>
          <span>AMM 수수료</span>
          <strong>
            {quote?.feeBps == null ? "지원되지 않음" : formatBps(quote.feeBps)}
          </strong>
        </div>
        <div>
          <span>네트워크 수수료 추정</span>
          <strong>
            {gasCost == null
              ? "—"
              : `${formatUnits(gasCost)} ${targetChain.nativeCurrency.symbol}`}
          </strong>
        </div>
        <div>
          <span>deadline</span>
          <strong>
            {quote
              ? new Date(quote.deadline * 1_000).toLocaleTimeString("ko-KR")
              : "—"}
          </strong>
        </div>
      </div>
      <div className="transaction-state" data-status={status} role="status">
        <span aria-hidden="true">
          {status === "confirmed" ? "✓" : status === "reverted" ? "×" : "·"}
        </span>
        {statusCopy(status)}
      </div>
      {error ? (
        <div className="inline-alert inline-alert--danger" role="alert">
          {error}
        </div>
      ) : null}
      {txHash ? (
        <ExternalLink href={explorer("tx", txHash)}>
          트랜잭션 {shortenAddress(txHash)}
        </ExternalLink>
      ) : null}
      {wallet.account == null ? (
        <Button
          tone="neutral"
          onClick={() => void wallet.connect()}
          data-testid="trade-connect"
        >
          지갑 연결
        </Button>
      ) : wallet.chainId !== targetChain.id ? (
        <Button tone="danger" onClick={() => void wallet.switchToTargetChain()}>
          {targetChain.name}로 전환
        </Button>
      ) : quote ? (
        <Button
          tone={side}
          onClick={() => void execute()}
          busy={["signing", "confirming", "balance-loading"].includes(status)}
          data-testid="execute-trade"
        >
          {status === "approval-required"
            ? `정확히 ${formatUnits(quote.amountIn)} ${launch.symbol} 승인 후 매도`
            : `${side === "buy" ? "매수" : "매도"} 트랜잭션 확인`}
        </Button>
      ) : (
        <Button
          tone={side}
          onClick={() => void getQuote()}
          busy={status === "quote-loading"}
          disabled={!amount}
          data-testid="get-quote"
        >
          온체인 견적 확인
        </Button>
      )}
      <p className="trade-disclaimer">
        직접 AMM 호출을 포함한 모든 경로의 거래 수수료를 Forge가 강제하지
        않습니다. 지갑에서 대상·금액을 다시 확인하세요.
      </p>
    </section>
  );
}

function ReportToken({ launch }: { launch: LaunchDetail }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);

  async function submit() {
    const response = await fetch(
      `${import.meta.env.VITE_INDEXER_URL ?? "http://127.0.0.1:8787"}/api/v1/reports`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: launch.chainId,
          tokenAddress: launch.tokenAddress,
          reason,
        }),
      },
    );
    if (response.ok) setSent(true);
  }

  return (
    <div className="report-widget">
      <button className="text-link" onClick={() => setOpen(!open)}>
        이 토큰 신고
      </button>
      {open ? (
        <div className="report-form">
          {sent ? (
            <p role="status">신고가 기록되었습니다.</p>
          ) : (
            <>
              <label>
                <span>신고 이유</span>
                <textarea
                  value={reason}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <Button
                tone="danger"
                disabled={reason.trim().length < 10}
                onClick={() => void submit()}
              >
                신고 기록
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function TokenPage() {
  const params = useParams();
  const chainId = Number(params.chainId);
  const address = params.address ?? "";
  const query = useQuery({
    queryKey: ["launch", chainId, address],
    queryFn: () => fetchLaunch(chainId, address),
    enabled: Number.isInteger(chainId) && /^0x[a-fA-F0-9]{40}$/.test(address),
    refetchInterval: 8_000,
  });

  const launch = query.data?.data;
  if (query.isLoading) {
    return <div className="page skeleton-card token-page-skeleton" />;
  }
  if (!launch || query.error) {
    return (
      <section className="page empty-state" role="alert">
        <h1>온체인 런치를 찾지 못했습니다</h1>
        <p>
          주소와 인덱서 상태를 확인하세요. 없는 데이터를 0으로 표시하지
          않습니다.
        </p>
        <Link to="/">런치 피드로 돌아가기</Link>
      </section>
    );
  }

  const sourceVerified = launch.riskFacts.some(
    (fact) => fact.key === "contract-source" && fact.status === "confirmed",
  );
  const liquidityLocked = launch.riskFacts.some(
    (fact) => fact.key === "liquidity-lock" && fact.status === "confirmed",
  );
  const allocationDisclosed = launch.riskFacts.some(
    (fact) => fact.key === "creator-allocation" && fact.status === "confirmed",
  );

  return (
    <section className="page token-page">
      <div className="token-header">
        <div className="token-identity token-identity--large">
          <span className="token-image token-image--large" aria-hidden="true">
            {launch.imageUrl ? (
              <img
                src={launch.imageUrl}
                alt=""
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            ) : null}
            <span>{launch.symbol.slice(0, 1)}</span>
          </span>
          <div>
            <div className="token-title-row">
              <h1>{launch.name}</h1>
              <span>${launch.symbol}</span>
            </div>
            <div className="address-row">
              <code>{shortenAddress(launch.tokenAddress)}</code>
              <ExternalLink href={explorer("address", launch.tokenAddress)}>
                컨트랙트
              </ExternalLink>
            </div>
          </div>
        </div>
        <div className="token-header__badges">
          {sourceVerified ? (
            <Badge status="confirmed">Contract Template Verified</Badge>
          ) : null}
          {liquidityLocked ? (
            <Badge status="confirmed">Liquidity Locked</Badge>
          ) : null}
          {allocationDisclosed ? (
            <Badge status="confirmed">Allocation Disclosed</Badge>
          ) : null}
          {launch.socialOwnershipVerified ? (
            <Badge status="confirmed">Creator Social Verified</Badge>
          ) : null}
        </div>
        <DataFreshness meta={query.data?.meta ?? null} />
      </div>

      <div className="token-layout">
        <div className="token-content">
          <section className="glass-panel chart-card">
            <div className="section-heading section-heading--compact">
              <div>
                <span className="eyebrow">ACTUAL TRADES</span>
                <h2>가격 흐름</h2>
              </div>
              <span>실제 체결 {launch.trades.length}건</span>
            </div>
            <PriceChart trades={launch.trades} />
            <div className="metric-strip">
              <Metric
                label="실제 유동성"
                value={
                  launch.actualLiquidityNative == null
                    ? "—"
                    : `${formatUnits(BigInt(launch.actualLiquidityNative))} ${targetChain.nativeCurrency.symbol}`
                }
              />
              <Metric
                label="유통 공급량"
                value={
                  launch.circulatingSupply == null
                    ? "데이터 수집 중"
                    : formatUnits(BigInt(launch.circulatingSupply), 18, true)
                }
              />
              <Metric
                label="고유 홀더"
                value={launch.uniqueHolders?.toLocaleString("ko-KR") ?? "—"}
              />
              <Metric
                label="최근 거래"
                value={launch.recentTrades?.toLocaleString("ko-KR") ?? "—"}
              />
            </div>
          </section>

          <section className="glass-panel facts-card">
            <div className="section-heading section-heading--compact">
              <div>
                <span className="eyebrow">VERIFIABLE FACTS</span>
                <h2>위험 사실</h2>
              </div>
              <Link to="/about/risk">배지 의미 보기 →</Link>
            </div>
            <div className="risk-grid">
              {launch.riskFacts.map((fact) => (
                <article className="risk-fact" key={fact.key}>
                  <div>
                    <h3>{fact.label}</h3>
                    <Badge status={riskTone(fact)}>
                      {fact.status === "confirmed"
                        ? "확인됨"
                        : fact.status === "not-applicable"
                          ? "해당 없음"
                          : fact.status === "caution"
                            ? "주의"
                            : fact.status === "high-concentration"
                              ? "높은 집중도"
                              : fact.status === "collecting"
                                ? "데이터 수집 중"
                                : "검증할 수 없음"}
                    </Badge>
                  </div>
                  <strong>{riskValue(fact, launch.symbol)}</strong>
                  <p>{fact.explanation}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="glass-panel distribution-card">
            <div className="section-heading section-heading--compact">
              <div>
                <span className="eyebrow">DISTRIBUTION</span>
                <h2>홀더 분포</h2>
              </div>
              <span>
                일반 지갑 상위 10 비중{" "}
                {formatBps(launch.topTenOrdinaryHolderBps)}
              </span>
            </div>
            {launch.holders.length ? (
              <div className="holder-table" role="table">
                {launch.holders.slice(0, 20).map((holder) => (
                  <div role="row" key={holder.address}>
                    <code role="cell">{shortenAddress(holder.address)}</code>
                    <span role="cell">{holder.category}</span>
                    <strong role="cell">
                      {formatUnits(BigInt(holder.balance), 18, true)}
                    </strong>
                    <span role="cell">
                      {formatBps(holder.circulatingShareBps)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p>홀더 Transfer 데이터 수집 중</p>
            )}
          </section>

          <section className="glass-panel vesting-card">
            <div className="section-heading section-heading--compact">
              <div>
                <span className="eyebrow">CREATOR VESTING</span>
                <h2>창작자 배정과 해제</h2>
              </div>
              <Link to={`/creator/${launch.creatorAddress}`}>
                창작자 프로필 →
              </Link>
            </div>
            <div className="metric-strip">
              <Metric
                label="총 배정량"
                value={formatUnits(
                  BigInt(launch.vesting.totalAllocation),
                  18,
                  true,
                )}
              />
              <Metric
                label="현재 인출 가능"
                value={formatUnits(BigInt(launch.vesting.claimable), 18, true)}
              />
              <Metric
                label="이미 인출"
                value={formatUnits(BigInt(launch.vesting.claimed), 18, true)}
              />
              <Metric
                label="잠긴 잔량"
                value={formatUnits(BigInt(launch.vesting.locked), 18, true)}
              />
            </div>
            <div className="timeline">
              <div>
                <span>Cliff</span>
                <strong>
                  {new Date(launch.vesting.cliffAt).toLocaleString("ko-KR")}
                </strong>
              </div>
              <div>
                <span>완전 해제</span>
                <strong>
                  {new Date(launch.vesting.fullyVestedAt).toLocaleString(
                    "ko-KR",
                  )}
                </strong>
              </div>
            </div>
          </section>

          <section className="glass-panel evidence-card">
            <h2>직접 확인할 주소</h2>
            <div className="evidence-links">
              {(
                [
                  ["토큰", launch.tokenAddress],
                  ["풀", launch.poolAddress],
                  ["LP 락커", launch.lockerAddress],
                  ["베스팅 볼트", launch.vestingVaultAddress],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <code>{shortenAddress(value)}</code>
                  <ExternalLink href={explorer("address", value)}>
                    explorer
                  </ExternalLink>
                </div>
              ))}
            </div>
            <ReportToken launch={launch} />
          </section>
        </div>
        <aside className="token-sidebar">
          <TradePanel
            key={`${launch.chainId}:${launch.tokenAddress}`}
            launch={launch}
            onReconcile={async () => query.refetch()}
          />
          <div className="glass-panel caution-card">
            <strong>거래 전 확인</strong>
            <p>
              Liquidity Locked는 표시된 LP 원금의 인출 제한만 의미합니다.
              가격·AMM 운영·창작자 행동을 보증하지 않습니다.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
