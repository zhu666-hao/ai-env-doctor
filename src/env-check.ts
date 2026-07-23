import { execSync } from "child_process";
import { platform } from "os";

// --- Types ---

export interface CheckResult {
  /** 检查项名称，显示在表格第一列 */
  name: string;
  /** 期望值，如 "≥ 18" */
  expected: string;
  /** 实际值，如 "v20.11.0" 或 "-"（未安装） */
  actual: string;
  /** 状态 */
  status: "ok" | "fail" | "warn";
  /** 人类可读的修复建议（如果有问题） */
  fix?: string;
  /** 是否支持自动修复（默认 false） */
  autoFix?: boolean;
  /** 自动修复命令（如果 autoFix = true） */
  fixCommand?: string;
}

// --- Helpers ---

function getVersion(cmd: string, args: string[], regex: RegExp): string | null {
  try {
    const stdout = execSync(`${cmd} ${args.join(" ")}`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const match = stdout.match(regex);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function commandExists(cmd: string): boolean {
  try {
    const checkCmd = platform() === "win32" ? `where ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { encoding: "utf-8", stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function getEnvVar(name: string): string | null {
  const val = process.env[name];
  return val || null;
}

// --- Individual Checks ---

function checkNode(): CheckResult {
  const version = getVersion("node", ["--version"], /v(\d+\.\d+\.\d+)/);
  if (!version) {
    return {
      name: "Node.js",
      expected: "≥ 18",
      actual: "未安装",
      status: "fail",
      fix: "安装 Node.js: https://nodejs.org/ （建议 LTS 版本）",
      autoFix: false,
    };
  }
  const major = parseInt(version.split(".")[0]);
  if (major < 18) {
    return {
      name: "Node.js",
      expected: "≥ 18",
      actual: `v${version}`,
      status: "fail",
      fix: `当前 v${version}，升级 Node.js 到 v18 或以上: https://nodejs.org/`,
      autoFix: false,
    };
  }
  return {
    name: "Node.js",
    expected: "≥ 18",
    actual: `v${version}`,
    status: "ok",
  };
}

function checkBun(): CheckResult {
  const version = getVersion("bun", ["--version"], /(\d+\.\d+\.\d+)/);
  if (!version) {
    return {
      name: "Bun",
      expected: "≥ 1.2.0（如需）",
      actual: "未安装",
      status: "warn",
      fix: "部分 MCP Server 需要 Bun。安装: npm install -g bun",
      autoFix: commandExists("npm"),
      fixCommand: "npm install -g bun",
    };
  }
  const parts = version.split(".").map(Number);
  if (parts[0] < 1 || (parts[0] === 1 && parts[1] < 2)) {
    return {
      name: "Bun",
      expected: "≥ 1.2.0",
      actual: `v${version}`,
      status: "warn",
      fix: `当前 v${version}，部分 MCP Server 需要 Bun ≥ 1.2.0。升级: npm install -g bun@latest`,
      autoFix: commandExists("npm"),
      fixCommand: "npm install -g bun@latest",
    };
  }
  return {
    name: "Bun",
    expected: "≥ 1.2.0",
    actual: `v${version}`,
    status: "ok",
  };
}

function checkPython(): CheckResult {
  const version = getVersion("python3", ["--version"], /(\d+\.\d+)/) ??
    getVersion("python", ["--version"], /(\d+\.\d+)/);
  if (!version) {
    return {
      name: "Python",
      expected: "≥ 3.10（如需）",
      actual: "未安装",
      status: "warn",
      fix: "部分 MCP Server（uvx / pip 方式）需要 Python ≥ 3.10。安装: https://www.python.org/downloads/",
      autoFix: false,
    };
  }
  const parts = version.split(".").map(Number);
  if (parts[0] < 3 || (parts[0] === 3 && parts[1] < 10)) {
    return {
      name: "Python",
      expected: "≥ 3.10",
      actual: `v${version}`,
      status: "warn",
      fix: `当前 v${version}，部分 MCP Server（FastMCP）需要 Python ≥ 3.10`,
      autoFix: false,
    };
  }
  return {
    name: "Python",
    expected: "≥ 3.10",
    actual: `v${version}`,
    status: "ok",
  };
}

function checkNpx(): CheckResult {
  const exists = commandExists("npx");
  const nodeOk = checkNode().status === "ok";
  if (!exists && nodeOk) {
    return {
      name: "npx",
      expected: "可用",
      actual: "不在 PATH 中",
      status: "fail",
      fix: "npx 随 Node.js 安装，检查 %APPDATA%\\npm 是否在 PATH 中（Windows）或 /usr/local/bin（macOS/Linux）",
      autoFix: false,
    };
  }
  if (!exists) {
    return {
      name: "npx",
      expected: "可用",
      actual: "无法检测（Node 未安装）",
      status: "warn",
      fix: "先安装 Node.js，npx 随附安装",
      autoFix: false,
    };
  }
  return {
    name: "npx",
    expected: "可用",
    actual: "可用",
    status: "ok",
  };
}

function checkUvx(): CheckResult {
  // uvx 是 uv 的一部分，用于运行 Python MCP Server
  const uvxExists = commandExists("uvx");
  const uvExists = commandExists("uv");
  if (!uvxExists && !uvExists) {
    return {
      name: "uvx",
      expected: "可用（如需）",
      actual: "未安装",
      status: "warn",
      fix: "部分 Python MCP Server 通过 uvx 运行。安装 uv: pip install uv 或 https://docs.astral.sh/uv/",
      autoFix: commandExists("pip") || commandExists("pip3"),
      fixCommand: "pip install uv",
    };
  }
  if (!uvxExists && uvExists) {
    return {
      name: "uvx",
      expected: "可用",
      actual: "uv 已安装但 uvx 不在 PATH 中",
      status: "warn",
      fix: "uvx 随 uv 安装，检查 ~/.local/bin（Linux/macOS）或 %USERPROFILE%\\.local\\bin（Windows）是否在 PATH 中",
      autoFix: false,
    };
  }
  return {
    name: "uvx",
    expected: "可用",
    actual: "可用",
    status: "ok",
  };
}

function checkGitBash(): CheckResult {
  if (platform() !== "win32") {
    return {
      name: "Git Bash",
      expected: "Windows 专用",
      actual: "非 Windows 系统，跳过",
      status: "ok",
    };
  }

  // 1) 尝试从 PATH 中定位 bash.exe
  let foundPath = "";
  try {
    const stdout = execSync("where bash", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 5000,
    });
    const lines = stdout.trim().split("\r\n");
    // 优先选路径含 Git 的（而非 WSL/system32 里的 bash）
    const gitLine = lines.find((l: string) => l.includes("Git"));
    foundPath = gitLine || lines[0] || "";
  } catch {
    // where 失败，说明 PATH 里没有 bash
  }

  // 2) 如果 PATH 里没有，通过 git --exec-path 反查
  if (!foundPath) {
    try {
      const gitExec = execSync("git --exec-path", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
      // git --exec-path 指向 .../Git/mingw64/libexec/git-core
      // bash 在  .../Git/bin/bash.exe
      const candidate = gitExec.replace(
        /mingw64[\\/]libexec[\\/]git-core$/,
        "bin\\bash.exe"
      );
      try {
        execSync(`"${candidate}" --version`, {
          encoding: "utf-8",
          stdio: "ignore",
          timeout: 3000,
        });
        foundPath = candidate;
      } catch {
        // 路径不对，算了
      }
    } catch {
      // git 可能也没装
    }
  }

  if (!foundPath) {
    return {
      name: "Git Bash",
      expected: "已安装",
      actual: "未找到",
      status: "warn",
      fix: "Claude Code 的某些功能依赖 Git Bash。安装: https://git-scm.com/download/win",
      autoFix: false,
    };
  }

  const hasSpace = foundPath.includes(" ");
  if (hasSpace) {
    return {
      name: "Git Bash",
      expected: "路径不含空格",
      actual: `含空格: ${foundPath}`,
      status: "warn",
      fix: "Git Bash 路径含空格可能导致 observer 守护进程失败（#2502, #2461）。重装 Git 到 C:\\Git\\ 即可。",
      autoFix: false,
    };
  }

  return {
    name: "Git Bash",
    expected: "可用",
    actual: "可用",
    status: "ok",
  };
}

// --- Runner ---

export function runAllChecks(): CheckResult[] {
  return [
    checkNode(),
    checkBun(),
    checkPython(),
    checkNpx(),
    checkUvx(),
    checkGitBash(),
  ];
}

/** 可以自动修复的检查项 */
export function autoFixable(results: CheckResult[]): CheckResult[] {
  return results.filter((r) => r.autoFix && r.fixCommand && r.status !== "ok");
}

/** 执行自动修复 */
export function runAutoFix(fixable: CheckResult[]): void {
  for (const item of fixable) {
    if (!item.fixCommand) continue;
    try {
      console.log(`🔧 正在修复: ${item.name}...`);
      execSync(item.fixCommand, { encoding: "utf-8", stdio: "inherit", timeout: 60000 });
      console.log(`✅ ${item.name} 修复完成\n`);
    } catch (e: any) {
      console.error(`❌ ${item.name} 修复失败: ${e.message}\n`);
    }
  }
}
