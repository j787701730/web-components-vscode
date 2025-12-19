import * as vscode from 'vscode';

/**
 * 判断文件路径是否属于忽略目录
 * @param filePath 文件绝对路径
 * @param ignoreDirs 忽略的目录列表（支持 glob 或绝对路径）
 * @returns true=忽略，false=处理
 */
export function isIgnoredPath(filePath: string, ignoreDirs: string[] = ['node_modules', '.git', 'dist']): boolean {
  // 1. 统一路径分隔符（兼容 Windows \ 和 Linux/Mac /）
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

  // 2. 检查是否包含忽略目录（支持多级目录，如 a/node_modules/b）
  return ignoreDirs.some((dir) => {
    // 匹配 "任意位置/忽略目录/任意位置" 或 "忽略目录/任意位置"
    const regex = new RegExp(`(^|/)${dir.toLowerCase()}(/|$)`);
    return regex.test(normalizedPath);
  });
}

// 提取光标位置的 HTML 标签名
export const getTagNameAtPosition = (document: vscode.TextDocument, position: vscode.Position): string | null => {
  // 获取当前行文本
  const lineText = document.lineAt(position.line).text;
  // 简化版：匹配光标附近的 HTML 标签（<xxx ...> 或 </xxx>）
  // const tagRegex = /<\/?([a-zA-Z0-9-]+)[\s>]/g;
  // 匹配更精确的 HTML 支持断行
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
