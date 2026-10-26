export type User = {
  id: number;
  username: string;
  name: string;
  role: "user" | "admin";
};
export type Status = "pending" | "processing" | "completed";
export type Priority = "low" | "normal" | "high";
export type Ticket = {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  owner_id: number;
  owner_name: string;
  assignee_id: number | null;
  assignee_name: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};
export type Detail = {
  ticket: Ticket;
  comments: {
    id: number;
    content: string;
    author: string;
    created_at: string;
  }[];
  events: { id: number; action: string; author: string; created_at: string }[];
};
export const labels: Record<Status, string> = {
  pending: "待处理",
  processing: "处理中",
  completed: "已完成",
};
export const priorities: Record<Priority, string> = {
  low: "低",
  normal: "普通",
  high: "高",
};
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "TicketApp",
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("服务器返回了无法读取的内容，请稍后重试");
  }
  if (!response.ok) {
    if (data.error?.code === "UNAUTHENTICATED")
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      data.error?.message || "请求失败",
      data.error?.code || "UNKNOWN",
      response.status,
    );
  }
  return data as T;
}
export const date = (v: string) =>
  new Date(v).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
export const errorMessage = (error: unknown) =>
  error instanceof TypeError
    ? "无法连接服务器，请检查服务是否启动后重试。"
    : error instanceof Error
      ? error.message
      : "操作失败，请重试";
