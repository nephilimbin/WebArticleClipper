# MarkDownload - Markdown Web Clipper 项目结构

## 核心目录
/src
├── background/           # 后台脚本
│   ├── apache-mime-types.js  # MIME类型处理
│   ├── background.js         # 主后台逻辑
│   ├── moment.min.js         # 时间处理库
│   ├── Readability.js        # 网页内容提取
│   ├── turndown.js           # HTML转Markdown
│   └── turndown-plugin-gfm.js # GFM支持
├── popup/               # 弹出窗口
│   ├── lib/
│   │   ├── codemirror.css    # 编辑器样式
│   │   └── codemirror.js     # 编辑器核心
│   ├── popup.html           # 弹出页面
│   └── popup.js            # 弹出页面逻辑
├── shared/              # 共享代码
│   └── context-menus.js    # 右键菜单
├── contentScript/       # 内容脚本
├── icons/              # 图标资源
├── options/            # 选项页面
├── browser-polyfill.min.js # 浏览器兼容层
├── manifest.json       # 扩展清单
└── package.json        # 项目配置

## 其他目录
/xcode                  # Safari扩展相关
/web-ext-artifacts      # 构建输出