# Changelog

## [Unreleased]

### Added
- Added web-ext-config.js for better build configuration
- Added Mac-specific test scripts for Chrome and Firefox
- Added new dev commands for easier development
- Added test URLs to target specific GitHub repository
- 新增图片处理模块 (image-handler.js)
  - 支持安全的图片下载功能
  - 实现图片类型验证
  - 添加文件大小限制
  - SVG 安全性检查
  - MIME 类型验证
- 重构图片下载功能
  - 添加新的 ImageHandler 类处理图片下载
  - 实现安全的 MIME 类型验证
  - 添加文件大小限制
  - 改进错误处理和日志记录
  - 支持批量下载图片
  - 添加 base64 编码支持
- 新增隐藏图片URL功能
  - 添加 Hide picture md url 选项
  - 支持在预览和下载时隐藏图片链接
  - 默认不隐藏图片链接

### Changed
- 优化 MathJax 处理方式
  - 将 pageContext.js 内容内联到 contentScript.js
  - 移除外部脚本加载机制
  - 改进代码注入方式

### Fixed
- Fixed project structure to properly handle web-ext commands
- Updated package.json scripts to correctly reference source directory
- Added proper .gitignore rules for development files
- Fixed web-ext-config.js firefoxProfile configuration
- 修复 MathJax 相关错误
  - 改进 MathJax 检测逻辑
  - 添加错误处理
  - 优化初始化时机
- 修复图片下载功能无法正常工作的问题
  - 改进图片下载逻辑
  - 添加错误处理
  - 优化内存使用
- 修复脚本加载失败问题
  - 移除外部脚本依赖
  - 优化代码注入时机
  - 改进错误处理

## [3.4.0]
- Initial version
