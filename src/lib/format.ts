export function formatMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}¥${Math.abs(Math.round(value)).toLocaleString("zh-CN")}`;
}

export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return value.toLocaleString("zh-CN");
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
