#!/usr/bin/env node
// CJS wrapper for agent-doctor ESM entry
import("../dist/index.js").catch((err) => {
  console.error("agent-doctor: 启动失败", err.message);
  process.exit(1);
});
