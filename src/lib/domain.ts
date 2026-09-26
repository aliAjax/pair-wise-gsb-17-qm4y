import type {
  CirculationRecord,
  StabilityReading,
  TreatmentCase,
} from "../types";

/** 消耗较前班高出两成（>20%）即判定漏失异常 */
export const ALARM_RATIO = 1.2;
/** 两次回流“稳定”的允许波动：绝对差 ≤0.5m³ 或相对差 ≤5% */
export const STABLE_ABS_TOLERANCE = 0.5;
export const STABLE_REL_TOLERANCE = 0.05;
/** 两次稳定回流观测的最小间隔（毫秒） */
export const MIN_READING_GAP_MS = 60 * 60 * 1000;

export const SHIFT_LABEL: Record<"day" | "night", string> = {
  day: "白班",
  night: "夜班",
};

let seq = 0;
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export function formatNum(v: number | undefined | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return `${Number(v.toFixed(2))}`;
}

/** 实际消耗 = 注入 − 回流 +（上班罐余 − 本班罐余） */
export function calcConsumption(
  rec: Pick<CirculationRecord, "injected" | "returned" | "tankRemaining">,
  prev: Pick<CirculationRecord, "tankRemaining"> | undefined
): number | undefined {
  if (!prev) return undefined;
  return (
    rec.injected - rec.returned + (prev.tankRemaining - rec.tankRemaining)
  );
}

/** 同孔按观测时刻排序，逐班重算消耗与超两成标记。返回新数组，不改入参。 */
export function recomputeConsumption(
  records: CirculationRecord[]
): CirculationRecord[] {
  const byHole = new Map<string, CirculationRecord[]>();
  for (const r of records) {
    const list = byHole.get(r.holeId) ?? [];
    list.push(r);
    byHole.set(r.holeId, list);
  }

  const result = new Map<string, CirculationRecord>();
  for (const list of byHole.values()) {
    list.sort(
      (a, b) =>
        new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime() ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    let prev: CirculationRecord | undefined;
    for (const r of list) {
      const consumption = calcConsumption(r, prev);
      const prevConsumption = prev?.consumption;
      // 高出两成：严格大于 1.2 倍（加微小容差消除浮点误差，恰好 20% 不算）
      const alarm =
        Boolean(prev) &&
        consumption !== undefined &&
        prevConsumption !== undefined &&
        prevConsumption > 0 &&
        consumption > prevConsumption * ALARM_RATIO + 1e-9;
      result.set(r.id, {
        ...r,
        prevId: prev?.id,
        consumption,
        firstInHole: !prev,
        alarm,
      });
      prev = result.get(r.id);
    }
  }
  return records.map((r) => result.get(r.id)!);
}

/**
 * 根据报警记录对账处置事件（幂等：可随时由全部记录重算）：
 * - 已作为触发记录或升级记录关联的报警不重复立案
 * - 孔内已有待处理事件 → 追加一条升级留痕
 * - 否则新建待处理事件，孔位锁定
 * - 孔号、深度、前班消耗、本班消耗、差值等展示字段统一由
 *   触发记录 + 升级列表派生，保证重复执行结果一致
 */
export function reconcileCases(
  records: CirculationRecord[],
  cases: TreatmentCase[]
): TreatmentCase[] {
  const recordById = new Map(records.map((r) => [r.id, r]));
  const next: TreatmentCase[] = cases.map((c) => ({
    ...c,
    escalations: c.escalations.map((e) => ({ ...e })),
  }));
  const openByHole = new Map<string, TreatmentCase>();
  for (const c of next) {
    if (c.status === "pending") openByHole.set(c.holeId, c);
  }

  const sorted = [...records].sort(
    (a, b) =>
      new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()
  );

  for (const rec of sorted) {
    if (!rec.alarm || rec.consumption === undefined) continue;
    if (next.some((c) => c.triggerRecordId === rec.id)) continue;
    if (next.some((c) => c.escalations.some((e) => e.recordId === rec.id)))
      continue;

    const prev = recordById.get(rec.prevId ?? "");
    const prevConsumption = prev?.consumption ?? 0;
    const existing = openByHole.get(rec.holeId);

    if (existing) {
      existing.escalations.push({
        id: uid("esc"),
        recordId: rec.id,
        at: rec.observedAt,
        depth: rec.depth,
        prevConsumption,
        consumption: rec.consumption,
        diff: rec.consumption - prevConsumption,
      });
    } else {
      const created: TreatmentCase = {
        id: uid("case"),
        holeId: rec.holeId,
        depth: rec.depth,
        openedAt: rec.observedAt,
        triggerRecordId: rec.id,
        prevConsumption,
        consumption: rec.consumption,
        diff: rec.consumption - prevConsumption,
        percent: prevConsumption > 0 ? rec.consumption / prevConsumption : 0,
        escalations: [],
        sealMaterial: "",
        responsible: "",
        treatmentNote: "",
        readings: [],
        recoveryResult: "",
        status: "pending",
      };
      next.push(created);
      openByHole.set(rec.holeId, created);
    }
  }

  // 由触发记录与升级列表重新派生最新对比数据；
  // 每次报警的基准是该班次自身的前一班消耗（连续报警时与上一条报警值一致）
  for (const c of next) {
    const trigger = recordById.get(c.triggerRecordId);
    if (!trigger) continue; // 记录被清空（如全量重置），保持原样
    const events: {
      at: string;
      depth: number;
      consumption: number;
      base: number;
    }[] = [];
    if (trigger.consumption !== undefined) {
      const triggerPrev = recordById.get(trigger.prevId ?? "");
      events.push({
        at: trigger.observedAt,
        depth: trigger.depth,
        consumption: trigger.consumption,
        base: triggerPrev?.consumption ?? 0,
      });
    }
    for (const e of c.escalations) {
      events.push({
        at: e.at,
        depth: e.depth,
        consumption: e.consumption,
        base: e.prevConsumption,
      });
    }
    events.sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
    );
    const latest = events[events.length - 1];
    c.depth = latest.depth;
    c.consumption = latest.consumption;
    c.prevConsumption = latest.base;
    c.diff = latest.consumption - latest.base;
    c.percent =
      latest.base > 0 ? latest.consumption / latest.base : 0;
  }

  return next;
}

/** 回流稳定判定：取最晚两次观测，间隔 ≥1 小时且差值在容差内。 */
export function evaluateReadings(readings: StabilityReading[]): {
  ok: boolean;
  reason: string;
  gapMs: number | null;
  lastTwo: StabilityReading[];
} {
  const sorted = [...readings].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
  if (sorted.length < 2) {
    return {
      ok: false,
      reason: `还需 ${2 - sorted.length} 次回流复核（共需 2 次）`,
      gapMs: null,
      lastTwo: sorted,
    };
  }
  const [r1, r2] = sorted.slice(-2);
  const gapMs = new Date(r2.at).getTime() - new Date(r1.at).getTime();
  if (gapMs < MIN_READING_GAP_MS) {
    const waitMs = MIN_READING_GAP_MS - gapMs;
    return {
      ok: false,
      reason: `两次观测间隔不足 1 小时，还需等待约 ${Math.ceil(
        waitMs / 60000
      )} 分钟`,
      gapMs,
      lastTwo: [r1, r2],
    };
  }
  const diff = Math.abs(r2.returned - r1.returned);
  const base = Math.max(Math.abs(r1.returned), 1e-9);
  const stable =
    diff <= STABLE_ABS_TOLERANCE || diff / base <= STABLE_REL_TOLERANCE;
  if (!stable) {
    return {
      ok: false,
      reason: `回流波动 ${formatNum(diff)}m³，超出稳定容差（±${STABLE_ABS_TOLERANCE}m³ 或 ±${
        STABLE_REL_TOLERANCE * 100
      }%）`,
      gapMs,
      lastTwo: [r1, r2],
    };
  }
  return {
    ok: true,
    reason: `两次回流稳定（间隔 ${formatGap(gapMs)}，波动 ${formatNum(
      diff
    )}m³）`,
    gapMs,
    lastTwo: [r1, r2],
  };
}

export function formatGap(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

export function formatDateTime(s: string): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export function nowLocalInput(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}
