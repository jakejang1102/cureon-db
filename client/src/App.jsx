import { useState, useEffect, useCallback } from "react";
import { auth, tasksApi, getToken, setToken } from "./api.js";

/** 구분별 라벨 + 표시 색 (범례·월간 제목·카드 테두리) */
const CATEGORY_PALETTE = {
  sales: { label: "영업", fg: "#c2410c", bg: "#fff7ed", border: "#fdba74" },
  project: { label: "과제", fg: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd" },
  dev: { label: "개발", fg: "#15803d", bg: "#f0fdf4", border: "#86efac" },
  plan: { label: "기획", fg: "#b45309", bg: "#fffbeb", border: "#fcd34d" },
  meeting: { label: "회의", fg: "#6d28d9", bg: "#f5f3ff", border: "#c4b5fd" },
};

function catStyle(category) {
  return (
    CATEGORY_PALETTE[category] || {
      label: category || "-",
      fg: "#52525b",
      bg: "#f4f4f5",
      border: "#d4d4d8",
    }
  );
}

const STATUS_MAP = {
  not_started: "미착수",
  in_progress: "진행중",
  delayed: "지연",
  completed: "완료",
};

const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const getFirstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();
const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => {
  if (!d) return "-";
  return `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
};
const todayStr = () => {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTHS_KR = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
];

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const r = await auth.login(email, password);
        setToken(r.token);
        onAuthed(r.user);
      } else {
        if (!name.trim()) {
          setError("이름을 입력하세요.");
          setLoading(false);
          return;
        }
        const r = await auth.register(email, password, name);
        setToken(r.token);
        onAuthed(r.user);
      }
    } catch (err) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>수행관리</h1>
        <p>{mode === "login" ? "계정으로 로그인하세요." : "새 계정을 만듭니다."}</p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={submit}>
          {mode === "register" && (
            <div className="form-row">
              <label>이름</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required={mode === "register"}
              />
            </div>
          )}
          <div className="form-row">
            <label>이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="form-row">
            <label>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={loading}>
              {loading ? "처리 중…" : mode === "login" ? "로그인" : "가입"}
            </button>
          </div>
        </form>
        <div className="auth-toggle">
          {mode === "login" ? (
            <>
              계정이 없으신가요?{" "}
              <button type="button" onClick={() => { setMode("register"); setError(""); }}>
                회원가입
              </button>
            </>
          ) : (
            <>
              이미 계정이 있으신가요?{" "}
              <button type="button" onClick={() => { setMode("login"); setError(""); }}>
                로그인
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskFormModal({ title, initial, selectedDate, onClose, onSave }) {
  const empty = {
    title: "",
    category: "sales",
    startDate: selectedDate,
    endDate: selectedDate,
    partner: "",
    region: "",
    status: "not_started",
    progress: 0,
    managerName: "",
    managerPhone: "",
    managerEmail: "",
    teamDept: "",
    teamMembers: "",
  };
  const [form, setForm] = useState(() => {
    if (!initial) return empty;
    const m = initial.manager || {};
    const t = initial.team || {};
    return {
      title: initial.title || "",
      category: initial.category || "sales",
      startDate: initial.startDate || selectedDate,
      endDate: initial.endDate || selectedDate,
      partner: initial.partner || "",
      region: initial.region || "",
      status: initial.status || "not_started",
      progress: initial.progress ?? 0,
      managerName: m.name && m.name !== "-" ? m.name : "",
      managerPhone: m.phone && m.phone !== "-" ? m.phone : "",
      managerEmail: m.email && m.email !== "-" ? m.email : "",
      teamDept: t.dept && t.dept !== "-" ? t.dept : "",
      teamMembers: Array.isArray(t.members) ? t.members.join(", ") : "",
    };
  });
  const upd = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.title.trim()) return;
    const body = {
      title: form.title.trim(),
      category: form.category,
      startDate: form.startDate,
      endDate: form.endDate,
      partner: form.partner,
      region: form.region,
      status: form.status,
      progress: Number(form.progress) || 0,
      manager: {
        name: form.managerName || "-",
        phone: form.managerPhone || "-",
        email: form.managerEmail || "-",
      },
      team: {
        dept: form.teamDept || "-",
        members: form.teamMembers
          ? form.teamMembers.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      },
    };
    onSave(body);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>제목 *</label>
            <input
              value={form.title}
              onChange={(e) => upd("title", e.target.value)}
              placeholder="업무 제목"
            />
          </div>
          <div className="form-row">
            <label>진척률 (0~100%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={form.progress}
              onChange={(e) => upd("progress", e.target.value)}
              placeholder="0"
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-row">
              <label>구분</label>
              <select value={form.category} onChange={(e) => upd("category", e.target.value)}>
                {Object.entries(CATEGORY_PALETTE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>상태</label>
              <select value={form.status} onChange={(e) => upd("status", e.target.value)}>
                {Object.entries(STATUS_MAP).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>시작일</label>
              <input type="date" value={form.startDate} onChange={(e) => upd("startDate", e.target.value)} />
            </div>
            <div className="form-row">
              <label>종료일</label>
              <input type="date" value={form.endDate} onChange={(e) => upd("endDate", e.target.value)} />
            </div>
            <div className="form-row">
              <label>관계처</label>
              <input value={form.partner} onChange={(e) => upd("partner", e.target.value)} />
            </div>
            <div className="form-row">
              <label>지역</label>
              <input value={form.region} onChange={(e) => upd("region", e.target.value)} />
            </div>
          </div>
          <div className="modal-section" style={{ marginTop: 16 }}>
            <div className="modal-section-title">담당자</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-row">
                <label>이름</label>
                <input value={form.managerName} onChange={(e) => upd("managerName", e.target.value)} />
              </div>
              <div className="form-row">
                <label>연락처</label>
                <input value={form.managerPhone} onChange={(e) => upd("managerPhone", e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <label>이메일</label>
              <input value={form.managerEmail} onChange={(e) => upd("managerEmail", e.target.value)} />
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">수행</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-row">
                <label>부서</label>
                <input value={form.teamDept} onChange={(e) => upd("teamDept", e.target.value)} />
              </div>
              <div className="form-row">
                <label>담당자 (쉼표 구분)</label>
                <input
                  value={form.teamMembers}
                  onChange={(e) => upd("teamMembers", e.target.value)}
                  placeholder="홍길동, 김영희"
                />
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose}>
              취소
            </button>
            <button type="button" className="btn" onClick={handleSave}>
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskModal({
  task,
  currentUser,
  onClose,
  onUpdated,
  onOpenEdit,
  onDeleted,
}) {
  const [logContent, setLogContent] = useState("");
  const [editingLog, setEditingLog] = useState(null);
  const [editDraft, setEditDraft] = useState({ content: "", author: "", date: "" });
  const [progressDraft, setProgressDraft] = useState(task?.progress ?? 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setProgressDraft(task?.progress ?? 0);
  }, [task?.id, task?.progress]);

  if (!task) return null;

  const cs = catStyle(task.category);
  const catLabel = cs.label;
  const stLabel = STATUS_MAP[task.status] || task.status || "-";
  const mgr = task.manager || {};
  const tm = task.team || {};
  const logs = task.logs || [];

  const refresh = async () => {
    const list = await tasksApi.list();
    const t = list.find((x) => x.id === task.id);
    if (t) onUpdated(t);
  };

  const handleAddLog = async () => {
    if (!logContent.trim() || !currentUser?.name) return;
    setBusy(true);
    try {
      await tasksApi.addLog(task.id, {
        content: logContent.trim(),
        author: currentUser.name,
        date: todayStr(),
      });
      setLogContent("");
      await refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startEditLog = (log) => {
    setEditingLog(log.id);
    setEditDraft({
      content: log.content,
      author: log.author,
      date: log.date,
    });
  };

  const saveEditLog = async () => {
    if (!editingLog) return;
    setBusy(true);
    try {
      await tasksApi.updateLog(task.id, editingLog, {
        content: editDraft.content,
        author: editDraft.author,
        date: editDraft.date,
      });
      setEditingLog(null);
      await refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteLog = async (logId) => {
    if (!confirm("이 이력을 삭제할까요?")) return;
    setBusy(true);
    try {
      await tasksApi.removeLog(task.id, logId);
      await refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteTask = async () => {
    if (!confirm("이 업무를 삭제할까요? 이력도 함께 삭제됩니다.")) return;
    setBusy(true);
    try {
      await tasksApi.remove(task.id);
      onDeleted();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveProgress = async () => {
    const next = Math.max(0, Math.min(100, Number(progressDraft) || 0));
    setBusy(true);
    try {
      await tasksApi.update(task.id, { progress: next });
      setProgressDraft(next);
      await refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ marginBottom: 8 }}>
              <span
                className="badge"
                style={{
                  background: cs.bg,
                  color: cs.fg,
                  borderColor: cs.border,
                }}
              >
                {catLabel}
              </span>
              <span className="badge" style={{ marginLeft: 6 }}>
                {stLabel}
              </span>
            </div>
            <h2>{task.title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">기본 정보</div>
            <div className="modal-grid">
              <div className="modal-field">
                <label>기간</label>
                <span>
                  {fmtDate(task.startDate)} ~ {fmtDate(task.endDate)}
                </span>
              </div>
              <div className="modal-field">
                <label>관계처</label>
                <span>{task.partner || "-"}</span>
              </div>
              <div className="modal-field">
                <label>지역</label>
                <span>{task.region || "-"}</span>
              </div>
              <div className="modal-field">
                <label>구분</label>
                <span>{catLabel}</span>
              </div>
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">담당자</div>
            <div className="modal-grid">
              <div className="modal-field">
                <label>이름</label>
                <span>{mgr.name || "-"}</span>
              </div>
              <div className="modal-field">
                <label>연락처</label>
                <a href={`tel:${mgr.phone}`}>{mgr.phone || "-"}</a>
              </div>
              <div className="modal-field" style={{ gridColumn: "1 / -1" }}>
                <label>이메일</label>
                <a href={`mailto:${mgr.email}`}>{mgr.email || "-"}</a>
              </div>
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">수행</div>
            <div className="modal-grid">
              <div className="modal-field">
                <label>부서</label>
                <span>{tm.dept || "-"}</span>
              </div>
              <div className="modal-field">
                <label>담당자</label>
                <div className="team-members">
                  {(tm.members || []).map((m, i) => (
                    <span key={i} className="team-chip">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">진척률</div>
            <div className="progress-bar-bg">
              <div
                className="progress-bar-fill"
                style={{ width: `${task.progress || 0}%`, background: cs.fg }}
              />
            </div>
            <div className="progress-label">{task.progress || 0}%</div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <input
                type="number"
                min={0}
                max={100}
                value={progressDraft}
                onChange={(e) => setProgressDraft(e.target.value)}
                style={{ width: 110 }}
              />
              <button type="button" className="btn" onClick={saveProgress} disabled={busy}>
                진척률 저장
              </button>
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">이력</div>
            {logs.length > 0 ? (
              <table className="log-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>No</th>
                    <th>내용</th>
                    <th>일자</th>
                    <th>작성자</th>
                    <th style={{ width: 100 }} />
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) =>
                    editingLog === log.id ? (
                      <tr key={log.id}>
                        <td>{i + 1}</td>
                        <td colSpan={4}>
                          <div style={{ display: "grid", gap: 8 }}>
                            <textarea
                              value={editDraft.content}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, content: e.target.value }))
                              }
                              rows={2}
                              style={{ width: "100%" }}
                            />
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <input
                                type="date"
                                value={editDraft.date}
                                onChange={(e) =>
                                  setEditDraft((d) => ({ ...d, date: e.target.value }))
                                }
                              />
                              <input
                                placeholder="작성자"
                                value={editDraft.author}
                                onChange={(e) =>
                                  setEditDraft((d) => ({ ...d, author: e.target.value }))
                                }
                              />
                              <button type="button" className="btn" onClick={saveEditLog} disabled={busy}>
                                저장
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => setEditingLog(null)}
                                disabled={busy}
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={log.id}>
                        <td>{i + 1}</td>
                        <td>{log.content}</td>
                        <td className="log-date">{fmtDate(log.date)}</td>
                        <td>{log.author}</td>
                        <td>
                          <div className="log-actions">
                            <button type="button" onClick={() => startEditLog(log)}>
                              수정
                            </button>
                            <button type="button" className="danger" onClick={() => deleteLog(log.id)}>
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>등록된 이력이 없습니다.</div>
            )}
            <div className="add-log-row">
              <textarea
                placeholder="내용"
                value={logContent}
                onChange={(e) => setLogContent(e.target.value)}
              />
              <div className="add-log-meta">
                작성자 <strong>{currentUser?.name ?? "-"}</strong>
              </div>
              <button type="button" className="add-log-btn" onClick={handleAddLog} disabled={busy}>
                등록
              </button>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => onOpenEdit(task)} disabled={busy}>
              업무 수정
            </button>
            <button type="button" className="btn danger" onClick={deleteTask} disabled={busy}>
              업무 삭제
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 수정 이력 빨간 점 표시 컴포넌트 ── */
function HistoryBadge({ histories }) {
  if (!histories || histories.length === 0) return null;
  const now = new Date();
  const recent = histories.filter((log) => {
    const diff = (now - new Date(log.date)) / (1000 * 60 * 60 * 24);
    return diff <= 1;
  });
  if (recent.length === 0) return null;
  return (
    <span
      className="history-badge"
      title={`최근 수정 ${recent.length}건`}
    />
  );
}

export default function App() {
  const today = new Date();
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [day, setDay] = useState(today.getDate());
  const [view, setView] = useState("month");
  const [selectedTask, setSelectedTask] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [calendarOnly] = useState(
    () => new URLSearchParams(window.location.search).get("calendar") === "1"
  );

  const loadTasks = useCallback(async () => {
    const list = await tasksApi.list();
    setTasks(list);
  }, []);

  useEffect(() => {
    (async () => {
      if (!getToken()) {
        setBooting(false);
        return;
      }
      try {
        const u = await auth.me();
        setUser(u);
        await loadTasks();
      } catch {
        setUser(null);
      } finally {
        setBooting(false);
      }
    })();
  }, [loadTasks]);

  useEffect(() => {
    if (calendarOnly) setView("month");
  }, [calendarOnly]);

  const openCalendarWindow = () => {
    const u = new URL(window.location.href);
    u.searchParams.set("calendar", "1");
    window.open(u.toString(), "_blank", "noopener,noreferrer,width=1280,height=900");
  };

  const goToMainApp = () => {
    const u = new URL(window.location.href);
    u.searchParams.delete("calendar");
    window.location.href = `${u.pathname}${u.search}`;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTasks([]);
    setSelectedTask(null);
  };

  const getTasksForDate = (y, m, d) => {
    const ds = `${y}-${pad(m + 1)}-${pad(d)}`;
    return tasks.filter((t) => t.startDate <= ds && t.endDate >= ds);
  };

  const getTasksForMonth = (y, m) => {
    const s = `${y}-${pad(m + 1)}-01`;
    const e = `${y}-${pad(m + 1)}-${pad(getDaysInMonth(y, m))}`;
    return tasks.filter((t) => t.startDate <= e && t.endDate >= s);
  };

  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setDay(today.getDate());
  };

  const navigate = (dir) => {
    if (view === "year") setYear((y) => y + dir);
    else if (view === "month") {
      const d = new Date(year, month + dir, 1);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    } else {
      const d = new Date(year, month, day + dir);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setDay(d.getDate());
    }
  };

  const navTitle =
    view === "year"
      ? `${year}년`
      : view === "month"
        ? `${year}년 ${MONTHS_KR[month]}`
        : `${year}년 ${month + 1}월 ${day}일 (${WEEKDAYS[new Date(year, month, day).getDay()]})`;

  const selectedDateStr = `${year}-${pad(month + 1)}-${pad(day)}`;

  const handleAddSave = async (body) => {
    try {
      const created = await tasksApi.create(body);
      await loadTasks();
      setShowAddModal(false);
      setSelectedTask(created);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleEditSave = async (body) => {
    if (!editTask) return;
    try {
      const updated = await tasksApi.update(editTask.id, body);
      await loadTasks();
      setEditTask(null);
      setSelectedTask(updated);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleCellClick = (cellDay, cellMonth, cellYear) => {
    setDay(cellDay);
    setMonth(cellMonth);
    setYear(cellYear);
    setView("day");
  };

  if (booting) {
    return (
      <div className="app">
        <p style={{ color: "var(--muted)", padding: 24 }}>불러오는 중…</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthed={(u) => { setUser(u); loadTasks(); }} />;
  }

  const YearView = () => (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, mi) => {
        const days = getDaysInMonth(year, mi);
        const first = getFirstDayOfMonth(year, mi);
        const mTasks = getTasksForMonth(year, mi);
        return (
          <div
            key={mi}
            className="year-month-card"
            onClick={() => {
              setMonth(mi);
              setView("month");
            }}
          >
            <div className="year-month-title">{MONTHS_KR[mi]}</div>
            <div className="year-mini-grid">
              {WEEKDAYS.map((w) => (
                <div key={w} style={{ fontWeight: 600, color: "var(--muted)", fontSize: 9 }}>
                  {w}
                </div>
              ))}
              {Array.from({ length: first }, (_, i) => (
                <div key={`e${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const d = i + 1;
                const isToday =
                  year === today.getFullYear() &&
                  mi === today.getMonth() &&
                  d === today.getDate();
                const has = getTasksForDate(year, mi, d).length > 0;
                return (
                  <div
                    key={d}
                    className={`year-mini-day${isToday ? " today-mini" : ""}${has ? " has-task" : ""}`}
                  >
                    {d}
                  </div>
                );
              })}
            </div>
            <div className="year-task-dots">
              {mTasks.slice(0, 16).map((t) => (
                <div
                  key={t.id}
                  className="year-task-dot"
                  style={{ background: catStyle(t.category).fg }}
                  title={t.title}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  const MonthView = () => {
    const days = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const prevMonthDate = new Date(year, month - 1, 1);
    const prevDays = getDaysInMonth(prevMonthDate.getFullYear(), prevMonthDate.getMonth());
    const totalCells = Math.ceil((firstDay + days) / 7) * 7;
    return (
      <>
        <div className="cal-header">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-header-cell">
              {w}
            </div>
          ))}
        </div>
        <div className="cal-grid">
          {Array.from({ length: totalCells }, (_, i) => {
            let d;
            let cm;
            let cy;
            let isOther = false;
            if (i < firstDay) {
              const prev = new Date(year, month - 1, 1);
              cm = prev.getMonth();
              cy = prev.getFullYear();
              d = prevDays - firstDay + i + 1;
              isOther = true;
            } else if (i >= firstDay + days) {
              const next = new Date(year, month + 1, 1);
              cm = next.getMonth();
              cy = next.getFullYear();
              d = i - firstDay - days + 1;
              isOther = true;
            } else {
              d = i - firstDay + 1;
              cm = month;
              cy = year;
            }
            const isToday =
              !isOther &&
              cy === today.getFullYear() &&
              cm === today.getMonth() &&
              d === today.getDate();
            const dayTasks = getTasksForDate(cy, cm, d);
            return (
              <div
                key={i}
                className={`cal-cell${isOther ? " other-month" : ""}${isToday ? " today" : ""}`}
                onClick={() => handleCellClick(d, cm, cy)}
              >
                <div className="cal-date">{d}</div>
                {dayTasks.slice(0, 3).map((t) => {
                  const cs = catStyle(t.category);
                  const tHistory = t.logs || [];
                  return (
                    <div
                      key={t.id}
                      className="cal-task"
                      style={{
                        background: cs.bg,
                        color: cs.fg,
                        borderColor: cs.border,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTask(t);
                      }}
                    >
                      <span className="cal-task-title">{t.title}</span>
                      <HistoryBadge histories={tHistory} />
                    </div>
                  );
                })}
                {dayTasks.length > 3 && (
                  <div className="cal-more">+{dayTasks.length - 3}건</div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  const DayView = () => {
    const dayTasks = getTasksForDate(year, month, day);
    if (!dayTasks.length) {
      return <div className="day-empty">이 날짜에 등록된 업무가 없습니다.</div>;
    }
    return (
      <div className="day-view">
        {dayTasks.map((t) => {
          const cs = catStyle(t.category);
          const catLabel = cs.label;
          const stLabel = STATUS_MAP[t.status] || t.status;
          const mgr = t.manager || {};
          return (
            <div
              key={t.id}
              className="day-task-card"
              style={{ borderLeftColor: cs.fg }}
              onClick={() => setSelectedTask(t)}
            >
              <div className="day-task-info">
                <h3>{t.title}</h3>
                <div className="day-task-meta">
                  <span>{t.region || "-"}</span>
                  <span>{mgr.name || "-"}</span>
                  <span>
                    {fmtDate(t.startDate)} ~ {fmtDate(t.endDate)}
                  </span>
                </div>
              </div>
              <span
                className="badge"
                style={{
                  background: cs.bg,
                  color: cs.fg,
                  borderColor: cs.border,
                }}
              >
                {catLabel}
              </span>
              <span className="badge">{stLabel}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="app">
        <div className="header">
          <div>
            <h1>{calendarOnly ? "달력" : "수행관리"}</h1>
            <div className="header-sub">
              {calendarOnly ? "새 창에서 연 달력 화면입니다." : "일정 · 업무 · 이력"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div className="view-tabs">
              {[
                ["year", "연간"],
                ["month", "월간"],
                ["day", "일간"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  className={`view-tab${view === k ? " active" : ""}`}
                  onClick={() => setView(k)}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="user-bar">
              <span>{user.name}</span>
              <button type="button" className="btn-text" onClick={logout}>
                로그아웃
              </button>
            </div>
          </div>
        </div>

        <div className="nav-bar">
          <div className="nav-arrows">
            <button type="button" onClick={() => navigate(-1)}>
              ◀
            </button>
            <span className="nav-title">{navTitle}</span>
            <button type="button" onClick={() => navigate(1)}>
              ▶
            </button>
          </div>
          <div className="nav-actions">
            {!calendarOnly && (
              <button type="button" className="today-btn" onClick={openCalendarWindow}>
                달력 새 창
              </button>
            )}
            <button type="button" className="today-btn" onClick={goToday}>
              오늘
            </button>
            {calendarOnly && (
              <button type="button" className="today-btn" onClick={goToMainApp}>
                메인 화면
              </button>
            )}
          </div>
        </div>

        <div className="legend">
          {Object.entries(CATEGORY_PALETTE).map(([k, v]) => (
            <div key={k} className="legend-item">
              <span
                className="legend-swatch"
                style={{ background: v.bg, borderColor: v.border }}
              />
              <span>{v.label}</span>
            </div>
          ))}
          <div className="legend-item">
    <span
      className="legend-swatch"
      style={{ background: "#E24B4A", borderColor: "#E24B4A", borderRadius: "50%" }}
    />
    <span>수정됨 (24시간 활성화)</span>
  </div>
</div>
        </div>

        {view === "year" && <YearView />}
        {view === "month" && <MonthView />}
        {view === "day" && <DayView />}

        <button type="button" className="fab" onClick={() => setShowAddModal(true)} title="새 업무">
          +
        </button>
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          currentUser={user}
          onClose={() => setSelectedTask(null)}
          onUpdated={setSelectedTask}
          onOpenEdit={(t) => {
            setSelectedTask(null);
            setEditTask(t);
          }}
          onDeleted={() => {
            setSelectedTask(null);
            loadTasks();
          }}
        />
      )}

      {showAddModal && (
        <TaskFormModal
          key="new-task"
          title="새 업무"
          selectedDate={selectedDateStr}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddSave}
        />
      )}

      {editTask && (
        <TaskFormModal
          key={editTask.id}
          title="업무 수정"
          initial={editTask}
          selectedDate={selectedDateStr}
          onClose={() => setEditTask(null)}
          onSave={handleEditSave}
        />
      )}
    </>
  );
}
