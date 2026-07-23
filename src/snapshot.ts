/**
 * snapshot.ts —— 快照保存 / 对比 / 状态检查
 *
 * 砖 2 核心：把当前 MCP 环境状态保存为快照，
 * 下次对比时标记任何变化。
 */

import { writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync, unlinkSync, statSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import chalk from "chalk";
import {
  scanMCPConfigs,
  listAllServers,
  MCPConfigFile,
  MCPServerEntry,
} from "./mcp-scan.js";

// --- Types ---

export interface SnapshotServerEntry {
  name: string;
  command: string;
  args: string[];
  transport: string;
  envVarNames: string[];
  configFile: string;
}

export interface SnapshotConfigFileEntry {
  path: string;
  client: string;
  permissions: string;
  lastModified: string;
}

export interface Snapshot {
  /** 快照格式版本 */
  version: string;
  /** 创建时间 */
  timestamp: string;
  /** 快照时的主机名 */
  hostname: string;
  /** 快照时的平台 */
  platform: string;
  /** 所有 MCP Server */
  servers: SnapshotServerEntry[];
  /** 配置文件元数据 */
  configFiles: SnapshotConfigFileEntry[];
}

export interface SnapshotDiff {
  /** 新增的 Server */
  addedServers: SnapshotServerEntry[];
  /** 移除的 Server */
  removedServers: SnapshotServerEntry[];
  /** 变更的 Server（命令或参数变了） */
  changedServers: {
    name: string;
    old: SnapshotServerEntry;
    current: SnapshotServerEntry;
    changes: string[];
  }[];
  /** 新增的配置文件 */
  addedConfigs: string[];
  /** 移除的配置文件 */
  removedConfigs: string[];
  /** 配置文件变更 */
  changedConfigs: {
    path: string;
    changes: string[];
  }[];
}

// --- Paths ---

function snapshotDir(): string {
  return join(homedir(), ".ai-env-doctor", "snapshots");
}

function latestSnapshotPath(): string | null {
  const dir = snapshotDir();
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  return files.length > 0 ? join(dir, files[0]) : null;
}

// --- Save ---

function captureSnapshot(): Snapshot {
  const configs = scanMCPConfigs();
  const servers = listAllServers(configs);

  return {
    version: "1.0",
    timestamp: new Date().toISOString(),
    hostname: process.env.HOSTNAME || process.env.COMPUTERNAME || "unknown",
    platform: process.platform,
    servers: servers.map((s) => ({
      name: s.name,
      command: s.command,
      args: s.args,
      transport: s.transport,
      envVarNames: s.envVarNames,
      configFile: s.configFile,
    })),
    configFiles: configs.map((c) => ({
      path: c.path,
      client: c.client,
      permissions: c.permissions,
      lastModified: c.lastModified,
    })),
  };
}

export function saveSnapshot(): string {
  const snapshot = captureSnapshot();
  const dir = snapshotDir();

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // 文件名：snapshot_2026-07-21T14-30-00.json
  const filename = `snapshot_${snapshot.timestamp.replace(/:/g, "-").replace(/\..+/, "")}.json`;
  const filepath = join(dir, filename);

  writeFileSync(filepath, JSON.stringify(snapshot, null, 2), "utf-8");

  return filepath;
}

// --- Load ---

export function loadLatestSnapshot(): Snapshot | null {
  const path = latestSnapshotPath();
  if (!path) return null;

  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    // 基本校验
    if (!parsed.version || !parsed.timestamp || !Array.isArray(parsed.servers)) {
      return null;
    }
    return parsed as Snapshot;
  } catch {
    return null;
  }
}

export function getLatestSnapshotPath(): string | null {
  return latestSnapshotPath();
}

export function getSnapshotAge(): number | null {
  const path = latestSnapshotPath();
  if (!path) return null;

  try {
    const stat = statSync(path);
    return Math.floor((Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24)); // 天
  } catch {
    return null;
  }
}

// --- Diff ---

export function diffSnapshot(snapshot: Snapshot): SnapshotDiff {
  const current = captureSnapshot();

  const oldServerMap = new Map<string, SnapshotServerEntry>();
  for (const s of snapshot.servers) {
    oldServerMap.set(keyServer(s), s);
  }

  const newServerMap = new Map<string, SnapshotServerEntry>();
  for (const s of current.servers) {
    newServerMap.set(keyServer(s), s);
  }

  const addedServers: SnapshotServerEntry[] = [];
  const removedServers: SnapshotServerEntry[] = [];
  const changedServers: SnapshotDiff["changedServers"] = [];

  // 新增和变更
  for (const [k, s] of newServerMap) {
    const old = oldServerMap.get(k);
    if (!old) {
      addedServers.push(s);
    } else {
      const changes = compareServers(old, s);
      if (changes.length > 0) {
        changedServers.push({ name: s.name, old, current: s, changes });
      }
    }
  }

  // 移除
  for (const [k, s] of oldServerMap) {
    if (!newServerMap.has(k)) {
      removedServers.push(s);
    }
  }

  // 配置文件变更
  const oldConfigMap = new Map<string, SnapshotConfigFileEntry>();
  for (const c of snapshot.configFiles) {
    oldConfigMap.set(c.path, c);
  }

  const newConfigPaths = new Set(current.configFiles.map((c) => c.path));
  const addedConfigs = current.configFiles
    .filter((c) => !oldConfigMap.has(c.path))
    .map((c) => c.path);
  const removedConfigs = snapshot.configFiles
    .filter((c) => !newConfigPaths.has(c.path))
    .map((c) => c.path);
  const changedConfigs: SnapshotDiff["changedConfigs"] = [];

  for (const c of current.configFiles) {
    const old = oldConfigMap.get(c.path);
    if (old) {
      const cfgChanges: string[] = [];
      if (old.permissions !== c.permissions) {
        cfgChanges.push(`权限: ${old.permissions} → ${c.permissions}`);
      }
      if (old.lastModified !== c.lastModified) {
        cfgChanges.push(`修改时间: ${old.lastModified} → ${c.lastModified}`);
      }
      if (cfgChanges.length > 0) {
        changedConfigs.push({ path: c.path, changes: cfgChanges });
      }
    }
  }

  return {
    addedServers,
    removedServers,
    changedServers,
    addedConfigs,
    removedConfigs,
    changedConfigs,
  };
}

// --- Helpers ---

function keyServer(s: SnapshotServerEntry): string {
  return `${s.configFile}::${s.name}`;
}

function compareServers(
  old: SnapshotServerEntry,
  current: SnapshotServerEntry,
): string[] {
  const changes: string[] = [];

  if (old.command !== current.command) {
    changes.push(`启动命令: ${old.command} → ${current.command}`);
  }

  const oldArgs = JSON.stringify(old.args);
  const newArgs = JSON.stringify(current.args);
  if (oldArgs !== newArgs) {
    changes.push(`参数: ${oldArgs} → ${newArgs}`);
  }

  if (old.transport !== current.transport) {
    changes.push(`传输模式: ${old.transport} → ${current.transport}`);
  }

  const oldEnv = JSON.stringify(old.envVarNames.sort());
  const newEnv = JSON.stringify(current.envVarNames.sort());
  if (oldEnv !== newEnv) {
    const added = current.envVarNames.filter((v) => !old.envVarNames.includes(v));
    const removed = old.envVarNames.filter((v) => !current.envVarNames.includes(v));
    if (added.length > 0) changes.push(`新增环境变量: ${added.join(", ")}`);
    if (removed.length > 0) changes.push(`移除环境变量: ${removed.join(", ")}`);
  }

  if (old.configFile !== current.configFile) {
    changes.push(`配置文件: ${old.configFile} → ${current.configFile}`);
  }

  return changes;
}

// --- Status ---

export interface StatusResult {
  changed: boolean;
  snapshotAge: number | null;
  snapshotPath: string | null;
  diff: SnapshotDiff | null;
}

export function checkStatus(): StatusResult {
  const snapshot = loadLatestSnapshot();
  const age = getSnapshotAge();

  if (!snapshot) {
    return { changed: false, snapshotAge: null, snapshotPath: null, diff: null };
  }

  const diff = diffSnapshot(snapshot);
  const changed =
    diff.addedServers.length > 0 ||
    diff.removedServers.length > 0 ||
    diff.changedServers.length > 0 ||
    diff.addedConfigs.length > 0 ||
    diff.removedConfigs.length > 0 ||
    diff.changedConfigs.length > 0;

  return {
    changed,
    snapshotAge: age,
    snapshotPath: getLatestSnapshotPath(),
    diff,
  };
}

// --- Clean ---

export function cleanSnapshots(): number {
  const dir = snapshotDir();
  if (!existsSync(dir)) return 0;

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  // 保留最近 10 个
  let removed = 0;
  if (files.length > 10) {
    for (const f of files.slice(0, files.length - 10)) {
      unlinkSync(join(dir, f));
      removed++;
    }
  }

  return removed;
}

// --- Output (给 CLI 用的) ---

export function formatDiffOutput(diff: SnapshotDiff, snapshotAge: number | null): void {
  const totalChanges =
    diff.addedServers.length +
    diff.removedServers.length +
    diff.changedServers.length +
    diff.addedConfigs.length +
    diff.removedConfigs.length +
    diff.changedConfigs.length;

  console.log("");
  console.log(chalk.bold("  MCP Snapshot Diff"));
  console.log(chalk.gray(`  上次快照：${snapshotAge !== null ? `${snapshotAge} 天前` : "未知"}`));
  console.log("");

  if (totalChanges === 0) {
    console.log(chalk.green("  ✅ 无变化。当前状态与快照一致。"));
    console.log("");
    return;
  }

  // 新增 Server
  for (const s of diff.addedServers) {
    console.log(chalk.green(`  🟢 新增 Server: ${s.name}`));
    console.log(chalk.gray(`     ${s.command} ${s.args.join(" ")}`));
    console.log(chalk.gray(`     来自: ${s.configFile}`));
    console.log("");
  }

  // 移除 Server
  for (const s of diff.removedServers) {
    console.log(chalk.red(`  🔴 移除 Server: ${s.name}`));
    console.log(chalk.gray(`     原配置: ${s.configFile}`));
    console.log("");
  }

  // 变更 Server
  for (const c of diff.changedServers) {
    console.log(chalk.yellow(`  🟡 变更 Server: ${c.name}`));
    for (const change of c.changes) {
      console.log(chalk.yellow(`     ${change}`));
    }
    console.log("");
  }

  // 配置文件变更
  for (const c of diff.changedConfigs) {
    console.log(chalk.yellow(`  ⚠️  配置文件变更: ${c.path}`));
    for (const change of c.changes) {
      console.log(chalk.yellow(`     ${change}`));
    }
    console.log("");
  }

  for (const c of diff.addedConfigs) {
    console.log(chalk.green(`  🟢 新增配置文件: ${c}`));
    console.log("");
  }

  for (const c of diff.removedConfigs) {
    console.log(chalk.red(`  🔴 移除配置文件: ${c}`));
    console.log("");
  }

  console.log(chalk.gray(`  总计: ${diff.addedServers.length} 新增, ${diff.removedServers.length} 移除, ${diff.changedServers.length} 变更`));
  console.log("");
}

export function formatStatusOutput(status: StatusResult, jsonMode: boolean): void {
  if (jsonMode) {
    const output = {
      changed: status.changed,
      snapshotAgeDays: status.snapshotAge,
      snapshotPath: status.snapshotPath,
      summary: status.diff
        ? {
            addedServers: status.diff.addedServers.length,
            removedServers: status.diff.removedServers.length,
            changedServers: status.diff.changedServers.length,
            addedConfigs: status.diff.addedConfigs.length,
            removedConfigs: status.diff.removedConfigs.length,
            changedConfigs: status.diff.changedConfigs.length,
          }
        : null,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (!status.snapshotPath) {
    console.log(chalk.yellow("  ⚠️  未找到快照。运行 `ai-env-doctor snapshot save` 创建第一个快照。"));
    return;
  }

  if (status.changed) {
    console.log(chalk.red(`  🔴 检测到变更（上次快照：${status.snapshotAge} 天前）`));
    console.log(chalk.gray(`  运行 \`ai-env-doctor snapshot diff\` 查看详情`));
  } else {
    console.log(chalk.green(`  ✅ 无变化（上次快照：${status.snapshotAge} 天前）`));
  }
}
