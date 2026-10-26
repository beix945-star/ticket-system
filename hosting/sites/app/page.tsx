"use client";
import App from "../components/App";
export default function Page(){return <><div className="demo-banner">公开演示环境：请仅输入虚构数据，演示账号的数据会共享。<DemoSetup/></div><App/></>}
import {useState} from "react";
function DemoSetup(){const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);return <><button disabled={busy} onClick={async()=>{setBusy(true);try{const r=await fetch("/api/demo",{method:"POST",headers:{"X-Requested-With":"TicketApp"}});if(!r.ok)throw new Error();setMessage("已就绪。成员 demo / Demo12345!；管理员 admin / Admin12345!。") }catch{setMessage("初始化失败，请稍后重试")}finally{setBusy(false)}}}>{busy?"准备中…":"首次使用：准备演示账号"}</button><span role="status">{message}</span></>;}
