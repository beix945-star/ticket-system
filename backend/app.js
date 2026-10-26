import express from "express";
import { createHash, randomBytes } from "node:crypto";
import { addUser, checkPassword, hashPassword } from "./db.js";
const tokenHash = (value) => createHash("sha256").update(value).digest("hex");
const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
});
class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code, message) => {
  throw new ApiError(status, code, message);
};
function text(value, label, min, max) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    fail(400, "VALIDATION_ERROR", `${label}长度应为 ${min}–${max} 个字符`);
  return value.trim();
}
const fields = (body, allowed) => {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !allowed.includes(k))
  )
    fail(400, "VALIDATION_ERROR", "请求字段不正确");
};
const integer = (v, min, max, label) => {
  if (
    !/^\d+$/.test(String(v)) ||
    !Number.isSafeInteger(Number(v)) ||
    Number(v) < min ||
    Number(v) > max
  )
    fail(400, "VALIDATION_ERROR", `${label}不正确`);
  return Number(v);
};
const select = `SELECT t.*, u.name AS owner_name, a.name AS assignee_name FROM tickets t JOIN users u ON u.id=t.owner_id LEFT JOIN users a ON a.id=t.assignee_id`;
export function createApp(db, { secureCookie = false, authLimit = 20 } = {}) {
  const app = express();
  app.disable("x-powered-by");
  const attempts = new Map();
  const dummyPassword = hashPassword("dummy-password");
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "same-origin");
    next();
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("X-Requested-With") !== "TicketApp"
    )
      return next(new ApiError(403, "CSRF_REJECTED", "请求来源验证失败"));
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookie,
    path: "/api",
    maxAge: 8 * 60 * 60 * 1000,
  };
  function session(req) {
    const raw = (req.headers.cookie ?? "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("ticket_session="))
      ?.slice(15);
    return raw && /^[a-f0-9]{64}$/.test(raw) ? tokenHash(raw) : null;
  }
  function login(res, user) {
    db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
    const raw = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)").run(
      tokenHash(raw),
      user.id,
      Date.now() + cookieOptions.maxAge,
    );
    res.cookie("ticket_session", raw, cookieOptions);
    res.json({ user: publicUser(user) });
  }
  const throttle = (req, res, next) => {
    const now = Date.now();
    for (const [key, record] of attempts)
      if (record.until < now) attempts.delete(key);
    const key = req.ip;
    const record = attempts.get(key) ?? { count: 0, until: now + 60000 };
    record.count++;
    attempts.set(key, record);
    if (record.count > authLimit) {
      res.set("Retry-After", "60");
      return next(
        new ApiError(429, "RATE_LIMITED", "请求过于频繁，请一分钟后重试"),
      );
    }
    next();
  };
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.post("/api/auth/register", throttle, (req, res) => {
    fields(req.body, ["username", "name", "password"]);
    const username = text(req.body.username, "用户名", 3, 24).toLowerCase();
    if (!/^[a-z0-9_]+$/.test(username))
      fail(400, "VALIDATION_ERROR", "用户名只允许字母、数字和下划线");
    const name = text(req.body.name, "姓名", 1, 40);
    const password = text(req.body.password, "密码", 8, 128);
    if (db.prepare("SELECT id FROM users WHERE username=?").get(username))
      fail(409, "USERNAME_EXISTS", "用户名已存在");
    const id = addUser(db, username, password, name);
    res.status(201);
    login(res, db.prepare("SELECT * FROM users WHERE id=?").get(id));
  });
  app.post("/api/auth/login", throttle, (req, res) => {
    fields(req.body, ["username", "password"]);
    const username = text(req.body.username, "用户名", 3, 24).toLowerCase();
    const password = text(req.body.password, "密码", 1, 128);
    const user = db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(username);
    const valid = checkPassword(password, user?.password ?? dummyPassword);
    if (!user || !valid) fail(401, "INVALID_CREDENTIALS", "用户名或密码不正确");
    const previous = session(req);
    if (previous)
      db.prepare("DELETE FROM sessions WHERE token=?").run(previous);
    login(res, user);
  });
  app.use("/api", (req, res, next) => {
    const user = db
      .prepare(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
      )
      .get(session(req) ?? "", Date.now());
    if (!user) return next(new ApiError(401, "UNAUTHENTICATED", "请先登录"));
    req.user = publicUser(user);
    next();
  });
  app.get("/api/auth/me", (req, res) => res.json({ user: req.user }));
  app.post("/api/auth/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(session(req));
    res.clearCookie("ticket_session", {
      httpOnly: true,
      sameSite: "strict",
      secure: secureCookie,
      path: "/api",
    });
    res.status(204).end();
  });
  const admin = (req) => {
    if (req.user.role !== "admin") fail(403, "FORBIDDEN", "需要管理员权限");
  };
  function visible(req, id) {
    id = integer(id, 1, Number.MAX_SAFE_INTEGER, "工单编号");
    const ticket = db.prepare(`${select} WHERE t.id=?`).get(id);
    if (
      !ticket ||
      (req.user.role !== "admin" && ticket.owner_id !== req.user.id)
    )
      fail(404, "NOT_FOUND", "工单不存在或无权访问");
    return ticket;
  }
  const event = (id, user, action) =>
    db
      .prepare(
        "INSERT INTO events(ticket_id,user_id,action,created_at) VALUES(?,?,?,?)",
      )
      .run(id, user, action, new Date().toISOString());
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  app.get("/api/users/assignees", (req, res) => {
    admin(req);
    res.json({
      users: db
        .prepare("SELECT id,name FROM users WHERE role='admin' ORDER BY id")
        .all(),
    });
  });
  app.get("/api/stats", (req, res) => {
    const rows =
      req.user.role === "admin"
        ? db
            .prepare(
              "SELECT status,COUNT(*) AS count FROM tickets GROUP BY status",
            )
            .all()
        : db
            .prepare(
              "SELECT status,COUNT(*) AS count FROM tickets WHERE owner_id=? GROUP BY status",
            )
            .all(req.user.id);
    const stats = { pending: 0, processing: 0, completed: 0 };
    for (const r of rows) stats[r.status] = r.count;
    res.json({ stats });
  });
  app.get("/api/tickets", (req, res) => {
    const page = integer(req.query.page ?? 1, 1, 100000, "页码"),
      pageSize = integer(req.query.pageSize ?? 9, 1, 50, "每页数量");
    const where = [],
      params = [];
    if (req.user.role !== "admin") {
      where.push("t.owner_id=?");
      params.push(req.user.id);
    }
    if (req.query.status) {
      if (!["pending", "processing", "completed"].includes(req.query.status))
        fail(400, "VALIDATION_ERROR", "状态不正确");
      where.push("t.status=?");
      params.push(req.query.status);
    }
    if (req.query.q) {
      const q = text(req.query.q, "搜索词", 1, 100);
      where.push(
        "(instr(lower(t.title),lower(?))>0 OR instr(lower(t.description),lower(?))>0)",
      );
      params.push(q, q);
    }
    const clause = where.length ? " WHERE " + where.join(" AND ") : "";
    const total = db
      .prepare("SELECT COUNT(*) AS n FROM tickets t" + clause)
      .get(...params).n;
    const tickets = db
      .prepare(select + clause + " ORDER BY t.id DESC LIMIT ? OFFSET ?")
      .all(...params, pageSize, (page - 1) * pageSize);
    res.json({ tickets, total, page, pageSize });
  });
  app.post("/api/tickets", (req, res) => {
    fields(req.body, ["title", "description", "priority"]);
    const title = text(req.body.title, "标题", 1, 100),
      description = text(req.body.description, "描述", 1, 5000),
      priority = req.body.priority ?? "normal";
    if (!["low", "normal", "high"].includes(priority))
      fail(400, "VALIDATION_ERROR", "优先级不正确");
    const now = new Date().toISOString();
    const id = transaction(() => {
      const id = Number(
        db
          .prepare(
            "INSERT INTO tickets(title,description,priority,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?)",
          )
          .run(title, description, priority, req.user.id, now, now)
          .lastInsertRowid,
      );
      event(id, req.user.id, "创建工单");
      return id;
    });
    res.status(201).json({ ticket: visible(req, id) });
  });
  app.get("/api/tickets/:id", (req, res) => {
    const ticket = visible(req, req.params.id);
    const comments = db
      .prepare(
        "SELECT c.*,u.name AS author FROM comments c JOIN users u ON u.id=c.user_id WHERE ticket_id=? ORDER BY c.id",
      )
      .all(ticket.id);
    const events = db
      .prepare(
        "SELECT e.*,u.name AS author FROM events e JOIN users u ON u.id=e.user_id WHERE ticket_id=? ORDER BY e.id DESC",
      )
      .all(ticket.id);
    res.json({ ticket, comments, events });
  });
  app.patch("/api/tickets/:id", (req, res) => {
    const before = visible(req, req.params.id);
    fields(req.body, [
      "version",
      "title",
      "description",
      "priority",
      "status",
      "assignee_id",
    ]);
    const version = integer(
      req.body.version,
      1,
      Number.MAX_SAFE_INTEGER,
      "版本号",
    );
    if (version !== before.version)
      fail(409, "VERSION_CONFLICT", "工单已更新，请重新打开后再操作");
    if (before.status === "completed")
      fail(409, "TICKET_CLOSED", "已完成的工单不能修改");
    const next = { ...before };
    const actions = [];
    for (const field of ["title", "description", "priority"])
      if (Object.hasOwn(req.body, field)) {
        if (req.user.role !== "admin" && before.status !== "pending")
          fail(403, "FORBIDDEN", "处理中工单只能由管理员修改");
        if (field === "priority") {
          if (!["low", "normal", "high"].includes(req.body[field]))
            fail(400, "VALIDATION_ERROR", "优先级不正确");
          next[field] = req.body[field];
        } else
          next[field] = text(
            req.body[field],
            field === "title" ? "标题" : "描述",
            1,
            field === "title" ? 100 : 5000,
          );
        if (next[field] !== before[field])
          actions.push(
            `更新${{ title: "标题", description: "描述", priority: "优先级" }[field]}`,
          );
      }
    if (Object.hasOwn(req.body, "assignee_id")) {
      admin(req);
      const id =
        req.body.assignee_id === null
          ? null
          : integer(req.body.assignee_id, 1, Number.MAX_SAFE_INTEGER, "处理人");
      if (
        id !== null &&
        !db.prepare("SELECT id FROM users WHERE id=? AND role='admin'").get(id)
      )
        fail(400, "VALIDATION_ERROR", "处理人必须是管理员");
      next.assignee_id = id;
      if (id !== before.assignee_id) actions.push("更新处理人");
    }
    if (Object.hasOwn(req.body, "status")) {
      admin(req);
      const expected = { pending: "processing", processing: "completed" }[
        before.status
      ];
      if (req.body.status !== expected)
        fail(
          409,
          "INVALID_TRANSITION",
          "状态必须按待处理 → 处理中 → 已完成流转",
        );
      next.status = req.body.status;
      next.assignee_id ??= req.user.id;
      actions.push(next.status === "processing" ? "开始处理" : "完成工单");
    }
    if (!actions.length) fail(400, "NO_CHANGES", "没有需要保存的修改");
    transaction(() => {
      const result = db
        .prepare(
          "UPDATE tickets SET title=?,description=?,priority=?,status=?,assignee_id=?,updated_at=?,version=version+1 WHERE id=? AND version=?",
        )
        .run(
          next.title,
          next.description,
          next.priority,
          next.status,
          next.assignee_id,
          new Date().toISOString(),
          before.id,
          version,
        );
      if (!result.changes) fail(409, "VERSION_CONFLICT", "工单已更新，请刷新");
      event(before.id, req.user.id, actions.join("；"));
    });
    res.json({ ticket: visible(req, before.id) });
  });
  app.post("/api/tickets/:id/comments", (req, res) => {
    const ticket = visible(req, req.params.id);
    fields(req.body, ["content"]);
    const content = text(req.body.content, "评论", 1, 2000);
    db.prepare(
      "INSERT INTO comments(ticket_id,user_id,content,created_at) VALUES(?,?,?,?)",
    ).run(ticket.id, req.user.id, content, new Date().toISOString());
    res.status(201).json({ ok: true });
  });
  app.use("/api", (req, res, next) =>
    next(new ApiError(404, "NOT_FOUND", "接口不存在")),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status =
      err instanceof ApiError
        ? err.status
        : err.type === "entity.too.large"
          ? 413
          : err.type === "entity.parse.failed"
            ? 400
            : 500;
    res
      .status(status)
      .json({
        error: {
          code:
            err.code ??
            (status === 413
              ? "PAYLOAD_TOO_LARGE"
              : status === 400
                ? "INVALID_JSON"
                : "INTERNAL_ERROR"),
          message:
            err instanceof ApiError
              ? err.message
              : status === 413
                ? "请求体过大"
                : status === 400
                  ? "JSON 格式不正确"
                  : "服务器暂时无法处理请求",
        },
      });
  });
  return app;
}
