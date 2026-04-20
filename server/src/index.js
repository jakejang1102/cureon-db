import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;

const app = express();
app.use(
  cors({
    origin: CLIENT_ORIGIN || true,
    credentials: true,
  })
);
app.use(express.json());

// ── 신규: 필드 한글 라벨 매핑 ──
const FIELD_LABELS = {
  title: "제목",
  category: "구분",
  startDate: "시작일",
  endDate: "종료일",
  partner: "관계처",
  region: "지역",
  status: "상태",
  progress: "진척률",
  managerName: "담당자명",
  managerPhone: "담당자 연락처",
  managerEmail: "담당자 이메일",
  teamDept: "부서",
  teamMembers: "담당자 목록",
};

// ── 신규: 변경 감지 + 이력 저장 함수 ──
async function recordChanges(taskId, oldData, newData, userName) {
  const tracked = Object.keys(FIELD_LABELS);
  const changes = [];
  for (const field of tracked) {
    const ov = String(oldData[field] ?? "");
    const nv = String(newData[field] ?? oldData[field] ?? "");
    if (newData[field] !== undefined && ov !== nv) {
      changes.push({
        taskId,
        action: "update",
        field,
        oldValue: ov,
        newValue: nv,
        userName,
      });
    }
  }
  if (changes.length > 0) {
    await prisma.taskHistory.createMany({ data: changes });
  }
  return changes;
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "로그인이 필요합니다." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "세션이 만료되었거나 유효하지 않습니다." });
  }
}

// ── 신규: 요청에서 사용자 이름 가져오기 ──
async function getUserName(req) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { name: true },
    });
    return user?.name || req.user.email || "알 수 없음";
  } catch {
    return req.user.email || "알 수 없음";
  }
}

function taskToClient(t) {
  let members = [];
  try {
    members = JSON.parse(t.teamMembers || "[]");
  } catch {
    members = [];
  }
  return {
    id: t.id,
    title: t.title,
    category: t.category,
    startDate: t.startDate,
    endDate: t.endDate,
    partner: t.partner || "",
    region: t.region || "",
    status: t.status,
    progress: t.progress,
    manager: {
      name: t.managerName || "-",
      phone: t.managerPhone || "-",
      email: t.managerEmail || "-",
    },
    team: {
      dept: t.teamDept || "-",
      members,
    },
    logs: (t.logs || []).map((l) => ({
      id: l.id,
      content: l.content,
      date: l.date,
      author: l.author,
    })),
  };
}

// ────────────────────────────────
// AUTH
// ────────────────────────────────

app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name)
    return res.status(400).json({ error: "이메일, 비밀번호, 이름을 입력하세요." });
  const exists = await prisma.user.findUnique({ where: { email: String(email) } });
  if (exists) return res.status(409).json({ error: "이미 등록된 이메일입니다." });
  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = await prisma.user.create({
    data: {
      email: String(email).trim().toLowerCase(),
      passwordHash,
      name: String(name).trim(),
    },
  });
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "이메일과 비밀번호를 입력하세요." });
  const user = await prisma.user.findUnique({
    where: { email: String(email).trim().toLowerCase() },
  });
  if (!user || !(await bcrypt.compare(String(password), user.passwordHash)))
    return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, email: true, name: true },
  });
  if (!user) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
  res.json(user);
});

// ────────────────────────────────
// TASKS
// ────────────────────────────────

app.get("/api/tasks", authMiddleware, async (req, res) => {
  const rows = await prisma.task.findMany({
    orderBy: { startDate: "asc" },
    include: { logs: { orderBy: { id: "asc" } } },
  });
  res.json(rows.map(taskToClient));
});

app.get("/api/tasks/:id", authMiddleware, async (req, res) => {
  const t = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { logs: { orderBy: { id: "asc" } } },
  });
  if (!t) return res.status(404).json({ error: "업무를 찾을 수 없습니다." });
  res.json(taskToClient(t));
});

app.post("/api/tasks", authMiddleware, async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.startDate || !b.endDate)
    return res.status(400).json({ error: "제목, 시작일, 종료일은 필수입니다." });
  const members = Array.isArray(b.team?.members)
    ? b.team.members
    : typeof b.teamMembers === "string"
      ? b.teamMembers.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  const mgr = b.manager || {};
  const team = b.team || {};
  const row = await prisma.task.create({
    data: {
      title: String(b.title),
      category: String(b.category || "sales"),
      startDate: String(b.startDate),
      endDate: String(b.endDate),
      partner: String(b.partner || ""),
      region: String(b.region || ""),
      status: String(b.status || "not_started"),
      progress: Number(b.progress) || 0,
      managerName: String(mgr.name ?? b.managerName ?? ""),
      managerPhone: String(mgr.phone ?? b.managerPhone ?? ""),
      managerEmail: String(mgr.email ?? b.managerEmail ?? ""),
      teamDept: String(team.dept ?? b.teamDept ?? ""),
      teamMembers: JSON.stringify(members),
    },
    include: { logs: true },
  });

  // ── 신규: 생성 이력 기록 ──
  const userName = await getUserName(req);
  await prisma.taskHistory.create({
    data: {
      taskId: row.id,
      action: "create",
      field: "all",
      oldValue: "",
      newValue: row.title,
      userName,
    },
  });

  res.status(201).json(taskToClient(row));
});

app.put("/api/tasks/:id", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "업무를 찾을 수 없습니다." });
  let members = undefined;
  if (b.team?.members != null) {
    members = JSON.stringify(Array.isArray(b.team.members) ? b.team.members : []);
  } else if (b.teamMembers != null) {
    members =
      typeof b.teamMembers === "string"
        ? JSON.stringify(
            b.teamMembers.split(",").map((s) => s.trim()).filter(Boolean)
          )
        : JSON.stringify(b.teamMembers);
  }
  const mgr = b.manager;
  const team = b.team;

  const updateData = {
    ...(b.title != null && { title: String(b.title) }),
    ...(b.category != null && { category: String(b.category) }),
    ...(b.startDate != null && { startDate: String(b.startDate) }),
    ...(b.endDate != null && { endDate: String(b.endDate) }),
    ...(b.partner != null && { partner: String(b.partner) }),
    ...(b.region != null && { region: String(b.region) }),
    ...(b.status != null && { status: String(b.status) }),
    ...(b.progress != null && { progress: Number(b.progress) || 0 }),
    ...(mgr && {
      managerName: mgr.name != null ? String(mgr.name) : undefined,
      managerPhone: mgr.phone != null ? String(mgr.phone) : undefined,
      managerEmail: mgr.email != null ? String(mgr.email) : undefined,
    }),
    ...(team && {
      teamDept: team.dept != null ? String(team.dept) : undefined,
    }),
    ...(members != null && { teamMembers: members }),
  };

  // ── 신규: 변경 이력 자동 기록 ──
  const userName = await getUserName(req);
  await recordChanges(req.params.id, existing, updateData, userName);

  const row = await prisma.task.update({
    where: { id: req.params.id },
    data: updateData,
    include: { logs: { orderBy: { id: "asc" } } },
  });
  res.json(taskToClient(row));
});

app.delete("/api/tasks/:id", authMiddleware, async (req, res) => {
  try {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });

    // ── 신규: 삭제 이력 기록 ──
    if (existing) {
      const userName = await getUserName(req);
      await prisma.taskHistory.create({
        data: {
          taskId: req.params.id,
          action: "delete",
          field: "all",
          oldValue: existing.title,
          newValue: "",
          userName,
        },
      });
    }

    await prisma.task.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "업무를 찾을 수 없습니다." });
  }
});

// ────────────────────────────────
// 신규: 수정 이력 API
// ────────────────────────────────

// 특정 업무의 이력 조회
app.get("/api/tasks/:id/history", authMiddleware, async (req, res) => {
  const rows = await prisma.taskHistory.findMany({
    where: { taskId: req.params.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      action: r.action,
      field: r.field,
      fieldLabel: FIELD_LABELS[r.field] || r.field,
      oldValue: r.oldValue,
      newValue: r.newValue,
      userName: r.userName,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

// 전체 이력 조회 (월간 뷰용, 최근 N건)
app.get("/api/history", authMiddleware, async (req, res) => {
  const { since, until } = req.query;
  const where = {};
  if (since || until) {
    where.createdAt = {};
    if (since) where.createdAt.gte = new Date(since);
    if (until) where.createdAt.lte = new Date(until);
  }
  const rows = await prisma.taskHistory.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      action: r.action,
      field: r.field,
      fieldLabel: FIELD_LABELS[r.field] || r.field,
      oldValue: r.oldValue,
      newValue: r.newValue,
      userName: r.userName,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

// ────────────────────────────────
// TASK LOGS (기존 유지)
// ────────────────────────────────

app.post("/api/tasks/:id/logs", authMiddleware, async (req, res) => {
  const b = req.body || {};
  if (!b.content || !b.author)
    return res.status(400).json({ error: "내용과 작성자를 입력하세요." });
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) return res.status(404).json({ error: "업무를 찾을 수 없습니다." });
  const log = await prisma.taskLog.create({
    data: {
      taskId: req.params.id,
      content: String(b.content),
      author: String(b.author),
      date: String(b.date || new Date().toISOString().slice(0, 10)),
    },
  });
  res.status(201).json({
    id: log.id,
    content: log.content,
    date: log.date,
    author: log.author,
  });
});

app.put("/api/tasks/:taskId/logs/:logId", authMiddleware, async (req, res) => {
  const logId = parseInt(req.params.logId, 10);
  if (Number.isNaN(logId)) return res.status(400).json({ error: "잘못된 로그 ID입니다." });
  const b = req.body || {};
  const log = await prisma.taskLog.findFirst({
    where: { id: logId, taskId: req.params.taskId },
  });
  if (!log) return res.status(404).json({ error: "이력을 찾을 수 없습니다." });
  const updated = await prisma.taskLog.update({
    where: { id: logId },
    data: {
      ...(b.content != null && { content: String(b.content) }),
      ...(b.author != null && { author: String(b.author) }),
      ...(b.date != null && { date: String(b.date) }),
    },
  });
  res.json({
    id: updated.id,
    content: updated.content,
    date: updated.date,
    author: updated.author,
  });
});

app.delete("/api/tasks/:taskId/logs/:logId", authMiddleware, async (req, res) => {
  const logId = parseInt(req.params.logId, 10);
  if (Number.isNaN(logId)) return res.status(400).json({ error: "잘못된 로그 ID입니다." });
  const log = await prisma.taskLog.findFirst({
    where: { id: logId, taskId: req.params.taskId },
  });
  if (!log) return res.status(404).json({ error: "이력을 찾을 수 없습니다." });
  await prisma.taskLog.delete({ where: { id: logId } });
  res.status(204).send();
});

// ────────────────────────────────
// STATIC / ERROR
// ────────────────────────────────

const staticDir = path.join(__dirname, "..", "..", "client", "dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(staticDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(staticDir, "index.html"), (err) => {
      if (err) next();
    });
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "서버 오류가 발생했습니다." });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
