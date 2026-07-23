/**
 * mcp-scan.ts —— 扫描本机已安装的 MCP Server
 *
 * 从各 AI 客户端的配置文件中提取 MCP Server 列表，
 * 不记录密钥值（env 变量的 value），只记录变量名。
 */

import { readFileSync, statSync, existsSync } from "fs";
import { join, resolve } from "path";
import { homedir, platform } from "os";
import { execSync } from "child_process";

// --- Types ---

export interface MCPServerEntry {
  /** Server 名称（配置里的 key） */
  name: string;
  /** 启动命令，如 "npx" / "uvx" / "bun" */
  command: string;
  /** 启动参数 */
  args: string[];
  /** 传输模式 */
  transport: "stdio" | "streamable-http" | "sse" | "unknown";
  /** 环境变量名列表（不记录值） */
  envVarNames: string[];
  /** 来自哪个配置文件 */
  configFile: string;
}

export interface MCPConfigFile {
  /** 配置文件绝对路径 */
  path: string;
  /** 客户端名称 */
  client: string;
  /** 文件权限（八进制字符串，如 "644"） */
  permissions: string;
  /** 最后修改时间 */
  lastModified: string;
  /** 该配置包含的 Server 列表 */
  servers: MCPServerEntry[];
}

// --- Config File Discovery ---

function getConfigPaths(): { client: string; paths: string[] }[] {
  const home = homedir();
  const isWindows = platform() === "win32";

  return [
    {
      client: "Claude Desktop",
      paths: isWindows
        ? [join(process.env.APPDATA || home, "Claude", "claude_desktop_config.json")]
        : [
            join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
            join(home, ".config", "claude", "claude_desktop_config.json"),
          ],
    },
    {
      client: "Claude Code",
      paths: [
        join(home, ".claude", "mcp.json"),
        join(home, ".claude.json"),
      ],
    },
    {
      client: "Cursor",
      paths: [
        join(home, ".cursor", "mcp.json"),
      ],
    },
    {
      client: "VS Code Copilot",
      paths: [
        join(home, ".vscode", "mcp.json"),
      ],
    },
    {
      client: "Windsurf",
      paths: [
        join(home, ".windsurf", "mcp.json"),
        join(home, ".config", "windsurf", "mcp.json"),
      ],
    },
    {
      client: "Cline",
      paths: isWindows
        ? [join(process.env.APPDATA || home, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")]
        : [join(home, ".vscode-server", "data", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")],
    },
  ];
}

// --- Parsing ---

function tryParseJSON(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseMCPServers(
  config: Record<string, unknown>,
  configPath: string,
): MCPServerEntry[] {
  const mcpServers = config.mcpServers || config["mcp-servers"] || {};
  if (typeof mcpServers !== "object" || mcpServers === null) return [];

  const entries: MCPServerEntry[] = [];

  for (const [name, entry] of Object.entries(
    mcpServers as Record<string, unknown>,
  )) {
    if (typeof entry !== "object" || entry === null) continue;

    const e = entry as Record<string, unknown>;
    const command = typeof e.command === "string" ? e.command : "";
    const args: string[] = Array.isArray(e.args) ? e.args.map(String) : [];

    // 判断传输模式
    const serverType = typeof e.type === "string" ? e.type.toLowerCase() : "";
    let transport: MCPServerEntry["transport"] = "unknown";
    if (serverType === "http" || serverType === "streamable-http" || typeof e.url === "string") {
      transport = "streamable-http";
    } else if (serverType === "sse" || (typeof e.url === "string" && String(e.url || "").endsWith("/sse"))) {
      transport = "sse";
    } else if (command === "npx" || command === "uvx" || command === "bun" || command === "node" || command === "python" || command === "python3") {
      transport = "stdio";
    }

    // 提取 env 变量名（不取值）
    const envVars: string[] = [];
    const env = e.env;
    if (typeof env === "object" && env !== null) {
      envVars.push(...Object.keys(env as Record<string, unknown>));
    }

    entries.push({
      name,
      command,
      args,
      transport,
      envVarNames: envVars,
      configFile: configPath,
    });
  }

  return entries;
}

// --- Scanner ---

export function scanMCPConfigs(): MCPConfigFile[] {
  const results: MCPConfigFile[] = [];
  const clients = getConfigPaths();

  for (const { client, paths } of clients) {
    for (const p of paths) {
      const resolved = resolve(p);
      if (!existsSync(resolved)) continue;

      try {
        const raw = readFileSync(resolved, "utf-8");
        const config = tryParseJSON(raw);
        if (!config) continue;

        const stat = statSync(resolved);
        const perms = (stat.mode & 0o777).toString(8);

        const servers = parseMCPServers(config, resolved);

        results.push({
          path: resolved,
          client,
          permissions: perms,
          lastModified: stat.mtime.toISOString(),
          servers,
        });
      } catch {
        // 跳过读不了的配置文件
      }
    }
  }

  return results;
}

/** 扁平化：所有 Server 条目 */
export function listAllServers(configs: MCPConfigFile[]): MCPServerEntry[] {
  return configs.flatMap((c) => c.servers);
}
