import { useLocation } from "react-router";

export function isWalletEmbedSearch(search: string): boolean {
  const values = new URLSearchParams(search).getAll("embed");
  return values.length === 1 && values[0] === "wallet";
}

export function withWalletEmbed(path: string, enabled: boolean): string {
  if (!enabled) return path;

  const hashIndex = path.indexOf("#");
  const hash = hashIndex === -1 ? "" : path.slice(hashIndex);
  const pathWithoutHash = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const queryIndex = pathWithoutHash.indexOf("?");
  const pathname =
    queryIndex === -1 ? pathWithoutHash : pathWithoutHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : pathWithoutHash.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  params.set("embed", "wallet");
  return `${pathname}?${params.toString()}${hash}`;
}

export function useWalletEmbed(): boolean {
  return isWalletEmbedSearch(useLocation().search);
}
