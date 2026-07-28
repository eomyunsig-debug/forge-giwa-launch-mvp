import type { DataMeta, LaunchDetail, LaunchSummary } from "@forge/shared";

/**
 * Recorded from the local Anvil indexer API after the verified vertical run at
 * source commit a44fc839153bfc02463bb5461e7b14154a93a628. Canonical
 * provenance is chain 31337, block 18 and the block hash stored in demo meta.
 * This is a read-only execution record, not live GIWA or invented market data.
 */
export const publicDemoRecordedAt = "2026-07-27T18:34:31.193Z";

export const publicDemoProvenance = {
  sourceCommit: "a44fc839153bfc02463bb5461e7b14154a93a628",
  sourceApi: "local Anvil onchain indexer",
  canonicalResponseSha256:
    "c3c18c0a913119be8a5135c017c4c26d8fcb97fcc92e1afb6e0acd124f758d81",
  originalImageUrl:
    "http://127.0.0.1:8787/uploads/ff34c82bd5e1bdfa2c802856254b8f5a60f4fb0e79c0f2c323e1c78929389ca6.png",
  transformations: [
    "The localhost-only image URL is represented as null so the public build does not pretend it can serve a missing asset.",
    "Freshness is marked lagging because this deployment is an immutable recording rather than a live indexer connection.",
  ],
} as const;

export const publicDemoMeta: DataMeta = {
  chainId: 31_337,
  source: "onchain-indexer",
  indexedBlock: "18",
  indexedBlockHash:
    "0x3a4069210ed56876f0f235ed18bd9b9789f9c7e187c813649df2d8a13ee5074d",
  updatedAt: publicDemoRecordedAt,
  status: "lagging",
  error:
    "읽기 전용 공개 데모에 보존된 로컬 Anvil 인덱서 기록입니다. 실시간 체인 연결이 아닙니다.",
};

export const publicDemoLaunch: LaunchDetail = {
  chainId: 31_337,
  tokenAddress: "0x8c8519cf76d0427e4d936183b9b10018c11cb3ba",
  name: "Sungnyemun Gate",
  symbol: "SNMN",
  metadataUri:
    "http://127.0.0.1:8787/uploads/5c645f86074d4e461bd229c20b76562a452e0abe44fc3ea9787e98d229c13be7.json",
  metadataHash:
    "0x5c645f86074d4e461bd229c20b76562a452e0abe44fc3ea9787e98d229c13be7",
  imageUrl: null,
  description: "서울 랜드마크 밈 토큰. 아무것도 보장하지 않습니다.",
  creatorAddress: "0x15b4fe1c4ba6b63b46ed83abbf6f0f7e0fdec0c6",
  creatorAllocationBps: 300,
  creatorAllocation: "30000000000000000000000000",
  vestingVaultAddress: "0xb29133181c13e768b24f93c46a71d8fcce2d0ce6",
  poolAddress: "0x434686d92687af98a3b684d842f8082feb426e50",
  lockerAddress: "0xd228cdcf6fda5c2c0abf0004530cf24c4b07a42d",
  lpTokenAddress: "0x434686d92687af98a3b684d842f8082feb426e50",
  actualLiquidityNative: "3050000000000000000",
  uniqueHolders: 2,
  recentVolumeNative: "550000000000000000",
  recentTrades: 2,
  topTenOrdinaryHolderBps: 1798,
  createdAt: "2026-07-27T18:34:10.000Z",
  createdBlock: "14",
  transactionHash:
    "0xc7566b3e0167602110b28a5d10a2956a5bd9d6ef6d7025c1e7f76216ba0a485f",
  socialOwnershipVerified: false,
  totalSupply: "1000000000000000000000000000",
  circulatingSupply: "970000000000000000000000000",
  holders: [
    {
      address: "0x434686d92687af98a3b684d842f8082feb426e50",
      category: "pool",
      balance: "795528475895697586754272258",
      circulatingShareBps: 8201,
    },
    {
      address: "0x6dd97333a6977e60596614a2951fa8d13652c8ec",
      category: "ordinary",
      balance: "41024580541448818654862557",
      circulatingShareBps: 422,
    },
    {
      address: "0xb29133181c13e768b24f93c46a71d8fcce2d0ce6",
      category: "vesting",
      balance: "30000000000000000000000000",
      circulatingShareBps: null,
    },
    {
      address: "0xb342c2eddc429621c861fc5c623097ba30963619",
      category: "ordinary",
      balance: "133446943562853594590865185",
      circulatingShareBps: 1375,
    },
  ],
  trades: [
    {
      chainId: 31_337,
      tokenAddress: "0x8c8519cf76d0427e4d936183b9b10018c11cb3ba",
      poolAddress: "0x434686d92687af98a3b684d842f8082feb426e50",
      transactionHash:
        "0x665c10acd83628703c96670240af724863e32c66922da3d0d2cb683ae20ae814",
      logIndex: 1,
      traderAddress: "0x6dd97333a6977e60596614a2951fa8d13652c8ec",
      side: "buy",
      nativeAmount: "150000000000000000",
      tokenAmount: "41024580541448818654862557",
      blockNumber: "18",
      blockTimestamp: "2026-07-27T18:34:30.000Z",
    },
    {
      chainId: 31_337,
      tokenAddress: "0x8c8519cf76d0427e4d936183b9b10018c11cb3ba",
      poolAddress: "0x434686d92687af98a3b684d842f8082feb426e50",
      transactionHash:
        "0xb34eb238b7028c6fcfd13bfe908d67324e43dcc9a165f0d914f9723261775552",
      logIndex: 1,
      traderAddress: "0xb342c2eddc429621c861fc5c623097ba30963619",
      side: "buy",
      nativeAmount: "400000000000000000",
      tokenAmount: "133446943562853594590865185",
      blockNumber: "17",
      blockTimestamp: "2026-07-27T18:34:30.000Z",
    },
  ],
  vesting: {
    vaultAddress: "0xb29133181c13e768b24f93c46a71d8fcce2d0ce6",
    tokenAddress: "0x8c8519cf76d0427e4d936183b9b10018c11cb3ba",
    creatorAddress: "0x15b4fe1c4ba6b63b46ed83abbf6f0f7e0fdec0c6",
    totalAllocation: "30000000000000000000000000",
    claimed: "0",
    claimable: "0",
    locked: "30000000000000000000000000",
    cliffAt: "2026-07-28T18:34:10.000Z",
    fullyVestedAt: "2026-08-26T18:34:10.000Z",
  },
  riskFacts: [
    {
      key: "actual-liquidity",
      label: "실제 유동성",
      status: "confirmed",
      value: "3050000000000000000",
      evidence: {
        contractAddress: "0x434686d92687af98a3b684d842f8082feb426e50",
      },
      explanation: "마지막으로 인덱싱한 pool의 네이티브 자산 reserve입니다.",
    },
    {
      key: "additional-mint",
      label: "추가 민팅",
      status: "confirmed",
      value: "불가능",
      evidence: {
        contractAddress: "0x8c8519cf76d0427e4d936183b9b10018c11cb3ba",
        transactionHash:
          "0xc7566b3e0167602110b28a5d10a2956a5bd9d6ef6d7025c1e7f76216ba0a485f",
        blockNumber: "14",
      },
      explanation: "표준 템플릿에는 생성 이후 민팅 함수가 없습니다.",
    },
    {
      key: "admin-permissions",
      label: "관리자 권한",
      status: "caution",
      value: "creationFee, feeRecipient, adapterAllowlist",
      evidence: {
        contractAddress: "0x3e8477b756716b81b0ad2a9e5f52d0e6a10bde56",
        transactionHash:
          "0xc7566b3e0167602110b28a5d10a2956a5bd9d6ef6d7025c1e7f76216ba0a485f",
        blockNumber: "14",
      },
      explanation: "ProtocolConfig에서 변경 가능한 항목만 표시합니다.",
    },
    {
      key: "blacklist",
      label: "주소 블랙리스트",
      status: "not-applicable",
      value: "기능 없음",
      evidence: {
        contractAddress: "0x8c8519cf76d0427e4d936183b9b10018c11cb3ba",
        transactionHash:
          "0xc7566b3e0167602110b28a5d10a2956a5bd9d6ef6d7025c1e7f76216ba0a485f",
        blockNumber: "14",
      },
      explanation: "토큰에 주소 차단 기능이 없습니다.",
    },
    {
      key: "contract-source",
      label: "컨트랙트 소스 검증",
      status: "collecting",
      value: null,
      evidence: {
        contractAddress: "0x8c8519cf76d0427e4d936183b9b10018c11cb3ba",
      },
      explanation: "익스플로러가 보고한 해당 배포 주소의 소스 검증 상태입니다.",
    },
    {
      key: "creator-allocation",
      label: "창작자 배정",
      status: "confirmed",
      value: "300 bps",
      evidence: {
        contractAddress: "0xb29133181c13e768b24f93c46a71d8fcce2d0ce6",
        transactionHash:
          "0xc7566b3e0167602110b28a5d10a2956a5bd9d6ef6d7025c1e7f76216ba0a485f",
        blockNumber: "14",
      },
      explanation: "런치 트랜잭션에 기록된 창작자 배정 비율입니다.",
    },
    {
      key: "creator-locked-balance",
      label: "잠긴 창작자 물량",
      status: "confirmed",
      value: "30000000000000000000000000",
      evidence: {
        contractAddress: "0xb29133181c13e768b24f93c46a71d8fcce2d0ce6",
      },
      explanation:
        "현재 시각의 선형 베스팅을 반영해 아직 vest되지 않은 창작자 물량만 표시합니다.",
    },
    {
      key: "liquidity-lock",
      label: "유동성 잠금 방식",
      status: "confirmed",
      value: "원금 인출 함수 없는 락커",
      evidence: {
        contractAddress: "0xd228cdcf6fda5c2c0abf0004530cf24c4b07a42d",
        transactionHash:
          "0xc7566b3e0167602110b28a5d10a2956a5bd9d6ef6d7025c1e7f76216ba0a485f",
        blockNumber: "14",
      },
      explanation: "표시된 LP 원금은 인출 함수가 없는 락커가 보유합니다.",
    },
    {
      key: "pause",
      label: "거래 일시정지",
      status: "not-applicable",
      value: "기능 없음",
      evidence: {
        contractAddress: "0x8c8519cf76d0427e4d936183b9b10018c11cb3ba",
        transactionHash:
          "0xc7566b3e0167602110b28a5d10a2956a5bd9d6ef6d7025c1e7f76216ba0a485f",
        blockNumber: "14",
      },
      explanation: "토큰에 관리자 pause 기능이 없습니다.",
    },
    {
      key: "proxy-upgrade",
      label: "프록시 업그레이드",
      status: "confirmed",
      value: "불가능",
      evidence: {
        contractAddress: "0x8c8519cf76d0427e4d936183b9b10018c11cb3ba",
        transactionHash:
          "0xc7566b3e0167602110b28a5d10a2956a5bd9d6ef6d7025c1e7f76216ba0a485f",
        blockNumber: "14",
      },
      explanation: "런치 토큰은 비업그레이드형 템플릿입니다.",
    },
    {
      key: "top-ten-concentration",
      label: "상위 10개 일반 지갑 집중도",
      status: "confirmed",
      value: "1798 bps",
      evidence: {
        contractAddress: "0x8c8519cf76d0427e4d936183b9b10018c11cb3ba",
      },
      explanation:
        "pool, locker, vesting, burn, zero 주소를 일반 지갑에서 제외하고 유통 공급량을 분모로 계산합니다.",
    },
    {
      key: "transfer-tax",
      label: "전송세",
      status: "not-applicable",
      value: "0",
      evidence: {
        contractAddress: "0x8c8519cf76d0427e4d936183b9b10018c11cb3ba",
        transactionHash:
          "0xc7566b3e0167602110b28a5d10a2956a5bd9d6ef6d7025c1e7f76216ba0a485f",
        blockNumber: "14",
      },
      explanation: "표준 토큰은 전송세를 부과하지 않습니다.",
    },
  ],
  admin: {
    protocolConfigAddress: "0x3e8477b756716b81b0ad2a9e5f52d0e6a10bde56",
    operatorAddress: "0xb740cd04f3f621dbefcbe53b3f72dfccd4e972c7",
    proxyUpgradeable: false,
    mutableParameters: ["creationFee", "feeRecipient", "adapterAllowlist"],
  },
};

export const publicDemoLaunches: LaunchSummary[] = [publicDemoLaunch];
