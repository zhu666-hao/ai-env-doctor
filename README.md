# ai-env-doctor

AI Agent 环境诊断 + MCP 快照监控工具。

## 安装

```bash
npm install -g ai-env-doctor
```

或者直接运行：

```bash
npx ai-env-doctor
```

## 用法

### 环境诊断（砖 1）

```bash
# 扫描环境
ai-env-doctor

# 自动修复
ai-env-doctor --fix

# JSON 输出（供脚本调用）
ai-env-doctor --json
```

### MCP 快照监控（砖 2）🆕

```bash
# 保存当前 MCP 环境快照
ai-env-doctor snapshot save

# 对比当前状态与上次快照
ai-env-doctor snapshot diff

# 快速检查有无变化（退出码 1 = 有变化，适合 CI）
ai-env-doctor snapshot status

# 清理旧快照（保留最近 10 个）
ai-env-doctor snapshot clean
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

## MCP 快照监控什么

每次保存快照时，记录：
- 所有已安装 MCP Server 的名称、启动命令和参数
- 每个 Server 的传输模式和依赖的环境变量（只记变量名，不记密钥值）
- MCP 配置文件的权限和修改时间

运行 `diff` 时，自动对比并标记任何变化——Server 新增/移除、命令变更、配置文件被修改。

## 平台支持

- Windows ✓
- macOS ✓
- Linux ✓

## 为什么需要这个工具

AI Agent（Claude Code、Cursor、Windsurf 等）依赖 MCP Server 来连接外部工具。

**环境问题：** MCP Server 对环境的要求各不相同——有些需要 Node ≥ 18、有些需要 Bun ≥ 1.2.0、有些需要 Python + uvx。Windows 下 Git Bash 路径含空格会导致守护进程失败。当你装了 10 个 MCP Server 后，某个突然不能用了——99% 是环境问题。ai-env-doctor 帮你 10 秒定位问题。

**安全问题：** MCP Server 会在你不知情时更新——工具描述可能被修改、新工具可能被添加、配置文件权限可能被更改。保存快照，定期对比，第一时间发现变化。

## 许可

MIT
