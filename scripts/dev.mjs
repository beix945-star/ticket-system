import { spawn } from "node:child_process";
const children = [];
const stop = () => children.forEach((p) => p.kill("SIGTERM"));
const launch = (args) => {
  const p = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  children.push(p);
  p.on("error", (e) => {
    console.error(e.message);
    stop();
    process.exitCode = 1;
  });
  p.on("exit", (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
};
launch(["backend/server.js"]);
launch([
  "frontend/node_modules/vite/bin/vite.js",
  "frontend",
  "--host",
  "127.0.0.1",
  "--port",
  "5174",
  "--strictPort",
]);
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
