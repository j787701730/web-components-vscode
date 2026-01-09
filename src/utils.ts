import * as fs from 'fs';
import * as path from 'path';
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

/** 判断数据是不是对象类型 */
export const isObject = (data: any): boolean => {
  return data && `${Object.prototype.toString.call(data)}`.includes('Object');
};

export const toObject = (data: any): object => {
  return isObject(data) ? data : {};
};

export const objectClear = (data: any): void => {
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      delete data[key];
    }
  }
};

export const toArray = (data: any): Array<any> => (Array.isArray(data) ? data : []);

/**
 * 读取工作区配置文件
 */
export async function loadWorkspaceConfig(): Promise<object> {
  // 获取当前工作区根目录（无工作区时返回 undefined）
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    // vscode.window.showInformationMessage('未检测到工作区，使用默认配置');
    return {};
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const configPath = path.join(workspaceRoot, 'components.d.json');

  try {
    // 检查配置文件是否存在
    await vscode.workspace.fs.stat(vscode.Uri.file(configPath));
    // 读取配置文件内容
    const fileContent = fs.readFileSync(configPath, 'utf8');
    const customConfig: Record<string, any> = toObject(JSON.parse(fileContent));
    const obj: any = {};
    for (const [key, value] of Object.entries(customConfig)) {
      const keys = key
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item);
      for (const key of keys) {
        if (obj[key]) {
          if (value?.description) {
            obj[key].description = value?.description;
          }

          Object.assign(obj[key].attributes, value?.attributes);
        } else {
          obj[key] = value;
        }
      }
    }

    return obj;
  } catch (error) {
    //
  }
  return {};
}

/** 获取光标前一个字符 */
export function getCharBeforeCursor(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;

  const pos = editor.selection.active;
  if (pos.character === 0) return undefined; // 行首无字符

  const prevPos = new vscode.Position(pos.line, pos.character - 1);
  const range = new vscode.Range(prevPos, pos);
  return editor.document.getText(range);
}

/**
 * 核心优化：提取光标位置的 HTML 属性名（支持折行）
 */
export function getAttributeNameAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): {
  tagName: string | null;
  attrName: string | null;
  range: { start: number; end: number } | null;
  isEndTag: boolean;
} {
  const docText = document.getText();
  const docOffset = document.offsetAt(position);
  const res: any = { tagName: null, attrName: null, range: null, isEndTag: false };
  // 1. 向前找标签开始符 `<`
  let startOffset = docOffset;
  while (startOffset > 0) {
    startOffset--;
    if (docText[startOffset] === '<') {
      break;
    }
    /** 是结束标签 */
    if (docText[startOffset] === '>') {
      return res;
    }
    if (docText[startOffset] === '/') {
      res.isEndTag = true;
      return res;
    }
  }
  if (docText[startOffset] !== '<') {
    return res; // 没找到标签开始
  }

  // 2. 向后找标签结束符 `>`
  let endOffset = docOffset;
  while (endOffset < docText.length) {
    endOffset++;
    if (docText[endOffset] === '>') {
      break;
    }
  }
  if (docText[endOffset] !== '>') {
    return res; // 没找到标签结束
  }

  // 3. 提取标签内容（去掉 `<` 和 `>`）
  const tagContent = docText.substring(startOffset + 1, endOffset);

  // 4. 解析标签名（过滤换行、空格、属性）
  // 匹配规则：忽略换行/空格，提取第一个单词（区分结束标签）
  const tagMatch = tagContent.match(/^\s*(\/?)\s*([a-zA-Z0-9-]+)/);
  if (!tagMatch) {
    return res;
  }

  const isClosingTag = tagMatch[1] === '/';
  const tagName = tagMatch[2].toLowerCase(); // 统一转小写
  res.tagName = isClosingTag ? null : tagName;
  const tagRange = { start: startOffset + 1, end: endOffset };
  res.range = tagRange;

  // 1. 边界校验：确保光标在标签范围内
  if (docOffset < tagRange.start || docOffset > tagRange.end) return res;

  // 先匹配标签名，然后截取标签名后的内容（只保留属性部分）
  const tagNameMatch = tagContent.match(/^\s*(\/?)\s*([a-zA-Z0-9-]+)\s*/);

  if (!tagNameMatch) return res;
  // 截取标签名后的所有内容（纯属性区域）
  const attrContent = tagContent.substring(tagNameMatch[0].length);
  // 计算光标在纯属性区域中的相对偏移
  const tagContentOffset = docOffset - tagRange.start; // 光标在整个标签内容中的偏移
  const attrRelativeOffset = tagContentOffset - tagNameMatch[0].length; // 光标在纯属性区域的偏移

  // 3. 处理纯属性区域的换行和偏移映射
  const offsetMap = [];
  let cleanAttrContent = '';
  for (let i = 0; i < attrContent.length; i++) {
    const char = attrContent[i];
    if (char !== '\n' && char !== '\r') {
      offsetMap.push(i); // 记录原始属性区域的位置
      cleanAttrContent += char;
    }
  }

  // 4. 计算光标在去换行后的纯属性内容中的位置
  let cleanCursorPos = -1;
  if (attrRelativeOffset >= 0) {
    // 光标在属性区域内
    for (let i = 0; i < offsetMap.length; i++) {
      if (offsetMap[i] >= attrRelativeOffset) {
        cleanCursorPos = i;
        break;
      }
    }
  } else {
    // 光标在标签名和第一个属性之间（比如 <div | class="box">）
    cleanCursorPos = 0; // 归到第一个属性的起始位置
  }
  if (cleanCursorPos === -1 && cleanAttrContent.length > 0) {
    cleanCursorPos = cleanAttrContent.length - 1; // 处理光标在属性区域末尾的情况
  }

  // 5. 匹配所有属性（优化正则，精准匹配属性名）
  const attrRegex = /([a-zA-Z0-9-]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;
  let match;
  let resultAttr = null;

  while ((match = attrRegex.exec(cleanAttrContent)) !== null) {
    const attrName = match[1];
    const attrStart = match.index;
    const attrEnd = attrRegex.lastIndex;

    // 判断光标是否在当前属性范围内
    if (cleanCursorPos >= attrStart && cleanCursorPos <= attrEnd) {
      resultAttr = attrName.toLowerCase();
      break;
    }
  }

  return { attrName: resultAttr, tagName: res.tagName, range: res.range, isEndTag: res.isEndTag };
}
