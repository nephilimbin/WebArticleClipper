// these are the default options
const defaultOptions = {
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
  return new Promise((resolve) => {
    chrome.storage.sync.get(defaultOptions, (result) => {
      resolve({ ...defaultOptions, ...result });
    });
  });
}

// 初始化默认选项（需要在Service Worker启动时调用）
export async function initOptions() {
  try {
    const current = await getOptions();
    await chrome.storage.sync.set(current);
  } catch (error) {
    console.error('Options initialization failed:', error);
  }
}

// 更新选项存储
export async function saveOptions(options) {
  try {
    await chrome.storage.sync.set(options);
    await createMenus(); // 同步更新右键菜单
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
