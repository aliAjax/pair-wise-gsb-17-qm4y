import { useState } from "react";
import type { TreatmentCase } from "../types";
import {
  evaluateReadings,
  formatDateTime,
  formatGap,
  formatNum,
} from "../lib/domain";

export function HistoryTab({ cases }: { cases: TreatmentCase[] }) {
  const resolved = cases
    .filter((c) => c.status === "resolved")
    .sort(
      (a, b) =>
        new Date(b.resolvedAt ?? b.openedAt).getTime() -
        new Date(a.resolvedAt ?? a.openedAt).getTime()
    );
  const [openId, setOpenId] = useState<string | null>(
    resolved[0]?.id ?? null
  );

  return (
    <section className="panel history-panel">
      <div className="section-heading">
        <div>
          <p>处置历史</p>
          <h2>已解锁事件（{resolved.length}）</h2>
        </div>
      </div>
      {resolved.length === 0 ? (
        <p className="empty-hint">
          暂无处置历史。完成封堵登记、责任人、两次间隔不少于 1 小时的稳定回流
          并写明恢复结果后，事件会从“待处理”归档到这里。
        </p>
      ) : (
        <div className="history-list">
          {resolved.map((c) => {
            const evalResult = evaluateReadings(c.readings);
            const open = openId === c.id;
            return (
              <article key={c.id} className="history-card">
                <button
                  className="history-head"
                  onClick={() => setOpenId(open ? null : c.id)}
                >
                  <span className="resolved-badge">已解锁</span>
                  <h3>
                    {c.holeId} · {formatNum(c.depth)}m
                  </h3>
                  <span className="history-time">
                    立案 {formatDateTime(c.openedAt)} → 解锁{" "}
                    {formatDateTime(c.resolvedAt ?? "")}
                  </span>
                  <span className="chevron">{open ? "收起 ▲" : "详情 ▼"}</span>
                </button>
                {open && (
                  <div className="history-body">
                    <dl className="history-grid">
                      <div>
                        <dt>触发时差值</dt>
                        <dd>
                          +{formatNum(c.diff)}m³（前班{" "}
                          {formatNum(c.prevConsumption)} → 本班{" "}
                          {formatNum(c.consumption)}）
                        </dd>
                      </div>
                      <div>
                        <dt>封堵材料</dt>
                        <dd>{c.sealMaterial}</dd>
                      </div>
                      <div>
                        <dt>责任人</dt>
                        <dd>{c.responsible}</dd>
                      </div>
                      {c.treatmentNote ? (
                        <div>
                          <dt>处置措施</dt>
                          <dd>{c.treatmentNote}</dd>
                        </div>
                      ) : null}
                      <div className="span-2">
                        <dt>恢复结果</dt>
                        <dd>{c.recoveryResult}</dd>
                      </div>
                    </dl>
                    <div className="history-readings">
                      <p>
                        回流复核（{c.readings.length} 次
                        {evalResult.gapMs !== null
                          ? `，间隔 ${formatGap(evalResult.gapMs)}`
                          : ""}
                        ）：
                      </p>
                      <ul>
                        {[...c.readings]
                          .sort(
                            (a, b) =>
                              new Date(a.at).getTime() -
                              new Date(b.at).getTime()
                          )
                          .map((r) => (
                            <li key={r.id}>
                              {formatDateTime(r.at)} · 回流{" "}
                              {formatNum(r.returned)}m³
                            </li>
                          ))}
                      </ul>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
