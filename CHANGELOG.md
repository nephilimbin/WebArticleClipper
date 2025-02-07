# Changelog

## [3.5.0] - 2024-03-15

### Changed
- 升级Manifest至V3规范
- 重构后台脚本为Service Worker
- 使用ES Modules模块系统
- 更新API调用方式（chrome.*代替browser.*）
- 优化权限声明方式
- 移除browser-polyfill依赖
- 重构Readability为ES模块
- 升级turndown.js至ES模块规范
- 重构模块导入导出方式以兼容Manifest V3
- 保持核心转换逻辑零修改
- 升级turndown-plugin-gfm.js至ES模块规范
- 保持GFM插件功能零修改
- 升级content_script.js至ES模块规范
- 统一使用chrome.*命名空间API
- 整合page_context.js到content_script.js
- 优化代码组织结构，减少文件数量
- 升级options.js至使用chrome.* API
- 升级popup.js至使用chrome.* API
- 优化弹出窗口消息通信机制

### 新增
- 图片处理功能增强
  - 新增图片处理模块 (image-handler.js)
  - 支持安全的图片下载功能
  - 实现图片类型验证和MIME类型验证
  - 添加文件大小限制
  - SVG 安全性检查
  - 支持批量下载图片
  - 添加 base64 编码支持
- 新增隐藏图片URL功能
  - 添加 Hide picture md url 选项
  - 支持在预览和下载时隐藏图片链接
  - 默认不隐藏图片链接
- 开发工具改进
  - 添加 web-ext-config.js 配置文件
  - 新增 Mac 专用的 Chrome 和 Firefox 测试脚本
  - 添加便捷开发命令
  - 新增特定 GitHub 仓库测试 URL

### 优化
- 优化 MathJax 处理方式
  - 将 page_context.js 内容内联到 content_script.js
  - 移除外部脚本加载机制
  - 改进代码注入方式
- 项目结构优化
  - 改进 web-ext 命令处理
  - 更新 package.json 脚本以正确引用源目录
  - 完善 .gitignore 规则
  - 修正 web-ext-config.js 的 firefoxProfile 配置

### 修复
- MathJax 相关问题修复
  - 改进 MathJax 检测逻辑
  - 添加错误处理
  - 优化初始化时机
- 图片下载功能修复
  - 改进图片下载逻辑
  - 添加错误处理
  - 优化内存使用
- 脚本加载问题修复
  - 移除外部脚本依赖
  - 优化代码注入时机
  - 改进错误处理
- 修复内容脚本消息处理器缺失问题
- 完善后台与内容脚本的通信机制

## [3.5.1] - 2024-03-20
### Fixed
- 修正表格对齐映射规则
- 增强任务列表项内容提取
- 优化真实网页测试选择器
### Changed
- 使用更灵活的正则表达式进行断言

## [3.4.0]
- Fixed extra spaces in titles which could cause issues (thanks @rickdoesdev !)
- Fixed an issue with image paths in some circumstances (thanks @rickdoesdev !)
- Added parametersizations for "mixed-kebab" and "mixed_snake" which retain original casing but replace spaces (thanks @NSHenry !)
  - Also added a special "obsidian-cal" parameterization which is the same as "mixed-kebab" with duplicate `-` removed for additional compatibility with the Obsidian Consistent Attachment Location plugin (thanks @NSHenry !)
- Added lowecase and uppercase options to parameterizations (thanks @redxtech !)
- Updated Turndown to v7.1.3 (thanks @WeHat !)
- Updated Readability to v0.5.0 (thanks @WeHat !)
- Fixed some issues with code block parsing and formatting (thanks @WeHat !)
- Fixed an issue with some sites missing a proper title (thanks @WeHat !)
- Fixed an issue with bad base urls causing issues with links in certain circumstances (thanks @WeHat !)
- Fixed an issue with readability removing everything in certain circumstances (thanks @WeHat !)
- Send properly configured title to the Obsidian integration (thanks @nekton39 !)
- Updates to the README (thanks @2gn and @eugenesvk !)

## [3.5.0] - 2023-12-01
### Fixed
- 修复弹出窗口重复获取配置的问题
- 优化下载消息处理流程

## [3.5.1] - 2024-02-20
### Removed
- 移除未使用的Base64转换功能(image-handler.js)
