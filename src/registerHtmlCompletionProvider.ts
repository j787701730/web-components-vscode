import * as vscode from 'vscode';
import { IComponentsTags } from './types';
import { getCharBeforeCursor, toArray } from './utils';

export const componentsTags: IComponentsTags = {};

/**
 * 核心函数：获取光标位置的 HTML 标签名（支持折行）
 */
function getHtmlTagName(
  document: vscode.TextDocument,
  position: vscode.Position
): {
  tagName: string | null;
  range: { start: number; end: number } | null;
  isEndTag: boolean;
} {
  const docText = document.getText();
  const docOffset = document.offsetAt(position);
  const res: any = { tagName: null, range: null, isEndTag: false };
  // 1. 向前找标签开始符 `<`
  let startOffset = docOffset;
  while (startOffset > 0) {
    startOffset--;
    if (docText[startOffset] === '<') {
      break;
    }

    /** 标签内部 */
    if (docText[startOffset] === '>') {
      return res;
    }

    // 匹配 `/`，表示结束标签
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
  res.range = { start: startOffset + 1, end: endOffset };
  return res;
}

function getTagContent(
  document: vscode.TextDocument,
  position: vscode.Position,
  tagRange: { start: number; end: number }
) {
  const docText = document.getText();
  const docOffset = document.offsetAt(position);

  // 1. 边界校验：确保光标在标签范围内
  if (docOffset < tagRange.start || docOffset > tagRange.end) return null;

  // 2. 获取标签内容，并提取纯属性部分（去掉标签名）
  const tagContent = docText.substring(tagRange.start, tagRange.end);
  return tagContent;
}

/**
 * 核心：获取光标所在的属性名（支持属性多行）
 */
function getAttributeName(
  document: vscode.TextDocument,
  position: vscode.Position,
  tagRange: { start: number; end: number }
) {
  const docText = document.getText();
  const docOffset = document.offsetAt(position);

  // 1. 边界校验：确保光标在标签范围内
  if (docOffset < tagRange.start || docOffset > tagRange.end) return null;

  // 2. 获取标签内容，并提取纯属性部分（去掉标签名）
  const tagContent = docText.substring(tagRange.start, tagRange.end);

  // 先匹配标签名，然后截取标签名后的内容（只保留属性部分）
  const tagNameMatch = tagContent.match(/^\s*(\/?)\s*([a-zA-Z0-9-]+)\s*/);

  if (!tagNameMatch) return null;
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

  return resultAttr;
}

export function registerHtmlCompletionProvider(context: vscode.ExtensionContext) {
  const provider = vscode.languages.registerCompletionItemProvider(
    [
      { scheme: 'file', language: 'html' },
      { scheme: 'file', language: 'javascript' },
    ],
    {
      provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        const completionItems: vscode.CompletionItem[] = [];

        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const res = getHtmlTagName(editor.document, position);

        const tagName = res.tagName;

        if (res.isEndTag) {
          return;
        }

        // console.log('tagName---', tagName);
        if (tagName) {
          const attributes = componentsTags?.[tagName]?.attributes;

          // const  tags = getExistingAttributes(editor.document, position)

          if (res.range) {
            const res2 = getAttributeName(editor.document, position, res.range);
            // console.log('res2', res2);

            if (res2 && attributes[res2]) {
              const values = toArray(attributes[res2]?.values);

              values.forEach((val) => {
                const attrCompletion = new vscode.CompletionItem(val, vscode.CompletionItemKind.Property);
                // attrCompletion.documentation = new vscode.MarkdownString(`**${val}** (${val})\n\n${val}`);
                // 补全后自动添加等号和引号，光标定位到引号内
                attrCompletion.insertText = new vscode.SnippetString(`${val}`);
                completionItems.push(attrCompletion);
              });
              return completionItems;
            }
          }

          if (attributes) {
            let tagContent = '';

            if (res.range) {
              tagContent = getTagContent(editor.document, position, res.range) || '';
            }

            Object.entries(attributes).forEach(([key, value]) => {
              if (tagContent.includes(`${key}=`)) {
                return;
              }
              const attrCompletion = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
              attrCompletion.documentation = new vscode.MarkdownString(
                `**${key}** (${value.type})\n\n${value.description}`
              );
              // 补全后自动添加等号和引号，光标定位到引号内
              attrCompletion.insertText = new vscode.SnippetString(`${key}="$0"`);
              completionItems.push(attrCompletion);
            });
          }
          return completionItems;
        }

        // 原有逻辑：提示自定义标签
        Object.keys(componentsTags).forEach((tag: any) => {
          const item = new vscode.CompletionItem(tag, vscode.CompletionItemKind.Text);
          item.detail = componentsTags?.[tag]?.description || '';
          item.documentation = new vscode.MarkdownString(componentsTags[tag]?.description);
          const txt = getCharBeforeCursor();
          // console.log(getCharBeforeCursor());

          item.insertText = new vscode.SnippetString(`${txt == '<' ? '' : '<'}${tag}>$0</${tag}>`);
          completionItems.push(item);
        });

        return completionItems;
      },
    },
    '<',
    ' '
    // '=',
    // '"',
    // "'" // 新增 " 和 ' 作为触发字符（属性值补全）
  );

  context.subscriptions.push(provider);
}
