export const brandConfig = {
  appName: "Forge",
  tagline: "온체인 사실을 숨기지 않는 커뮤니티 런치 마켓",
  shortDescription:
    "누구나 테스트 토큰을 만들 수 있지만, 창작자 물량과 유동성 잠금, 관리자 권한은 공개됩니다.",
  legalName: "Forge testnet prototype",
} as const;

export type BrandConfig = typeof brandConfig;
