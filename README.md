# EasyPingMake

EasyPingMake 是一个面向拼豆新手的本地网页版工具，用于将宠物图片转换为可编辑、可导出的拼豆图纸。

当前开发基线：

- MVP 按 P0 范围开发，当前已建立可运行的本地演示闭环；
- MVP 色板为 MARD221，使用 A～H、M 共 221 个色号；
- 52×52、78×78、104×104 是编辑画板的首选尺寸，也是 AI 抽象程度参考；
- AI 伪像素图先通过网格检测/提供器网格提示还原为真实像素，再转换为画板数据；
- 每个画板格子代表一颗 2.8mm 拼豆；
- 有效像素区域超过 104×104 时使用动态方形画板；
- 当前 AI 生图通过可替换的 `AiImageProvider` 调用中转站，生图后的伪像素图优先使用本地 PerfectPixel 还原为真实像素；
- 当前阶段不包含账号、社区和正式云端部署。

## 配置图片 AI API

复制项目根目录的 `.env.example` 为 `.env.local`，填写中转站地址、API Key、图片模型和图片编辑接口路径，然后重新启动开发服务器：

```powershell
Copy-Item .env.example .env.local
npm.cmd run dev
```

`.env.local` 已被 Git 忽略，不要提交该文件。推荐中转站提供 OpenAI-compatible 的 `/v1/images/edits` 接口；前端请求 `/api/ai/generate`，Vite 开发代理会在本地附加 API Key。

详细产品范围见 `docs/PRD.md`，视觉规范见 `docs/design.md`。

## PerfectPixel 本地转换依赖

当前生成流程在 AI 返回图片后，通过本地 Vite 接口调用 PerfectPixel，将伪像素图转换为真实像素图，再继续执行 MARD221 色号映射和图纸生成。当前版本先把 AI 返回的原始解码图作为普通 RGB 图片交给 PerfectPixel，暂不把去背景后的透明图作为其输入；PerfectPixel 输出后再执行主体背景清理。PerfectPixel 的输出像素会直接作为编辑器的视觉格子，2.8mm 只用于最终实体尺寸计算。

首次使用前，需要安装 [uv](https://docs.astral.sh/uv/)，然后在项目根目录执行：

```powershell
uv.exe sync --project python
npm.cmd run dev
```

`python/pyproject.toml` 会固定 PerfectPixel 运行依赖，`python/.venv/` 已加入 Git 忽略。也可以不预先执行 `uv sync`，首次点击生成时由开发服务器按项目配置自动准备依赖。

如果你已经在其他 Python 环境安装了 `perfect-pixel` 及 OpenCV，可以在启动 Vite 前指定解释器：

```powershell
$env:PERFECT_PIXEL_PYTHON = "python"
npm.cmd run dev
```

PerfectPixel 不可用时，流程会记录错误并回退到现有网格检测或首选画板像素化适配器；调试目录中的 `05c-perfect-pixel-output.png` 只有在 PerfectPixel 成功并被选中时才会生成。

## 查看 AI 生成中间文件

每次生成会自动保存一条调试记录到项目根目录的 `debug/generations/`，每次生成使用独立目录，不会覆盖之前的记录：

- 原始上传图片和发送给 AI 前的预处理图片；
- AI 原始响应、AI 返回图片和浏览器解码后的像素图；
- PerfectPixel 还原后的真实像素图（`05c-perfect-pixel-output.png`）及运行诊断；
- 每个网格恢复适配器的结果、最终选中的网格及恢复诊断 JSON；
- MARD221 映射结果、最终图纸 PNG 和 `PatternDocument` JSON。

调试文件只在本地开发服务器运行时自动写入，不会包含 API Key。`debug/` 已加入 Git 忽略，不应提交这些生成产物。
