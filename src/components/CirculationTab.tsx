import { useMemo, useState } from "react";
import type { CirculationRecord, Shift } from "../types";
import {
  SHIFT_LABEL,
  calcConsumption,
  formatDateTime,
  formatNum,
  nowLocalInput,
} from "../lib/domain";

const EMPTY = {
  holeId: "",
  depth: "",
  tankRemaining: "",
  injected: "",
  returned: "",
  observedAt: nowLocalInput(),
};

export function CirculationTab({
  records,
  lockedHoles,
  onAdd,
}: {
  records: CirculationRecord[];
  lockedHoles: Set<string>;
  onAdd: (
    rec: Omit<CirculationRecord, "id" | "createdAt" | "consumption">
  ) => void;
}) {
  const [shift, setShift] = useState<Shift>("day");
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [holeFilter, setHoleFilter] = useState<string>("__all__");

  const holes = useMemo(
    () => Array.from(new Set(records.map((r) => r.holeId))).sort(),
    [records]
  );

  const prevOfHole = useMemo(() => {
    const map = new Map<string, CirculationRecord>();
    for (const r of records) {
      const cur = map.get(r.holeId);
      if (
        !cur ||
        new Date(r.observedAt).getTime() > new Date(cur.observedAt).getTime()
      )
        map.set(r.holeId, r);
    }
    return map;
  }, [records]);

  const livePreview = (() => {
    const holeId = form.holeId.trim();
    const prev = prevOfHole.get(holeId);
    if (!prev) return null;
    const injected = Number(form.injected);
    const returned = Number(form.returned);
    const tank = Number(form.tankRemaining);
    if ([injected, returned, tank].some((n) => Number.isNaN(n))) return null;
    return {
      prev,
      consumption: calcConsumption(
        { injected, returned, tankRemaining: tank },
        prev
      ),
    };
  })();

  const submit = () => {
    const holeId = form.holeId.trim();
    const depth = Number(form.depth);
    const tankRemaining = Number(form.tankRemaining);
    const injected = Number(form.injected);
    const returned = Number(form.returned);
    if (!holeId) return setError("请填写孔号");
    if (!Number.isFinite(depth) || depth < 0) return setError("请填写正确的当前孔深（m）");
    if (!Number.isFinite(tankRemaining) || tankRemaining < 0)
      return setError("请填写正确的罐余量（m³）");
    if (!Number.isFinite(injected) || injected < 0)
      return setError("请填写正确的注入量（m³）");
    if (!Number.isFinite(returned) || returned < 0)
      return setError("请填写正确的回流量（m³）");
    if (!form.observedAt) return setError("请选择观测时刻");

    if (lockedHoles.has(holeId)) {
      setError(
        `${holeId} 处于漏失锁定状态，须先在“待处理”中完成封堵登记并解锁后才能继续登记本班`
      );
      return;
    }

    onAdd({
      holeId,
      depth,
      shift,
      observedAt: form.observedAt,
      tankRemaining,
      injected,
      returned,
    });
    setForm({ ...EMPTY, observedAt: nowLocalInput() });
    setError("");
  };

  const visible = useMemo(() => {
    const list =
      holeFilter === "__all__"
        ? records
        : records.filter((r) => r.holeId === holeFilter);
    return [...list].sort(
      (a, b) =>
        new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime()
    );
  }, [records, holeFilter]);

  const set = (k: keyof typeof EMPTY) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="tab-grid">
      <section className="panel entry-panel">
        <div className="section-heading">
          <div>
            <p>班次登记</p>
            <h2>循环量录入</h2>
          </div>
        </div>

        <div className="shift-toggle" role="radiogroup" aria-label="班次">
          {(["day", "night"] as Shift[]).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={shift === s}
              className={shift === s ? "active" : ""}
              onClick={() => setShift(s)}
              type="button"
            >
              {SHIFT_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="field-grid">
          <label>
            <span>孔号 *</span>
            <input
              list="hole-options"
              placeholder="如 ZK-18"
              value={form.holeId}
              onChange={set("holeId")}
            />
            <datalist id="hole-options">
              {holes.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </label>
          <label>
            <span>当前深度 (m) *</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.depth}
              onChange={set("depth")}
            />
          </label>
          <label>
            <span>罐余量 (m³) *</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.tankRemaining}
              onChange={set("tankRemaining")}
            />
          </label>
          <label>
            <span>注入量 (m³) *</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.injected}
              onChange={set("injected")}
            />
          </label>
          <label>
            <span>回流量 (m³) *</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.returned}
              onChange={set("returned")}
            />
          </label>
          <label>
            <span>观测时刻 *</span>
            <input
              type="datetime-local"
              value={form.observedAt}
              onChange={set("observedAt")}
            />
          </label>
        </div>

        {livePreview ? (
          <div
            className={
              livePreview.prev.consumption !== undefined &&
              livePreview.consumption !== undefined &&
              livePreview.prev.consumption > 0 &&
              livePreview.consumption > livePreview.prev.consumption * 1.2
                ? "preview warn"
                : "preview"
            }
          >
            <span>
              本班预计实际消耗 = 注入 − 回流 +（上班罐余 − 本班罐余）
            </span>
            <strong>
              {formatNum(livePreview.consumption)} m³
              {livePreview.prev.consumption !== undefined
                ? `（前班 ${formatNum(livePreview.prev.consumption)} m³）`
                : ""}
            </strong>
          </div>
        ) : form.holeId.trim() ? (
          <p className="form-hint">
            {holes.includes(form.holeId.trim())
              ? "补全数值后显示本班预计消耗"
              : "新孔首班作为基准班，需下一班组才能对比实际消耗"}
          </p>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-action submit-btn" onClick={submit}>
          提交本班记录
        </button>
      </section>

      <section className="panel records-panel">
        <div className="section-heading">
          <div>
            <p>循环记录</p>
            <h2>班次台账</h2>
          </div>
          <select
            className="hole-select"
            value={holeFilter}
            onChange={(e) => setHoleFilter(e.target.value)}
            aria-label="按孔号筛选"
          >
            <option value="__all__">全部孔号</option>
            {holes.map((h) => (
              <option key={h} value={h}>
                {h}
                {lockedHoles.has(h) ? "（锁定）" : ""}
              </option>
            ))}
          </select>
        </div>

        {visible.length === 0 ? (
          <p className="empty-hint">
            暂无循环记录，先在左侧登记本班罐余量、注入量、回流量。
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>观测时刻</th>
                  <th>孔号</th>
                  <th>深度(m)</th>
                  <th>班次</th>
                  <th>罐余(m³)</th>
                  <th>注入(m³)</th>
                  <th>回流(m³)</th>
                  <th>实际消耗(m³)</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const locked = lockedHoles.has(r.holeId);
                  const prevRec = r.prevId
                    ? records.find((x) => x.id === r.prevId)
                    : undefined;
                  const diff =
                    r.alarm &&
                    r.consumption !== undefined &&
                    prevRec?.consumption !== undefined
                      ? r.consumption - prevRec.consumption
                      : null;
                  return (
                    <tr key={r.id} className={r.alarm ? "row-alarm" : ""}>
                      <td>{formatDateTime(r.observedAt)}</td>
                      <td>
                        {r.holeId}
                        {locked ? <span className="lock-tag">锁</span> : null}
                      </td>
                      <td>{formatNum(r.depth)}</td>
                      <td>{SHIFT_LABEL[r.shift]}</td>
                      <td>{formatNum(r.tankRemaining)}</td>
                      <td>{formatNum(r.injected)}</td>
                      <td>{formatNum(r.returned)}</td>
                      <td>
                        {r.firstInHole ? (
                          <span className="muted-cell">基准班</span>
                        ) : (
                          formatNum(r.consumption)
                        )}
                      </td>
                      <td>
                        {r.alarm ? (
                          <span className="badge badge-danger">
                            超两成 +{formatNum(diff)}
                          </span>
                        ) : (
                          <span className="badge badge-ok">正常</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="table-foot">
          实际消耗 = 注入量 − 回流量 +（上班罐余量 − 本班罐余量）；
          消耗高于前班两成（&gt;20%）自动转入“待处理”并锁定该孔。
        </p>
      </section>
    </div>
  );
}
