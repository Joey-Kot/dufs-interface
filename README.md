# Dufs Interface

一个供 [dufs](https://github.com/Joey-Kot/dufs) 使用的独立前端资源项目。构建结果可以通过 dufs 的 `--assets <path>` 参数替换内置界面；所有文件读写、认证和权限判断仍由 dufs 完成，前端不需要额外的后端服务。

## 功能

### 文件浏览

- 默认列表视图，也可切换为图标视图；目录始终排在文件之前。
- 面包屑导航、返回上级、刷新、实时搜索和深色/浅色主题。
- 图标视图可展示图片缩略图、视频首帧和音频内嵌封面；图片超过 15 MiB 时仅显示文件图标，避免下载和解码原图造成资源占用。
- 图片支持 `svg`、`png`、`jpg/jpeg`、`gif`、`webp`、`avif`、`bmp`、`ico`、`tiff`。
- 音频支持 `mp3`、`ogg`、`opus`、`flac`、`m4a`、`aac`、`wav`；音频封面从内嵌标签读取，FLAC 另有 `METADATA_BLOCK_PICTURE` 后备解析。
- 视频支持 `mp4`、`mkv`、`webm`、`mov`。缩略图能否显示取决于浏览器是否支持对应编解码器。
- 单选时桌面端显示属性面板，包括名称、类型、大小、修改时间和路径；移动端将操作收纳到行末菜单。

### 选择、下载与移动

- 工具栏多选模式、`Ctrl` / `Cmd` 点选，以及列表和图标视图中的鼠标拖拽圈选。
- 批量下载会在浏览器内合并为一个 ZIP 文件，根目录使用独立的批次名称，避免采用某个已选目录作为压缩包名称。
- 单文件直接下载；文件夹通过 dufs 的 `?zip` 接口下载。
- 可将文件或目录拖到同级目录卡片/行中移动。不能将目录移动到自身或其子目录。

### 文件管理

- 新建空文件和目录。
- 上传单个、多个文件；选择文件夹或拖入文件夹上传。
- 文件夹上传会先递归创建目录，再将文件上传到相应路径；上传队列支持查看、悬停展开和点击固定。
- 重命名、复制、删除文件或目录；批量删除会先确认。
- 纯文本文件可在页面内编辑并保存。已知二进制扩展名会被拒绝；无后缀文件会额外检测 ELF 文件头，避免把 Linux 可执行文件按文本打开。

### 媒体预览与响应式界面

- 图片、音频和视频在页面内预览；预览窗口可下载原文件。
- 音频和视频使用浏览器原生播放控件；`.webm` 会根据响应的 `Content-Type` 区分音频或视频。
- 顶部导航、文件信息和列表表头保持在工作区内，实际文件列表独立滚动。
- 小屏幕下工具栏会折叠为菜单，长面包屑自动保留末级路径；详情面板隐藏，行末菜单保留所有操作。

## Dufs 接口与权限

界面从 dufs 的目录 JSON 响应读取当前目录、路径与权限。下表列出实际使用的 HTTP/WebDAV 方法：

| 界面操作 | 请求方式 | dufs 开关 |
| --- | --- | --- |
| 列出目录、读取文件、实时搜索 | `GET ?json`、`GET ?json&q=<query>` | 搜索需要 `--allow-search` |
| 下载文件、下载目录 ZIP | `GET`、`GET ?zip` | 目录归档需要 `--allow-archive` |
| 上传文件、新建文件、保存文本 | `PUT` | `--allow-upload` |
| 新建目录、文件夹上传的目录树 | `MKCOL` | `--allow-upload` |
| 重命名、拖入目录移动 | `MOVE` | `--allow-upload --allow-delete` |
| 复制文件或目录 | `COPY` | `--allow-upload` |
| 删除文件或目录 | `DELETE` | `--allow-delete` |

权限不足时，对应控件会禁用。认证、访问控制、文件系统边界和 HTTPS 均由 dufs 或其反向代理负责；此项目不绕过 dufs 的权限模型。

## 使用 Release

从仓库的 `Latest` Release 下载以下两个文件：

- `dufs-interface-assets.zip`
- `dufs-interface-assets.zip.sha256`

在同一目录中校验、解压并启动 dufs：

```bash
sha256sum -c dufs-interface-assets.zip.sha256
unzip dufs-interface-assets.zip -d dufs-interface-assets
dufs --assets "$(pwd)/dufs-interface-assets" \
  --allow-upload \
  --allow-delete \
  --allow-search \
  --allow-archive \
  /path/to/files
```

`--allow-*` 参数按需要取舍。例如只读文件浏览不应启用上传和删除；如果不需要目录 ZIP 下载，可以省略 `--allow-archive`。

解压后的目录是独立资源目录，直接传给 `--assets` 即可，不需要复制到 dufs 项目或二进制文件旁边。

## 本地开发

### 前置条件

- Node.js 24（与 CI 保持一致）
- 可运行的 dufs 实例

启动 dufs，例如：

```bash
dufs -p 12345 \
  --allow-upload \
  --allow-delete \
  --allow-search \
  --allow-archive \
  /path/to/files
```

安装依赖并启动 Vite：

```bash
npm ci
npm run dev
```

开发服务器默认将非 Vite 资源请求代理至 `http://127.0.0.1:12345`。若 dufs 运行在其他地址，启动时设置 `DUFS_PROXY`：

```bash
DUFS_PROXY=http://127.0.0.1:5000 npm run dev
```

开发服务器由终端输出实际访问地址。生产环境不需要 Vite 代理，浏览器请求会直接发往承载资源的 dufs 实例。

## 构建

```bash
npm run lint
npm run build
```

构建结果位于 `dist/`：

- Vite 编译 React、TypeScript 和样式。
- 构建后脚本内联主入口的 CSS、JavaScript 和网站图标，并保留 dufs 所需的 `__INDEX_DATA__` 占位符。
- 按需加载的音频标签解析代码仍保留在 `dist/assets/`，因此部署时应使用完整的 `dist/` 目录，而不是只复制 `index.html`。

## 项目结构

```text
src/
  App.tsx                  主界面、Dufs 请求和文件操作
  App.css                  桌面与移动端样式
  jsmediatags.d.ts         音频标签解析器的类型声明
scripts/
  prepare-dufs-assets.mjs  将构建入口处理为 Dufs 资源
.github/workflows/
  release.yml              构建并覆盖 Latest Release
```

## 依赖

- React 19 和 Vite 8：界面和构建。
- `lucide-react`：界面图标。
- `fflate`：批量下载时在浏览器中合并 ZIP。
- `jsmediatags`：读取常见音频容器的内嵌封面；仅在可见音频卡片需要时动态加载。
