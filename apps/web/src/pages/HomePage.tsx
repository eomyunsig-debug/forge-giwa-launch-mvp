import { useDeferredValue, useEffect, useState } from "react";
import { Button } from "@forge/ui";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@forge/ui";
import { Link } from "react-router";

import { fetchLaunches } from "../api";
import { AsyncBoundary, DataFreshness, LaunchCard } from "../components";
import { appBrand, isLocalFixture, isPublicDemo } from "../config";

const feedFilters = [
  "신규 런치",
  "거래 급증",
  "고유 매수자 증가",
  "유동성 유지 중",
] as const;

const sortByFilter = {
  "신규 런치": "new",
  "거래 급증": "trending",
  "고유 매수자 증가": "buyers",
  "유동성 유지 중": "liquidity",
} as const;

export function HomePage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] =
    useState<(typeof feedFilters)[number]>("신규 런치");
  const [visibleLimit, setVisibleLimit] = useState(12);
  const deferredSearch = useDeferredValue(search);
  useEffect(() => {
    setVisibleLimit(12);
  }, [deferredSearch, filter]);
  const query = useQuery({
    queryKey: ["launches", deferredSearch, filter],
    queryFn: () => fetchLaunches(deferredSearch, sortByFilter[filter]),
    refetchInterval: isPublicDemo ? false : 8_000,
  });

  const launches = query.data?.data ?? [];
  const filtered =
    filter === "유동성 유지 중"
      ? launches.filter(
          (launch) =>
            launch.actualLiquidityNative != null &&
            BigInt(launch.actualLiquidityNative) > 0n,
        )
      : launches;

  return (
    <>
      <section className="hero">
        <div className="hero__glow" aria-hidden="true" />
        <div className="hero__copy">
          <Badge status={isPublicDemo ? "muted" : "confirmed"}>
            {isPublicDemo
              ? "실제 로컬 실행 기록"
              : isLocalFixture
                ? "로컬 Anvil 개발 환경"
                : "GIWA 테스트넷 실험"}
          </Badge>
          <h1>
            빠르게 만들고,
            <br />
            <span>위험은 숨기지 마세요.</span>
          </h1>
          <p>{appBrand.tagline}</p>
          <div className="hero__actions">
            <Link
              className="forge-button forge-button--primary"
              to={
                isPublicDemo
                  ? `/token/31337/0x8c8519cf76d0427e4d936183b9b10018c11cb3ba`
                  : "/create"
              }
            >
              <span aria-hidden="true">＋</span>
              {isPublicDemo ? "검증 기록 보기" : "토큰 만들기"}
            </Link>
            <Link className="text-link" to="/about/risk">
              무엇을 보장하나요? →
            </Link>
          </div>
        </div>
        <aside className="hero__facts glass-panel">
          <div>
            <span className="fact-icon fact-icon--mint" aria-hidden="true">
              ∅
            </span>
            <p>추가 민팅</p>
            <strong>불가능</strong>
          </div>
          <div>
            <span className="fact-icon fact-icon--lock" aria-hidden="true">
              ⌑
            </span>
            <p>LP 원금</p>
            <strong>인출 경로 없음</strong>
          </div>
          <div>
            <span className="fact-icon fact-icon--vest" aria-hidden="true">
              ◷
            </span>
            <p>창작자 물량</p>
            <strong>온체인 베스팅</strong>
          </div>
        </aside>
      </section>

      <section className="feed-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              {isPublicDemo ? "RECORDED LAUNCH" : "LIVE LAUNCHES"}
            </span>
            <h2>
              {isPublicDemo ? "로컬 수직 흐름 실행 결과" : "지금 만들어진 자산"}
            </h2>
          </div>
          <DataFreshness meta={query.data?.meta ?? null} />
        </div>

        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <span className="visually-hidden">이름, 심볼 또는 주소 검색</span>
          <input
            type="search"
            placeholder="이름, 심볼, 컨트랙트 주소 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="filter-row" role="group" aria-label="런치 피드 필터">
          {feedFilters.map((label) => (
            <button
              type="button"
              key={label}
              className={filter === label ? "active" : ""}
              aria-pressed={filter === label}
              onClick={() => setFilter(label)}
            >
              {label}
            </button>
          ))}
        </div>

        <AsyncBoundary loading={query.isLoading} error={query.error}>
          {filtered.length ? (
            <>
              <div className="launch-grid">
                {filtered.slice(0, visibleLimit).map((launch) => (
                  <LaunchCard
                    launch={launch}
                    key={`${launch.chainId}:${launch.tokenAddress}`}
                  />
                ))}
              </div>
              {visibleLimit < filtered.length ? (
                <div className="feed-pagination">
                  <Button
                    tone="neutral"
                    onClick={() =>
                      setVisibleLimit((current) =>
                        Math.min(current + 12, filtered.length),
                      )
                    }
                  >
                    다음 12개 보기
                  </Button>
                  <span>
                    {Math.min(visibleLimit, filtered.length)} /{" "}
                    {filtered.length}
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state" data-testid="empty-launches">
              <span aria-hidden="true">◇</span>
              <h2>
                {search || filter !== "신규 런치"
                  ? "조건에 맞는 온체인 런치가 없습니다"
                  : "아직 인덱싱된 런치가 없습니다"}
              </h2>
              <p>
                숫자를 만들어 채우지 않습니다.{" "}
                {isPublicDemo
                  ? "검색 조건을 바꾸어 기록된 런치를 확인하세요."
                  : "첫 테스트 런치를 시작해 보세요."}
              </p>
              {!isPublicDemo ? (
                <Link
                  className="forge-button forge-button--primary"
                  to="/create"
                >
                  첫 런치 만들기
                </Link>
              ) : null}
            </div>
          )}
        </AsyncBoundary>
      </section>
    </>
  );
}
