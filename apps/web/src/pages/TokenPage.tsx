import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, ExternalLink, Metric } from "@forge/ui";
import {
  formatBps,
  formatUnits,
  shortenAddress,
  type LaunchDetail,
  type RiskFact,
  type Trade,
} from "@forge/shared";
import {
  assertIntentFresh,
  buildApprovalRequest,
  buildTradeRequest,
  createTransactionIntent,
  erc20Abi,
  fetchTradeQuote,
  isUserRejectedRequest,
  StaleIntentError,
  type TradeQuote,
  type TransactionRequest,
  type TransactionIntent,
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
import {
  DataFreshness,
  formatInverseTradePrice,
  PriceChart,
  summarizeTradePrices,
} from "../components";
import { deployment, isPublicDemo, targetChain } from "../config";
import { MotionPresence, MotionSwap } from "../motion";
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

async function estimateTransactionCost(
  request: TransactionRequest,
): Promise<bigint | null> {
  try {
    const [gas, gasPrice] = await Promise.all([
      client.estimateGas({
        account: request.account,
        to: request.to,
        data: request.data,
        value: request.value,
      }),
      client.getGasPrice(),
    ]);
    return gas * gasPrice;
  } catch {
    return null;
  }
}

export function hasSufficientGas(
  nativeBalance: bigint,
  estimatedCost: bigint | null,
): boolean {
  return estimatedCost == null || nativeBalance >= estimatedCost;
}

export function isTradeSubmissionLocked(status: TradeStatus): boolean {
  return [
    "balance-loading",
    "signing",
    "submitted",
    "confirming",
    "reconciling",
  ].includes(status);
}

export interface TradeSubmissionLock {
  current: boolean;
}

export function beginTradeSubmission(
  lock: TradeSubmissionLock,
  status: TradeStatus,
): boolean {
  if (lock.current || isTradeSubmissionLocked(status)) return false;
  lock.current = true;
  return true;
}

export function statusAfterExecutionError(
  broadcastHash: Hash | null,
): TradeStatus {
  return broadcastHash ? "confirming" : "reverted";
}

export type PendingTransactionKind = "approval" | "trade";

export function pendingTransactionStorageKey(
  chainId: number,
  tokenAddress: string,
  account: string,
): string {
  return `forge:pending:${chainId.toString()}:${tokenAddress.toLowerCase()}:${account.toLowerCase()}`;
}

export function parsePendingTransaction(
  raw: string | null,
): { hash: Hash; kind: PendingTransactionKind } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { hash?: unknown; kind?: unknown };
    if (
      typeof value.hash !== "string" ||
      !/^0x[a-fA-F0-9]{64}$/.test(value.hash) ||
      (value.kind !== "approval" && value.kind !== "trade")
    ) {
      return null;
    }
    return { hash: value.hash as Hash, kind: value.kind };
  } catch {
    return null;
  }
}

export function shouldConfirmIndexedTrade(
  status: TradeStatus,
  receiptLookupUnknown: boolean,
  pendingKind: PendingTransactionKind | null,
  txHash: Hash | null,
  indexedTransactionHashes: readonly string[],
): boolean {
  if (
    !txHash ||
    (status !== "reconciling" &&
      !(
        status === "confirming" &&
        receiptLookupUnknown &&
        pendingKind === "trade"
      ))
  ) {
    return false;
  }
  return indexedTransactionHashes.some(
    (candidate) => candidate.toLowerCase() === txHash.toLowerCase(),
  );
}

export function quoteSecondsRemaining(
  quote: Pick<TradeQuote, "expiresAt">,
  nowMs = Date.now(),
): number {
  return Math.max(0, Math.ceil((quote.expiresAt - nowMs) / 1_000));
}

export function isQuoteExpired(
  quote: Pick<TradeQuote, "expiresAt">,
  nowMs = Date.now(),
): boolean {
  return nowMs >= quote.expiresAt;
}

function roundedDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export function formatTradeUnitPrice(
  nativeAmount: string,
  tokenAmount: string,
  significantDigits = 6,
): string | null {
  const numerator = BigInt(nativeAmount);
  const denominator = BigInt(tokenAmount);
  if (
    numerator <= 0n ||
    denominator <= 0n ||
    !Number.isSafeInteger(significantDigits) ||
    significantDigits < 2
  ) {
    return null;
  }

  let exponent = numerator.toString().length - denominator.toString().length;
  if (
    (exponent >= 0 && numerator < denominator * 10n ** BigInt(exponent)) ||
    (exponent < 0 && numerator * 10n ** BigInt(-exponent) < denominator)
  ) {
    exponent -= 1;
  }

  if (exponent < -6 || exponent >= significantDigits) {
    const shift = significantDigits - 1 - exponent;
    let mantissa =
      shift >= 0
        ? roundedDivide(numerator * 10n ** BigInt(shift), denominator)
        : roundedDivide(numerator, denominator * 10n ** BigInt(-shift));
    if (mantissa >= 10n ** BigInt(significantDigits)) {
      mantissa /= 10n;
      exponent += 1;
    }
    const digits = mantissa
      .toString()
      .padStart(significantDigits, "0")
      .slice(0, significantDigits);
    const fraction = digits.slice(1).replace(/0+$/, "");
    return `${digits[0]}${fraction ? `.${fraction}` : ""}e${exponent}`;
  }

  const decimalPlaces = Math.max(0, significantDigits - 1 - exponent);
  const scaled = roundedDivide(
    numerator * 10n ** BigInt(decimalPlaces),
    denominator,
  );
  if (decimalPlaces === 0) return scaled.toString();
  const digits = scaled.toString().padStart(decimalPlaces + 1, "0");
  const whole = digits.slice(0, -decimalPlaces);
  const fraction = digits.slice(-decimalPlaces).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function latestTradePrice(trades: Trade[]): string | null {
  const latest = trades
    .filter((trade) => BigInt(trade.tokenAmount) > 0n)
    .reduce<Trade | null>((current, trade) => {
      if (!current) return trade;
      const blockDifference =
        BigInt(trade.blockNumber) - BigInt(current.blockNumber);
      if (blockDifference > 0n) return trade;
      if (blockDifference === 0n && trade.logIndex > current.logIndex) {
        return trade;
      }
      return current;
    }, null);
  return latest
    ? formatInverseTradePrice(latest.nativeAmount, latest.tokenAmount)
    : null;
}

function explorer(kind: "address" | "tx", value: string): string | null {
  const base = targetChain.blockExplorers?.default.url;
  if (!base || !/^[a-zA-Z0-9x]+$/.test(value)) return null;
  return `${base.replace(/\/$/, "")}/${kind}/${value}`;
}

function CopyAddressButton({ address }: { address: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <button
      type="button"
      className="text-link address-copy"
      aria-label="토큰 컨트랙트 주소 복사"
      onClick={() => void copy()}
    >
      {status === "copied"
        ? "복사됨"
        : status === "failed"
          ? "복사 실패"
          : "주소 복사"}
    </button>
  );
}

function riskTone(fact: RiskFact) {
  if (
    fact.status === "confirmed" ||
    fact.status === "recorded-confirmed" ||
    fact.status === "not-applicable"
  )
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

function HolderDistribution({ launch }: { launch: LaunchDetail }) {
  const holdersByBalance = launch.holders.slice().sort((left, right) => {
    const leftBalance = BigInt(left.balance);
    const rightBalance = BigInt(right.balance);
    return leftBalance === rightBalance
      ? 0
      : leftBalance > rightBalance
        ? -1
        : 1;
  });

  return (
    <section className="glass-panel distribution-card motion-reveal motion-reveal--4">
      <div className="section-heading section-heading--compact">
        <div>
          <span className="eyebrow">DISTRIBUTION</span>
          <h2>홀더 분포</h2>
        </div>
        <span>
          거래 가능 일반 물량 대비 상위 10 지갑{" "}
          {formatBps(launch.topTenOrdinaryHolderBps)}
        </span>
      </div>
      {launch.holders.length ? (
        <div
          className="holder-table"
          role="table"
          aria-label="잔액 내림차순 홀더 분포"
        >
          <div role="row">
            <strong role="columnheader">주소</strong>
            <strong role="columnheader">구분</strong>
            <strong role="columnheader">잔액</strong>
            <strong role="columnheader">거래 가능 물량 비중</strong>
          </div>
          {holdersByBalance.slice(0, 20).map((holder) => (
            <div role="row" key={holder.address}>
              <code role="cell">{shortenAddress(holder.address)}</code>
              <span role="cell">{holder.category}</span>
              <strong role="cell">
                {formatUnits(BigInt(holder.balance), 18, true)}
              </strong>
              <span role="cell">{formatBps(holder.circulatingShareBps)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p>홀더 Transfer 데이터 수집 중</p>
      )}
      <p className="panel-note">
        비중 분모는 pool·락커·베스팅·소각·zero 잔고를 제외한 거래 가능 일반
        물량입니다.
      </p>
    </section>
  );
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
  const [tradeIntent, setTradeIntent] = useState<TransactionIntent | null>(
    null,
  );
  const [status, setStatus] = useState<TradeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [gasCost, setGasCost] = useState<bigint | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [pendingKind, setPendingKind] = useState<PendingTransactionKind | null>(
    null,
  );
  const [pendingAccount, setPendingAccount] = useState<Address | null>(null);
  const [receiptLookupUnknown, setReceiptLookupUnknown] = useState(false);
  const [quoteClockMs, setQuoteClockMs] = useState(() => Date.now());
  const quoteRequestId = useRef(0);
  const executionInFlight = useRef(false);
  const actionIncomingRef = useRef<HTMLDivElement>(null);
  const restoreActionFocus = useRef(false);

  function clearQuote() {
    quoteRequestId.current += 1;
    setQuote(null);
    setTradeIntent(null);
    setGasCost(null);
  }

  function invalidateQuote() {
    restoreActionFocus.current = false;
    clearQuote();
    if (!executionInFlight.current && txHash == null) {
      setStatus("idle");
      setError(null);
    }
  }

  function rememberPendingTransaction(
    hash: Hash,
    kind: PendingTransactionKind,
    account: Address,
  ) {
    setTxHash(hash);
    setPendingKind(kind);
    setPendingAccount(account);
    setReceiptLookupUnknown(false);
    try {
      window.sessionStorage.setItem(
        pendingTransactionStorageKey(
          launch.chainId,
          launch.tokenAddress,
          account,
        ),
        JSON.stringify({ hash, kind }),
      );
    } catch {
      // A blocked storage API must not block the wallet transaction.
    }
  }

  function forgetPendingTransaction(account = pendingAccount) {
    if (account) {
      try {
        window.sessionStorage.removeItem(
          pendingTransactionStorageKey(
            launch.chainId,
            launch.tokenAddress,
            account,
          ),
        );
      } catch {
        // In-memory state remains authoritative for this tab.
      }
    }
    setPendingKind(null);
    setPendingAccount(null);
    setReceiptLookupUnknown(false);
  }

  useEffect(() => {
    invalidateQuote();
  }, [wallet.account, wallet.chainId, launch.chainId, launch.tokenAddress]);

  useEffect(() => {
    if (!wallet.account || wallet.chainId !== launch.chainId) return;
    const stored = (() => {
      try {
        return parsePendingTransaction(
          window.sessionStorage.getItem(
            pendingTransactionStorageKey(
              launch.chainId,
              launch.tokenAddress,
              wallet.account,
            ),
          ),
        );
      } catch {
        return null;
      }
    })();
    if (!stored) return;
    clearQuote();
    setTxHash(stored.hash);
    setPendingKind(stored.kind);
    setPendingAccount(wallet.account);
    setReceiptLookupUnknown(true);
    setStatus("confirming");
    setError(
      "이전에 제출한 트랜잭션의 영수증 상태를 다시 확인해야 합니다. 같은 요청을 재제출하지 마세요.",
    );
  }, [wallet.account, wallet.chainId, launch.chainId, launch.tokenAddress]);

  useEffect(() => {
    if (
      shouldConfirmIndexedTrade(
        status,
        receiptLookupUnknown,
        pendingKind,
        txHash,
        launch.trades.map((trade) => trade.transactionHash),
      )
    ) {
      setStatus("confirmed");
      clearQuote();
      setAmount("");
      forgetPendingTransaction();
    }
  }, [launch.trades, status, txHash, receiptLookupUnknown, pendingKind]);

  useEffect(() => {
    if (!quote) return;
    setQuoteClockMs(Date.now());
    const timer = window.setInterval(() => setQuoteClockMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [quote]);

  const submissionLocked = isTradeSubmissionLocked(status);
  const secondsRemaining = quote
    ? quoteSecondsRemaining(quote, quoteClockMs)
    : null;

  useEffect(() => {
    if (
      quote &&
      quoteClockMs >= quote.expiresAt &&
      !isTradeSubmissionLocked(status)
    ) {
      clearQuote();
      setStatus("quote-expired");
    }
  }, [quote, quoteClockMs, status]);

  const token = launch.tokenAddress as Address;

  async function assertFreshRequest(
    intent: TransactionIntent,
    request: TransactionRequest,
  ) {
    await wallet.assertCurrentIntent(intent.account as Address, intent.chainId);
    if (!wallet.account || wallet.chainId == null) {
      throw new StaleIntentError("account");
    }
    assertIntentFresh(intent, {
      chainId: wallet.chainId,
      account: wallet.account,
      target: request.to,
      calldata: request.data,
      value: request.value,
    });
  }

  async function getQuote() {
    if (submissionLocked || executionInFlight.current) return;
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
    restoreActionFocus.current = true;
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
      const request = buildTradeRequest(next);
      const intent = createTransactionIntent({
        chainId: next.chainId,
        kind: next.side,
        request,
        token: next.token,
        amountIn: next.amountIn,
        minAmountOut: next.minAmountOut,
        deadline: next.deadline,
        quoteCreatedAt: next.createdAt,
        quoteExpiresAt: next.expiresAt,
      });
      setQuote(next);
      setTradeIntent(intent);
      setQuoteClockMs(Date.now());
      setTxHash(null);
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
    if (
      !quote ||
      !tradeIntent ||
      !deployment ||
      !wallet.account ||
      !beginTradeSubmission(executionInFlight, status)
    ) {
      return;
    }
    restoreActionFocus.current = true;
    let broadcastHash: Hash | null = null;
    let broadcastKind: "approval" | "trade" | null = null;
    try {
      setError(null);
      if (isQuoteExpired(quote)) {
        clearQuote();
        setStatus("quote-expired");
        return;
      }
      const quotedRequest = buildTradeRequest(quote);
      await assertFreshRequest(tradeIntent, quotedRequest);
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
          const approval = buildApprovalRequest(
            quote.account,
            quote.token,
            quote.adapter,
            quote.amountIn,
          );
          const [nativeBalance, approvalGasCost] = await Promise.all([
            client.getBalance({ address: quote.account }),
            estimateTransactionCost(approval),
          ]);
          if (!hasSufficientGas(nativeBalance, approvalGasCost)) {
            setGasCost(approvalGasCost);
            setStatus("insufficient-gas");
            return;
          }
          const approvalIntent = createTransactionIntent({
            chainId: quote.chainId,
            kind: "approve",
            request: approval,
            token: quote.token,
            amountIn: quote.amountIn,
            deadline: quote.deadline,
            quoteCreatedAt: quote.createdAt,
            quoteExpiresAt: quote.expiresAt,
          });
          setStatus("signing");
          await assertFreshRequest(approvalIntent, approval);
          const approvalHash = await wallet.sendTransaction(approval);
          broadcastHash = approvalHash;
          broadcastKind = "approval";
          rememberPendingTransaction(approvalHash, "approval", quote.account);
          setStatus("confirming");
          const approvalReceipt = await client.waitForTransactionReceipt({
            hash: approvalHash,
          });
          if (approvalReceipt.status !== "success") {
            forgetPendingTransaction(quote.account);
            setStatus("reverted");
            setError("정확한 수량 승인 트랜잭션이 실패했습니다.");
            return;
          }
          broadcastHash = null;
          broadcastKind = null;
          forgetPendingTransaction(quote.account);
          setTxHash(null);
        }
      }

      if (isQuoteExpired(quote)) {
        clearQuote();
        setStatus("quote-expired");
        return;
      }
      const request = buildTradeRequest(quote);
      if (quote.side === "sell") {
        const [nativeBalance, tradeGasCost] = await Promise.all([
          client.getBalance({ address: quote.account }),
          estimateTransactionCost(request),
        ]);
        if (tradeGasCost != null) {
          setGasCost(tradeGasCost);
          if (!hasSufficientGas(nativeBalance, tradeGasCost)) {
            setStatus("insufficient-gas");
            return;
          }
        }
      }
      setStatus("signing");
      await assertFreshRequest(tradeIntent, request);
      const hash = await wallet.sendTransaction(request);
      broadcastHash = hash;
      broadcastKind = "trade";
      rememberPendingTransaction(hash, "trade", quote.account);
      clearQuote();
      setStatus("submitted");
      setStatus("confirming");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        forgetPendingTransaction(quote.account);
        setStatus("reverted");
        setError("거래 컨트랙트가 트랜잭션을 되돌렸습니다.");
        return;
      }
      broadcastHash = null;
      broadcastKind = null;
      forgetPendingTransaction(quote.account);
      setStatus("reconciling");
      try {
        await onReconcile();
      } catch {
        setError(
          "거래 영수증은 확인됐지만 인덱서 반영을 아직 확인하지 못했습니다.",
        );
      }
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "거래에 실패했습니다.";
      if (broadcastHash) {
        setTxHash(broadcastHash);
        setReceiptLookupUnknown(true);
        setStatus(statusAfterExecutionError(broadcastHash));
        setError(
          `${broadcastKind === "approval" ? "승인" : "거래"} 트랜잭션은 제출됐지만 영수증 상태를 확인하지 못했습니다. 같은 요청을 다시 제출하지 말고 explorer에서 먼저 확인하세요.`,
        );
      } else if (cause instanceof StaleIntentError) {
        clearQuote();
        setStatus(cause.reason === "expired" ? "quote-expired" : "reverted");
        setError(
          cause.reason === "expired"
            ? "견적 유효 시간이 지나 거래 요청을 폐기했습니다."
            : "지갑 또는 거래 조건이 변경되어 견적을 폐기했습니다.",
        );
      } else if (isUserRejectedRequest(cause)) {
        setStatus("rejected");
        setError("지갑에서 요청을 취소했습니다.");
      } else if (message.toLowerCase().includes("slippage")) {
        setStatus("slippage-exceeded");
        setError(message);
      } else {
        setStatus(statusAfterExecutionError(null));
        setError(message);
      }
    } finally {
      executionInFlight.current = false;
    }
  }

  async function recheckPendingReceipt() {
    if (
      !txHash ||
      !pendingKind ||
      !pendingAccount ||
      !receiptLookupUnknown ||
      executionInFlight.current
    ) {
      return;
    }
    executionInFlight.current = true;
    setError(null);
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        forgetPendingTransaction(pendingAccount);
        setStatus("reverted");
        setError("제출된 트랜잭션이 온체인에서 되돌려졌습니다.");
        return;
      }
      const recoveredKind = pendingKind;
      forgetPendingTransaction(pendingAccount);
      if (recoveredKind === "approval") {
        setTxHash(null);
        if (!quote || isQuoteExpired(quote)) {
          clearQuote();
          setStatus("quote-expired");
          setError(
            "승인은 확인됐지만 거래 견적이 만료되어 다시 조회해야 합니다.",
          );
        } else {
          setStatus("quoted");
        }
        return;
      }
      setStatus("reconciling");
      try {
        await onReconcile();
      } catch {
        setError(
          "거래 영수증은 확인됐지만 인덱서 반영을 아직 확인하지 못했습니다.",
        );
      }
    } catch {
      setStatus("confirming");
      setReceiptLookupUnknown(true);
      setError(
        "영수증 상태를 아직 확인하지 못했습니다. 같은 요청을 재제출하지 말고 잠시 후 다시 확인하세요.",
      );
    } finally {
      executionInFlight.current = false;
    }
  }

  const actionKey =
    wallet.account == null
      ? "connect"
      : wallet.chainId !== targetChain.id
        ? "wrong-network"
        : quote
          ? `execute:${side}:${status}`
          : `quote:${side}:${status}`;
  const quoteKey = quote ? `${quote.side}:${quote.createdAt}` : "empty";
  const actionBusy = status === "quote-loading" || submissionLocked;

  useEffect(() => {
    const cancelFocusRestore = (event: FocusEvent) => {
      if (
        !restoreActionFocus.current ||
        !(event.target instanceof Node) ||
        actionIncomingRef.current?.contains(event.target)
      ) {
        return;
      }
      restoreActionFocus.current = false;
    };
    document.addEventListener("focusin", cancelFocusRestore, true);
    return () =>
      document.removeEventListener("focusin", cancelFocusRestore, true);
  }, []);

  useEffect(() => {
    if (!restoreActionFocus.current || actionBusy) return;
    const action =
      actionIncomingRef.current?.querySelector<HTMLButtonElement>("button");
    if (!action || action.disabled) return;
    restoreActionFocus.current = false;
    action.focus({ preventScroll: true });
  }, [actionBusy, actionKey]);

  return (
    <section className="trade-panel glass-panel" aria-labelledby="trade-title">
      <div className="trade-tabs" role="group" aria-label="거래 방향">
        <button
          type="button"
          aria-pressed={side === "buy"}
          className={side === "buy" ? "buy active" : "buy"}
          disabled={submissionLocked}
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
          type="button"
          aria-pressed={side === "sell"}
          className={side === "sell" ? "sell active" : "sell"}
          disabled={submissionLocked}
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
            disabled={submissionLocked}
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
            disabled={submissionLocked}
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
      <MotionSwap motionKey={quoteKey} className="quote-motion">
        <div className="quote-box">
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
              {quote?.feeBps == null
                ? "지원되지 않음"
                : formatBps(quote.feeBps)}
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
            <span>견적 만료</span>
            <strong>
              {quote && secondsRemaining != null
                ? `${new Date(quote.expiresAt).toLocaleTimeString(
                    "ko-KR",
                  )} · ${secondsRemaining}초 남음`
                : "—"}
            </strong>
          </div>
        </div>
      </MotionSwap>
      <div className="transaction-state" data-status={status} role="status">
        <MotionSwap motionKey={status} className="transaction-state__motion">
          <span className="transaction-state__content">
            <span aria-hidden="true">
              {status === "confirmed" ? "✓" : status === "reverted" ? "×" : "·"}
            </span>
            {statusCopy(status)}
          </span>
        </MotionSwap>
      </div>
      <MotionPresence show={Boolean(error)} className="trade-alert-motion">
        {error ? (
          <div className="inline-alert inline-alert--danger" role="alert">
            {error}
          </div>
        ) : null}
      </MotionPresence>
      <MotionPresence show={Boolean(txHash)} className="trade-link-motion">
        {txHash ? (
          <ExternalLink href={explorer("tx", txHash)}>
            트랜잭션 {shortenAddress(txHash)}
          </ExternalLink>
        ) : null}
      </MotionPresence>
      <MotionPresence
        show={Boolean(txHash && receiptLookupUnknown)}
        className="receipt-action-motion"
      >
        <Button
          tone="neutral"
          onClick={() => void recheckPendingReceipt()}
          data-testid="recheck-receipt"
        >
          영수증 다시 확인
        </Button>
      </MotionPresence>
      <MotionSwap
        motionKey={actionKey}
        className="trade-action-motion"
        incomingRef={actionIncomingRef}
      >
        {wallet.account == null ? (
          <Button
            tone="neutral"
            onClick={() => void wallet.connect()}
            data-testid="trade-connect"
          >
            지갑 연결
          </Button>
        ) : wallet.chainId !== targetChain.id ? (
          <Button
            tone="danger"
            onClick={() => void wallet.switchToTargetChain()}
          >
            {targetChain.name}로 전환
          </Button>
        ) : quote ? (
          <Button
            tone={side}
            onClick={() => void execute()}
            busy={submissionLocked}
            disabled={submissionLocked}
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
            busy={status === "quote-loading" || submissionLocked}
            disabled={!amount || submissionLocked}
            data-testid="get-quote"
          >
            온체인 견적 확인
          </Button>
        )}
      </MotionSwap>
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
      <button
        className="text-link"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        이 토큰 신고
      </button>
      <MotionPresence show={open} className="report-presence">
        <div className="report-form">
          <MotionSwap
            motionKey={sent ? "sent" : "editing"}
            className="report-state-motion"
          >
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
          </MotionSwap>
        </div>
      </MotionPresence>
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
    refetchInterval: isPublicDemo ? false : 8_000,
  });

  const launch = query.data?.data;
  if (query.isLoading) {
    return (
      <div
        className="page skeleton-card token-page-skeleton motion-reveal"
        role="status"
        aria-label="토큰 데이터 불러오는 중"
      />
    );
  }
  if (!launch) {
    return (
      <section className="page empty-state" role="alert">
        <h1>
          {query.error
            ? "토큰 데이터를 불러오지 못했습니다"
            : "온체인 런치를 찾지 못했습니다"}
        </h1>
        <p>
          주소와 인덱서 상태를 확인하세요. 실패한 응답을 빈 값이나 0으로
          표시하지 않습니다.
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
  const recentPrice = latestTradePrice(launch.trades);
  const priceSummary = summarizeTradePrices(launch.trades);
  const hasRecordedRiskFacts = launch.riskFacts.some(
    (fact) => fact.status === "recorded-confirmed",
  );
  const explorerAvailable = Boolean(targetChain.blockExplorers?.default.url);
  const marketMetrics = (
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
        label="거래 가능 일반 물량 · 풀·락커·베스팅·소각·zero 제외"
        value={
          launch.circulatingSupply == null
            ? "데이터 수집 중"
            : formatUnits(BigInt(launch.circulatingSupply), 18, true)
        }
      />
      <Metric
        label="고유 일반 홀더"
        value={launch.uniqueHolders?.toLocaleString("ko-KR") ?? "—"}
      />
      <Metric
        label={`최근 체결가 · 표시 체결 ${launch.trades.length}건 기준`}
        value={
          recentPrice == null
            ? "—"
            : `1 ${targetChain.nativeCurrency.symbol} ≈ ${recentPrice} ${launch.symbol}`
        }
      />
    </div>
  );

  function renderTradeSidebar(currentLaunch: LaunchDetail) {
    return (
      <aside className="token-sidebar token-sidebar--trade">
        <div className="token-sidebar__sticky motion-reveal motion-reveal--2">
          {isPublicDemo ? (
            <div className="glass-panel public-demo-trade">
              <Badge status="muted">READ ONLY</Badge>
              <h2>거래는 로컬 검증에서만 실행했습니다</h2>
              <p>
                공개 URL에서는 지갑 연결, 견적, 승인, 매수·매도 요청을 모두
                차단합니다. 표시된 값은 기록 시점까지 수집한 로컬 Anvil 인덱서
                결과이며 GIWA 시장 데이터가 아닙니다.
              </p>
              <div className="metric-strip">
                <Metric
                  label="기록된 거래"
                  value={currentLaunch.trades.length}
                />
                <Metric
                  label="기록된 유동성"
                  value={
                    currentLaunch.actualLiquidityNative == null
                      ? "—"
                      : `${formatUnits(BigInt(currentLaunch.actualLiquidityNative))} tETH`
                  }
                />
              </div>
              <div className="public-demo-trade__caution">
                <strong>거래 전 확인</strong>
                <p>
                  Liquidity Locked는 표시된 LP 원금의 인출 제한만 의미합니다.
                  가격·AMM 운영·창작자 행동을 보증하지 않습니다.
                </p>
              </div>
            </div>
          ) : (
            <TradePanel
              key={`${currentLaunch.chainId}:${currentLaunch.tokenAddress}`}
              launch={currentLaunch}
              onReconcile={async () => query.refetch()}
            />
          )}
          {!isPublicDemo ? (
            <div className="glass-panel caution-card">
              <strong>거래 전 확인</strong>
              <p>
                Liquidity Locked는 표시된 LP 원금의 인출 제한만 의미합니다.
                가격·AMM 운영·창작자 행동을 보증하지 않습니다.
              </p>
            </div>
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <section
      className={`page token-page${isPublicDemo ? " token-page--public-demo" : ""}`}
    >
      <div className="token-header motion-reveal motion-reveal--1">
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
              {explorerAvailable ? (
                <ExternalLink href={explorer("address", launch.tokenAddress)}>
                  컨트랙트
                </ExternalLink>
              ) : null}
              <CopyAddressButton address={launch.tokenAddress} />
            </div>
          </div>
        </div>
        <div className="token-header__meta">
          <div className="token-header__badges">
            {sourceVerified ? (
              <Badge status="confirmed">Contract Source Verified</Badge>
            ) : null}
            {liquidityLocked ? (
              <Badge status="confirmed">Liquidity Locked</Badge>
            ) : null}
            {allocationDisclosed ? (
              <Badge status="confirmed">Allocation Disclosed</Badge>
            ) : null}
          </div>
          <DataFreshness meta={query.data?.meta ?? null} />
        </div>
      </div>

      <MotionPresence
        show={Boolean(query.error)}
        className="token-stale-alert-motion"
      >
        <div className="inline-alert inline-alert--danger" role="alert">
          최신 토큰 데이터를 갱신하지 못했습니다. 마지막 정상 응답을 유지합니다.
        </div>
      </MotionPresence>

      <div className="token-layout">
        {!isPublicDemo ? renderTradeSidebar(launch) : null}
        <div className="token-content">
          <section className="glass-panel chart-card motion-reveal motion-reveal--2">
            <div className="section-heading section-heading--compact">
              <div>
                <span className="eyebrow">ACTUAL TRADES</span>
                <h2>가격 흐름</h2>
              </div>
              <span>
                실제 체결 {launch.trades.length}건 · 저점 대비{" "}
                {priceSummary?.changeBps == null
                  ? "—"
                  : `+${formatBps(priceSummary.changeBps)}`}
              </span>
            </div>
            {isPublicDemo ? marketMetrics : null}
            <PriceChart
              trades={launch.trades}
              symbol={launch.symbol}
              nativeSymbol={targetChain.nativeCurrency.symbol}
            />
            {!isPublicDemo ? marketMetrics : null}
          </section>

          {isPublicDemo ? renderTradeSidebar(launch) : null}

          <section className="glass-panel facts-card motion-reveal motion-reveal--3">
            <div className="section-heading section-heading--compact">
              <div>
                <span className="eyebrow">VERIFIABLE FACTS</span>
                <h2>위험 사실</h2>
              </div>
              <div className="risk-heading__links">
                {hasRecordedRiskFacts ? (
                  <span>로컬 실행 시 확인 · 공개 URL 재검증 없음</span>
                ) : null}
                <Link to="/about/risk">배지 의미 보기 →</Link>
              </div>
            </div>
            <div className="risk-grid motion-stagger">
              {launch.riskFacts.map((fact) => (
                <article className="risk-fact" key={fact.key}>
                  <div>
                    <h3>{fact.label}</h3>
                    <Badge status={riskTone(fact)}>
                      {fact.status === "confirmed"
                        ? "확인됨"
                        : fact.status === "recorded-confirmed"
                          ? "로컬 실행 시 확인됨"
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

          <HolderDistribution launch={launch} />

          <section className="glass-panel vesting-card motion-reveal motion-reveal--5">
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
                label={isPublicDemo ? "기록 시 인출 가능" : "현재 인출 가능"}
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
        </div>
        <aside className="token-sidebar token-sidebar--evidence">
          <section className="glass-panel evidence-card motion-reveal motion-reveal--5">
            <div className="section-heading section-heading--compact">
              <h2>직접 확인할 주소</h2>
              {!explorerAvailable ? (
                <span>로컬 체인 · 익스플로러 없음</span>
              ) : null}
            </div>
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
                  {explorerAvailable ? (
                    <ExternalLink href={explorer("address", value)}>
                      explorer
                    </ExternalLink>
                  ) : null}
                </div>
              ))}
            </div>
            {!isPublicDemo ? <ReportToken launch={launch} /> : null}
          </section>
        </aside>
      </div>
    </section>
  );
}
