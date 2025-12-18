import * as vscode from "vscode";

/**
 * 解析 JSDoc 注释为结构化数据
 * @param jsdocStr 原始 JSDoc 字符串
 * @returns 解析后的结构化对象
 * */

interface JSDocParsed {
  description: string; // 基础描述
  params: Array<{ name: string; type: string; desc: string }>; // 参数
  returns?: { type: string; desc: string }; // 返回值
  example?: string; // 示例
  [key: string]: any; // 其他自定义标签
}

export function parseJSDoc(jsdocStr: string): JSDocParsed {
  // 1. 清理 JSDoc 格式（去掉 /**、*/、行前的 * 号）
  const cleanStr = jsdocStr
    .replace(/^\/\*\*|\*\/$/g, "") // 去掉首尾的 /** 和 */
    .replace(/^\s*\*|\n\s*\*/g, "") // 去掉每行的 * 号
    .trim();

  // 2. 初始化解析结果
  const result: JSDocParsed = {
    description: "",
    params: [],
  };

  // 3. 拆分行并解析标签（支持多行标签）
  const lines = cleanStr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);
  let currentLine = 0;

  // 先提取基础描述（非 @ 开头的内容）
  while (currentLine < lines.length && !lines[currentLine].startsWith("@")) {
    result.description += lines[currentLine] + " ";
    currentLine++;
  }
  result.description = result.description.trim();

  // 解析 @ 开头的标签
  const tagRegex = /@(\w+)\s*(?:\{([^}]+)\})?\s*([\s\S]*?)(?=@|\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(cleanStr)) !== null) {
    const [, tag, type, content] = match;
    const trimmedContent = content.trim();

    switch (tag.toLowerCase()) {
      case "param":
        // 解析 @param {type} name desc（如 @param {string} label 标签文本）
        const paramMatch = trimmedContent.match(/^(\S+)\s*(.*)$/);
        if (paramMatch) {
          result.params.push({
            name: paramMatch[1],
            type: type || "",
            desc: paramMatch[2] || "",
          });
        }
        break;
      case "returns":
      case "return":
        result.returns = {
          type: type || "void",
          desc: trimmedContent || "",
        };
        break;
      case "example":
        result.example = trimmedContent;
        break;
      // 支持自定义标签（如 @author、@version）
      default:
        result[tag] = trimmedContent;
        break;
    }
  }

  return result;
}

/**
 * 将解析后的 JSDoc 转为 MarkdownString
 * @param jsdocParsed 解析后的 JSDoc 数据
 * @returns 可渲染的 MarkdownString
 */
export function jsdocToMarkdown(jsdocParsed: JSDocParsed): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  // 允许链接/命令跳转（必须开启）
  md.isTrusted = true;

  // 1. 渲染基础描述
  if (jsdocParsed.description) {
    // md.appendMarkdown(`### 描述\n${jsdocParsed.description}\n\n`);
    md.appendMarkdown(`${jsdocParsed.description}\n\n`);
  }

  // 2. 渲染参数（@param）
  if (jsdocParsed.params.length > 0) {
    // md.appendMarkdown(`### 参数\n`);
    jsdocParsed.params.forEach((param) => {
      md.appendMarkdown(`- **${param.name}** (${param.type})：${param.desc}\n`);
    });
    md.appendMarkdown("\n");
  }

  // 3. 渲染返回值（@returns）
  if (jsdocParsed.returns) {
    // md.appendMarkdown(`### 返回值\n`);
    md.appendMarkdown(`- (${jsdocParsed.returns.type})：${jsdocParsed.returns.desc}\n\n`);
  }

  // 4. 渲染示例（@example）
  if (jsdocParsed.example) {
    // md.appendMarkdown(`### 示例\n`);
    // 用代码块包裹示例（支持语法高亮）
    md.appendMarkdown(`\`\`\`html\n${jsdocParsed.example}\n\`\`\`\n\n`);
  }

  // 5. 渲染自定义标签（如 @author、@version）
  const customTags = Object.keys(jsdocParsed).filter(
    (key) => !["description", "params", "returns", "example"].includes(key)
  );
  if (customTags.length > 0) {
    // md.appendMarkdown(`### 其他信息\n`);
    customTags.forEach((tag) => {
      md.appendMarkdown(`- **@${tag}**：${jsdocParsed[tag]}\n`);
    });
  }

  return md;
}
