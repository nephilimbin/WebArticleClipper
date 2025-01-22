# MarkDownload - Markdown Web Clipper (Enhanced Version)

[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/deathau/markdownload?style=for-the-badge&sort=semver)](https://github.com/deathau/markdownload/releases/latest)

> **重要说明**：本项目是基于 [deathau/markdownload](https://github.com/deathau/markdownload) 的增强版本。我使用Cursor工具对原项目进行了bug修复和功能增强，以提供更好的用户体验。
>
> **主要改进**：
> - 增强的图片处理功能
> - 改进的MathJax支持
> - 优化的代码结构
> - 更多自定义选项
>
> **免责声明**：
> - 本项目是一个独立的分支版本，与原作者无关
> - 所有新增功能和修复均遵循原项目的开源协议
> - 如有任何问题或建议，请在本项目的 Issues 中提出
> - 原项目的所有权利归属于原作者

This is an enhanced version of the extension to clip websites and download them into a readable markdown file. Please keep in mind that it is not guaranteed to work on all websites.

To use this add-on, simply click the add-on icon while you are browsing the page you want to save offline. A popup will show the rendered markdown so you can make minor edits or copy the text, or you can click the download button to download an .md file.  
Selecting text will allow you to download just the selected text

See the [Markdownload User Guide](https://github.com/deathau/markdownload/blob/master/user-guide.md#markdownload-user-guide) for more details on the functionality of this extension

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

# Installation
The extension is available for 
[Firefox](https://addons.mozilla.org/en-GB/firefox/addon/markdownload/), 
[Google Chrome](https://chrome.google.com/webstore/detail/markdownload-markdown-web/pcmpcfapbekmbjjkdalcgopdkipoggdi), 
[Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/hajanaajapkhaabfcofdjgjnlgkdkknm) and [Safari](https://apple.co/3tcU0pD).



# Local Development

## Prerequisites
- Node.js (Latest LTS version recommended)
- npm or yarn
- Chrome, Firefox, or Edge browser for testing

## Setup
1. Clone the repository
```bash
git clone https://github.com/deathau/markdownload.git
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

- Start development with Firefox:
```bash
npm run dev:firefox
```

- Build for production:
```bash
npm run build
```

## Testing
The extension can be tested locally using the following methods:

### Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `dist` directory

### Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in the `dist` directory

### Edge
1. Open Edge and navigate to `edge://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist` directory

## Development Notes
- The extension uses web-ext for development and testing
- Configuration can be found in `web-ext-config.js`
- Source files are in the `src` directory
- Build output goes to the `dist` directory

# Obsidian Integration

For integration with obsidian, you need to install and enable community plugins named "Advanced Obsidian URI". This plugin help us to bypass character limitation in URL. Because it's using clipboard as the source for creating new file.
More information about Advanced Obsidian URI plugin:  https://vinzent03.github.io/obsidian-advanced-uri/

You need to do some configurations in order to use this integration.
<details>
  <summary>Steps to follow</summary>
  
  1. Left-Click on the extension
  2. Click on the gear icon to open the configuration menu  
  3. Scroll down to "Obsidian integration" section and turn "enable obsidian integration" on.
  4. Fill out the form below (Obsidian vault name and Obsidian folder name.)
  5. Right-click on the extension and open the menu
  6. In "MarkDownload - Markdown Web Clipper", select "Send Tab to Obsidian"

</details>

# External Libraries
It uses the following libraries:
- [Readability.js](https://github.com/mozilla/readability) by Mozilla version [0.5.0](https://github.com/mozilla/readability/releases/tag/0.5.0). This library is also used for the Firefox Reader View and it simplifies the page so that only the important parts are clipped. (Licensed under Apache License Version 2.0)
- [Turndown](https://github.com/mixmark-io/turndown) by Dom Christie in version [7.1.3](https://github.com/mixmark-io/turndown/releases/tag/v7.1.3) is used to convert the simplified HTML (from Readability.js) into markdown. (Licensed under MIT License)
- [Moment.js](https://momentjs.com) version 2.29.4 used to format dates in template variables

# Permissions
- Data on all sites: used to enable "Download All Tabs" functionality - no other data is captured or sent online
- Access tabs: used to access the website content when the icon in the browser bar is clicked.
- Manage Downloads: necessary to be able to download the markdown file.
- Storage: used to save extension options
- Clipboard: used to copy Markdown to clipboard

--- 
The Common Mark icon courtesy of https://github.com/dcurtis/markdown-mark

## Pricing
This is an open-source extension made *for fun*. Its intention is to be completely free.
It's free on Firefox, Edge and Chrome (and other Chromium browsers).
Due to the high costs associated with Apple's developer program, a Safari version is not currently available.



# Version History
See [CHANGELOG.md](./CHANGELOG.md) for detailed version history.
