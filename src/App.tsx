import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type {
  CirculationRecord,
  LossTicket,
  RecordInput,
  ReadingInput,
  Shift,
  SubmitMessage,
} from "./types";
import {
  CIRC_KEY,
  TICKET_KEY,
  consumption,
  findPrevRecord,
  fmtTime,
  fmtVol,
  isSpike,
  nowLocal,
  openTicketHoleSet,
  round1,
  spikePercent,
  uid,
} from "./lib";
import { seedRecords, seedTickets } from "./seed";
import TicketCard from "./components/TicketCard";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const blankForm = {
  holeId: "",
  depth: "",
  shift: "白班" as Shift,
  tankBalance: "",
  injected: "",
  returned: "",
  observedAt: nowLocal(),
};

function App() {
  const [records, setRecords] = useState<CirculationRecord[]>(() =>
    load(CIRC_KEY, seedRecords)
  );
  const [tickets, setTickets] = useState<LossTicket[]>(() =>
    load(TICKET_KEY, seedTickets)
  );
  const [form, setForm] = useState(blankForm);
  const [message, setMessage] = useState<SubmitMessage | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // 循环记录和处置历史分开保存：重开面板还能接着处理
  useEffect(() => {
    localStorage.setItem(CIRC_KEY, JSON.stringify(records));
  }, [records]);
  useEffect(() => {
    localStorage.setItem(TICKET_KEY, JSON.stringify(tickets));
  }, [tickets]);

  const openTickets = useMemo(
    () =>
      tickets
        .filter((t) => t.status === "open")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [tickets]
  );
  const resolvedTickets = useMemo(
    () =>
      tickets
        .filter((t) => t.status === "resolved")
        .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? "")),
    [tickets]
  );

  const lockedHoles = useMemo(
    () => Array.from(openTicketHoleSet(tickets)).sort(),
    [tickets]
  );

  const sortedRecords = useMemo(
    () =>
      [...records].sort((a, b) => b.observedAt.localeCompare(a.observedAt)),
    [records]
  );

  const ticketByRecord = useMemo(() => {
    const m = new Map<string, LossTicket>();
    tickets.forEach((t) => m.set(t.recordId, t));
    return m;
  }, [tickets]);

  const holeIds = useMemo(
    () => Array.from(new Set(records.map((r) => r.holeId))).sort(),
    [records]
  );

  const totalInjected = round1(
    records.reduce((s, r) => s + r.injected, 0)
  );
  const totalConsumed = round1(
    records.reduce((s, r) => s + consumption(r), 0)
  );

  const updateTicket = (id: string, patch: Partial<LossTicket>) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  };

  const handleSubmit = () => {
    setMessage(null);
    const holeId = form.holeId.trim().toUpperCase();
    const depth = Number(form.depth);
    const tankBalance = Number(form.tankBalance);
    const injected = Number(form.injected);
    const returned = Number(form.returned);

    if (!holeId) {
      setMessage({ tone: "danger", text: "请填写孔号。" });
      return;
    }
    if (!Number.isFinite(depth) || depth <= 0) {
      setMessage({ tone: "danger", text: "孔深须为大于 0 的数值（m）。" });
      return;
    }
    if (!Number.isFinite(tankBalance) || tankBalance < 0) {
      setMessage({ tone: "danger", text: "罐余量须为不小于 0 的数值（m³）。" });
      return;
    }
    if (!Number.isFinite(injected) || injected < 0) {
      setMessage({ tone: "danger", text: "注入量须为不小于 0 的数值（m³）。" });
      return;
    }
    if (!Number.isFinite(returned) || returned < 0) {
      setMessage({ tone: "danger", text: "回流量须为不小于 0 的数值（m³）。" });
      return;
    }
    if (returned > injected + 1e-9) {
      setMessage({ tone: "danger", text: "回流量不应大于注入量，请核对。" });
      return;
    }
    if (!form.observedAt) {
      setMessage({ tone: "danger", text: "请选择观测时刻。" });
      return;
    }

    const input: RecordInput = {
      holeId,
      depth: round1(depth),
      shift: form.shift,
      tankBalance: round1(tankBalance),
      injected: round1(injected),
      returned: round1(returned),
      observedAt: form.observedAt,
    };
    const record: CirculationRecord = {
      ...input,
      id: uid("rec"),
      createdAt: nowLocal(),
    };
    const current = consumption(record);
    const prev = findPrevRecord(records, input);

    setRecords((rs) => [record, ...rs]);

    if (!prev) {
      setMessage({
        tone: "ok",
        text: `${holeId} 已登记本班循环，实际消耗 ${fmtVol(current)}。该孔无前班记录，暂不做对比。`,
      });
    } else {
      const prevCons = consumption(prev);
      const delta = round1(current - prevCons);
      if (isSpike(prevCons, current)) {
        const pct = spikePercent(prevCons, current);
        const existed = tickets.find(
          (t) => t.holeId === holeId && t.status === "open"
        );
        if (!existed) {
          const ticket: LossTicket = {
            id: uid("tic"),
            holeId,
            depth: record.depth,
            recordId: record.id,
            prevRecordId: prev.id,
            prevConsumption: prevCons,
            consumption: current,
            delta,
            createdAt: record.createdAt,
            status: "open",
            material: "",
            materialAmount: "",
            owner: "",
            treatmentNote: "",
            readings: [],
            resumeResult: "",
          };
          setTickets((ts) => [ticket, ...ts]);
          setMessage({
            tone: "danger",
            text: `${holeId} 孔深 ${record.depth.toFixed(
              1
            )} m：实际消耗 ${fmtVol(current)}，前班 ${fmtVol(
              prevCons
            )}，差值 +${fmtVol(delta)}（+${pct}%，超过两成）。已列入待处理，未登记封堵材料和责任人前禁止恢复钻进。`,
          });
        } else {
          setMessage({
            tone: "warn",
            text: `${holeId} 消耗仍偏高（+${pct}%，差值 +${fmtVol(
              delta
            )}），该孔已有待处理处置单，请继续完成封堵与回流观测，不重复建单。`,
          });
        }
      } else {
        setMessage({
          tone: "ok",
          text: `${holeId} 已登记，实际消耗 ${fmtVol(current)}，前班 ${fmtVol(
            prevCons
          )}${
            delta > 0 ? `，增加 ${fmtVol(delta)}` : delta < 0 ? `，减少 ${fmtVol(-delta)}` : "，持平"
          }，未超过两成预警线。`,
        });
      }
    }

    setForm({ ...blankForm, holeId, observedAt: nowLocal() });
  };

  const handleSaveMaterial = (
    id: string,
    patch: {
      material: string;
      materialAmount: string;
      owner: string;
      treatmentNote: string;
    }
  ) => {
    const ticket = tickets.find((t) => t.id === id);
    updateTicket(id, {
      ...patch,
      treatedAt: ticket?.treatedAt ?? nowLocal(),
    });
  };

  const handleAddReading = (id: string, reading: ReadingInput) => {
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket) return;
    updateTicket(id, {
      readings: [...ticket.readings, { ...reading, id: uid("rdg") }],
    });
  };

  const handleRemoveReading = (ticketId: string, readingId: string) => {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    updateTicket(ticketId, {
      readings: ticket.readings.filter((r) => r.id !== readingId),
    });
  };

  const handleUnlock = (id: string, resumeResult: string) => {
    updateTicket(id, {
      status: "resolved",
      resumeResult,
      resolvedAt: nowLocal(),
    });
  };

  const resetDemo = () => {
    if (!window.confirm("确定恢复为演示数据？当前登记内容将被覆盖。")) return;
    setRecords(seedRecords);
    setTickets(seedTickets);
    setMessage({ tone: "ok", text: "已恢复演示数据。" });
  };

  const clearAll = () => {
    if (!window.confirm("确定清空全部循环记录与处置历史？此操作不可恢复。"))
      return;
    setRecords([]);
    setTickets([]);
    setMessage({ tone: "warn", text: "已清空全部数据。" });
  };

  const metrics = [
    { label: "登记孔数", value: String(holeIds.length), tone: "ok" },
    { label: "待处理漏失", value: String(openTickets.length), tone: "danger" },
    { label: "累计注入量", value: fmtVol(totalInjected), tone: "watch" },
    { label: "累计实际消耗", value: fmtVol(totalConsumed), tone: "watch" },
  ];

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">泥浆循环与漏失处置台</p>
          <h1>泥浆循环与漏失处置台</h1>
          <p className="subtitle">
            按班次登记罐余量、注入量、回流量与观测时刻，自动计算实际消耗；消耗高出前班两成即生成漏失处置单，
            封堵登记、两次稳定回流（间隔 ≥ 1 小时）、恢复结果三道闸全部通过方可解锁恢复钻进。
          </p>
        </div>
        <div className="stack-card">
          <span>数据保存</span>
          <strong>循环记录 / 处置历史分开保存</strong>
          <p className="stack-note">本地浏览器存储，重开面板可接着处理</p>
          <div className="stack-actions">
            <button onClick={resetDemo}>恢复演示数据</button>
            <button onClick={clearAll} className="danger-btn">
              清空全部
            </button>
          </div>
        </div>
      </section>

      {lockedHoles.length > 0 && (
        <section className="lock-banner">
          <strong>⛔ 以下钻孔漏失待处理，禁止钻进：</strong>
          {lockedHoles.map((h) => (
            <a key={h} href={`#${tickets.find((t) => t.holeId === h && t.status === "open")?.id}`}>
              {h}
            </a>
          ))}
          <span>完成封堵登记与两次稳定回流观测、写明恢复结果后解锁。</span>
        </section>
      )}

      <section className="metrics-grid">
        {metrics.map((m) => (
          <article key={m.label} className="metric-card">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={`status-${m.tone}`} />
          </article>
        ))}
      </section>

      {message && (
        <p className={`submit-msg msg-${message.tone}`}>{message.text}</p>
      )}

      <section className="workspace">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p>班次循环登记</p>
              <h2>泥浆循环观测</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>孔号 *</span>
              <input
                list="hole-list"
                value={form.holeId}
                placeholder="如 ZK-18"
                onChange={(e) =>
                  setForm({ ...form, holeId: e.target.value })
                }
              />
              <datalist id="hole-list">
                {holeIds.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
            </label>
            <label>
              <span>孔深（m）*</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.depth}
                placeholder="当前钻进深度"
                onChange={(e) => setForm({ ...form, depth: e.target.value })}
              />
            </label>
            <label>
              <span>班次 *</span>
              <select
                value={form.shift}
                onChange={(e) =>
                  setForm({ ...form, shift: e.target.value as Shift })
                }
              >
                <option value="白班">白班</option>
                <option value="夜班">夜班</option>
              </select>
            </label>
            <label>
              <span>观测时刻 *</span>
              <input
                type="datetime-local"
                value={form.observedAt}
                onChange={(e) =>
                  setForm({ ...form, observedAt: e.target.value })
                }
              />
            </label>
            <label>
              <span>罐余量（m³）*</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.tankBalance}
                onChange={(e) =>
                  setForm({ ...form, tankBalance: e.target.value })
                }
              />
            </label>
            <label>
              <span>注入量（m³）*</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.injected}
                onChange={(e) =>
                  setForm({ ...form, injected: e.target.value })
                }
              />
            </label>
            <label>
              <span>回流量（m³）*</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.returned}
                onChange={(e) =>
                  setForm({ ...form, returned: e.target.value })
                }
              />
            </label>
            <label className="computed-cell">
              <span>本班实际消耗（自动）</span>
              <strong>
                {form.injected !== "" && form.returned !== ""
                  ? fmtVol(round1(Number(form.injected) - Number(form.returned)))
                  : "—"}
              </strong>
              <em>实际消耗 = 注入量 − 回流量</em>
            </label>
          </div>
          <div className="form-footer">
            <button className="primary-action" onClick={handleSubmit}>
              登记本班循环
            </button>
            <span className="form-rule">
              同一孔号与前班对比：实际消耗高出两成自动转入待处理
            </span>
          </div>
        </section>

        <section className="panel records-panel">
          <div className="section-heading">
            <div>
              <p>循环记录（单独保存）</p>
              <h2>班次消耗对比</h2>
            </div>
            <span className="count-chip">{records.length} 条</span>
          </div>
          {sortedRecords.length === 0 ? (
            <p className="empty-hint">暂无循环记录，请在左侧登记。</p>
          ) : (
            <div className="table-wrap">
              <table className="record-table">
                <thead>
                  <tr>
                    <th>观测时刻</th>
                    <th>孔号</th>
                    <th>孔深</th>
                    <th>班次</th>
                    <th>罐余量</th>
                    <th>注入</th>
                    <th>回流</th>
                    <th>实际消耗</th>
                    <th>对比前班</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords.map((r) => {
                    const prev = findPrevRecord(records, r);
                    const cur = consumption(r);
                    const ticket = ticketByRecord.get(r.id);
                    const spike =
                      prev !== undefined && isSpike(consumption(prev), cur);
                    const delta = prev ? round1(cur - consumption(prev)) : null;
                    return (
                      <tr key={r.id} className={spike ? "row-spike" : ""}>
                        <td>{fmtTime(r.observedAt)}</td>
                        <td>
                          <strong>{r.holeId}</strong>
                        </td>
                        <td>{r.depth.toFixed(1)} m</td>
                        <td>{r.shift}</td>
                        <td>{fmtVol(r.tankBalance)}</td>
                        <td>{fmtVol(r.injected)}</td>
                        <td>{fmtVol(r.returned)}</td>
                        <td>
                          <strong>{fmtVol(cur)}</strong>
                        </td>
                        <td>
                          {prev ? (
                            spike ? (
                              <a
                                className="badge badge-danger spike-link"
                                href={`#${ticket?.id}`}
                              >
                                +{fmtVol(delta ?? 0)} / +
                                {spikePercent(consumption(prev), cur)}%
                              </a>
                            ) : (
                              <span
                                className={
                                  delta !== null && delta > 0
                                    ? "delta-up-soft"
                                    : "delta-flat"
                                }
                              >
                                {delta !== null && delta > 0
                                  ? `+${fmtVol(delta)}`
                                  : delta !== null && delta < 0
                                  ? `−${fmtVol(-delta)}`
                                  : "持平"}
                              </span>
                            )
                          ) : (
                            <span className="muted">首班</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      <section className="tickets panel">
        <div className="section-heading">
          <div>
            <p>处置历史单独保存 · 待处理 {openTickets.length} 单</p>
            <h2>漏失处置（待处理）</h2>
          </div>
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="history-toggle"
          >
            {historyOpen ? "收起处置历史" : `查看处置历史（${resolvedTickets.length}）`}
          </button>
        </div>
        {openTickets.length === 0 ? (
          <p className="empty-hint ok-empty">
            当前无待处理漏失；消耗高出前班两成时，处置单将自动出现在这里并锁定对应钻孔。
          </p>
        ) : (
          <div className="ticket-list">
            {openTickets.map((t, i) => (
              <TicketCard
                key={t.id}
                ticket={t}
                index={i}
                onSaveMaterial={handleSaveMaterial}
                onAddReading={handleAddReading}
                onRemoveReading={handleRemoveReading}
                onUnlock={handleUnlock}
              />
            ))}
          </div>
        )}

        {historyOpen && (
          <div className="history-block">
            <h3>处置历史（已解锁）</h3>
            {resolvedTickets.length === 0 ? (
              <p className="empty-hint">暂无已完成处置记录。</p>
            ) : (
              <div className="ticket-list">
                {resolvedTickets.map((t, i) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    index={i}
                    onSaveMaterial={handleSaveMaterial}
                    onAddReading={handleAddReading}
                    onRemoveReading={handleRemoveReading}
                    onUnlock={handleUnlock}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <footer className="foot-note">
        循环记录（{CIRC_KEY}）与处置历史（{TICKET_KEY}）分开存储；刷新或重开面板后数据仍在，可继续处理待办处置单。
      </footer>
    </main>
  );
}

export default App;
