import './App.css'

// 第一段：规定一张工单有哪些字段，以及状态允许填写哪些值。
type Ticket = {
  id: number
  title: string
  description: string
  status: 'pending' | 'processing' | 'completed'
  createdAt: string
}

// 第二段：练习用的模拟数据。后续会把它替换成后端接口返回的数据。
const tickets: Ticket[] = [
  {
    id: 1001,
    title: '这是我的第一条工单',
    description: '输入账号后页面一直加载，需要排查页面与接口的连接情况。',
    status: 'pending',
    createdAt: '2026-09-28',
  },
  {
    id: 1002,
    title: '申请开通文档查看权限',
    description: '新成员需要查看团队的入职文档，等待处理人确认访问权限。',
    status: 'processing',
    createdAt: '2026-09-27',
  },
  {
    id: 1003,
    title: '修复工单标题显示不完整',
    description: '调整了标题的换行方式，较长的文字也可以完整显示。',
    status: 'completed',
    createdAt: '2026-09-26',
  },
]

// 第三段：代码中的状态值，与页面上的中文名称对应。
const statusLabels = {
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
}

// 第四段：一个组件负责显示一张工单，ticket 是从外部传入的数据。
function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <li className="ticket-card">
      <div className="ticket-meta">
        <span className="ticket-id">TK-{ticket.id}</span>
        <span className={`status status-${ticket.status}`}>
          <span className="status-dot" aria-hidden="true" />
          {statusLabels[ticket.status]}
        </span>
      </div>
      <h3>{ticket.title}</h3>
      <p className="ticket-description">{ticket.description}</p>
      <p className="ticket-date">
        创建于 <time dateTime={ticket.createdAt}>{ticket.createdAt}</time>
      </p>
    </li>
  )
}

// 第五段：把数据逐条交给 TicketCard，组成整个页面。
function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="工单台首页">
          <span className="brand-mark" aria-hidden="true">工</span>
          <span>工单台</span>
        </a>
        <span className="workspace-name">个人练习空间</span>
      </header>

      <main>
        <div className="page-heading">
          <p className="eyebrow">团队协作 / 工单管理</p>
          <h1>把问题，一件件解决。</h1>
          <p className="page-description">集中记录团队问题，清晰追踪处理进度。</p>
        </div>

        <section aria-labelledby="tickets-heading">
          <div className="section-heading">
            <h2 id="tickets-heading">全部工单 <span>{tickets.length}</span></h2>
            <span className="sample-label">演示数据</span>
          </div>
          <ul className="ticket-list">
            {tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </ul>
        </section>
      </main>

      <footer>工单台 · 记录问题，推动解决</footer>
    </div>
  )
}

export default App
