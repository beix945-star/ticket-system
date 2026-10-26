import { openDatabase, seedDemo } from "./db.js";
import { fileURLToPath } from "node:url";
if (process.env.NODE_ENV === "production")
  throw new Error("禁止在生产环境生成演示账号");
const db = openDatabase(
  process.env.DATABASE_PATH ||
    fileURLToPath(new URL("../data/tickets.sqlite", import.meta.url)),
);
try {
  seedDemo(db);
  console.log(
    "演示数据已创建。成员 demo / Demo12345!；管理员 admin / Admin12345!。仅用于本地演示。",
  );
} finally {
  db.close();
}
