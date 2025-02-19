# Markdown Web Clipper (Enhanced Version)

> **重要说明**：本项目是基于 [deathau/markdownload](https://github.com/deathau/markdownload) 的增强版本。使用Cursor工具对原项目进行了bug修复和功能增强，以提供更好的用户体验。
>
> **主要改进**：
> - 增强的图片处理功能
> - 改进的MathJax支持
> - 优化的代码结构
> - 适用Manifest3规范
>
> **免责声明**：
> - 本项目是一个独立的分支版本，与原作者无关
> - 所有新增功能和修复均遵循原项目的开源协议
> - 如有任何问题或建议，请在本项目的 Issues 中提出
> - 原项目的所有权利归属于原作者

This is an enhanced version of the extension to clip websites and download them into a readable markdown file. Please keep in mind that it is not guaranteed to work on all websites.

To use this add-on, simply click the add-on icon while you are browsing the page you want to save offline. A popup will show the rendered markdown so you can make minor edits or copy the text, or you can click the download button to download an .md file.  
Selecting text will allow you to download just the selected text

See the [Markdownload User Guide](https://github.com/nephilimbin/WebArticleClipper/user-guide.md) for more details on the functionality of this extension

# Features

## Original Features
- Convert web pages to clean, readable Markdown
- Support for various Markdown flavors
- Customizable templates
- Obsidian integration
- Multi-browser support

## Enhanced Features
- Enhanced Image Processing
  - Secure image downloading
  - Image type and MIME type validation
  - File size limitations
  - SVG security checks
  - Batch download support
  - Base64 encoding support
- Improved MathJax Support
  - Optimized formula rendering
  - Better code injection
- New Option to Hide Image URLs
- Development Tools Improvements
  - Better testing support
  - Convenient development commands
- Smart Context Menu
  - Context-aware functionality (displays different options based on clicked element type)
  - Batch operation support
  - Experimental feature marking
- Improved Image Processing
  - Right-click menu for direct image Markdown copy
  - Local image path conversion

# Installation
The extension is available for [Google Chrome] and [Microsoft Edge]
You can search for the software name to find it. 

# Local Development

## Prerequisites
- Node.js (Latest LTS version recommended)
- npm or yarn
- Chrome, Firefox, or Edge browser for testing

## Setup
1. Clone the repository
```bash
git clone https://github.com/nephilimbin/WebArticleClipper.git
cd markdownload
```

2. Install dependencies
```bash
npm install
```

## Development Commands
- Start development with Chrome:
```bash
npm run dev:chrome
```

- Build for production:
```bash
npm run build
```


### Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `dist` directory

### Edge
1. Open Edge and navigate to `edge://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist` directory

## Development Notes
- The extension uses web-ext for development and testing
- Configuration can be found in `web-ext-config.js`
- Source files are in the `src` directory
- Build output goes to the `dist` directory


</details>

# External Libraries
It uses the following libraries:
- [Readability.js](https://github.com/mozilla/readability) by Mozilla version [0.5.0](https://github.com/mozilla/readability/releases/tag/0.5.0). This library is also used for the Firefox Reader View and it simplifies the page so that only the important parts are clipped. (Licensed under Apache License Version 2.0)
- [Turndown](https://github.com/mixmark-io/turndown) by Dom Christie in version [7.2.0](https://github.com/mixmark-io/turndown/releases/tag/v7.2.0) is used to convert the simplified HTML (from Readability.js) into markdown. (Licensed under MIT License)
- [dayjs.js](https://github.com/iamkun/dayjs/releases) version 1.11.13 used to format dates in template variables

# Permissions
- Data on all sites: used to enable "Download All Tabs" functionality - no other data is captured or sent online
- Access tabs: used to access the website content when the icon in the browser bar is clicked.
- Manage Downloads: necessary to be able to download the markdown file.
- Storage: used to save extension options
- Clipboard: used to copy Markdown to clipboard

--- 

## Pricing
This is an open-source extension made *for fun*. Its intention is to be completely free.
It's free on Edge and Chrome (and other Chromium browsers).
Due to the high costs associated with Apple's developer program, a Safari version is not currently available.



# Version History
See [CHANGELOG.md](./CHANGELOG.md) for detailed version history.
