import type { CirculationRecord, LossTicket } from "./types";

/**
 * 演示数据：ZK-18 夜班消耗 3.6 m³（前班 2.0 m³，+80%）已生成处置单，
 * 封堵材料和责任人已登记、有一次稳定观测，等待第二次（间隔 ≥ 1 小时）；
 * ZK-21 两班平稳，无预警。
 */
export const seedRecords: CirculationRecord[] = [
  {
    id: "rec-z18-1",
    holeId: "ZK-18",
    depth: 28.4,
    shift: "白班",
    tankBalance: 34,
    injected: 18,
    returned: 16,
    observedAt: "2026-09-24T08:00",
    createdAt: "2026-09-24T08:05",
  },
  {
    id: "rec-z18-2",
    holeId: "ZK-18",
    depth: 33.1,
    shift: "白班",
    tankBalance: 30,
    injected: 16,
    returned: 14,
    observedAt: "2026-09-25T08:00",
    createdAt: "2026-09-25T08:06",
  },
  {
    id: "rec-z18-3",
    holeId: "ZK-18",
    depth: 36.8,
    shift: "夜班",
    tankBalance: 21,
    injected: 22,
    returned: 18.4,
    observedAt: "2026-09-25T20:00",
    createdAt: "2026-09-25T20:04",
  },
  {
    id: "rec-z21-1",
    holeId: "ZK-21",
    depth: 17.6,
    shift: "白班",
    tankBalance: 26,
    injected: 12,
    returned: 11,
    observedAt: "2026-09-25T08:30",
    createdAt: "2026-09-25T08:35",
  },
  {
    id: "rec-z21-2",
    holeId: "ZK-21",
    depth: 24.9,
    shift: "白班",
    tankBalance: 24,
    injected: 11,
    returned: 9.8,
    observedAt: "2026-09-26T08:30",
    createdAt: "2026-09-26T08:34",
  },
];

export const seedTickets: LossTicket[] = [
  {
    id: "tic-z18-1",
    holeId: "ZK-18",
    depth: 36.8,
    recordId: "rec-z18-3",
    prevRecordId: "rec-z18-2",
    prevConsumption: 2.0,
    consumption: 3.6,
    delta: 1.6,
    createdAt: "2026-09-25T20:04",
    status: "open",
    material: "膨润土-水泥复合堵漏浆",
    materialAmount: "1.2 t",
    owner: "张建国",
    treatmentNote: "裂隙性漏失，井深 36.8 m 处灌注堵漏浆并静压 30 分钟。",
    treatedAt: "2026-09-25T20:50",
    readings: [
      {
        id: "rdg-1",
        measuredAt: "2026-09-25T22:10",
        injected: 10,
        returned: 9.6,
      },
    ],
    resumeResult: "",
  },
];
