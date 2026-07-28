import {
  apiEnvelope,
  launchDetailSchema,
  type DataMeta,
  type LaunchDetail,
  type LaunchSummary,
  type RiskFact,
} from "@forge/shared";

import recordedEnvelope from "./publicDemoRecord.json";

const recorded = apiEnvelope(launchDetailSchema).parse(recordedEnvelope);

const localExecutionFacts: Record<
  string,
  Pick<RiskFact, "value" | "explanation">
> = {
  "additional-mint": {
    value: "추가 민팅 함수 없음",
    explanation:
      "표준 LaunchToken 템플릿과 로컬 Anvil 수직 테스트에서 추가 민팅 경로가 없음을 확인했습니다.",
  },
  pause: {
    value: "일시정지 함수 없음",
    explanation:
      "표준 LaunchToken 템플릿과 로컬 Anvil 수직 테스트에서 관리자 일시정지 경로가 없음을 확인했습니다.",
  },
  blacklist: {
    value: "블랙리스트 함수 없음",
    explanation:
      "표준 LaunchToken 템플릿과 로컬 Anvil 수직 테스트에서 주소 차단 경로가 없음을 확인했습니다.",
  },
  "transfer-tax": {
    value: "0%",
    explanation:
      "표준 LaunchToken 템플릿과 로컬 Anvil 수직 테스트에서 전송세 경로가 없음을 확인했습니다.",
  },
  "proxy-upgrade": {
    value: "업그레이드 경로 없음",
    explanation:
      "표준 LaunchToken은 비업그레이드형이며 로컬 Anvil에 해당 템플릿을 직접 배포했습니다.",
  },
  "liquidity-lock": {
    value: "LP 원금 1 position 잠금",
    explanation:
      "로컬 Anvil 수직 테스트에서 LP 원금이 PermanentLiquidityLocker에 보관되고 인출 경로가 없음을 확인했습니다.",
  },
};

function preserveRecordedEvidence(fact: RiskFact): RiskFact {
  const localFact = localExecutionFacts[fact.key];
  if (!localFact) {
    return fact;
  }

  return {
    ...fact,
    status: "recorded-confirmed",
    value: localFact.value,
    explanation: `${localFact.explanation} 공개 URL은 RPC에 재연결하지 않으므로 현재 상태를 독립적으로 재검증하지 않습니다.`,
  };
}

/**
 * FORGE_CAPTURE_PUBLIC_DEMO=1 pnpm test:e2e가 기록한 로컬 Anvil 인덱서
 * 응답입니다. 이 파일은 읽기 전용 실행 증거이며 GIWA 배포나 실시간 시세가
 * 아닙니다.
 */
export const publicDemoRecordedAt =
  recorded.meta.updatedAt ?? "2026-07-28T17:25:45.501Z";

export const publicDemoProvenance = {
  sourceBaseCommit: "b8d25f73f0c9c0dd9b43947981fdd26ad70e0135",
  sourceApi: "local Anvil onchain indexer",
  captureMethod: "FORGE_CAPTURE_PUBLIC_DEMO=1 pnpm test:e2e",
  canonicalResponseSha256:
    "20b139d5f8672d52f9b0b569c699e02447f674c27d6cd97e2289b4a1c08e244f",
  originalImageUrl: recorded.data.imageUrl,
  transformations: [
    "The localhost-only image URL is represented as null so the public build does not pretend it can serve a missing asset.",
    "Freshness is marked lagging because this deployment is an immutable recording rather than a live indexer connection.",
    "Template and locker facts confirmed by the local vertical run use recorded-confirmed, which does not claim that the public URL independently revalidated them.",
  ],
} as const;

export const publicDemoMeta: DataMeta = {
  ...recorded.meta,
  status: "lagging",
  error:
    "읽기 전용 공개 데모에 보존된 로컬 Anvil 인덱서 기록입니다. 실시간 체인 연결이 아닙니다.",
};

export const publicDemoLaunch: LaunchDetail = {
  ...recorded.data,
  imageUrl: null,
  riskFacts: recorded.data.riskFacts
    .filter((fact) => fact.key !== "contract-source")
    .map(preserveRecordedEvidence),
};

export const publicDemoLaunches: LaunchSummary[] = [publicDemoLaunch];
