// 泥浆循环与漏失处置台 —— 数据模型

export type Shift = "day" | "night";

/** 循环记录（一班一条） */
export interface CirculationRecord {
  id: string;
  holeId: string; // 孔号
  depth: number; // 当前孔深 m
  shift: Shift; // 班次
  observedAt: string; // 观测时刻（datetime-local）
  tankRemaining: number; // 罐余量 m³
  injected: number; // 注入量 m³
  returned: number; // 回流量 m³
  createdAt: string;

  // —— 以下为按同孔前后班推算的派生字段 ——
  prevId?: string; // 前班记录
  consumption?: number; // 实际消耗 m³
  firstInHole?: boolean; // 本孔首班（无上班罐余，仅作基准）
  alarm?: boolean; // 消耗较前班高出两成
}

/** 处置后的回流稳定观测 */
export interface StabilityReading {
  id: string;
  at: string; // 观测时刻
  returned: number; // 回流量 m³
}

/** 锁定期间再次超两成的升级留痕 */
export interface Escalation {
  id: string;
  recordId: string;
  at: string;
  depth: number;
  prevConsumption: number;
  consumption: number;
  diff: number;
}

export type CaseStatus = "pending" | "resolved";

/** 漏失处置事件（待处理 / 已解锁） */
export interface TreatmentCase {
  id: string;
  holeId: string;
  depth: number; // 最新触发深度 m
  openedAt: string; // 立案时刻
  triggerRecordId: string; // 首次触发的班次记录

  // 最新一次超两成的对比数据
  prevConsumption: number;
  consumption: number;
  diff: number;
  percent: number;

  escalations: Escalation[]; // 锁定期内再次超限记录

  // 处置信息
  sealMaterial: string; // 封堵材料
  responsible: string; // 责任人
  treatmentNote: string; // 处置措施（选填）
  readings: StabilityReading[]; // 回流复核
  recoveryResult: string; // 恢复结果

  status: CaseStatus;
  resolvedAt?: string;
}
