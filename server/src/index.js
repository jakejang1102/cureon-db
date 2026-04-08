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
  const row = await prisma.task.update({
    where: { id: req.params.id },
    data: {
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
    },
    include: { logs: { orderBy: { id: "asc" } } },
  });
  res.json(taskToClient(row));
});

app.delete("/api/tasks/:id", authMiddleware, async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "업무를 찾을 수 없습니다." });
  }
});

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
