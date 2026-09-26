export type Shift = "白班" | "夜班";

/** 泥浆循环记录（按班次登记，单独保存） */
export interface CirculationRecord {
  id: string;
  /** 孔号 */
  holeId: string;
  /** 观测时孔深 m */
  depth: number;
  /** 班次 */
  shift: Shift;
  /** 罐余量 m³ */
  tankBalance: number;
  /** 注入量 m³ */
  injected: number;
  /** 回流量 m³ */
  returned: number;
  /** 观测时刻，本地时间 YYYY-MM-DDTHH:mm */
  observedAt: string;
  /** 入库时间 */
  createdAt: string;
}

/** 处置后的回流稳定性观测 */
export interface StabilityReading {
  id: string;
  /** 观测时刻 */
  measuredAt: string;
  /** 注入量 m³ */
  injected: number;
  /** 回流量 m³ */
  returned: number;
}

/** 漏失处置单（待处理 / 已解锁，与循环记录分开保存） */
export interface LossTicket {
  id: string;
  /** 孔号 */
  holeId: string;
  /** 漏失发现时孔深 m */
  depth: number;
  /** 触发预警的循环记录 */
  recordId: string;
  prevRecordId?: string;
  /** 前班实际消耗 m³ */
  prevConsumption: number;
  /** 本班实际消耗 m³ */
  consumption: number;
  /** 差值 m³ */
  delta: number;
  createdAt: string;
  status: "open" | "resolved";

  /** 封堵材料 */
  material: string;
  /** 封堵材料用量 */
  materialAmount: string;
  /** 责任人 */
  owner: string;
  /** 处置说明 */
  treatmentNote: string;
  /** 封堵登记时刻（处置起点） */
  treatedAt?: string;

  /** 处置后回流观测 */
  readings: StabilityReading[];
  /** 恢复钻进结果 */
  resumeResult: string;
  /** 解锁时刻 */
  resolvedAt?: string;
}

/** 登记表单提交内容 */
export type RecordInput = Omit<CirculationRecord, "id" | "createdAt">;

/** 读数登记内容 */
export type ReadingInput = Omit<StabilityReading, "id">;

/** 登记后的反馈提示 */
export interface SubmitMessage {
  tone: "ok" | "warn" | "danger";
  text: string;
}
