import { useEffect, useState } from "react";
import type { LossTicket, ReadingInput } from "../types";
import {
  STABLE_GAP_MINUTES,
  STABLE_RETURN_RATIO,
  canUnlock,
  fmtTime,
  fmtVol,
  gateMaterialPassed,
  gateResumePassed,
  gateStablePassed,
  isReadingStable,
  nowLocal,
  returnRatio,
  round1,
  spikePercent,
  stableGapMinutes,
  stablePair,
} from "../lib";

interface MaterialPatch {
  material: string;
  materialAmount: string;
  owner: string;
  treatmentNote: string;
}

interface TicketCardProps {
  ticket: LossTicket;
  index: number;
  onSaveMaterial: (id: string, patch: MaterialPatch) => void;
  onAddReading: (id: string, reading: ReadingInput) => void;
  onRemoveReading: (ticketId: string, readingId: string) => void;
  onUnlock: (id: string, resumeResult: string) => void;
}

function Gate({
  no,
  title,
  passed,
  children,
}: {
  no: number;
  title: string;
  passed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`gate ${passed ? "gate-pass" : ""}`}>
      <div className="gate-head">
        <span className={`gate-no ${passed ? "gate-no-pass" : ""}`}>
          {passed ? "✓" : no}
        </span>
        <strong>{title}</strong>
        <em>{passed ? "已满足" : "未完成"}</em>
      </div>
      <div className="gate-body">{children}</div>
    </div>
  );
}

function TicketCard({
  ticket,
  index,
  onSaveMaterial,
  onAddReading,
  onRemoveReading,
  onUnlock,
}: TicketCardProps) {
  const [material, setMaterial] = useState(ticket.material);
  const [materialAmount, setMaterialAmount] = useState(ticket.materialAmount);
  const [owner, setOwner] = useState(ticket.owner);
  const [treatmentNote, setTreatmentNote] = useState(ticket.treatmentNote);
  const [materialMsg, setMaterialMsg] = useState("");

  const [measuredAt, setMeasuredAt] = useState(nowLocal());
  const [rInjected, setRInjected] = useState("");
  const [rReturned, setRReturned] = useState("");
  const [readingMsg, setReadingMsg] = useState("");

  const [resumeResult, setResumeResult] = useState(ticket.resumeResult);

  useEffect(() => {
    setMaterial(ticket.material);
    setMaterialAmount(ticket.materialAmount);
    setOwner(ticket.owner);
    setTreatmentNote(ticket.treatmentNote);
    setResumeResult(ticket.resumeResult);
  }, [
    ticket.id,
    ticket.material,
    ticket.materialAmount,
    ticket.owner,
    ticket.treatmentNote,
    ticket.resumeResult,
  ]);

  const pct = spikePercent(ticket.prevConsumption, ticket.consumption);
  const materialPassed = gateMaterialPassed(ticket);
  const stablePassed = gateStablePassed(ticket);
  const pair = stablePair(ticket.readings);
  const gap = stableGapMinutes(ticket.readings);
  const resumePassed = gateResumePassed(ticket);
  const unlockReady =
    materialPassed && stablePassed && resumeResult.trim().length >= 5;

  const handleSaveMaterial = () => {
    if (!material.trim() || !owner.trim()) {
      setMaterialMsg("封堵材料和责任人均为必填，未登记不能恢复钻进。");
      return;
    }
    onSaveMaterial(ticket.id, {
      material: material.trim(),
      materialAmount: materialAmount.trim(),
      owner: owner.trim(),
      treatmentNote: treatmentNote.trim(),
    });
    setMaterialMsg("已登记封堵信息，可开始处置后回流观测。");
  };

  const handleAddReading = () => {
    setReadingMsg("");
    const inj = Number(rInjected);
    const ret = Number(rReturned);
    if (!measuredAt) {
      setReadingMsg("请选择观测时刻。");
      return;
    }
    if (
      ticket.treatedAt &&
      measuredAt < ticket.treatedAt.slice(0, 16)
    ) {
      setReadingMsg("观测时刻不得早于封堵登记时刻（须为处置后观测）。");
      return;
    }
    if (!Number.isFinite(inj) || inj <= 0) {
      setReadingMsg("注入量须为大于 0 的数值。");
      return;
    }
    if (!Number.isFinite(ret) || ret < 0) {
      setReadingMsg("回流量须为不小于 0 的数值。");
      return;
    }
    onAddReading(ticket.id, {
      measuredAt,
      injected: round1(inj),
      returned: round1(ret),
    });
    setRInjected("");
    setRReturned("");
  };

  const handleUnlock = () => {
    if (!materialPassed || !stablePassed) return;
    if (resumeResult.trim().length < 5) return;
    onUnlock(ticket.id, resumeResult.trim());
  };

  if (ticket.status === "resolved") {
    return (
      <article className="ticket-card ticket-resolved" id={ticket.id}>
        <div className="ticket-top">
          <div>
            <span className="ticket-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3>{ticket.holeId}</h3>
            <span className="badge badge-ok">已解锁 · 恢复钻进</span>
          </div>
          <p className="ticket-meta">
            孔深 {ticket.depth.toFixed(1)} m · 差值 +{fmtVol(ticket.delta)}（较前班 +{pct}%）
          </p>
        </div>
        <dl className="resolved-grid">
          <div>
            <dt>封堵材料 / 用量</dt>
            <dd>
              {ticket.material}
              {ticket.materialAmount ? ` · ${ticket.materialAmount}` : ""}
            </dd>
          </div>
          <div>
            <dt>责任人</dt>
            <dd>{ticket.owner}</dd>
          </div>
          <div>
            <dt>两次稳定回流</dt>
            <dd>
              {pair
                ? `${fmtTime(pair[0].measuredAt)} / ${fmtTime(pair[1].measuredAt)}，间隔 ${
                    stableGapMinutes([pair[0], pair[1]]) ?? "—"
                  } 分钟`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>解锁时刻</dt>
            <dd>{fmtTime(ticket.resolvedAt ?? "")}</dd>
          </div>
          <div className="resolved-result">
            <dt>恢复结果</dt>
            <dd>{ticket.resumeResult}</dd>
          </div>
        </dl>
      </article>
    );
  }

  return (
    <article className="ticket-card ticket-open" id={ticket.id}>
      <div className="ticket-top">
        <div>
          <span className="ticket-index">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3>{ticket.holeId}</h3>
          <span className="badge badge-danger">待处理 · 禁止钻进</span>
        </div>
        <p className="ticket-meta">
          孔深 <strong>{ticket.depth.toFixed(1)} m</strong> · 本班消耗{" "}
          {fmtVol(ticket.consumption)}（前班 {fmtVol(ticket.prevConsumption)}）·
          差值 <strong className="delta-up">+{fmtVol(ticket.delta)}</strong> ·
          较前班 <strong className="delta-up">+{pct}%</strong>
          <br />
          预警时间 {fmtTime(ticket.createdAt)}
        </p>
      </div>

      <div className="gates">
        <Gate no={1} title="登记封堵材料与责任人" passed={materialPassed}>
          <div className="gate-grid">
            <label>
              <span>封堵材料 *</span>
              <input
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="如：膨润土-水泥复合堵漏浆"
              />
            </label>
            <label>
              <span>用量</span>
              <input
                value={materialAmount}
                onChange={(e) => setMaterialAmount(e.target.value)}
                placeholder="如：1.2 t"
              />
            </label>
            <label>
              <span>责任人 *</span>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="班组负责人姓名"
              />
            </label>
            <label className="gate-grid-wide">
              <span>封堵处置说明</span>
              <input
                value={treatmentNote}
                onChange={(e) => setTreatmentNote(e.target.value)}
                placeholder="漏失层位、封堵工艺、静压时间等"
              />
            </label>
          </div>
          <div className="gate-actions">
            <button className="primary-action" onClick={handleSaveMaterial}>
              {ticket.treatedAt ? "更新封堵登记" : "保存封堵登记"}
            </button>
            {materialMsg && <span className="gate-hint">{materialMsg}</span>}
            {ticket.treatedAt && (
              <span className="gate-hint ok">
                登记于 {fmtTime(ticket.treatedAt)}
              </span>
            )}
          </div>
        </Gate>

        <Gate
          no={2}
          title={`处置后两次回流稳定，间隔 ≥ ${STABLE_GAP_MINUTES} 分钟（回流率 ≥ ${Math.round(
            STABLE_RETURN_RATIO * 100
          )}%）`}
          passed={stablePassed}
        >
          {!materialPassed && (
            <p className="gate-hint">请先完成第 1 步封堵登记，再录入处置后观测。</p>
          )}
          {ticket.readings.length > 0 && (
            <table className="reading-table">
              <thead>
                <tr>
                  <th>观测时刻</th>
                  <th>注入量</th>
                  <th>回流量</th>
                  <th>回流率</th>
                  <th>判定</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...ticket.readings]
                  .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
                  .map((r) => (
                    <tr
                      key={r.id}
                      className={isReadingStable(r) ? "row-stable" : ""}
                    >
                      <td>{fmtTime(r.measuredAt)}</td>
                      <td>{fmtVol(r.injected)}</td>
                      <td>{fmtVol(r.returned)}</td>
                      <td>{Math.round(returnRatio(r) * 100)}%</td>
                      <td>
                        {isReadingStable(r) ? (
                          <span className="badge badge-ok">稳定</span>
                        ) : (
                          <span className="badge badge-warn">不稳定</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="link-btn"
                          onClick={() => onRemoveReading(ticket.id, r.id)}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          <div className={`gate-grid ${!materialPassed ? "disabled-form" : ""}`}>
            <label>
              <span>观测时刻</span>
              <input
                type="datetime-local"
                value={measuredAt}
                disabled={!materialPassed}
                onChange={(e) => setMeasuredAt(e.target.value)}
              />
            </label>
            <label>
              <span>注入量 m³</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={rInjected}
                disabled={!materialPassed}
                onChange={(e) => setRInjected(e.target.value)}
              />
            </label>
            <label>
              <span>回流量 m³</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={rReturned}
                disabled={!materialPassed}
                onChange={(e) => setRReturned(e.target.value)}
              />
            </label>
            <div className="gate-actions">
              <button
                className="primary-action"
                disabled={!materialPassed}
                onClick={handleAddReading}
              >
                添加观测
              </button>
            </div>
          </div>
          {readingMsg && <span className="gate-hint">{readingMsg}</span>}

          <p className={`gate-hint ${stablePassed ? "ok" : ""}`}>
            {stablePassed && pair
              ? `已满足：${fmtTime(pair[0].measuredAt)} 与 ${fmtTime(
                  pair[1].measuredAt
                )} 两次稳定，间隔 ${
                  stableGapMinutes([pair[0], pair[1]]) ?? "—"
                } 分钟。`
              : ticket.readings.filter(isReadingStable).length === 0
              ? `尚无稳定观测，需两次回流率 ≥ ${Math.round(
                  STABLE_RETURN_RATIO * 100
                )}% 且间隔不少于 ${STABLE_GAP_MINUTES} 分钟。`
              : gap === null
              ? "已有 1 次稳定观测，还需再观测 1 次。"
              : `最近两次稳定观测间隔 ${gap} 分钟，不足 ${STABLE_GAP_MINUTES} 分钟，请继续观测。`}
          </p>
        </Gate>

        <Gate no={3} title="写明恢复结果并解锁" passed={resumePassed}>
          <label>
            <span>恢复钻进结果 *（不少于 5 个字）</span>
            <textarea
              rows={2}
              value={resumeResult}
              disabled={!materialPassed || !stablePassed}
              placeholder={
                !materialPassed || !stablePassed
                  ? "完成前两步后填写"
                  : "如：循环正常、液面稳定，经值班负责人确认恢复钻进"
              }
              onChange={(e) => setResumeResult(e.target.value)}
            />
          </label>
          <div className="gate-actions">
            <button
              className="unlock-btn"
              disabled={!unlockReady}
              onClick={handleUnlock}
            >
              {materialPassed && stablePassed
                ? resumeResult.trim().length >= 5
                  ? "写明恢复结果，解锁恢复钻进"
                  : "请先写明恢复结果"
                : "三道闸未全部通过，暂不能解锁"}
            </button>
          </div>
          {!resumePassed && materialPassed && stablePassed && (
            <span className="gate-hint">
              封堵与稳定条件已满足，填写恢复结果后即可解锁。
            </span>
          )}
        </Gate>
      </div>
    </article>
  );
}

export default TicketCard;
