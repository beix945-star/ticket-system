import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.js";
import { openDatabase, seedDemo } from "./db.js";
let db, app, user, admin, other;
const send = (agent, method, path, body) =>
  agent[method](path).set("X-Requested-With", "TicketApp").send(body);
const patch = (agent, id, body) =>
  send(agent, "patch", `/api/tickets/${id}`, body);
beforeEach(async () => {
  db = openDatabase();
  seedDemo(db);
  app = createApp(db, { authLimit: 100 });
  user = request.agent(app);
  admin = request.agent(app);
  other = request.agent(app);
  await send(user, "post", "/api/auth/login", {
    username: "demo",
    password: "Demo12345!",
  }).expect(200);
  await send(admin, "post", "/api/auth/login", {
    username: "admin",
    password: "Admin12345!",
  }).expect(200);
  await send(other, "post", "/api/auth/login", {
    username: "other",
    password: "Other12345!",
  }).expect(200);
});
afterEach(() => db.close());
describe("认证与请求校验", () => {
  it("拒绝未登录访问", async () => {
    const r = await request(app).get("/api/tickets").expect(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
  });
  it("错误密码不发会话，正确登录使用 HttpOnly SameSite Cookie", async () => {
    const r = await send(request(app), "post", "/api/auth/login", {
      username: "demo",
      password: "wrong",
    }).expect(401);
    expect(r.headers["set-cookie"]).toBeUndefined();
    const good = await send(request(app), "post", "/api/auth/login", {
      username: "demo",
      password: "Demo12345!",
    }).expect(200);
    expect(good.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(good.headers["set-cookie"][0]).toContain("SameSite=Strict");
    expect(good.body.user.password).toBeUndefined();
  });
  it("注册普通成员，不允许客户端指定管理员角色或重复用户名", async () => {
    const payload = {
      username: "new_user",
      password: "LongPassword123",
      name: "新成员",
    };
    const r = await send(
      request(app),
      "post",
      "/api/auth/register",
      payload,
    ).expect(201);
    expect(r.body.user.role).toBe("user");
    await send(request(app), "post", "/api/auth/register", payload).expect(409);
    await send(request(app), "post", "/api/auth/register", {
      ...payload,
      role: "admin",
    }).expect(400);
  });
  it("退出登录使旧会话立即失效", async () => {
    await send(user, "post", "/api/auth/logout", {}).expect(204);
    await user.get("/api/auth/me").expect(401);
  });
  it("过期会话不可使用", async () => {
    db.prepare("UPDATE sessions SET expires=?").run(Date.now() - 1);
    await user.get("/api/auth/me").expect(401);
  });
  it("缺少来源校验头、畸形 JSON 和超大请求均返回明确错误", async () => {
    await user.post("/api/tickets").send({ title: "x" }).expect(403);
    const malformed = await user
      .post("/api/tickets")
      .set("X-Requested-With", "TicketApp")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);
    expect(malformed.body.error.code).toBe("INVALID_JSON");
    await send(user, "post", "/api/tickets", {
      title: "x",
      description: "a".repeat(70000),
    }).expect(413);
  });
  it("登录失败限流", async () => {
    const limited = createApp(db, { authLimit: 1 });
    const payload = { username: "demo", password: "wrong" };
    await send(request(limited), "post", "/api/auth/login", payload).expect(
      401,
    );
    const r = await send(
      request(limited),
      "post",
      "/api/auth/login",
      payload,
    ).expect(429);
    expect(r.headers["retry-after"]).toBe("60");
  });
});
describe("工单、归属和流程", () => {
  it("创建工单持久化并记录真实归属，标题会去除首尾空白", async () => {
    const r = await send(user, "post", "/api/tickets", {
      title: " 新问题 ",
      description: "复现步骤",
      priority: "high",
    }).expect(201);
    expect(r.body.ticket.title).toBe("新问题");
    expect(r.body.ticket.status).toBe("pending");
    const saved = db
      .prepare("SELECT * FROM tickets WHERE id=?")
      .get(r.body.ticket.id);
    expect(saved.description).toBe("复现步骤");
    expect(saved.owner_id).toBe(1);
    expect(
      db.prepare("SELECT action FROM events WHERE ticket_id=?").get(saved.id)
        .action,
    ).toBe("创建工单");
  });
  it.each([
    { title: " ", description: "内容" },
    { title: "标题", description: "" },
    { title: "a".repeat(101), description: "内容" },
    { title: "标题", description: "内容", owner_id: 2 },
    { title: "标题", description: "内容", priority: "urgent" },
  ])("拒绝非法创建数据 %j", async (body) => {
    await send(user, "post", "/api/tickets", body).expect(400);
    expect(db.prepare("SELECT count(*) AS n FROM tickets").get().n).toBe(3);
  });
  it("其他成员不能读取、编辑或评论他人工单", async () => {
    await other.get("/api/tickets/1").expect(404);
    await patch(other, 1, { version: 1, title: "越权" }).expect(404);
    await send(other, "post", "/api/tickets/1/comments", {
      content: "越权",
    }).expect(404);
    const r = await other.get("/api/tickets").expect(200);
    expect(r.body.total).toBe(0);
    const stats = await other.get("/api/stats");
    expect(stats.body.stats).toEqual({
      pending: 0,
      processing: 0,
      completed: 0,
    });
  });
  it("普通用户无法变更状态、分配处理人或读取管理员列表", async () => {
    await patch(user, 1, { version: 1, status: "processing" }).expect(403);
    await patch(user, 1, { version: 1, assignee_id: 2 }).expect(403);
    await user.get("/api/users/assignees").expect(403);
  });
  it("普通成员可编辑自己的待处理工单，不能编辑处理中工单", async () => {
    await patch(user, 1, { version: 1, title: "更新标题" }).expect(200);
    await patch(user, 2, { version: 1, title: "处理中修改" }).expect(403);
  });
  it("管理员可以查看全部，但必须依次处理并完成", async () => {
    const skipped = await patch(admin, 1, {
      version: 1,
      status: "completed",
    }).expect(409);
    expect(skipped.body.error.code).toBe("INVALID_TRANSITION");
    const started = await patch(admin, 1, {
      version: 1,
      status: "processing",
    }).expect(200);
    expect(started.body.ticket.assignee_id).toBe(2);
    const done = await patch(admin, 1, {
      version: 2,
      status: "completed",
    }).expect(200);
    expect(done.body.ticket.status).toBe("completed");
    await patch(admin, 1, { version: 3, title: "完成后修改" }).expect(409);
    const detail = await admin.get("/api/tickets/1");
    expect(detail.body.events).toHaveLength(3);
  });
  it("版本冲突不会覆盖数据或多写审计记录", async () => {
    await patch(admin, 1, { version: 1, title: "第一次" }).expect(200);
    const r = await patch(admin, 1, { version: 1, title: "旧页面覆盖" }).expect(
      409,
    );
    expect(r.body.error.code).toBe("VERSION_CONFLICT");
    expect(db.prepare("SELECT title FROM tickets WHERE id=1").get().title).toBe(
      "第一次",
    );
    expect(
      db.prepare("SELECT count(*) AS n FROM events WHERE ticket_id=1").get().n,
    ).toBe(2);
  });
  it("只能分配给有效管理员", async () => {
    await patch(admin, 1, { version: 1, assignee_id: 1 }).expect(400);
    await patch(admin, 1, { version: 1, assignee_id: 999 }).expect(400);
    const r = await patch(admin, 1, { version: 1, assignee_id: 2 }).expect(200);
    expect(r.body.ticket.assignee_name).toBe("演示管理员");
  });
  it("评论正文及作者正确保存，拒绝空评论", async () => {
    await send(user, "post", "/api/tickets/1/comments", {
      content: "补充复现信息",
    }).expect(201);
    await send(user, "post", "/api/tickets/1/comments", {
      content: " ",
    }).expect(400);
    const r = await user.get("/api/tickets/1");
    expect(r.body.comments[0]).toMatchObject({
      content: "补充复现信息",
      author: "演示成员",
    });
  });
  it("搜索、筛选和分页返回一致总数，拒绝非法页码", async () => {
    const r = await user
      .get("/api/tickets?status=pending&pageSize=1&page=1")
      .expect(200);
    expect(r.body.total).toBe(1);
    expect(r.body.tickets).toHaveLength(1);
    const q = await user.get("/api/tickets").query({ q: "文档" });
    expect(q.body.tickets[0].id).toBe(2);
    const injection = await user
      .get("/api/tickets")
      .query({ q: "' OR 1=1 --" });
    expect(injection.body.total).toBe(0);
    await user.get("/api/tickets?page=-1").expect(400);
    await user.get("/api/tickets?pageSize=9999").expect(400);
    await user.get("/api/tickets?status=bad").expect(400);
    await user.get("/api/tickets/nope").expect(400);
    await user.get("/api/tickets/9999").expect(404);
  });
  it("SQLite 关闭再打开后记录仍在", () => {
    const dir = mkdtempSync(join(tmpdir(), "ticket-test-"));
    const path = join(dir, "test.sqlite");
    const first = openDatabase(path);
    seedDemo(first);
    first.close();
    const second = openDatabase(path);
    try {
      expect(second.prepare("SELECT count(*) AS n FROM tickets").get().n).toBe(
        3,
      );
    } finally {
      second.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
