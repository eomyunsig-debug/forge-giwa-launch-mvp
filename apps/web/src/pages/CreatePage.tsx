import { useMemo, useState, type SyntheticEvent } from "react";
import { Badge, Button, Metric } from "@forge/ui";
import { createLaunchInputSchema, formatBps, formatUnits } from "@forge/shared";
import { buildLaunchRequest, launchFactoryAbi } from "@forge/sdk";
import {
  createPublicClient,
  http,
  parseEther,
  parseEventLogs,
  type Address,
  type Hash,
} from "viem";
import { useNavigate } from "react-router";
import { z } from "zod";

import { uploadMetadata } from "../api";
import { deployment, targetChain } from "../config";
import { useWallet } from "../wallet";

export const draftSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(40),
  symbol: z
    .string()
    .trim()
    .min(2, "심볼은 2자 이상이어야 합니다.")
    .max(10)
    .regex(/^[A-Z][A-Z0-9]*$/, "영문 대문자로 시작하고 A–Z, 0–9만 사용하세요."),
  description: z.string().trim().min(1, "설명을 입력하세요.").max(500),
  socialUrl: z
    .string()
    .trim()
    .refine(
      (value) => !value || /^https:\/\/[^\s]+$/.test(value),
      "HTTPS 소셜 URL만 사용할 수 있습니다.",
    ),
  creatorAllocationBps: z.number().int().min(0).max(1_000),
  nativeLiquidity: z.string().refine((value) => {
    try {
      return parseEther(value) > 0n;
    } catch {
      return false;
    }
  }, "0보다 큰 초기 유동성을 입력하세요."),
});

const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxImageBytes = 5 * 1024 * 1024;

export type LaunchStatus =
  | "editing"
  | "uploading"
  | "review"
  | "signing"
  | "submitted"
  | "confirming"
  | "reconciling"
  | "confirmed"
  | "rejected"
  | "reverted";

interface PreparedLaunch {
  request: Awaited<ReturnType<typeof buildLaunchRequest>>;
  imageUrl: string;
  metadataUri: string;
  nativeLiquidity: bigint;
  creationFee: bigint;
  estimatedNetworkFee: bigint | null;
}

const client = createPublicClient({
  chain: targetChain,
  transport: http(targetChain.rpcUrls.default.http[0]),
});

export function statusLabel(status: LaunchStatus) {
  const labels: Record<LaunchStatus, string> = {
    editing: "입력 중",
    uploading: "이미지·메타데이터 저장 중",
    review: "최종 확인",
    signing: "지갑 승인 대기",
    submitted: "트랜잭션 제출됨",
    confirming: "영수증 확인 중",
    reconciling: "인덱서 반영 대기",
    confirmed: "생성 확인됨",
    rejected: "사용자가 취소함",
    reverted: "트랜잭션 실패",
  };
  return labels[status];
}

export function CreatePage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const [draft, setDraft] = useState({
    name: "",
    symbol: "",
    description: "",
    socialUrl: "",
    creatorAllocationBps: 500,
    nativeLiquidity: "1",
  });
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedLaunch | null>(null);
  const [status, setStatus] = useState<LaunchStatus>("editing");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [createdToken, setCreatedToken] = useState<Address | null>(null);

  const parsed = useMemo(() => draftSchema.safeParse(draft), [draft]);
  const allocation = draft.creatorAllocationBps / 100;

  function updateDraft<Key extends keyof typeof draft>(
    key: Key,
    value: (typeof draft)[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setPrepared(null);
    setStatus("editing");
  }

  function updateImage(file: File | null) {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
    setPrepared(null);
    setStatus("editing");
  }

  async function prepare(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");
      return;
    }
    if (!image) {
      setError("PNG, JPG 또는 WebP 이미지를 선택하세요.");
      return;
    }
    if (!allowedImageTypes.has(image.type) || image.size > maxImageBytes) {
      setError(
        "이미지는 PNG/JPG/WebP, 최대 5MB만 허용됩니다. SVG와 HTML은 금지됩니다.",
      );
      return;
    }
    if (!wallet.account) {
      setError("메타데이터를 저장하기 전에 지갑을 연결하세요.");
      return;
    }
    if (wallet.chainId !== targetChain.id) {
      setError(`${targetChain.name} 네트워크로 전환하세요.`);
      return;
    }
    if (!deployment) {
      setError(
        "컨트랙트 배포 정보가 없습니다. 로컬 배포 manifest를 웹 환경에 연결하세요.",
      );
      return;
    }

    setStatus("uploading");
    try {
      const uploaded = await uploadMetadata({
        image,
        name: parsed.data.name,
        symbol: parsed.data.symbol,
        description: parsed.data.description,
        ...(parsed.data.socialUrl ? { socialUrl: parsed.data.socialUrl } : {}),
      });
      const nativeLiquidity = parseEther(parsed.data.nativeLiquidity);
      const input = createLaunchInputSchema.parse({
        name: parsed.data.name,
        symbol: parsed.data.symbol,
        description: parsed.data.description,
        imageUrl: uploaded.imageUrl,
        metadataUri: uploaded.metadataUri,
        metadataHash: uploaded.metadataHash,
        ...(parsed.data.socialUrl ? { socialUrl: parsed.data.socialUrl } : {}),
        creatorAllocationBps: parsed.data.creatorAllocationBps,
        nativeLiquidityWei: nativeLiquidity.toString(),
      });
      const request = await buildLaunchRequest(
        client,
        deployment,
        wallet.account,
        input,
      );
      let estimatedNetworkFee: bigint | null = null;
      try {
        const [gas, gasPrice] = await Promise.all([
          client.estimateGas(request),
          client.getGasPrice(),
        ]);
        estimatedNetworkFee = gas * gasPrice;
      } catch {
        estimatedNetworkFee = null;
      }
      setPrepared({
        request,
        imageUrl: uploaded.imageUrl,
        metadataUri: uploaded.metadataUri,
        nativeLiquidity,
        creationFee: request.value - nativeLiquidity,
        estimatedNetworkFee,
      });
      setStatus("review");
    } catch (cause) {
      setStatus("editing");
      setError(
        cause instanceof Error
          ? cause.message
          : "업로드 또는 온체인 비용 조회에 실패했습니다.",
      );
    }
  }

  async function launch() {
    if (!prepared || !wallet.account || !deployment) return;
    setError(null);
    try {
      setStatus("signing");
      await wallet.assertCurrentIntent(
        prepared.request.account,
        deployment.chainId,
      );
      const hash = await wallet.sendTransaction(prepared.request);
      setTxHash(hash);
      setStatus("submitted");
      setStatus("confirming");
      const receipt = await client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
      if (receipt.status !== "success") {
        setStatus("reverted");
        setError("컨트랙트가 트랜잭션을 되돌렸습니다.");
        return;
      }
      const events = parseEventLogs({
        abi: launchFactoryAbi,
        logs: receipt.logs,
        eventName: "LaunchCreated",
        strict: false,
      });
      const token = events[0]?.args.token;
      if (!token) {
        setStatus("reverted");
        setError("영수증에서 LaunchCreated 이벤트를 확인하지 못했습니다.");
        return;
      }
      setCreatedToken(token);
      setStatus("reconciling");

      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const response = await fetch(
          `${
            import.meta.env.VITE_INDEXER_URL ?? "http://127.0.0.1:8787"
          }/api/v1/launches/${deployment.chainId}/${token}`,
        );
        if (response.ok) {
          setStatus("confirmed");
          await navigate(`/token/${deployment.chainId}/${token}`);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 600));
      }
      setStatus("reconciling");
      setError(
        "영수증은 확인됐지만 인덱서 반영을 기다리는 중입니다. 새로고침해도 온체인 상태는 유지됩니다.",
      );
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "트랜잭션 처리에 실패했습니다.";
      if (message.includes("취소")) {
        setStatus("rejected");
      } else {
        setStatus("reverted");
      }
      setError(message);
    }
  }

  return (
    <section className="page page--create">
      <header className="page-header">
        <span className="eyebrow">CREATE ON TESTNET</span>
        <h1>새 커뮤니티 자산 만들기</h1>
        <p>
          토큰 규칙은 생성 순간 고정됩니다. 나중에 민팅·정지·세금을 추가할 수
          없습니다.
        </p>
      </header>

      <div className="create-layout">
        <form
          className="form-card glass-panel"
          onSubmit={(event) => void prepare(event)}
        >
          <div className="form-section">
            <div className="step-number">1</div>
            <div>
              <h2>기본 정보</h2>
              <p>이미지와 설명은 토큰 생성 전에 저장·검증됩니다.</p>
            </div>
          </div>
          <div className="field-grid field-grid--two">
            <label>
              <span>토큰 이름</span>
              <input
                name="name"
                maxLength={40}
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
                placeholder="예: Forge Friends"
                data-testid="create-name"
              />
            </label>
            <label>
              <span>심볼</span>
              <input
                name="symbol"
                maxLength={10}
                value={draft.symbol}
                onChange={(event) =>
                  updateDraft("symbol", event.target.value.toUpperCase())
                }
                placeholder="FORGE"
                autoCapitalize="characters"
                data-testid="create-symbol"
              />
            </label>
          </div>
          <label>
            <span>설명</span>
            <textarea
              name="description"
              maxLength={500}
              rows={4}
              value={draft.description}
              onChange={(event) =>
                updateDraft("description", event.target.value)
              }
              placeholder="커뮤니티와 토큰의 목적을 설명하세요. 수익을 약속하지 마세요."
            />
            <small>{draft.description.length}/500</small>
          </label>
          <label>
            <span>소셜 링크 (선택)</span>
            <input
              type="url"
              value={draft.socialUrl}
              onChange={(event) => updateDraft("socialUrl", event.target.value)}
              placeholder="https://..."
            />
            <small>링크 입력은 소유권 검증이나 KYC를 의미하지 않습니다.</small>
          </label>
          <label className="upload-field">
            <span>토큰 이미지</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => updateImage(event.target.files?.[0] ?? null)}
              data-testid="create-image"
            />
            <span className="upload-drop">
              {imagePreview ? (
                <img src={imagePreview} alt="선택한 토큰 이미지 미리보기" />
              ) : (
                <span aria-hidden="true">↥</span>
              )}
              <strong>{image ? image.name : "PNG, JPG 또는 WebP 선택"}</strong>
              <small>최대 5MB · SVG/HTML 금지</small>
            </span>
          </label>

          <div className="form-divider" />
          <div className="form-section">
            <div className="step-number">2</div>
            <div>
              <h2>배정과 유동성</h2>
              <p>
                창작자 물량은 최대 10%이며 24시간 cliff 뒤 30일 선형 해제됩니다.
              </p>
            </div>
          </div>
          <label>
            <span>창작자 배정 · {allocation.toFixed(2)}%</span>
            <input
              type="range"
              min="0"
              max="1000"
              step="25"
              value={draft.creatorAllocationBps}
              onChange={(event) =>
                updateDraft("creatorAllocationBps", Number(event.target.value))
              }
              data-testid="create-allocation"
            />
            <span className="range-labels">
              <small>0%</small>
              <small>상한 10%</small>
            </span>
          </label>
          <label>
            <span>초기 네이티브 유동성</span>
            <div className="amount-input">
              <input
                inputMode="decimal"
                value={draft.nativeLiquidity}
                onChange={(event) =>
                  updateDraft("nativeLiquidity", event.target.value)
                }
                data-testid="create-liquidity"
              />
              <strong>{targetChain.nativeCurrency.symbol}</strong>
            </div>
            <small>시작 가격은 선택한 유동성 비율로 결정됩니다.</small>
          </label>

          {error ? (
            <div className="inline-alert inline-alert--danger" role="alert">
              {error}
            </div>
          ) : null}
          <Button
            type="submit"
            busy={status === "uploading"}
            disabled={!parsed.success || !image || status !== "editing"}
            data-testid="review-launch"
          >
            메타데이터 저장 후 최종 확인
          </Button>
        </form>

        <aside className="review-card">
          <div className="review-card__head">
            <div>
              <span className="eyebrow">IMMUTABLE RULES</span>
              <h2>생성 후 바꿀 수 없는 규칙</h2>
            </div>
            <Badge status={status === "confirmed" ? "confirmed" : "collecting"}>
              {statusLabel(status)}
            </Badge>
          </div>
          <ul className="rule-list">
            <li>
              <span aria-hidden="true">✓</span>총 공급량 1,000,000,000 · 추가
              민팅 없음
            </li>
            <li>
              <span aria-hidden="true">✓</span>
              pause · blacklist · 전송/매수/매도세 없음
            </li>
            <li>
              <span aria-hidden="true">✓</span>
              창작자 {formatBps(draft.creatorAllocationBps)} · 24시간 cliff ·
              30일 선형
            </li>
            <li>
              <span aria-hidden="true">✓</span>
              표시 LP 원금의 인출 함수 없음
            </li>
            <li>
              <span aria-hidden="true">!</span>
              테스트넷 토큰이며 가치·수익·창작자 신뢰를 보증하지 않음
            </li>
          </ul>
          <div className="review-cost">
            <Metric
              label="초기 유동성"
              value={
                prepared
                  ? `${formatUnits(prepared.nativeLiquidity)} ${targetChain.nativeCurrency.symbol}`
                  : "—"
              }
            />
            <Metric
              label="생성 수수료"
              value={
                prepared
                  ? `${formatUnits(prepared.creationFee)} ${targetChain.nativeCurrency.symbol}`
                  : "—"
              }
            />
            <Metric
              label="지갑에서 승인할 정확한 전송액"
              value={
                prepared
                  ? `${formatUnits(prepared.request.value)} ${targetChain.nativeCurrency.symbol}`
                  : "온체인 조회 후 표시"
              }
            />
            <Metric
              label="네트워크 수수료 추정"
              value={
                prepared?.estimatedNetworkFee == null
                  ? "—"
                  : `${formatUnits(prepared.estimatedNetworkFee)} ${targetChain.nativeCurrency.symbol}`
              }
            />
          </div>
          {prepared && status === "review" ? (
            <div className="signing-summary" data-testid="launch-review">
              <img src={prepared.imageUrl} alt="" />
              <div>
                <strong>
                  {draft.name} · ${draft.symbol}
                </strong>
                <small>{prepared.metadataUri}</small>
              </div>
              <p>
                다음 버튼은 지갑에 컨트랙트 호출을 요청합니다. 지갑 연결과 토큰
                생성 승인은 별도 단계입니다.
              </p>
              <Button
                onClick={() => void launch()}
                data-testid="confirm-launch"
              >
                이 규칙으로 트랜잭션 요청
              </Button>
            </div>
          ) : null}
          {txHash ? (
            <div className="tx-status" role="status">
              <span>트랜잭션</span>
              <code>{txHash}</code>
              {createdToken ? <code>토큰 {createdToken}</code> : null}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
