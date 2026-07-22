#!/usr/bin/env node
/**
 * agent-doctor —— AI Agent 环境诊断工具
 *
 * 用法:
 *   npx ai-env-doctor              扫描全部
 *   npx ai-env-doctor --fix        扫描并自动修复
 *   npx ai-env-doctor --json       输出 JSON 格式
 */

import chalk from "chalk";
import { runAllChecks, runAutoFix, autoFixable, CheckResult } from "./env-check.js";

const args = process.argv.slice(2);
const shouldFix = args.includes("--fix") || args.includes("-f");
const jsonOutput = args.includes("--json") || args.includes("-j");

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
console.log(chalk.bold("  Agent Doctor  v0.1.0"));
console.log(chalk.gray("  AI Agent 环境诊断"));
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

console.log("");

// 非零退出码
if (failCount > 0) {
  process.exit(1);
}
