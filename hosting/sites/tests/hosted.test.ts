import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handle} from '../app/hosted-api.ts';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
 const prepare=(sql:string)=>{let values:any[]=[];const statement:any={bind:(...v:any[])=>{values=v;return statement},first:async()=>db.prepare(sql).get(...values)??null,all:async()=>({results:db.prepare(sql).all(...values)}),run:async()=>{const r=db.prepare(sql).run(...values);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}};return statement};
 const port:any={prepare,batch:async(items:any[])=>{db.exec('BEGIN');try{const results=[];for(const x of items)results.push(await x.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}};
 let cookie='';const send=async(path:string,method='GET',body?:unknown,providedCookie?:string)=>{const headers:Record<string,string>={'X-Requested-With':'TicketApp','Content-Type':'application/json','Cookie':providedCookie??cookie};const r=await handle(new Request('https://demo.test/api'+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})}),port);if(r.headers.get('Set-Cookie'))cookie=r.headers.get('Set-Cookie')!.split(';')[0];return {status:r.status,data:r.status===204?null:await r.json() as any,cookie,headers:r.headers}};
 return {db,send,close:()=>db.close()};
}
test('在线版完整流程、角色隔离、版本冲突和审计',async()=>{
 const f=fixture();try{
  assert.equal((await f.send('/tickets')).status,401);
  assert.equal((await f.send('/demo','POST')).status,200);
  const user=await f.send('/auth/login','POST',{username:'demo',password:'Demo12345!'});assert.equal(user.status,200);assert.match(user.headers.get('Set-Cookie')! ,/Secure/);const userCookie=user.cookie;
  const created=await f.send('/tickets','POST',{title:'中文工单',description:'中文内容，验证持久化',priority:'high'});assert.equal(created.status,201);const id=created.data.ticket.id;
  assert.equal((await f.send(`/tickets/${id}`,'PATCH',{version:1,status:'processing'})).status,403);
  assert.equal((await f.send(`/tickets/${id}/comments`,'POST',{content:'补充说明'})).status,201);
  const other=await f.send('/auth/login','POST',{username:'other',password:'Other12345!'});assert.equal(other.status,200);
  assert.equal((await f.send(`/tickets/${id}`)).status,404);assert.equal((await f.send('/tickets')).data.total,0);
  const admin=await f.send('/auth/login','POST',{username:'admin',password:'Admin12345!'});assert.equal(admin.status,200);
  assert.equal((await f.send(`/tickets/${id}`,'PATCH',{version:1,status:'completed'})).status,409);
  assert.equal((await f.send(`/tickets/${id}`,'PATCH',{version:1,status:'processing'})).status,200);
  assert.equal((await f.send(`/tickets/${id}`,'PATCH',{version:1,title:'旧版本'})).status,409);
  const done=await f.send(`/tickets/${id}`,'PATCH',{version:2,status:'completed'});assert.equal(done.status,200);
  const detail=await f.send(`/tickets/${id}`);assert.equal(detail.data.events.length,3);assert.equal(detail.data.comments[0].content,'补充说明');assert.equal(detail.data.ticket.description,'中文内容，验证持久化');
  assert.equal((await f.send(`/tickets/${id}`,'PATCH',{version:3,title:'完成后修改'})).status,409);
  // Logging in as another account rotates and invalidates the prior browser session.
  await f.send('/auth/logout','POST');assert.equal((await f.send('/auth/me')).status,401);
  assert.equal((await f.send('/auth/me','GET',undefined,userCookie)).status,401);
 }finally{f.close()}
});
test('重复演示初始化不覆盖数据，注册和参数校验正常',async()=>{
 const f=fixture();try{
  await f.send('/demo','POST');await f.send('/demo','POST');assert.equal(f.db.prepare('SELECT count(*) AS n FROM tickets').get()!.n,3);
  const r=await f.send('/auth/register','POST',{username:'new_user',name:'新成员',password:'LongPassword123'});assert.equal(r.status,201);assert.equal(r.data.user.role,'user');
  assert.equal((await f.send('/tickets','POST',{title:' ',description:'说明'})).status,400);
  assert.equal((await f.send('/tickets?page=-1')).status,400);
  assert.equal((await f.send('/auth/register','POST',{username:'bad',name:'x',password:'LongPassword123',role:'admin'})).status,400);
 }finally{f.close()}
});
