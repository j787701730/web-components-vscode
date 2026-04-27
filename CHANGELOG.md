# Change Log

## [0.2.2]

- 添加 html.customData 配置, script 支持 blocking="render" 属性提示

## [0.2.1]

- 使用 @babel/parser 和 @babel/traverse 更精准地匹配标签

## [0.1.5]

- 统一路径分隔符（兼容 Windows \ 和 Linux/Mac /）

## [0.1.4]

- 标签跳转 匹配规则：文件路径以 标签名.js 或 标签名/index.js 结尾

## [0.1.1]

- 修复排除文件夹错误
- 缓存文件路径统一成斜杆 /
- 文件跳转优化加斜杆 endsWith(`/${tagName}.js`)

