const compactFormatter = new Intl.NumberFormat("ko-KR", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export function formatUnits(
  value: bigint | null | undefined,
  decimals = 18,
  compact = false,
): string {
  if (value == null) return "—";
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;
  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, 4)
    .replace(/0+$/, "");
  const formatted =
    compact && whole >= 1_000n
      ? compactFormatter.format(whole)
      : `${whole.toLocaleString("ko-KR")}${fractionText ? `.${fractionText}` : ""}`;
  return negative ? `-${formatted}` : formatted;
}

export function formatBps(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value / 100).toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
  })}%`;
}

export function shortenAddress(value: string | null | undefined): string {
  if (!value) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatElapsed(iso: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
