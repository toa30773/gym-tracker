// 日付処理はすべてローカルタイムゾーン基準で扱う。
// toISOString() は UTC に変換するので、日本時間 0 時を UTC に直すと前日 15 時となり、
// .slice(0,10) で 1 日ずれる。日付文字列 (YYYY-MM-DD) の入出力ではこのヘルパを使う。

export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "YYYY-MM-DD" を「ローカル 0 時の Date」として復元する。
// new Date("2026-06-23") は UTC 0 時として解釈されるので JST だと 09:00 になり、
// setHours で潰しても境界バグを踏みやすい。これを避けるため明示的に local 構築する。
export function parseYmdLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// 渡された Date を破壊せず、その日のローカル 0 時の新しい Date を返す。
export function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 2 つのローカル日付の差を「日」で返す（時刻は無視）。
export function diffDaysLocal(a: Date, b: Date): number {
  const ms = startOfDayLocal(a).getTime() - startOfDayLocal(b).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
