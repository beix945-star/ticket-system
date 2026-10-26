import { DatabaseSync } from "node:sqlite";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function checkPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(
    Buffer.from(hash, "hex"),
    scryptSync(password, salt, 64),
  );
}
export function openDatabase(path = ":memory:") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','admin')));
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed')),
      priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
      owner_id INTEGER NOT NULL REFERENCES users(id), assignee_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id), user_id INTEGER NOT NULL REFERENCES users(id), content TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id), user_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS tickets_owner ON tickets(owner_id, id);
    CREATE INDEX IF NOT EXISTS comments_ticket ON comments(ticket_id);
    CREATE INDEX IF NOT EXISTS events_ticket ON events(ticket_id);
    CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);`);
  return db;
}
export function addUser(db, username, password, name, role = "user") {
  return Number(
    db
      .prepare("INSERT INTO users(username,password,name,role) VALUES(?,?,?,?)")
      .run(username, hashPassword(password), name, role).lastInsertRowid,
  );
}
export function seedDemo(db) {
  // Explicit development fixture, never run automatically by the server.
  if (db.prepare("SELECT count(*) AS n FROM users").get().n)
    throw new Error("数据库已有用户，未修改数据。请使用空的演示数据库。");
  db.exec("BEGIN");
  try {
    const user = addUser(db, "demo", "Demo12345!", "演示成员");
    const admin = addUser(db, "admin", "Admin12345!", "演示管理员", "admin");
    addUser(db, "other", "Other12345!", "另一位成员");
    const now = new Date().toISOString();
    for (const [title, description, status, priority] of [
      [
        "这是我的第一条工单",
        "输入账号后页面一直加载，需要排查页面与接口的连接情况。",
        "pending",
        "high",
      ],
      [
        "申请开通文档查看权限",
        "新成员需要查看团队的入职文档，等待处理人确认访问权限。",
        "processing",
        "normal",
      ],
      [
        "修复工单标题显示不完整",
        "调整了标题的换行方式，较长的文字也可以完整显示。",
        "completed",
        "low",
      ],
    ]) {
      const id = db
        .prepare(
          "INSERT INTO tickets(title,description,status,priority,owner_id,assignee_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          title,
          description,
          status,
          priority,
          user,
          status === "pending" ? null : admin,
          now,
          now,
        ).lastInsertRowid;
      db.prepare(
        "INSERT INTO events(ticket_id,user_id,action,created_at) VALUES(?,?,?,?)",
      ).run(id, admin, "初始化演示数据", now);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
