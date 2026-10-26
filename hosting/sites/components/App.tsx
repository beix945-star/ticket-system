"use client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api, date, errorMessage, labels, priorities } from "./api";
import type { Detail, Priority, Status, Ticket, User } from "./api";
import "./App.css";
function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button disabled={busy} aria-label="关闭窗口" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Badge({ status }: { status: Status }) {
  return (
    <span className={`status status-${status}`}>
      <span className="status-dot" />
      {labels[status]}
    </span>
  );
}
function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>(
        "/auth/" + (register ? "register" : "login"),
        {
          method: "POST",
          body: JSON.stringify(
            register ? { username, password, name } : { username, password },
          ),
        },
      );
      onLogin(result.user);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-layout">
      <section className="login-intro">
        <span className="eyebrow">TICKET DESK / 团队协作</span>
        <h1>
          把问题，
          <br />
          一件件解决。
        </h1>
        <p>
          让反馈有记录，让协作有进展。
          <br />
          从提交到完成，始终知道下一步。
        </p>
        <div className="flow">
          <span>01 提交问题</span>
          <span>02 跟进处理</span>
          <span>03 完成归档</span>
        </div>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <h2>{register ? "创建成员账号" : "欢迎回来"}</h2>
        <p className="muted">
          {register ? "新账号默认为普通成员" : "登录后查看你的工单工作台"}
        </p>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <label>
          用户名
          <input
            autoComplete="username"
            required
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]+"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="字母、数字或下划线"
          />
        </label>
        {register && (
          <label>
            姓名
            <input
              required
              maxLength={40}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label>
          密码
          <input
            type="password"
            required
            minLength={register ? 8 : 1}
            maxLength={128}
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="primary full" disabled={busy}>
          {busy ? "正在提交…" : register ? "注册并登录" : "登录工作台"}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register ? "已有账号？返回登录" : "没有账号？创建成员账号"}
        </button>
        <p className="auth-note">
          本地演示账号见项目 README。
          <br />
          普通成员只可查看自己的工单。
        </p>
      </form>
    </div>
  );
}
function TicketFields({
  title,
  setTitle,
  description,
  setDescription,
  priority,
  setPriority,
}: {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  priority: Priority;
  setPriority: (v: Priority) => void;
}) {
  return (
    <>
      <label>
        工单标题
        <input
          required
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="用一句话描述问题"
        />
      </label>
      <label>
        详细描述
        <textarea
          required
          maxLength={5000}
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="发生了什么？期望的结果是什么？"
        />
      </label>
      <label>
        优先级
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
        >
          {Object.entries(priorities).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
function CreateTicket({
  close,
  created,
}: {
  close: () => void;
  created: (id: number) => void;
}) {
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [priority, setPriority] = useState<Priority>("normal"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ ticket: Ticket }>("/tickets", {
        method: "POST",
        body: JSON.stringify({ title, description, priority }),
      });
      created(result.ticket.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal title="新建工单" onClose={close} busy={busy}>
      <form onSubmit={submit}>
        <p className="muted">清晰的问题描述，可以让处理更高效。</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <fieldset disabled={busy}>
          <TicketFields
            {...{
              title,
              setTitle,
              description,
              setDescription,
              priority,
              setPriority,
            }}
          />
        </fieldset>
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={close}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "正在创建…" : "创建工单"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function TicketDetail({
  id,
  user,
  close,
  changed,
}: {
  id: number;
  user: User;
  close: () => void;
  changed: () => void;
}) {
  const [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [comment, setComment] = useState(""),
    [editing, setEditing] = useState(false),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [priority, setPriority] = useState<Priority>("normal"),
    [assignees, setAssignees] = useState<{ id: number; name: string }[]>([]),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react/set-state-in-effect -- Clear errors when starting a new request.
    setError("");
    api<Detail>(`/tickets/${id}`, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    if (user.role === "admin")
      api<{ users: { id: number; name: string }[] }>("/users/assignees", {
        signal: controller.signal,
      })
        .then((r) => setAssignees(r.users))
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorMessage(e));
        });
    return () => controller.abort();
  }, [id, user.role, reload]);
  async function mutate(path: string, method: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, { method, body: JSON.stringify(body) });
      changed();
      setData(await api<Detail>(`/tickets/${id}`));
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const t = data?.ticket;
  return (
    <Modal title={`工单 TK-${id}`} onClose={close} busy={busy}>
      {error && (
        <div className="error" role="alert">
          {error}
          <button disabled={busy} onClick={() => setReload((v) => v + 1)}>
            重新加载
          </button>
        </div>
      )}
      {!t ? (
        <p className="muted">{error ? "暂时无法显示工单" : "正在加载…"}</p>
      ) : (
        <>
          <div className="detail-top">
            <Badge status={t.status} />
            <span className={"priority " + t.priority}>
              {priorities[t.priority]}优先级
            </span>
            <span className="muted">版本 {t.version}</span>
          </div>
          <h3 className="detail-title">{t.title}</h3>
          <div className="detail-meta">
            <span>提交人：{t.owner_name}</span>
            <span>处理人：{t.assignee_name || "待分配"}</span>
            <span>创建：{date(t.created_at)}</span>
          </div>
          {editing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutate(`/tickets/${id}`, "PATCH", {
                    version: t.version,
                    title,
                    description,
                    priority,
                  })
                )
                  setEditing(false);
              }}
            >
              <fieldset disabled={busy}>
                <TicketFields
                  {...{
                    title,
                    setTitle,
                    description,
                    setDescription,
                    priority,
                    setPriority,
                  }}
                />
              </fieldset>
              <div className="dialog-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  取消编辑
                </button>
                <button disabled={busy} className="primary">
                  保存修改
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="detail-description">{t.description}</p>
              <div className="detail-controls">
                {t.status !== "completed" &&
                  (user.role === "admin" || t.status === "pending") && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        setTitle(t.title);
                        setDescription(t.description);
                        setPriority(t.priority);
                        setEditing(true);
                      }}
                    >
                      编辑内容
                    </button>
                  )}
                {user.role === "admin" && t.status !== "completed" && (
                  <>
                    <label className="assign-label">
                      分配处理人
                      <select
                        disabled={busy}
                        aria-label="分配处理人"
                        value={t.assignee_id ?? ""}
                        onChange={(e) =>
                          void mutate(`/tickets/${id}`, "PATCH", {
                            version: t.version,
                            assignee_id: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      >
                        <option value="">未分配</option>
                        {assignees.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      disabled={busy}
                      className="primary"
                      onClick={() =>
                        void mutate(`/tickets/${id}`, "PATCH", {
                          version: t.version,
                          status:
                            t.status === "pending" ? "processing" : "completed",
                        })
                      }
                    >
                      {t.status === "pending" ? "开始处理" : "标记完成"}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          <section className="detail-section">
            <h3>
              沟通记录 <small>{data.comments.length}</small>
            </h3>
            {data.comments.length === 0 && (
              <p className="muted">还没有留言，补充信息可以帮助解决问题。</p>
            )}
            {data.comments.map((c) => (
              <div className="comment" key={c.id}>
                <div>
                  <strong>{c.author}</strong>
                  <time>{date(c.created_at)}</time>
                </div>
                <p>{c.content}</p>
              </div>
            ))}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutate(`/tickets/${id}/comments`, "POST", {
                    content: comment,
                  })
                )
                  setComment("");
              }}
            >
              <label>
                添加留言
                <textarea
                  rows={3}
                  required
                  maxLength={2000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={busy}
                />
              </label>
              <button disabled={busy || !comment.trim()} className="primary">
                {busy ? "正在提交…" : "发送留言"}
              </button>
            </form>
          </section>
          <section className="detail-section">
            <h3>操作记录</h3>
            <ul className="events">
              {data.events.map((e) => (
                <li key={e.id}>
                  <span>
                    {e.author} · {e.action}
                  </span>
                  <time>{date(e.created_at)}</time>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </Modal>
  );
}
function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [stats, setStats] = useState<Record<Status, number>>({
      pending: 0,
      processing: 0,
      completed: 0,
    }),
    [status, setStatus] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false),
    [detail, setDetail] = useState<number | null>(null),
    [revision, setRevision] = useState(0),
    [loggingOut, setLoggingOut] = useState(false);
  const refresh = () => setRevision((v) => v + 1);
  useEffect(() => {
    const c = new AbortController();
    // Loading state synchronizes the screen with a new external request.
    // eslint-disable-next-line react/set-state-in-effect
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "9",
      q: query,
      status,
    });
    Promise.all([
      api<{ tickets: Ticket[]; total: number }>("/tickets?" + params, {
        signal: c.signal,
      }),
      api<{ stats: Record<Status, number> }>("/stats", { signal: c.signal }),
    ])
      .then(([list, s]) => {
        setTickets(list.tickets);
        setTotal(list.total);
        setStats(s.stats);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [page, query, status, revision]);
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">工</span>
          <span>工单台</span>
        </a>
        <div className="account">
          <span>
            {user.name}{" "}
            <small>{user.role === "admin" ? "管理员" : "普通成员"}</small>
          </span>
          <button
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              try {
                await api("/auth/logout", { method: "POST" });
                onLogout();
              } catch (e) {
                setError(errorMessage(e));
                setLoggingOut(false);
              }
            }}
          >
            退出
          </button>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">团队协作 / 工单管理</p>
            <h1>把问题，一件件解决。</h1>
            <p className="page-description">
              {user.role === "admin"
                ? "查看团队反馈，分配处理人并跟进进度。"
                : "集中记录问题，清晰追踪每一次处理进度。"}
            </p>
          </div>
          <button className="primary" onClick={() => setCreating(true)}>
            ＋ 新建工单
          </button>
        </div>
        <section className="stats" aria-label="工单统计">
          {(Object.keys(labels) as Status[]).map((s) => (
            <button
              key={s}
              className={status === s ? "stat selected" : "stat"}
              onClick={() => {
                setStatus(status === s ? "" : s);
                setPage(1);
              }}
            >
              <span className={"status-dot " + s} />
              <span>{labels[s]}</span>
              <strong>{stats[s]}</strong>
            </button>
          ))}
        </section>
        <section>
          <div className="section-heading">
            <h2>
              {user.role === "admin" ? "团队工单" : "我的工单"}{" "}
              <span>{total}</span>
            </h2>
            <button onClick={refresh} disabled={loading}>
              ↻ 刷新
            </button>
          </div>
          <div className="filters">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(search.trim());
                setPage(1);
              }}
            >
              <input
                aria-label="搜索工单"
                placeholder="搜索标题或描述…"
                maxLength={100}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button>搜索</button>
            </form>
            <select
              aria-label="筛选状态"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">全部状态</option>
              {Object.entries(labels).map(([s, label]) => (
                <option key={s} value={s}>
                  {label}
                </option>
              ))}
            </select>
            {(query || status) && (
              <button
                onClick={() => {
                  setQuery("");
                  setSearch("");
                  setStatus("");
                  setPage(1);
                }}
              >
                重置筛选
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={refresh}>重试</button>
            </div>
          )}
          {loading ? (
            <div className="empty" role="status">
              正在加载工单…
            </div>
          ) : error ? null : tickets.length === 0 ? (
            <div className="empty">
              <h3>暂时没有工单</h3>
              <p>创建一条新工单，或调整搜索条件。</p>
            </div>
          ) : (
            <ul className="ticket-list">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    className="ticket-card"
                    onClick={() => setDetail(t.id)}
                  >
                    <div className="ticket-meta">
                      <span className="ticket-id">TK-{t.id}</span>
                      <Badge status={t.status} />
                    </div>
                    <h3>{t.title}</h3>
                    <p className="ticket-description">{t.description}</p>
                    <div className="card-tags">
                      <span className={"priority " + t.priority}>
                        {priorities[t.priority]}优先级
                      </span>
                      <span>{t.assignee_name || "待分配"}</span>
                    </div>
                    <p className="ticket-date">
                      {t.owner_name} · {date(t.created_at)}{" "}
                      <span>查看详情 →</span>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="pagination">
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </button>
            <span>
              第 {page} / {Math.max(1, Math.ceil(total / 9))} 页
            </span>
            <button
              disabled={page * 9 >= total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        </section>
      </main>
      <footer>
        工单台 · 记录问题，推动解决{" "}
        <span>
          {user.role === "admin"
            ? "管理员可查看全部工单"
            : "仅显示本人创建的工单"}
        </span>
      </footer>
      {creating && (
        <CreateTicket
          close={() => setCreating(false)}
          created={(id) => {
            setCreating(false);
            setDetail(id);
            setPage(1);
            refresh();
          }}
        />
      )}
      {detail !== null && (
        <TicketDetail
          key={detail}
          id={detail}
          user={user}
          close={() => setDetail(null)}
          changed={refresh}
        />
      )}
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    // Loading state synchronizes the screen with a new external request.
    // eslint-disable-next-line react/set-state-in-effect
    setLoading(true);
    setError("");
    api<{ user: User }>("/auth/me", { signal: c.signal })
      .then((r) => setUser(r.user))
      .catch((e) => {
        if (!c.signal.aborted && e.status !== 401) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => {
      c.abort();
      window.removeEventListener("session-expired", expired);
    };
  }, [retry]);
  if (loading) return <div className="empty">正在连接工作台…</div>;
  if (error)
    return (
      <div className="empty">
        <p role="alert">{error}</p>
        <button onClick={() => setRetry((v) => v + 1)}>重新连接</button>
      </div>
    );
  return user ? (
    <Dashboard user={user} onLogout={() => setUser(null)} />
  ) : (
    <Auth onLogin={setUser} />
  );
}
