import type { CirculationRecord, StabilityReading, TreatmentCase } from "../types";
import { uid } from "./domain";

/** 转成 <input type="datetime-local"> 需要的本地时间格式 */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export interface SeedBundle {
  records: CirculationRecord[];
  /** 在对账出的待处理事件上预填处置信息和一次回流复核 */
  prepareCases: (cases: TreatmentCase[]) => TreatmentCase[];
}

/**
 * 演示数据：
 * ZK-18 第三班消耗 9m³，较前班 1.5m³ 涨 500% → 自动立案锁定，
 * 已登记封堵材料/责任人并有 1 次回流复核（差 1 次即可解锁）；
 * ZK-21 两班消耗平稳，仅作循环记录。
 */
export function buildSeed(): SeedBundle {
  const now = Date.now();
  const H = 60 * 60 * 1000;
  const at = (offset: number) => localInput(new Date(now + offset));
  const created = new Date().toISOString();

  const mk = (
    partial: Omit<CirculationRecord, "id" | "createdAt" | "consumption">
  ): CirculationRecord => ({
    id: uid("rec"),
    createdAt: created,
    ...partial,
  });

  const r1 = mk({
    holeId: "ZK-18",
    depth: 126.5,
    shift: "night",
    observedAt: at(-10 * H),
    tankRemaining: 40,
    injected: 12,
    returned: 10,
  });
  const r2 = mk({
    holeId: "ZK-18",
    depth: 132.0,
    shift: "day",
    observedAt: at(-9 * H),
    tankRemaining: 39,
    injected: 12,
    returned: 11.5,
  });
  const r3 = mk({
    holeId: "ZK-18",
    depth: 138.2,
    shift: "night",
    observedAt: at(-8 * H),
    tankRemaining: 35,
    injected: 14,
    returned: 9,
  });
  const r4 = mk({
    holeId: "ZK-21",
    depth: 58.0,
    shift: "day",
    observedAt: at(-6 * H),
    tankRemaining: 30,
    injected: 10,
    returned: 8.5,
  });
  const r5 = mk({
    holeId: "ZK-21",
    depth: 64.5,
    shift: "night",
    observedAt: at(-5 * H),
    tankRemaining: 29,
    injected: 10,
    returned: 9,
  });

  const firstReading: StabilityReading = {
    id: uid("rd"),
    at: at(-75 * 60 * 1000),
    returned: 10.5,
  };

  return {
    records: [r1, r2, r3, r4, r5],
    prepareCases: (cases) =>
      cases.map((c) =>
        c.holeId === "ZK-18" && c.status === "pending"
          ? {
              ...c,
              sealMaterial: "水泥-膨润土浆液（掺速凝剂）",
              responsible: "张海涛",
              treatmentNote: "138m 处裂隙漏失，间歇注浆封堵，共注 6m³",
              readings: [firstReading],
            }
          : c
      ),
  };
}
