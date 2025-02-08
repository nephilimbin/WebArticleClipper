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
  includeTemplate: true,
  saveAs: false,
  downloadImages: false,
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
};

// 异步获取存储选项
export async function getOptions() {
  try {
    const result = await chrome.storage.sync.get(defaultOptions);
    return { ...defaultOptions, ...result };
  } catch (error) {
    console.error('Error getting options:', error);
    return defaultOptions;
  }
}

// 初始化默认选项（需要在Service Worker启动时调用）
export async function initOptions() {
  const current = await getOptions();
  return chrome.storage.sync.set(current);
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
