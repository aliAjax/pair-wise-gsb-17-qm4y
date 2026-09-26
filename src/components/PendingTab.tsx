import { useState } from "react";
import type { StabilityReading, TreatmentCase } from "../types";
import {
  MIN_READING_GAP_MS,
  evaluateReadings,
  formatDateTime,
  formatGap,
  formatNum,
  nowLocalInput,
  uid,
} from "../lib/domain";

function Gate({
  index,
  passed,
  title,
  children,
}: {
  index: number;
  passed: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`gate ${passed ? "gate-pass" : ""}`}>
      <div className="gate-head">
        <span className={`gate-dot ${passed ? "on" : ""}`}>
          {passed ? "✓" : index}
        </span>
        <strong>{title}</strong>
      </div>
      <div className="gate-body">{children}</div>
    </div>
  );
}

function CaseCard({
  c,
  onUpdate,
  onAddReading,
  onRemoveReading,
  onResolve,
}: {
  c: TreatmentCase;
  onUpdate: (id: string, patch: Partial<TreatmentCase>) => void;
  onAddReading: (id: string, reading: StabilityReading) => void;
  onRemoveReading: (caseId: string, readingId: string) => void;
  onResolve: (id: string) => void;
}) {
  const [readingAt, setReadingAt] = useState(nowLocalInput());
  const [readingVal, setReadingVal] = useState("");
  const [readingError, setReadingError] = useState("");

  const evalResult = evaluateReadings(c.readings);
  const hasMaterial = c.sealMaterial.trim().length > 0;
  const hasResponsible = c.responsible.trim().length > 0;
  const hasResult = c.recoveryResult.trim().length > 0;
  const stable = evalResult.ok;

  const gates = [
    { passed: hasMaterial, label: "已登记封堵材料" },
    { passed: hasResponsible, label: "已指定责任人" },
    { passed: stable, label: "两次回流稳定且间隔 ≥ 1 小时" },
    { passed: hasResult, label: "已写明恢复结果" },
  ];
  const allPass = gates.every((g) => g.passed);

  const addReading = () => {
    const v = Number(readingVal);
    if (!readingAt) return setReadingError("请选择观测时刻");
    if (!Number.isFinite(v) || v < 0)
      return setReadingError("请填写正确的回流量 (m³)");
    onAddReading(c.id, { id: uid("rd"), at: readingAt, returned: v });
    setReadingVal("");
    setReadingAt(nowLocalInput());
    setReadingError("");
  };

  return (
    <article className="case-card">
      <header className="case-head">
        <div>
          <div className="case-title">
            <span className="lock-badge">锁定中</span>
            <h3>{c.holeId}</h3>
          </div>
          <p className="case-meta">
            立案 {formatDateTime(c.openedAt)} · 当前深度 {formatNum(c.depth)}m
          </p>
        </div>
        <div className="case-diff">
          <span>较前班差值</span>
          <strong>+{formatNum(c.diff)} m³</strong>
          <em>
            前班 {formatNum(c.prevConsumption)} → 本班 {formatNum(c.consumption)}{" "}
            m³（{c.percent > 0 ? `${Math.round(c.percent * 100)}%` : "—"}）
          </em>
        </div>
      </header>

      {c.escalations.length > 0 && (
        <div className="escalation-box">
          <p>锁定期间再次超两成 {c.escalations.length} 次：</p>
          <ul>
            {c.escalations.map((e) => (
              <li key={e.id}>
                {formatDateTime(e.at)} · {formatNum(e.depth)}m · 消耗{" "}
                {formatNum(e.consumption)}m³（+{formatNum(e.diff)}）
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="gates">
        <Gate index={1} passed={hasMaterial} title="登记封堵材料（必填）">
          <input
            placeholder="如：水泥-膨润土浆液、锯末、封堵剂及用量"
            value={c.sealMaterial}
            onChange={(e) => onUpdate(c.id, { sealMaterial: e.target.value })}
          />
        </Gate>

        <Gate index={2} passed={hasResponsible} title="指定责任人（必填）">
          <input
            placeholder="处置责任人姓名 / 班组"
            value={c.responsible}
            onChange={(e) => onUpdate(c.id, { responsible: e.target.value })}
          />
        </Gate>

        <Gate
          index={3}
          passed={stable}
          title="回流复核：两次稳定，间隔不少于 1 小时"
        >
          <div className="reading-add">
            <input
              type="datetime-local"
              value={readingAt}
              onChange={(e) => setReadingAt(e.target.value)}
              aria-label="回流观测时刻"
            />
            <input
              type="number"
              min="0"
              step="0.1"
              placeholder="回流量 m³"
              value={readingVal}
              onChange={(e) => setReadingVal(e.target.value)}
            />
            <button type="button" onClick={addReading}>
              添加观测
            </button>
          </div>
          {readingError ? <p className="form-error">{readingError}</p> : null}

          {c.readings.length > 0 ? (
            <ul className="reading-list">
              {[...c.readings]
                .sort(
                  (a, b) =>
                    new Date(a.at).getTime() - new Date(b.at).getTime()
                )
                .map((r, idx, arr) => {
                  const gap =
                    idx > 0
                      ? new Date(r.at).getTime() -
                        new Date(arr[idx - 1].at).getTime()
                      : null;
                  return (
                    <li key={r.id}>
                      <span>
                        第 {idx + 1} 次 · {formatDateTime(r.at)} · 回流{" "}
                        {formatNum(r.returned)}m³
                        {gap !== null ? `（间隔 ${formatGap(gap)}）` : ""}
                        {gap !== null && gap < MIN_READING_GAP_MS ? (
                          <b className="warn-text"> 间隔不足</b>
                        ) : null}
                      </span>
                      <button
                        className="link-danger"
                        onClick={() => onRemoveReading(c.id, r.id)}
                      >
                        删除
                      </button>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <p className="form-hint">尚无回流复核观测</p>
          )}
          <p className={stable ? "eval-ok" : "eval-warn"}>{evalResult.reason}</p>
        </Gate>

        <Gate index={4} passed={hasResult} title="写明恢复结果（必填）">
          <textarea
            rows={3}
            placeholder="如：封堵后试运转正常，孔内液面稳定，恢复正常钻进参数"
            value={c.recoveryResult}
            onChange={(e) =>
              onUpdate(c.id, { recoveryResult: e.target.value })
            }
          />
          <input
            className="note-input"
            placeholder="处置措施（选填）"
            value={c.treatmentNote}
            onChange={(e) =>
              onUpdate(c.id, { treatmentNote: e.target.value })
            }
          />
        </Gate>
      </div>

      <div className="unlock-bar">
        <ul className="gate-summary">
          {gates.map((g) => (
            <li key={g.label} className={g.passed ? "done" : "todo"}>
              {g.passed ? "✓" : "○"} {g.label}
            </li>
          ))}
        </ul>
        <button
          className="primary-action unlock-btn"
          disabled={!allPass}
          onClick={() => onResolve(c.id)}
          title={allPass ? "" : "四项条件全部满足后才能解锁恢复钻进"}
        >
          {allPass ? "恢复结果已确认，解锁恢复钻进" : "条件未满足，禁止恢复钻进"}
        </button>
      </div>
    </article>
  );
}

export function PendingTab({
  cases,
  onUpdate,
  onAddReading,
  onRemoveReading,
  onResolve,
}: {
  cases: TreatmentCase[];
  onUpdate: (id: string, patch: Partial<TreatmentCase>) => void;
  onAddReading: (id: string, reading: StabilityReading) => void;
  onRemoveReading: (caseId: string, readingId: string) => void;
  onResolve: (id: string) => void;
}) {
  const pending = cases.filter((c) => c.status === "pending");
  return (
    <section className="panel pending-panel">
      <div className="section-heading">
        <div>
          <p>漏失处置</p>
          <h2>待处理（{pending.length}）</h2>
        </div>
      </div>
      {pending.length === 0 ? (
        <p className="empty-hint">
          没有待处理的漏失事件。当某班实际消耗较前班高出两成时，
          对应孔号、深度与差值会自动留在这里并锁定钻孔。
        </p>
      ) : (
        <div className="case-list">
          {pending
            .slice()
            .sort(
              (a, b) =>
                new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
            )
            .map((c) => (
              <CaseCard
                key={c.id}
                c={c}
                onUpdate={onUpdate}
                onAddReading={onAddReading}
                onRemoveReading={onRemoveReading}
                onResolve={onResolve}
              />
            ))}
        </div>
      )}
    </section>
  );
}
