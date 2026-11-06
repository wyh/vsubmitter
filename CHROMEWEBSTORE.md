# Chrome Web Store Listing — vsubmitter

> Last Updated: 2026-11-05

## Store Listing

**Extension Name**
vsubmitter - 多平台内容一键提交助手

**Short Description**
一键将视频标题、描述、话题标签及封面图同步填入小红书、抖音、视频号与B站创作者后台。

**Detailed Description**
vsubmitter 是一款专为自媒体创作者打造的轻量高效填表工具，帮助创作者告别在多个平台后台来回复制粘贴、打标签的繁琐重复劳动。

【核心功能】
1. 一键同步多平台：支持小红书、抖音、微信视频号、哔哩哔哩（B站）四大主流平台创作者后台。
2. Markdown 智能拆解：支持直接粘贴 Markdown 文本，自动识别提取标题、正文描述与 #话题标签。
3. 平台规则自动适配：
   - 小红书标题严格限制 20 字，自动截取前 20 字；
   - 抖音标题限制 30 字，自动截取前 30 字，描述与话题同步填入富文本区；
   - 视频号短标题智能提取过滤，保证 6~16 字要求，正文与标签同步填入；
   - B站标题上限 80 字，标签自动模拟回车键生成 Tag 气泡。
4. 素材上传与封面注入：支持视频文件注入上传，支持拖拽、本地选图或剪贴板直接粘贴（Cmd+V）设置封面图。
5. 双模交互：支持常规弹窗与浏览器侧边栏（Side Panel）常驻模式，多标签页核对极其方便。
6. 安全可控：插件仅执行表单填写体力活，最终提交发布按钮由创作者核对后手动点击，零封号与风控风险。

【使用方法】
1. 打开小红书、抖音、视频号、B站创作者后台（或勾选由插件自动打开）。
2. 点击插件图标，粘贴文案 Markdown，自动完成结构化拆解。
3. （可选）选择视频文件或封面图片。
4. 点击「一键同步填入所选平台」。
5. 到各标签页核对无误后，手动点击各平台的发布按钮。

【隐私与安全】
vsubmitter 纯本地前端运行，不收集、不上传任何个人隐私、账号凭据或作品数据至第三方服务器。

**Category**
Productivity

**Single Purpose**
一键将视频标题、正文描述、话题标签与封面图同步填入四大主流平台的创作者发布后台。

**Primary Language**
Chinese (Simplified)

## Permissions Justification

| Permission | Type | Justification |
| :--- | :--- | :--- |
| `tabs` | permissions | 用于检测当前窗口是否已打开小红书、抖音、视频号或B站创作者后台页面，并切换或新建对应标签页。 |
| `scripting` | permissions | 用于在用户点击同步填入时，将表单填写适配器脚本安全注入到目标平台的创作者后台页面中。 |
| `storage` | permissions | 用于在本地保存用户的草稿内容（标题、描述、标签等），避免意外关闭扩展导致内容丢失。 |
| `sidePanel` | permissions | 提供在浏览器侧边栏常驻运行扩展面板的能力，方便用户在多个后台标签页之间切换核对。 |
| `*://*.xiaohongshu.com/*` | host_permissions | 注入小红书创作者发布表单填写脚本。 |
| `*://*.douyin.com/*` | host_permissions | 注入抖音创作者发布表单填写脚本。 |
| `*://channels.weixin.qq.com/*` | host_permissions | 注入微信视频号助手发布表单填写脚本。 |
| `*://*.bilibili.com/*` | host_permissions | 注入哔哩哔哩创作者服务中心发布表单填写脚本。 |

## Privacy & Data Use

### Data Collection
- Personal information: None
- Authentication information: None (Directly uses existing browser session)
- Content data: Stored strictly in local `chrome.storage.local`, never transmitted externally.
