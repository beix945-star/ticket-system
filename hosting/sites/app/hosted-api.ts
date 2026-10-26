type Row=Record<string,any>;
const encoder=new TextEncoder();
const hex=(value:ArrayBuffer)=>Array.from(new Uint8Array(value),b=>b.toString(16).padStart(2,'0')).join('');
const bytes=(value:string)=>Uint8Array.from(value.match(/../g)??[],x=>parseInt(x,16));
async function digest(value:string){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)))}
async function hash(password:string,salt=hex(crypto.getRandomValues(new Uint8Array(16)).buffer)){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const result=await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(salt),iterations:100000,hash:'SHA-256'},key,256);
 return salt+':'+hex(result);
}
async function verify(password:string,stored:string){const salt=stored.split(':')[0];const got=await hash(password,salt);let mismatch=got.length^stored.length;for(let i=0;i<got.length;i++)mismatch|=got.charCodeAt(i)^stored.charCodeAt(i);return mismatch===0}
class Failure extends Error{status:number;code:string;constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code}}
const fail=(status:number,code:string,message:string):never=>{throw new Failure(status,code,message)};
function text(value:unknown,label:string,min:number,max:number){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(400,'VALIDATION_ERROR',`${label}长度应为 ${min}–${max} 个字符`);return (value as string).trim()}
function integer(v:unknown,min:number,max:number,label:string){if(!/^\d+$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>max)fail(400,'VALIDATION_ERROR',label+'不正确');return Number(v)}
function fields(body:Row,allowed:string[]){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))fail(400,'VALIDATION_ERROR','请求字段不正确')}
const select='SELECT t.*,u.name AS owner_name,a.name AS assignee_name FROM tickets t JOIN users u ON u.id=t.owner_id LEFT JOIN users a ON a.id=t.assignee_id';
const publicUser=(u:Row)=>({id:u.id,username:u.username,name:u.name,role:u.role});
export async function handle(request:Request,db:D1Database):Promise<Response>{
 const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 try{
  if(!db)fail(503,'DATABASE_UNAVAILABLE','演示数据库暂时不可用');
  const url=new URL(request.url),path=url.pathname.slice(4),method=request.method;
  if(!['GET','HEAD'].includes(method)&&request.headers.get('X-Requested-With')!=='TicketApp')fail(403,'CSRF_REJECTED','请求来源验证失败');
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)fail(403,'CSRF_REJECTED','不允许跨站写入');
  const statement=(sql:string,...values:any[])=>db.prepare(sql).bind(...values);
  const first=async(sql:string,...values:any[]):Promise<Row|null>=>statement(sql,...values).first<Row>();
  const all=async(sql:string,...values:any[])=> (await statement(sql,...values).all<Row>()).results;
  const run=async(sql:string,...values:any[])=>statement(sql,...values).run();
  let body:Row={};
  if(method==='POST'||method==='PATCH'){
   const declared=request.headers.get('content-length');if(declared&&Number(declared)>65536)fail(413,'PAYLOAD_TOO_LARGE','请求体过大');
   if(request.body){const reader=request.body.getReader();let size=0;const chunks:Uint8Array[]=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();fail(413,'PAYLOAD_TOO_LARGE','请求体过大')}chunks.push(value)}if(size){try{const decoder=new TextDecoder();body=JSON.parse(chunks.map(c=>decoder.decode(c,{stream:true})).join('')+decoder.decode())}catch{fail(400,'INVALID_JSON','JSON 格式不正确')}}}
  }
  if(path==='/health'&&method==='GET')return json({ok:true,storage:'D1'});
  if(path==='/demo'&&method==='POST'){
   const exists=await first("SELECT id FROM users WHERE username='admin'");if(exists)return json({ok:true});
   const credentials=[['demo','Demo12345!','演示成员','user'],['admin','Admin12345!','演示管理员','admin'],['other','Other12345!','另一位成员','user']];
   const hashes=await Promise.all(credentials.map(c=>hash(c[1])));
   await db.batch(credentials.map((c,i)=>statement('INSERT OR IGNORE INTO users(username,password,name,role) VALUES(?,?,?,?)',c[0],hashes[i],c[2],c[3])));
   const now=new Date().toISOString();
   const sample=[['demo-1','这是我的第一条工单','输入账号后页面一直加载，需要排查页面与接口连接。','pending','high'],['demo-2','申请开通文档查看权限','新成员申请查看团队文档，等待处理人确认。','processing','normal'],['demo-3','修复工单标题显示不完整','调整长标题换行方式，确认内容完整显示。','completed','low']];
   await db.batch(sample.map(c=>statement("INSERT OR IGNORE INTO tickets(request_id,title,description,status,priority,owner_id,assignee_id,created_at,updated_at) VALUES(?,?,?,?,?,(SELECT id FROM users WHERE username='demo'),CASE WHEN ?='pending' THEN NULL ELSE (SELECT id FROM users WHERE username='admin') END,?,?)",...c,c[3],now,now)));
   return json({ok:true});
  }
  const raw=(request.headers.get('Cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ticket_session='))?.slice(15)??'';
  const token=/^[a-f0-9]{64}$/.test(raw)?await digest(raw):'';
  if((path==='/auth/login'||path==='/auth/register')&&method==='POST'){
   const key=(request.headers.get('CF-Connecting-IP')??'unknown')+':'+Math.floor(Date.now()/60000);
   await run('DELETE FROM auth_limits WHERE until<?',Date.now());
   const limit=await first('INSERT INTO auth_limits(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',key,Date.now()+120000);
   if(Number(limit?.count)>20){headers['Retry-After']='60';fail(429,'RATE_LIMITED','请求过于频繁，请一分钟后重试')}
   const registering=path.endsWith('register');fields(body,registering?['username','password','name']:['username','password']);
   const username=text(body.username,'用户名',3,24).toLowerCase();const password=text(body.password,'密码',registering?8:1,128);
   let user=await first('SELECT * FROM users WHERE username=?',username);
   if(registering){
    if(!/^[a-z0-9_]+$/.test(username))fail(400,'VALIDATION_ERROR','用户名只允许字母、数字和下划线');
    const name=text(body.name,'姓名',1,40);if(user)fail(409,'USERNAME_EXISTS','用户名已存在');
    try{await run("INSERT INTO users(username,name,password,role) VALUES(?,?,?,'user')",username,name,await hash(password))}catch(e){if(await first('SELECT id FROM users WHERE username=?',username))fail(409,'USERNAME_EXISTS','用户名已存在');throw e}
    user=await first('SELECT * FROM users WHERE username=?',username);
   }else if(!user){await hash(password,'00000000000000000000000000000000');fail(401,'INVALID_CREDENTIALS','用户名或密码不正确')}
   else if(!await verify(password,user.password))fail(401,'INVALID_CREDENTIALS','用户名或密码不正确');
   const session=hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
   await db.batch([statement('DELETE FROM sessions WHERE expires<? OR token=?',Date.now(),token),statement('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',await digest(session),user!.id,Date.now()+8*3600000)]);
   headers['Set-Cookie']=`ticket_session=${session}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
   return json({user:publicUser(user!)},registering?201:200);
  }
  const user=await first('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',token,Date.now());
  if(!user)fail(401,'UNAUTHENTICATED','请先登录');
  const u=user!;const admin=()=>{if(u.role!=='admin')fail(403,'FORBIDDEN','需要管理员权限')};
  if(path==='/auth/me'&&method==='GET')return json({user:publicUser(u)});
  if(path==='/auth/logout'&&method==='POST'){await run('DELETE FROM sessions WHERE token=?',token);headers['Set-Cookie']='ticket_session=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0';return new Response(null,{status:204,headers})}
  const visible=async(id:unknown)=>{const n=integer(id,1,Number.MAX_SAFE_INTEGER,'工单编号');const t=await first(select+' WHERE t.id=?',n);if(!t||(u.role!=='admin'&&t.owner_id!==u.id))fail(404,'NOT_FOUND','工单不存在或无权访问');return t!};
  if(path==='/users/assignees'&&method==='GET'){admin();return json({users:await all("SELECT id,name FROM users WHERE role='admin' ORDER BY id")})}
  if(path==='/stats'&&method==='GET'){const rows=u.role==='admin'?await all('SELECT status,COUNT(*) AS count FROM tickets GROUP BY status'):await all('SELECT status,COUNT(*) AS count FROM tickets WHERE owner_id=? GROUP BY status',u.id);const stats:Row={pending:0,processing:0,completed:0};for(const r of rows)stats[r.status]=r.count;return json({stats})}
  if(path==='/tickets'&&method==='GET'){
   const page=integer(url.searchParams.get('page')??1,1,100000,'页码'),pageSize=integer(url.searchParams.get('pageSize')??9,1,50,'每页数量');const where:string[]=[],params:any[]=[];
   if(u.role!=='admin'){where.push('t.owner_id=?');params.push(u.id)}
   const status=url.searchParams.get('status'),q=url.searchParams.get('q');
   if(status){if(!['pending','processing','completed'].includes(status))fail(400,'VALIDATION_ERROR','状态不正确');where.push('t.status=?');params.push(status)}
   if(q){const search=text(q,'搜索词',1,100);where.push('(instr(lower(t.title),lower(?))>0 OR instr(lower(t.description),lower(?))>0)');params.push(search,search)}
   const clause=where.length?' WHERE '+where.join(' AND '):'';
   return json({tickets:await all(select+clause+' ORDER BY t.id DESC LIMIT ? OFFSET ?',...params,pageSize,(page-1)*pageSize),total:(await first('SELECT COUNT(*) AS n FROM tickets t'+clause,...params))!.n,page,pageSize});
  }
  if(path==='/tickets'&&method==='POST'){
   fields(body,['title','description','priority']);const title=text(body.title,'标题',1,100),description=text(body.description,'描述',1,5000),priority=body.priority??'normal';if(!['low','normal','high'].includes(priority))fail(400,'VALIDATION_ERROR','优先级不正确');const now=new Date().toISOString(),requestId=crypto.randomUUID();
   const result=await db.batch([statement('INSERT INTO tickets(request_id,title,description,priority,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',requestId,title,description,priority,u.id,now,now),statement('INSERT INTO events(ticket_id,user_id,action,created_at) SELECT id,?,?,? FROM tickets WHERE request_id=?',u.id,'创建工单',now,requestId)]);
   return json({ticket:await visible(result[0].meta.last_row_id)},201);
  }
  const match=path.match(/^\/tickets\/([^/]+)(\/comments)?$/);
  if(match){const t=await visible(match[1]);
   if(method==='GET'&&!match[2])return json({ticket:t,comments:await all('SELECT c.*,u.name AS author FROM comments c JOIN users u ON u.id=c.user_id WHERE ticket_id=? ORDER BY c.id',t.id),events:await all('SELECT e.*,u.name AS author FROM events e JOIN users u ON u.id=e.user_id WHERE ticket_id=? ORDER BY e.id DESC',t.id)});
   if(method==='POST'&&match[2]){fields(body,['content']);await run('INSERT INTO comments(ticket_id,user_id,content,created_at) VALUES(?,?,?,?)',t.id,u.id,text(body.content,'评论',1,2000),new Date().toISOString());return json({ok:true},201)}
   if(method==='PATCH'&&!match[2]){
    fields(body,['version','title','description','priority','status','assignee_id']);const version=integer(body.version,1,Number.MAX_SAFE_INTEGER,'版本号');if(version!==t.version)fail(409,'VERSION_CONFLICT','工单已更新，请重新打开后再操作');if(t.status==='completed')fail(409,'TICKET_CLOSED','已完成的工单不能修改');const next={...t},actions:string[]=[];
    for(const field of ['title','description','priority'])if(Object.hasOwn(body,field)){if(u.role!=='admin'&&t.status!=='pending')fail(403,'FORBIDDEN','处理中工单只能由管理员修改');if(field==='priority'){if(!['low','normal','high'].includes(body[field]))fail(400,'VALIDATION_ERROR','优先级不正确');next[field]=body[field]}else next[field]=text(body[field],field==='title'?'标题':'描述',1,field==='title'?100:5000);if(next[field]!==t[field])actions.push('更新'+({title:'标题',description:'描述',priority:'优先级'} as Row)[field])}
    if(Object.hasOwn(body,'assignee_id')){admin();const id=body.assignee_id===null?null:integer(body.assignee_id,1,Number.MAX_SAFE_INTEGER,'处理人');if(id!==null&&!await first("SELECT id FROM users WHERE id=? AND role='admin'",id))fail(400,'VALIDATION_ERROR','处理人必须是管理员');next.assignee_id=id;if(id!==t.assignee_id)actions.push('更新处理人')}
    if(Object.hasOwn(body,'status')){admin();const expected=({pending:'processing',processing:'completed'} as Row)[t.status];if(body.status!==expected)fail(409,'INVALID_TRANSITION','状态必须按待处理 → 处理中 → 已完成流转');next.status=body.status;next.assignee_id??=u.id;actions.push(next.status==='processing'?'开始处理':'完成工单')}
    if(!actions.length)fail(400,'NO_CHANGES','没有需要保存的修改');const now=new Date().toISOString();
    const results=await db.batch([statement('UPDATE tickets SET title=?,description=?,priority=?,status=?,assignee_id=?,updated_at=?,version=version+1 WHERE id=? AND version=?',next.title,next.description,next.priority,next.status,next.assignee_id,now,t.id,version),statement('INSERT INTO events(ticket_id,user_id,action,created_at) SELECT ?,?,?,? WHERE changes()=1',t.id,u.id,actions.join('；'),now)]);
    if(!results[0].meta.changes)fail(409,'VERSION_CONFLICT','工单已更新，请重新打开');return json({ticket:await visible(t.id)});
   }
  }
  return fail(404,'NOT_FOUND','接口不存在');
 }catch(e){return json({error:{code:e instanceof Failure?e.code:'INTERNAL_ERROR',message:e instanceof Failure?e.message:'服务器暂时无法处理请求'}},e instanceof Failure?e.status:500)}
}
