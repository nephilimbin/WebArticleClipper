// these are the default options
export const defaultOptions = {
  headingStyle: 'atx',
  hr: '___',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '_',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  linkReferenceStyle: 'full',
  imageStyle: 'markdown',
  imageRefStyle: 'inlined',
  frontmatter: '---\ncreated: {date:YYYY-MM-DDTHH:mm:ss} (UTC {date:Z})\ntags: [{keywords}]\nsource: {baseURI}\nauthor: {byline}\n---\n\n# {pageTitle}\n\n> ## Excerpt\n> {excerpt}\n\n---',
  backmatter: '',
  title: '{pageTitle}',
  includeTemplate: false,
  saveAs: false,
  downloadImages: true,
  imagePrefix: '{pageTitle}/',
  mdClipsFolder: null,
  disallowedChars: '[]#^',
  downloadMode: 'downloadsApi',
  turndownEscape: true,
  contextMenus: true,
  obsidianIntegration: false,
  obsidianVault: '',
  obsidianFolder: '',
  hidePictureMdUrl: false,
  mathJaxRendering: true,
  autoSanitize: true,
  clipSelection: true,
};

// 异步获取存储选项
export async function getOptions() {
  try {
    const stored = await chrome.storage.sync.get(null);
    console.log('原始存储数据:', stored);

    const merged = {
      ...defaultOptions,
      ...stored,
      mathRendering: {
        ...defaultOptions.mathRendering,
        ...(stored.mathRendering || {}),
      },
    };

    // 环境兼容性检测
    if (!chrome.downloads) {
      merged.downloadMode = 'contentLink';
      console.warn('下载API不可用，强制使用内容链接模式');
    }

    console.log('合并后配置:', merged);
    return merged;
  } catch (err) {
    console.error('配置加载失败:', err);
    return defaultOptions;
  }
}

// 初始化默认选项（需要在Service Worker启动时调用）
export async function initOptions() {
  try {
    const current = await getOptions();
    // 深度合并确保默认值
    const finalOptions = {
      ...defaultOptions,
      ...current,
      mathRendering: { ...defaultOptions.mathRendering, ...current.mathRendering },
    };
    await chrome.storage.sync.set(finalOptions);
    console.log('存储初始化完成，当前配置:', finalOptions);
  } catch (error) {
    console.error('存储初始化失败:', error);
    throw error;
  }
}

// 更新选项存储
export async function saveOptions(options) {
  try {
    await chrome.storage.sync.set(options);
  } catch (error) {
    console.error('Options save failed:', error);
    throw error;
  }
}

// 监听存储变化
chrome.storage.onChanged.addListener((changes) => {
  chrome.runtime.sendMessage({
    type: 'optionsUpdated',
    changes: changes,
  });
});
