import { openDatabase } from "./db.js";
import { createApp } from "./app.js";
import express from "express";
import { fileURLToPath } from "node:url";
const db = openDatabase(
  process.env.DATABASE_PATH ||
    fileURLToPath(new URL("../data/tickets.sqlite", import.meta.url)),
);
const app = createApp(db, {
  secureCookie: process.env.NODE_ENV === "production",
});
app.use(
  express.static(fileURLToPath(new URL("../frontend/dist", import.meta.url))),
);
const server = app.listen(
  Number(process.env.PORT || 3001),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      `工单接口：http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3001}`,
    ),
);
const stop = () =>
  server.close(() => {
    db.close();
    process.exit(0);
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
