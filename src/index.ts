#!/usr/bin/env node
/**
 * ai-env-doctor —— AI Agent 环境诊断 + MCP 快照监控
 *
 * 用法:
 *   npx ai-env-doctor              环境诊断（砖 1）
 *   npx ai-env-doctor --fix        自动修复
 *   npx ai-env-doctor --json       JSON 输出
 *
 *   npx ai-env-doctor snapshot save      保存 MCP 快照（砖 2）
 *   npx ai-env-doctor snapshot diff      对比变化
 *   npx ai-env-doctor snapshot status    快速检查
 *   npx ai-env-doctor snapshot clean     清理旧快照
 */

import chalk from "chalk";
import { runAllChecks, runAutoFix, autoFixable, CheckResult } from "./env-check.js";
import {
  saveSnapshot,
  loadLatestSnapshot,
  getSnapshotAge,
  getLatestSnapshotPath,
  diffSnapshot,
  checkStatus,
  cleanSnapshots,
  formatDiffOutput,
  formatStatusOutput,
} from "./snapshot.js";

const args = process.argv.slice(2);
const subcommand = args[0];
const subArgs = args.slice(1);
const jsonOutput = args.includes("--json") || args.includes("-j");

// ─── 子命令：snapshot ───────────────────────────────────────────────

if (subcommand === "snapshot") {
  const action = subArgs[0];

  if (action === "save") {
    const path = saveSnapshot();
    console.log("");
    console.log(chalk.green(`  ✅ 快照已保存: ${path}`));
    console.log("");
    process.exit(0);
  }

  if (action === "diff") {
    const snapshot = loadLatestSnapshot();
    if (!snapshot) {
      console.log("");
      console.log(chalk.yellow("  ⚠️  未找到快照。运行 `ai-env-doctor snapshot save` 创建第一个快照。"));
      console.log("");
      process.exit(0);
    }
    const diff = diffSnapshot(snapshot);
    const age = getSnapshotAge();
    formatDiffOutput(diff, age);
    process.exit(0);
  }

  if (action === "status") {
    const status = checkStatus();
    formatStatusOutput(status, jsonOutput);
    process.exit(status.changed ? 1 : 0);
  }

  if (action === "clean") {
    const removed = cleanSnapshots();
    console.log("");
    console.log(chalk.green(`  ✅ 已清理 ${removed} 个旧快照。`));
    console.log("");
    process.exit(0);
  }

  // snapshot help
  console.log("");
  console.log(chalk.bold("  ai-env-doctor snapshot"));
  console.log(chalk.gray("  MCP Server 快照监控 —— 记录环境状态，检测变化"));
  console.log("");
  console.log(`  ${chalk.white("snapshot save")}      保存当前 MCP 环境快照`);
  console.log(`  ${chalk.white("snapshot diff")}      对比当前状态与上次快照`);
  console.log(`  ${chalk.white("snapshot status")}    快速检查有无变化（退出码 1 = 有变化）`);
  console.log(`  ${chalk.white("snapshot clean")}     清理旧快照（保留最近 10 个）`);
  console.log("");
  process.exit(0);
}

// ─── 默认：环境诊断（砖 1）─────────────────────────────────────────

const shouldFix = args.includes("--fix") || args.includes("-f");

// --- JSON Output ---

if (jsonOutput) {
  const results = runAllChecks();
  const fixable = autoFixable(results);
  if (shouldFix) {
    runAutoFix(fixable);
  }
  console.log(
    JSON.stringify(
      {
        version: "0.2.0",
        timestamp: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        results: results.map((r) => ({
          check: r.name,
          expected: r.expected,
          actual: r.actual,
          status: r.status,
          fix: r.fix ?? null,
          autoFix: r.autoFix,
        })),
        summary: {
          total: results.length,
          ok: results.filter((r) => r.status === "ok").length,
          warn: results.filter((r) => r.status === "warn").length,
          fail: results.filter((r) => r.status === "fail").length,
          fixable: fixable.length,
        },
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// --- Terminal Output ---

console.log("");
console.log(chalk.bold("  Agent Doctor  v0.2.0"));
console.log(chalk.gray("  AI Agent 环境诊断 + MCP 快照监控"));
console.log("");

const results = runAllChecks();

// 表格输出
const col1Width = 14;
const col2Width = 16;
const col3Width = 22;

console.log(chalk.gray("  " + "─".repeat(col1Width + col2Width + col3Width + 15)));

for (const r of results) {
  const statusIcon =
    r.status === "ok" ? chalk.green("  ✅") :
    r.status === "fail" ? chalk.red("  ❌") :
    chalk.yellow("  ⚠️");

  const statusText =
    r.status === "ok" ? chalk.green(r.actual) :
    r.status === "fail" ? chalk.red(r.actual) :
    chalk.yellow(r.actual);

  console.log(`  ${statusIcon} ${r.name.padEnd(col1Width)} ${r.expected.padEnd(col2Width)} ${statusText}`);
}

console.log(chalk.gray("  " + "─".repeat(col1Width + col2Width + col3Width + 15)));

// 汇总
const okCount = results.filter((r) => r.status === "ok").length;
const warnCount = results.filter((r) => r.status === "warn").length;
const failCount = results.filter((r) => r.status === "fail").length;
const fixable = autoFixable(results);

console.log("");
console.log(`  ${chalk.green(okCount + " 项通过")}  ${chalk.yellow(warnCount + " 项告警")}  ${chalk.red(failCount + " 项失败")}`);

// 有问题的项 → 打印修复建议
if (warnCount + failCount > 0) {
  console.log("");
  console.log(chalk.bold("  修复建议:"));
  console.log("");

  for (const r of results) {
    if (r.status === "ok") continue;
    const icon = r.status === "fail" ? chalk.red("  ❌") : chalk.yellow("  ⚠️");
    console.log(`${icon} ${chalk.bold(r.name)}: ${r.fix ?? "请手动排查"}`);
    if (r.autoFix) {
      console.log(`     ${chalk.gray("→ 可自动修复")}`);
    }
  }
}

// --fix 模式
if (shouldFix && fixable.length > 0) {
  console.log("");
  console.log(chalk.bold(`  正在自动修复 ${fixable.length} 项...`));
  console.log("");
  runAutoFix(fixable);
} else if (fixable.length > 0 && !shouldFix) {
  console.log("");
  console.log(chalk.gray(`  运行 ${chalk.white("npx ai-env-doctor --fix")} 自动修复 ${fixable.length} 项`));
}

// 提醒快照功能
const snapshotAge = getSnapshotAge();
if (snapshotAge === null) {
  console.log("");
  console.log(chalk.gray(`  新功能: ${chalk.white("npx ai-env-doctor snapshot save")} —— 保存 MCP 环境快照，监控变化`));
} else {
  console.log("");
  console.log(chalk.gray(`  上次 MCP 快照: ${snapshotAge} 天前  |  ${chalk.white("npx ai-env-doctor snapshot diff")} 查看变化`));
}

console.log("");

// 非零退出码
if (failCount > 0) {
  process.exit(1);
}
