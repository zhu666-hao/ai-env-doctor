# ai-env-doctor

AI Agent 环境诊断工具 —— 一条命令诊断你的 AI Agent 环境哪里有问题。

## 安装

```bash
npm install -g ai-env-doctor
```

或者直接运行：

```bash
npx ai-env-doctor
```

## 用法

```bash
# 扫描环境
ai-env-doctor

# 自动修复
ai-env-doctor --fix

# JSON 输出（供脚本调用）
ai-env-doctor --json
```

## 检查项

| 检查项 | 说明 |
|--------|------|
| Node.js | ≥ 18 |
| Bun | ≥ 1.2.0（部分 MCP Server 需要） |
| Python | ≥ 3.10（uvx/pip MCP Server 需要） |
| npx | 是否可用 |
| uvx | 是否可用（Python MCP Server 运行时） |
| Git Bash | Windows：路径是否含空格（影响 observer） |

## 平台支持

- Windows ✓
- macOS ✓
- Linux ✓

## 为什么需要这个工具

AI Agent（Claude Code、Cursor、Windsurf 等）依赖 MCP Server 来连接外部工具。MCP Server 对环境的要求各不相同：
- 有些需要 Node ≥ 18
- 有些需要 Bun ≥ 1.2.0
- 有些需要 Python + uvx
- Windows 下 Git Bash 路径含空格会导致守护进程失败

当你装了 10 个 MCP Server 后，某个突然不能用了——99% 是环境问题。ai-env-doctor 帮你 10 秒定位问题。

## 许可

MIT
