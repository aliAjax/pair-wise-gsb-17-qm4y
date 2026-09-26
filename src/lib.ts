import type {
  CirculationRecord,
  LossTicket,
  RecordInput,
  StabilityReading,
} from "./types";

/** 实际消耗比前班高出的预警比例：20% */
export const SPIKE_RATIO = 0.2;
/** 两次稳定回流的最小间隔：60 分钟 */
export const STABLE_GAP_MINUTES = 60;
/** 回流/注入达到该比例视为回流稳定：95% */
export const STABLE_RETURN_RATIO = 0.95;

export const CIRC_KEY = "mud-console:circulation:v1";
export const TICKET_KEY = "mud-console:tickets:v1";

/** 实际消耗 = 注入量 - 回流量（m³） */
export function consumption(r: { injected: number; returned: number }): number {
  return round1(r.injected - r.returned);
}

export function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

/**
 * 找该孔「前一班」记录：同一孔号、观测时刻早于当前记录、取时间最近的一条。
 */
export function findPrevRecord(
  records: CirculationRecord[],
  input: RecordInput
): CirculationRecord | undefined {
  return records
    .filter(
      (r) => r.holeId === input.holeId && r.observedAt < input.observedAt
    )
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
}

/**
 * 是否构成漏失预警：前班消耗 >= 0，且本班消耗 > 前班 ×（1 + 20%）。
 * 前班无消耗（0 或负数）时不按比例判定，避免除零误报。
 */
export function isSpike(prev: number, current: number): boolean {
  if (prev <= 0) return false;
  return current > prev * (1 + SPIKE_RATIO) + 1e-9;
}

export function spikePercent(prev: number, current: number): number {
  if (prev <= 0) return 0;
  return Math.round(((current - prev) / prev) * 100);
}

/** 回流率：回流量 / 注入量；无注入时无意义，返回 0 */
export function returnRatio(
  r: { injected: number; returned: number }
): number {
  if (r.injected <= 0) return 0;
  return r.returned / r.injected;
}

/** 单次观测是否稳定：回流率 >= 95% */
export function isReadingStable(r: StabilityReading): boolean {
  return r.injected > 0 && returnRatio(r) >= STABLE_RETURN_RATIO - 1e-9;
}

/** 找出满足「两次稳定且间隔 >= 60 分钟」的最后一对观测 */
export function stablePair(
  readings: StabilityReading[]
): [StabilityReading, StabilityReading] | undefined {
  const sorted = [...readings]
    .filter(isReadingStable)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  for (let i = 1; i < sorted.length; i++) {
    const gap =
      (new Date(sorted[i].measuredAt).getTime() -
        new Date(sorted[i - 1].measuredAt).getTime()) /
      60000;
    if (gap >= STABLE_GAP_MINUTES) {
      return [sorted[i - 1], sorted[i]];
    }
  }
  return undefined;
}

/** 两次稳定观测之间的间隔（分钟），未满足两条时返回 null */
export function stableGapMinutes(
  readings: StabilityReading[]
): number | null {
  const stable = [...readings]
    .filter(isReadingStable)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  if (stable.length < 2) return null;
  const a = stable[stable.length - 2];
  const b = stable[stable.length - 1];
  return Math.round(
    (new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime()) /
      60000
  );
}

/** 闸 1：已登记封堵材料和责任人 */
export function gateMaterialPassed(t: LossTicket): boolean {
  return t.material.trim() !== "" && t.owner.trim() !== "";
}

/** 闸 2：处置后两次回流稳定且间隔不少于一小时 */
export function gateStablePassed(t: LossTicket): boolean {
  return stablePair(t.readings) !== undefined;
}

/** 闸 3：写明恢复结果 */
export function gateResumePassed(t: LossTicket): boolean {
  return t.resumeResult.trim().length >= 5;
}

/** 三道闸全部通过才允许解锁恢复钻进 */
export function canUnlock(t: LossTicket): boolean {
  return gateMaterialPassed(t) && gateStablePassed(t) && gateResumePassed(t);
}

export function openTicketHoleSet(tickets: LossTicket[]): Set<string> {
  return new Set(
    tickets.filter((t) => t.status === "open").map((t) => t.holeId)
  )
}

/** 当前本地时间，datetime-local 可用格式 */
export function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function uid(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function fmtTime(isoLocal: string): string {
  return isoLocal ? isoLocal.replace("T", " ") : "—";
}

export function fmtVol(n: number): string {
  return `${round1(n).toFixed(1)} m³`;
}
