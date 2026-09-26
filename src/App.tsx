import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type {
  CirculationRecord,
  StabilityReading,
  TreatmentCase,
} from "./types";
import {
  recomputeConsumption,
  reconcileCases,
  uid,
} from "./lib/domain";
import { STORAGE_KEYS, usePersistentState } from "./lib/storage";
import { buildSeed } from "./lib/seed";
import { MetricCard } from "./components/MetricCard";
import { CirculationTab } from "./components/CirculationTab";
import { PendingTab } from "./components/PendingTab";
import { HistoryTab } from "./components/HistoryTab";

type Tab = "circulation" | "pending" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "circulation", label: "循环记录" },
  { key: "pending", label: "待处理" },
  { key: "history", label: "处置历史" },
];

function App() {
  const [rawRecords, setRawRecords] = usePersistentState<CirculationRecord[]>(
    STORAGE_KEYS.records,
    []
  );
  const [cases, setCases] = usePersistentState<TreatmentCase[]>(
    STORAGE_KEYS.cases,
    []
  );
  const [tab, setTab] = useState<Tab>("circulation");
  const [toast, setToast] = useState("");

  // 每次新增后按同孔前后班重算实际消耗与超两成标记
  const records = useMemo(
    () => recomputeConsumption(rawRecords),
    [rawRecords]
  );

  // 报警记录 → 待处理事件对账（新增报警才会产生新事件）
  useEffect(() => {
    const linked = (list: TreatmentCase[]) =>
      new Set(
        list.flatMap((c) => [
          c.triggerRecordId,
          ...c.escalations.map((e) => e.recordId),
        ])
      );
    const alarmIds = records.filter((r) => r.alarm).map((r) => r.id);
    const already = linked(cases);
    if (!alarmIds.some((id) => !already.has(id))) return;
    setCases(reconcileCases(records, cases));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  const pendingCases = cases.filter((c) => c.status === "pending");
  const lockedHoles = useMemo(
    () => new Set(pendingCases.map((c) => c.holeId)),
    [pendingCases]
  );

  const totalConsumption = useMemo(
    () =>
      records.reduce(
        (sum, r) => sum + (r.firstInHole ? 0 : r.consumption ?? 0),
        0
      ),
    [records]
  );
  const holeCount = new Set(records.map((r) => r.holeId)).size;

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 3600);
  };

  const addRecord = (
    input: Omit<CirculationRecord, "id" | "createdAt" | "consumption">
  ) => {
    const rec: CirculationRecord = {
      ...input,
      id: uid("rec"),
      createdAt: new Date().toISOString(),
    };
    setRawRecords((list) => [...list, rec]);
    // 先用同孔前班已重算的消耗预判是否超两成，提交后直接引导到处置页
    const prev = records
      .filter((r) => r.holeId === rec.holeId)
      .sort(
        (a, b) =>
          new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime()
      )[0];
    if (prev?.consumption !== undefined && prev.consumption > 0) {
      const consumption =
        rec.injected -
        rec.returned +
        (prev.tankRemaining - rec.tankRemaining);
      if (consumption > prev.consumption * 1.2) {
        notify(
          `${rec.holeId} 本班消耗 ${consumption.toFixed(
            1
          )}m³，较前班高出两成，已立案并锁定孔位`
        );
        setTab("pending");
        return;
      }
    }
    notify("本班循环记录已登记");
  };

  const updateCase = (id: string, patch: Partial<TreatmentCase>) =>
    setCases((list) =>
      list.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );

  const addReading = (id: string, reading: StabilityReading) =>
    setCases((list) =>
      list.map((c) =>
        c.id === id ? { ...c, readings: [...c.readings, reading] } : c
      )
    );

  const removeReading = (caseId: string, readingId: string) =>
    setCases((list) =>
      list.map((c) =>
        c.id === caseId
          ? { ...c, readings: c.readings.filter((r) => r.id !== readingId) }
          : c
      )
    );

  const resolveCase = (id: string) => {
    const target = cases.find((c) => c.id === id);
    if (!target) return;
    if (
      !target.sealMaterial.trim() ||
      !target.responsible.trim() ||
      !target.recoveryResult.trim()
    ) {
      notify("封堵材料、责任人、恢复结果均为必填");
      return;
    }
    setCases((list) =>
      list.map((c) =>
        c.id === id
          ? { ...c, status: "resolved", resolvedAt: new Date().toISOString() }
          : c
      )
    );
    notify(`${target.holeId} 已解锁，恢复钻进；事件归档至处置历史`);
  };

  const loadSeed = () => {
    const seed = buildSeed();
    setRawRecords(seed.records);
    // 同步重算消耗并对账出 ZK-18 的待处理事件，再回填演示处置信息；
    // 此后 effect 复查时报警均已关联，不会重复立案
    const seeded = recomputeConsumption(seed.records);
    setCases(seed.prepareCases(reconcileCases(seeded, [])));
    setTab("circulation");
    notify("已载入演示数据（ZK-18 为待处理锁定状态）");
  };

  const clearAll = () => {
    if (!window.confirm("确认清空全部循环记录与处置历史？此操作不可恢复。"))
      return;
    setRawRecords([]);
    setCases([]);
    setTab("circulation");
    notify("已清空全部数据");
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">现场泥浆管控 · 端口 5103</p>
          <h1>泥浆循环与漏失处置台</h1>
          <p className="subtitle">
            按班登记罐余量、注入量、回流量与观测时刻，自动核算前后班实际消耗；
            消耗较前班高出两成即立案锁定，封堵材料、责任人、两次间隔不少于
            1 小时的稳定回流和恢复结果齐备后方可解锁恢复钻进。
          </p>
        </div>
        <div className="stack-card">
          <span>记录与处置</span>
          <strong>
            循环台账与处置历史分开保存，重开页面自动恢复，继续处理未结事件
          </strong>
          <div className="hero-actions">
            <button onClick={loadSeed}>载入演示数据</button>
            <button onClick={clearAll}>清空全部</button>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard
          label="在管钻孔"
          value={holeCount}
          unit="个"
          tone="ok"
          hint="已登记循环记录的孔号"
        />
        <MetricCard
          label="循环班次记录"
          value={records.length}
          unit="班"
          tone="ok"
          hint="首班为基准班不参与对比"
        />
        <MetricCard
          label="累计实际消耗"
          value={totalConsumption.toFixed(1)}
          unit="m³"
          tone="watch"
          hint="按同孔前后班罐余推算"
        />
        <MetricCard
          label="待处理 / 锁定孔"
          value={pendingCases.length}
          unit="个"
          tone={pendingCases.length ? "danger" : "ok"}
          hint={
            pendingCases.length
              ? `锁定：${pendingCases.map((c) => c.holeId).join("、")}`
              : "无漏失事件，钻进正常"
          }
        />
      </section>

      {lockedHoles.size > 0 && (
        <section className="lock-strip">
          <strong>孔位锁定</strong>
          <span>
            {Array.from(lockedHoles).join("、")} 正在漏失处置中，未完成
            “材料 · 责任人 · 两次稳定回流(≥1小时) · 恢复结果”前禁止恢复钻进与新增本班记录。
          </span>
        </section>
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === "pending" && pendingCases.length > 0 ? (
              <span className="tab-count">{pendingCases.length}</span>
            ) : null}
            {t.key === "history" ? (
              <span className="tab-count muted">
                {cases.filter((c) => c.status === "resolved").length}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {tab === "circulation" && (
        <CirculationTab
          records={records}
          lockedHoles={lockedHoles}
          onAdd={addRecord}
        />
      )}
      {tab === "pending" && (
        <PendingTab
          cases={cases}
          onUpdate={updateCase}
          onAddReading={addReading}
          onRemoveReading={removeReading}
          onResolve={resolveCase}
        />
      )}
      {tab === "history" && <HistoryTab cases={cases} />}

      <footer className="app-foot">
        循环记录存于 <code>{STORAGE_KEYS.records}</code>，处置历史存于{" "}
        <code>{STORAGE_KEYS.cases}</code>，二者独立持久化。
      </footer>

      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}

export default App;
