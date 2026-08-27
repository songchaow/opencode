# @ai-sdk/openai patch: Responses input items need explicit type

## 背景

腾讯内网 tcodex 网关（`hy4-dev` 模型，混元后端）的 Responses→chat/completions 转换器
**要求 input item 必须带 `type: "message"` 字段**，否则全部 item 被丢弃，
上游报 `400 messages is required and must not be empty`。

而 `@ai-sdk/openai`（v3.0.84）生成的 Responses input item 是 `{role, content}` 简写形式
（不带 `type`）。DeepSeek 系列（taiji 后端）接受简写形式，所以此前未暴露。

## 修复内容

`patch-ai-sdk-openai-type-message.patch`：在 `convertToOpenAIResponsesInput`
产出的 4 处 message item（system / developer / user / assistant）上补 `type: "message"`。
`type: "message"` 是 Responses API 标准写法（官方简写的等价形式），taiji / 官方 OpenAI
均接受，无副作用。

涉及文件（`node_modules/@ai-sdk/openai/dist/` 下）：
- `index.mjs` / `index.js`（主入口，opencode 构建实际使用）
- `internal/index.mjs` / `internal/index.js`（保持一致）

## 如何应用

`bun install` 重装依赖后会丢失此修改（node_modules 不入库），需要重新应用：

```powershell
cd I:\Codes\opencode
bun install
git apply scripts/patch-ai-sdk-openai-type-message.patch   # 在 node_modules 上应用
# 或手动应用：node_modules/@ai-sdk/openai/dist/ 下 4 个文件
# 每个文件在 convertToOpenAIResponsesInput 的 4 处 input.push 加 type: "message",
```

应用后验证：

```powershell
python -c "import io;c=io.open(r'node_modules\@ai-sdk\openai\dist\index.mjs',encoding='utf-8').read();print('type:message count =', c.count('type: \"message\"'))"
# 期望输出 4
```

## 验证

```powershell
opencodedev run -m tcodex-local/hy4-dev "只回复两个字：OK"   # 期望返回 OK
```

2026-08-27 已随 `99.99.99-dev-202608270305` 构建发布。
