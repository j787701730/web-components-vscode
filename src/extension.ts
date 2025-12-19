import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * js 文件路径缓存
 */
const componentFilesPathCache = new Set<string>();

/**
 * 判断文件路径是否属于忽略目录
 * @param filePath 文件绝对路径
 * @param ignoreDirs 忽略的目录列表（支持 glob 或绝对路径）
 * @returns true=忽略，false=处理
 */
function isIgnoredPath(filePath: string, ignoreDirs: string[] = ['node_modules', '.git', 'dist']): boolean {
  // 1. 统一路径分隔符（兼容 Windows \ 和 Linux/Mac /）
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

  // 2. 检查是否包含忽略目录（支持多级目录，如 a/node_modules/b）
  return ignoreDirs.some((dir) => {
    // 匹配 "任意位置/忽略目录/任意位置" 或 "忽略目录/任意位置"
    const regex = new RegExp(`(^|/)${dir.toLowerCase()}(/|$)`);
    return regex.test(normalizedPath);
  });
}

let statusBarItem: vscode.StatusBarItem;

// 激活插件时注册跳转提供者
export function activate(context: vscode.ExtensionContext) {
  getAllWorkspaceFiles();

  // ========== 1. 创建状态栏项 ==========
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left, // 位置：右侧（Left 为左侧）
    0 // 优先级（数值越大越靠右/左）
  );

  // ========== 2. 配置状态栏样式和内容 ==========
  statusBarItem.text = '$(code) web'; // 文本 + 内置图标（tag 是标签图标）
  const tooltip = new vscode.MarkdownString(
    `
 ## web components vscode
---
- [$(refresh)刷新缓存](command:htmlTagJump.refreshCache)

    `,
    true
  );

  tooltip.isTrusted = true;

  statusBarItem.tooltip = tooltip;
  // statusBarItem.command = "htmlTagJump.refreshCache"; // 点击触发的命令

  // ========== 3. 显示状态栏 ==========
  statusBarItem.show();

  // ========== 4. 注册状态栏点击的自定义命令 ==========
  const refreshCommand = vscode.commands.registerCommand('htmlTagJump.refreshCache', async () => {
    // 点击事件逻辑：刷新组件缓存
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在刷新数据缓存...',
      },
      async () => {
        componentFilesPathCache.clear();
        // 模拟刷新逻辑
        await getAllWorkspaceFiles();
        statusBarItem.text = `$(tag) HTML标签跳转`;
      }
    );
  });

  // ========== 1. 监听文件新增 ==========
  const createListener = vscode.workspace.onDidCreateFiles((event) => {
    console.log('检测到文件新增：', event.files);
    event.files.forEach((fileUri) => {
      const filePath = fileUri.fsPath;
      // 核心：跳过忽略目录的文件
      if (isIgnoredPath(filePath)) {
        console.log(`忽略新增文件（属于忽略目录）：${filePath}`);
        return;
      }
      // 过滤需要关注的文件（如 html/vue 组件）
      if (['.js'].includes(path.extname(filePath))) {
        componentFilesPathCache.add(filePath);
      }
    });
  });

  // ========== 2. 监听文件删除 ==========
  const deleteListener = vscode.workspace.onDidDeleteFiles((event) => {
    console.log('检测到文件删除：', event.files);
    event.files.forEach((fileUri) => {
      const filePath = fileUri.fsPath;
      // 核心：跳过忽略目录的文件
      if (isIgnoredPath(filePath)) {
        console.log(`忽略新增文件（属于忽略目录）：${filePath}`);
        return;
      }
      if (['.js'].includes(path.extname(filePath))) {
        componentFilesPathCache.delete(filePath);
      }
    });
  });

  // ========== 3. 监听文件重命名/移动 ==========
  const renameListener = vscode.workspace.onDidRenameFiles((event) => {
    console.log('检测到文件重命名：', event.files);
    event.files.forEach((renameInfo) => {
      const oldPath = renameInfo.oldUri.fsPath;
      const newPath = renameInfo.newUri.fsPath;
      // 核心：跳过忽略目录的文件
      if (isIgnoredPath(newPath)) {
        console.log(`忽略新增文件（属于忽略目录）：${newPath}`);
        return;
      }

      // 处理组件重命名
      if (['.js'].includes(path.extname(oldPath)) || ['.js'].includes(path.extname(newPath))) {
        // 更新缓存
        componentFilesPathCache.delete(oldPath);
        componentFilesPathCache.add(newPath);
      }

      console.log([...componentFilesPathCache]);
    });
  });

  // 注册 HTML 标签跳转的定义提供者
  const disposable = vscode.languages.registerDefinitionProvider(
    // 匹配的文件类型：html、vue、htm 等
    [
      { scheme: 'file', language: 'html' },
      { scheme: 'file', language: 'javascript' },
    ],
    new HtmlTagDefinitionProvider()
  );

  // ========== 1. 注册 Hover 提供者 ==========
  const hoverProvider = vscode.languages.registerHoverProvider(
    // 生效的文件类型：html、vue
    [
      { scheme: 'file', language: 'html' },
      { scheme: 'file', language: 'javascript' },
    ],
    {
      // 核心方法：提供悬停提示
      async provideHover(document: vscode.TextDocument, position: vscode.Position) {
        // 步骤1：获取光标位置的 HTML 标签名
        const tagName = getTagNameAtPosition(document, position);

        if (!tagName) {
          return undefined; // 非标签，不显示悬停提示
        }

        const targetFile = [...componentFilesPathCache].find((el) => el.endsWith(`${tagName}.js`)) || null;

        if (targetFile) {
          try {
            // 1. 读取文件（返回 Uint8Array）
            const fileData = await vscode.workspace.fs.readFile(vscode.Uri.file(targetFile));
            const content = Buffer.from(fileData).toString('utf8');
            // 只取前 200 行
            const firstLines = content.split('\n').slice(0, 200).join('\n');

            // 只支持 多行 注释 /** */
            // const regex = /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)*?(\/\*[\s\S]*?\n[\s\S]*?\*\/)/;

            // 匹配单/多行注释 /** */
            const regex = /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)*?(\/\*[\s\S]*?\*\/)/;
            const match = firstLines.match(regex);

            if (match) {
              // 3. 清理注释格式（去掉 /*、*/、每行的 * 号，保留纯内容）
              const cleanComment = match[1]
                .replace(/^\/\*/, '') // 去掉开头的 /*
                .replace(/\*\/$/, '') // 去掉结尾的 */
                .replace(/^\s*\*|\n\s*\*/g, '') // 去掉每行的 * 号（可选，根据需求）
                .replace(/^\n+|\n+$/g, '') // 去掉首尾多余换行
                .trim()
                .replace(/\r\n/g, '\n') // 将 CRLF 转为 LF
                .replace(/\r/g, '\n'); // 将单独的 CR 转为 LF; // 去除首尾空白

              const md = new vscode.MarkdownString();
              // 允许链接/命令跳转（必须开启）
              md.isTrusted = true;

              cleanComment.split('\n').forEach((li) => {
                md.appendMarkdown(`${li}\n\n`);
              });

              return new vscode.Hover(md, getTagRange(document, position, tagName));
            } else {
              // vscode.window.showInformationMessage(
              //   "No leading block comment found"
              // );
            }
          } catch (error) {
            // const err = error as Error;
            // vscode.window.showErrorMessage(`读取文件失败：${err.message}`);
            // throw err; // 抛出错误，让调用方处理
          }
        }
      },
    }
  );

  context.subscriptions.push(
    statusBarItem,
    refreshCommand,
    disposable,
    createListener,
    deleteListener,
    renameListener,
    hoverProvider
  );
  console.log('HTML 标签跳转插件已激活');
}

/**
 * 获取当前工作区的所有文件路径
 * @param include 包含的文件（glob 表达式，默认所有文件）
 * @param exclude 排除的文件（glob 表达式，默认忽略 node_modules/.git 等）
 * @returns 所有文件的 URI 路径数组
 */
export async function getAllWorkspaceFiles(
  include: string = '**/*',
  exclude: string = '**/node_modules/**|**/.git/**|**/dist/**'
): Promise<string[]> {
  // 1. 检查是否有打开的工作区
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showWarningMessage('未打开任何工作区！');
    return [];
  }

  // 2. 查找工作区文件（glob 匹配）
  const fileUris = await vscode.workspace.findFiles(include, exclude, undefined);

  fileUris.forEach((uri) => {
    if (['.js'].includes(path.extname(uri.fsPath))) {
      // 更新缓存
      componentFilesPathCache.add(uri.fsPath);
    }
  });
  return [];
}

/**
 * 辅助函数：获取标签的范围（精准匹配，避免悬停范围过大）
 * @param document
 * @param position
 * @param tagName
 * @returns
 */
function getTagRange(document: vscode.TextDocument, position: vscode.Position, tagName: string): vscode.Range {
  const lineText = document.lineAt(position.line).text;
  const tagRegex = new RegExp(`<\/?(${tagName})[\s>\n\r]`);
  const match = tagRegex.exec(lineText);
  if (!match) {
    return new vscode.Range(position, position);
  }
  const start = new vscode.Position(position.line, match.index + 1);
  const end = new vscode.Position(position.line, match.index + 1 + tagName.length);
  return new vscode.Range(start, end);
}

// 提取光标位置的 HTML 标签名
const getTagNameAtPosition = (document: vscode.TextDocument, position: vscode.Position): string | null => {
  // 获取当前行文本
  const lineText = document.lineAt(position.line).text;
  // 简化版：匹配光标附近的 HTML 标签（<xxx ...> 或 </xxx>）
  // const tagRegex = /<\/?([a-zA-Z0-9-]+)[\s>]/g;
  const tagRegex = /<\/?([a-zA-Z0-9-]+)(?:\s|>|$|\n|\r)/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(lineText)) !== null) {
    const tagStart = match.index + 1; // 跳过 < 或 </
    const tagEnd = tagRegex.lastIndex - (match[0].endsWith('>') ? 1 : 0);
    // 判断光标是否在标签名范围内
    if (position.character >= tagStart && position.character <= tagEnd) {
      return match[1];
    }
  }

  return null;
};

// 定义跳转提供者类
class HtmlTagDefinitionProvider implements vscode.DefinitionProvider {
  // 核心方法：处理跳转请求
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[] | vscode.LocationLink[] | undefined> {
    try {
      // 1. 获取光标位置的 HTML 标签名
      const tagName = getTagNameAtPosition(document, position);
      if (!tagName) {
        return undefined;
      }

      // 2. 定位标签对应的文件（示例：跳转到同目录下的 [标签名].html）
      // 可根据业务逻辑修改（如组件库、模板路径等）
      const targetPath = this.getTargetFilePath(tagName);
      if (!targetPath || !fs.existsSync(targetPath)) {
        // vscode.window.showWarningMessage(`未找到 ${tagName} 对应的文件`);
        return undefined;
      }

      // 3. 构建跳转目标位置（默认跳转到文件第一行第一列）
      const targetUri = vscode.Uri.file(targetPath);
      const targetRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));

      return [new vscode.Location(targetUri, targetRange)];
    } catch (error) {
      // console.error("HTML 标签跳转失败:", error);
      return undefined;
    }
  }

  // 自定义：根据标签名定位目标文件
  getTargetFilePath(tagName: string): string | null {
    const targetFile = [...componentFilesPathCache].find((el) => el.endsWith(`${tagName}.js`)) || null;
    return targetFile;
  }
}

export function deactivate() {}

