// 在文件顶部添加Service Worker生命周期管理
const SW_VERSION = '3.5.0-fix1';
console.log(`Service Worker启动 (${SW_VERSION})`);

// 添加模块导入
import './browser-polyfill.min.js';
import { initOptions } from './shared/default-options.js';
import { createMenus } from './shared/context-menus.js';
import ImageHandler from './shared/image-handler.js';
import Readability from './service_worker/Readability.js';
import mimeTypes from './service_worker/apache-mime-types.js';
import dayjs from './service_worker/dayjs.min.js';
import { getOptions, saveOptions } from './shared/default-options.js';
import { defaultOptions } from './shared/default-options.js';

// 修改浏览器信息获取逻辑
chrome.runtime.getPlatformInfo().then(async (platformInfo) => {
  // 使用特性检测替代直接调用
  const browserInfo = chrome.runtime.getBrowserInfo ? await chrome.runtime.getBrowserInfo() : { name: 'Chrome', version: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] };
  console.info('Platform Info:', platformInfo, 'Browser Info:', browserInfo);
});

// add notification listener for foreground page messages
chrome.runtime.onMessage.addListener(notify);
// create context menus
createMenus();

// function to convert the article content to markdown using Turndown
async function turndown(content, options, article) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'processMarkdown',
      content: content,
      options: options,
      article: article,
    });
    // 打印错误
    if (response.type === 'error') {
      console.error('turndown error:', response.error);
      throw new Error(response.error);
    }

    const { markdown, imageList } = response.result;
    return { markdown, imageList };
  } catch (error) {
    console.error('turndown error:', error);
    throw error;
  }
}

// function to replace placeholder strings with article info
function textReplace(string, article, disallowedChars = null) {
  // 原有字段替换逻辑
  for (const key in article) {
    if (article.hasOwnProperty(key) && key != 'content') {
      let s = (article[key] || '') + '';
      if (s && disallowedChars) s = generateValidFileName(s, disallowedChars);

      string = string
        .replace(new RegExp('{' + key + '}', 'g'), s)
        .replace(new RegExp('{' + key + ':lower}', 'g'), s.toLowerCase())
        .replace(new RegExp('{' + key + ':upper}', 'g'), s.toUpperCase())
        .replace(new RegExp('{' + key + ':kebab}', 'g'), s.replace(/ /g, '-').toLowerCase())
        .replace(new RegExp('{' + key + ':mixed-kebab}', 'g'), s.replace(/ /g, '-'))
        .replace(new RegExp('{' + key + ':snake}', 'g'), s.replace(/ /g, '_').toLowerCase())
        .replace(new RegExp('{' + key + ':mixed_snake}', 'g'), s.replace(/ /g, '_'))
        // For Obsidian Custom Attachment Location plugin, we need to replace spaces with hyphens, but also remove any double hyphens.
        .replace(new RegExp('{' + key + ':obsidian-cal}', 'g'), s.replace(/ /g, '-').replace(/-{2,}/g, '-'))
        .replace(
          new RegExp('{' + key + ':camel}', 'g'),
          s.replace(/ ./g, (str) => str.trim().toUpperCase()).replace(/^./, (str) => str.toLowerCase())
        )
        .replace(
          new RegExp('{' + key + ':pascal}', 'g'),
          s.replace(/ ./g, (str) => str.trim().toUpperCase()).replace(/^./, (str) => str.toUpperCase())
        );
    }
  }

  // 将日期处理移到字段替换之后（与原项目一致）
  const now = new Date();
  const dateRegex = /{date:(.+?)}/g;
  const matches = string.match(dateRegex);
  if (matches && matches.forEach) {
    matches.forEach((match) => {
      const format = match.substring(6, match.length - 1);
      const dateString = dayjs(now).format(format);
      string = string.replaceAll(match, dateString);
    });
  }

  // 恢复关键字处理逻辑
  const keywordRegex = /{keywords:?(.*)?}/g;
  const keywordMatches = string.match(keywordRegex);
  if (keywordMatches && keywordMatches.forEach) {
    keywordMatches.forEach((match) => {
      let seperator = match.substring(10, match.length - 1);
      try {
        seperator = JSON.parse(JSON.stringify(seperator).replace(/\\\\/g, '\\'));
      } catch {}
      const keywordsString = (article.keywords || []).join(seperator);
      string = string.replace(new RegExp(match.replace(/\\/g, '\\\\'), 'g'), keywordsString);
    });
  }

  // 原有剩余花括号替换
  const defaultRegex = /{(.*?)}/g;
  string = string.replace(defaultRegex, '');

  return string;
}

// function to convert an article info object into markdown
async function convertArticleToMarkdown(article, downloadImages = null) {
  if (!article || typeof article !== 'object') {
    throw new Error('无效的文章对象，类型：' + typeof article);
  }

  let options = await getOptions();
  // 配置回退机制
  if (!options || typeof options !== 'object') {
    console.warn('Using default options due to invalid config');
    options = { ...defaultOptions };
  }
  console.log('Options in convertArticleToMarkdown:', options);

  // 将处理逻辑转移到前端
  try {
    if (downloadImages != null) {
      options.downloadImages = downloadImages;
    }

    // substitute front and backmatter templates if necessary
    if (options.includeTemplate) {
      options.frontmatter = textReplace(options.frontmatter, article) + '\n';
      options.backmatter = '\n' + textReplace(options.backmatter, article);
    } else {
      options.frontmatter = options.backmatter = '';
    }

    options.imagePrefix = textReplace(options.imagePrefix, article, options.disallowedChars)
      .split('/')
      .map((s) => generateValidFileName(s, options.disallowedChars))
      .join('/');

    console.log('convertArticleToMarkdown转换前内容:', article);
    const result = await turndown(article.content, options, article);
    console.log('convertArticleToMarkdown转换后结果:', {
      markdownType: typeof result.markdown,
      imageCount: Object.keys(result.imageList).length,
    });

    if (options.downloadImages && options.downloadMode == 'downloadsApi') {
      // 在Service Worker中强制使用base64格式
      options.imageStyle = 'base64';
      const processed = await preDownloadImages(result.imageList, result.markdown);
      return processed;
    }
    return result;
  } catch (error) {
    console.error('Markdown处理失败:', error);
    throw error;
  }
}

// function to turn the title into a valid file name
function generateValidFileName(title, disallowedChars = null) {
  // 添加参数校验
  if (typeof title !== 'string') {
    console.warn('Invalid title type:', typeof title);
    title = String(title);
  }
  if (!title) return title;
  else title = title + '';
  // remove < > : " / \ | ? *
  var illegalRe = /[\/\?<>\\:\*\|":]/g;
  // and non-breaking spaces (thanks @Licat)
  var name = title
    .replace(illegalRe, '')
    .replace(new RegExp('\u00A0', 'g'), ' ')
    // collapse extra whitespace
    .replace(new RegExp(/\s+/, 'g'), ' ')
    // remove leading/trailing whitespace that can cause issues when using {pageTitle} in a download path
    .trim();

  if (disallowedChars) {
    for (let c of disallowedChars) {
      if (`[\\^$.|?*+()`.includes(c)) c = `\\${c}`;
      name = name.replace(new RegExp(c, 'g'), '');
    }
  }

  return name;
}

async function preDownloadImages(imageList, markdown) {
  const options = await getOptions();
  const uniqueImages = new Map(); // 使用Map替代Set以存储完整信息
  const processedList = {}; // 添加缺失的变量声明

  await Promise.all(
    Object.entries(imageList).map(([src, filename]) => {
      // 使用URL和filename组合作为唯一标识
      const key = `${src}|${filename}`;
      if (uniqueImages.has(key)) return Promise.resolve();
      uniqueImages.set(key, true);

      return new Promise(async (resolve) => {
        try {
          const blob = await ImageHandler.parseImage(src, filename);
          const reader = new FileReader();
          reader.onloadend = function () {
            // 不再替换Markdown中的链接
            processedList[src] = {
              filename: filename,
              base64: reader.result,
              original: src,
            };
            resolve();
          };
          reader.readAsDataURL(blob);
        } catch (error) {
          console.error(`图片下载失败: ${src}`, error);
          processedList[src] = { filename: filename, original: src };
          resolve();
        }
      });
    })
  );

  return { imageList: processedList, markdown: markdown };
}

let isProcessing = false;

async function downloadMarkdown(markdown, title, tabId, imageList = {}, mdClipsFolder = '') {
  if (isProcessing) {
    console.warn('已有下载正在进行中');
    return;
  }

  try {
    isProcessing = true;
    const options = await getOptions();
    const validFolderName = generateValidFileName(title, options.disallowedChars);
    const imageFolder = `${validFolderName}/`;
    const batchId = Date.now(); // 使用时间戳作为批次ID

    if (options.downloadMode == 'downloadsApi' && chrome.downloads) {
      try {
        // 主文件下载路径
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const reader = new FileReader();

        reader.onloadend = function () {
          const dataUrl = reader.result;
          chrome.downloads.download({
            url: dataUrl,
            filename: `${mdClipsFolder}${validFolderName}.md`,
            saveAs: options.saveAs,
            conflictAction: 'uniquify',
          });
        };
        reader.readAsDataURL(blob);

        // 仅在开启下载图片时处理图片
        console.log('imageList', imageList);
        if (options.downloadImages) {
          Object.entries(imageList).forEach(([src, info]) => {
            const filename = `${imageFolder}${info.filename}`;
            chrome.tabs.sendMessage(
              tabId,
              {
                type: 'downloadImage',
                batchId: batchId, // 添加批次标识
                src: info.base64 || src,
                filename: filename,
                isBase64: !!info.base64,
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.error('下载请求失败:', {
                    filename,
                    error: chrome.runtime.lastError.message,
                    batchId,
                  });
                }
              }
            );
          });
        }
      } catch (err) {
        console.error('Download failed', err);
      }
    }
    // // download via obsidian://new uri
    // else if (options.downloadMode == 'obsidianUri') {
    //   try {
    //     await ensureScripts(tabId);
    //     let uri = 'obsidian://new?';
    //     uri += `${options.obsidianPathType}=${encodeURIComponent(title)}`;
    //     if (options.obsidianVault) uri += `&vault=${encodeURIComponent(options.obsidianVault)}`;
    //     uri += `&content=${encodeURIComponent(markdown)}`;
    //     let code = `window.location='${uri}'`;
    //     await chrome.tabs.executeScript(tabId, {code: code});
    //   }
    //   catch (error) {
    //     // This could happen if the extension is not allowed to run code in
    //     // the page, for example if the tab is a privileged page.
    //     console.error("Failed to execute script: " + error);
    //   };

    // }
    // download via content link
    else {
      try {
        await ensureScripts(tabId);
        const filename = mdClipsFolder + generateValidFileName(title, options.disallowedChars) + '.md';
        // 修改为新的scripting API调用方式
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (filename, markdownData) => {
            // 在页面上下文中创建下载
            const element = document.createElement('a');
            element.href = `data:text/markdown;base64,${markdownData}`;
            element.download = filename;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
          },
          args: [filename, base64EncodeUnicode(markdown)],
        });
      } catch (error) {
        console.error('脚本执行失败:', error);
      }
    }
  } finally {
    isProcessing = false;
  }
}

function downloadListener(id, url) {
  const self = (delta) => {
    if (delta.id === id && delta.state && delta.state.current == 'complete') {
      // detatch this listener
      chrome.downloads.onChanged.removeListener(self);
      //release the url for the blob
      URL.revokeObjectURL(url);
    }
  };
  return self;
}

function base64EncodeUnicode(str) {
  // Firstly, escape the string using encodeURIComponent to get the UTF-8 encoding of the characters,
  // Secondly, we convert the percent encodings into raw bytes, and add it to btoa() function.
  const utf8Bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
    return String.fromCharCode('0x' + p1);
  });

  return btoa(utf8Bytes);
}

//function that handles messages from the injected script into the site
async function notify(message) {
  console.log('(notify)收到消息:', message);
  try {
    if (message.type === 'clipError') {
      console.error('Content script error:', message.error);
      return;
    }

    if (message.type === 'clip') {
      // 使用消息中传递的tabId而不是重新查询
      const tabId = message.tabId;
      if (!tabId) throw new Error('缺少tabId参数');

      const article = await getArticleFromDom(message.dom, tabId); // 传递tabId

      if (!article?.content) {
        throw new Error('(notify)无法解析文章内容');
      }

      // 后续处理保持不变
      if (message.selection && message.clipSelection) {
        article.content = message.selection;
      }

      const { markdown, imageList } = await convertArticleToMarkdown(article);

      // format the title
      article.title = await formatTitle(article);

      // format the mdClipsFolder
      const mdClipsFolder = await formatMdClipsFolder(article);

      // display the data in the popup
      await chrome.runtime.sendMessage({ type: 'display.md', markdown: markdown, article: article, imageList: imageList, mdClipsFolder: mdClipsFolder });
    } else if (message.type === 'storageRequest') {
      const options = await getOptions();
      return { options }; // 通过return响应消息
    } else if (message.type === 'download') {
      await downloadMarkdown(message.markdown, message.title, message.tab.id, message.imageList, message.mdClipsFolder);
      return { success: true };
    }
  } catch (error) {
    console.error('(notify)消息处理失败:', error);
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({
        type: 'displayError',
        error: error.message,
      });
    }
  }
}

chrome.commands.onCommand.addListener(function (command) {
  const tab = chrome.tabs.getCurrent();
  if (command == 'download_tab_as_markdown') {
    const info = { menuItemId: 'download-markdown-all' };
    downloadMarkdownFromContext(info, tab);
  } else if (command == 'copy_tab_as_markdown') {
    const info = { menuItemId: 'copy-markdown-all' };
    copyMarkdownFromContext(info, tab);
  } else if (command == 'copy_selection_as_markdown') {
    const info = { menuItemId: 'copy-markdown-selection' };
    copyMarkdownFromContext(info, tab);
  } else if (command == 'copy_tab_as_markdown_link') {
    copyTabAsMarkdownLink(tab);
  } else if (command == 'copy_selected_tab_as_markdown_link') {
    copySelectedTabAsMarkdownLink(tab);
  } else if (command == 'copy_selection_to_obsidian') {
    const info = { menuItemId: 'copy-markdown-obsidian' };
    copyMarkdownFromContext(info, tab);
  } else if (command == 'copy_tab_to_obsidian') {
    const info = { menuItemId: 'copy-markdown-obsall' };
    copyMarkdownFromContext(info, tab);
  }
});

// click handler for the context menus
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  // one of the copy to clipboard commands
  if (info.menuItemId.startsWith('copy-markdown')) {
    copyMarkdownFromContext(info, tab);
  } else if (info.menuItemId == 'download-markdown-alltabs' || info.menuItemId == 'tab-download-markdown-alltabs') {
    downloadMarkdownForAllTabs(info);
  }
  // one of the download commands
  else if (info.menuItemId.startsWith('download-markdown')) {
    downloadMarkdownFromContext(info, tab);
  }
  // copy tab as markdown link
  else if (info.menuItemId.startsWith('copy-tab-as-markdown-link-all')) {
    copyTabAsMarkdownLinkAll(tab);
  }
  // copy only selected tab as markdown link
  else if (info.menuItemId.startsWith('copy-tab-as-markdown-link-selected')) {
    copySelectedTabAsMarkdownLink(tab);
  } else if (info.menuItemId.startsWith('copy-tab-as-markdown-link')) {
    copyTabAsMarkdownLink(tab);
  }
  // a settings toggle command
  else if (info.menuItemId.startsWith('toggle-') || info.menuItemId.startsWith('tabtoggle-')) {
    toggleSetting(info.menuItemId.split('-')[1]);
  }
});

// this function toggles the specified option
async function toggleSetting(setting, options = null) {
  // if there's no options object passed in, we need to go get one
  if (options == null) {
    // get the options from storage and toggle the setting
    await toggleSetting(setting, await getOptions());
  } else {
    // toggle the option and save back to storage
    options[setting] = !options[setting];
    await chrome.storage.sync.set(options);
    if (setting == 'includeTemplate') {
      chrome.contextMenus.update('toggle-includeTemplate', {
        checked: options.includeTemplate,
      });
      try {
        chrome.contextMenus.update('tabtoggle-includeTemplate', {
          checked: options.includeTemplate,
        });
      } catch {}
    }

    if (setting == 'downloadImages') {
      chrome.contextMenus.update('toggle-downloadImages', {
        checked: options.downloadImages,
      });
      try {
        chrome.contextMenus.update('tabtoggle-downloadImages', {
          checked: options.downloadImages,
        });
      } catch {}
    }
  }
}

// this function ensures the content script is loaded (and loads it if it isn't)
async function ensureScripts(tabId) {
  console.log('正在验证内容脚本状态，标签页:', tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => typeof getSelectionAndDom === 'function',
  });
  console.log('内容脚本检查结果:', results);

  if (!results?.[0]?.result) {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['/content_scripts/content_script.js'],
    });
  }
}
// get Readability article info from the dom passed in
async function getArticleFromDom(domString, tabId) {
  try {
    // 发送消息请求解析DOM
    const response = await chrome.runtime.sendMessage({
      type: 'parseDOM',
      domString: domString,
    });

    if (!response?.article?.content) {
      throw new Error('文章内容为空');
    }
    // 获得文章对象
    const article = response.article;

    // 补充必要字段
    if (article) {
      if (!article.math) article.math = {};
      if (!article.keywords) article.keywords = [];
    } else {
      console.warn('DOM解析失败，收到空文章对象');
    }
    return article;
  } catch (error) {
    console.error('DOM解析失败详情:', {
      tabId,
      error: error.message,
    });
    return null;
  }
}
// get Readability article info from the content of the tab id passed in
// `selection` is a bool indicating whether we should just get the selected text
async function getArticleFromContent(tabId, selection = false) {
  // 修改为与原项目一致的逻辑
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => getSelectionAndDom(),
  });

  if (results?.[0]?.result?.dom) {
    const article = await getArticleFromDom(results[0].result.dom);
    if (selection && results[0].result.selection) {
      article.content = results[0].result.selection;
    }
    return article;
  }
  return null;
}

// function to apply the title template
async function formatTitle(article) {
  let options = await getOptions();

  let title = textReplace(options.title, article, options.disallowedChars + '/');
  title = title
    .split('/')
    .map((s) => generateValidFileName(s, options.disallowedChars))
    .join('/');
  return title;
}

async function formatMdClipsFolder(article) {
  let options = await getOptions();

  let mdClipsFolder = '';
  if (options.mdClipsFolder && options.downloadMode == 'downloadsApi') {
    mdClipsFolder = textReplace(options.mdClipsFolder, article, options.disallowedChars);
    mdClipsFolder = mdClipsFolder
      .split('/')
      .map((s) => generateValidFileName(s, options.disallowedChars))
      .join('/');
    if (!mdClipsFolder.endsWith('/')) mdClipsFolder += '/';
  }

  return mdClipsFolder;
}

async function formatObsidianFolder(article) {
  let options = await getOptions();

  let obsidianFolder = '';
  if (options.obsidianFolder) {
    obsidianFolder = textReplace(options.obsidianFolder, article, options.disallowedChars);
    obsidianFolder = obsidianFolder
      .split('/')
      .map((s) => generateValidFileName(s, options.disallowedChars))
      .join('/');
    if (!obsidianFolder.endsWith('/')) obsidianFolder += '/';
  }

  return obsidianFolder;
}

// function to download markdown, triggered by context menu
async function downloadMarkdownFromContext(info, tab) {
  await ensureScripts(tab.id);
  const article = await getArticleFromContent(tab.id, info.menuItemId == 'download-markdown-selection');
  const title = await formatTitle(article);
  const { markdown, imageList } = await convertArticleToMarkdown(article);
  // format the mdClipsFolder
  const mdClipsFolder = await formatMdClipsFolder(article);
  await downloadMarkdown(markdown, title, tab.id, imageList, mdClipsFolder);
}

// function to copy a tab url as a markdown link
async function copyTabAsMarkdownLink(tab) {
  try {
    await ensureScripts(tab.id);
    const article = await getArticleFromContent(tab.id);
    const title = await formatTitle(article);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (title, url) => copyToClipboard(`[${title}](${url}`),
      args: [title, article.baseURI],
    });
  } catch (error) {
    // This could happen if the extension is not allowed to run code in
    // the page, for example if the tab is a privileged page.
    console.error('Failed to copy as markdown link: ' + error);
  }
}

// function to copy all tabs as markdown links
async function copyTabAsMarkdownLinkAll(tab) {
  try {
    const options = await getOptions();
    options.frontmatter = options.backmatter = '';
    const tabs = await chrome.tabs.query({
      currentWindow: true,
    });

    const links = [];
    for (const tab of tabs) {
      await ensureScripts(tab.id);
      const article = await getArticleFromContent(tab.id);
      const title = await formatTitle(article);
      const link = `${options.bulletListMarker} [${title}](${article.baseURI})`;
      links.push(link);
    }

    const markdown = links.join(`\n`);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (content) => copyToClipboard(content),
      args: [markdown],
    });
  } catch (error) {
    // This could happen if the extension is not allowed to run code in
    // the page, for example if the tab is a privileged page.
    console.error('Failed to copy as markdown link: ' + error);
  }
}

// function to copy only selected tabs as markdown links
async function copySelectedTabAsMarkdownLink(tab) {
  try {
    const options = await getOptions();
    options.frontmatter = options.backmatter = '';
    const tabs = await chrome.tabs.query({
      currentWindow: true,
      highlighted: true,
    });

    const links = [];
    for (const tab of tabs) {
      await ensureScripts(tab.id);
      const article = await getArticleFromContent(tab.id);
      const title = await formatTitle(article);
      const link = `${options.bulletListMarker} [${title}](${article.baseURI})`;
      links.push(link);
    }

    const markdown = links.join(`\n`);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (content) => copyToClipboard(content),
      args: [markdown],
    });
  } catch (error) {
    // This could happen if the extension is not allowed to run code in
    // the page, for example if the tab is a privileged page.
    console.error('Failed to copy as markdown link: ' + error);
  }
}

// function to copy markdown to the clipboard, triggered by context menu
async function copyMarkdownFromContext(info, tab) {
  try {
    await ensureScripts(tab.id);

    const platformOS = navigator.platform;
    var folderSeparator = '';
    if (platformOS.indexOf('Win') === 0) {
      folderSeparator = '\\';
    } else {
      folderSeparator = '/';
    }

    if (info.menuItemId == 'copy-markdown-link') {
      const options = await getOptions();
      options.frontmatter = options.backmatter = '';
      const article = await getArticleFromContent(tab.id, false);
      const { markdown } = await turndown(`<a href="${info.linkUrl}">${info.linkText || info.selectionText}</a>`, { ...options, downloadImages: false }, article);
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (content) => copyToClipboard(content),
        args: [markdown],
      });
    } else if (info.menuItemId == 'copy-markdown-image') {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (url) => copyToClipboard(`![](${url})`),
        args: [info.srcUrl],
      });
    } else if (info.menuItemId == 'copy-markdown-obsidian') {
      const article = await getArticleFromContent(tab.id, info.menuItemId == 'copy-markdown-obsidian');
      const title = await formatTitle(article);
      const options = await getOptions();
      const obsidianVault = options.obsidianVault;
      const obsidianFolder = await formatObsidianFolder(article);
      const { markdown } = await convertArticleToMarkdown(article, (downloadImages = false));
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (content) => copyToClipboard(content),
        args: [markdown],
      });
      await chrome.tabs.update({ url: 'obsidian://advanced-uri?vault=' + obsidianVault + '&clipboard=true&mode=new&filepath=' + obsidianFolder + generateValidFileName(title) });
    } else if (info.menuItemId == 'copy-markdown-obsall') {
      const article = await getArticleFromContent(tab.id, info.menuItemId == 'copy-markdown-obsall');
      const title = await formatTitle(article);
      const options = await getOptions();
      const obsidianVault = options.obsidianVault;
      const obsidianFolder = await formatObsidianFolder(article);
      const { markdown } = await convertArticleToMarkdown(article, (downloadImages = false));
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (content) => copyToClipboard(content),
        args: [markdown],
      });
      await chrome.tabs.update({ url: 'obsidian://advanced-uri?vault=' + obsidianVault + '&clipboard=true&mode=new&filepath=' + obsidianFolder + generateValidFileName(title) });
    } else {
      const article = await getArticleFromContent(tab.id, info.menuItemId == 'copy-markdown-selection');
      const { markdown } = await convertArticleToMarkdown(article, (downloadImages = false));
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (content) => copyToClipboard(content),
        args: [markdown],
      });
    }
  } catch (error) {
    // This could happen if the extension is not allowed to run code in
    // the page, for example if the tab is a privileged page.
    console.error('Failed to copy text: ' + error);
  }
}

async function downloadMarkdownForAllTabs(info) {
  const tabs = await chrome.tabs.query({
    currentWindow: true,
  });
  tabs.forEach((tab) => {
    downloadMarkdownFromContext(info, tab);
  });
}

/**
 * String.prototype.replaceAll() polyfill
 * https://gomakethings.com/how-to-replace-a-section-of-a-string-with-another-one-with-vanilla-js/
 * @author Chris Ferdinandi
 * @license MIT
 */
if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function (str, newStr) {
    // If a regex pattern
    if (Object.prototype.toString.call(str).toLowerCase() === '[object regexp]') {
      return this.replace(str, newStr);
    }

    // If a string
    return this.replace(new RegExp(str, 'g'), newStr);
  };
}

// 在service worker中添加连接监听器
chrome.runtime.onConnect.addListener((port) => {
  console.log('🔗 新客户端连接');

  // 启动心跳
  const heartbeat = setInterval(() => {
    port.postMessage({ type: 'ping' });
  }, 2000);

  port.onDisconnect.addListener(() => {
    clearInterval(heartbeat);
    console.log('客户端主动断开');
  });
});

// 修改为使用统一连接管理器
chrome.runtime.onStartup.addListener(async () => {
  console.log('扩展启动，初始化连接...');
  const options = await chrome.storage.sync.get(defaultOptions);
  await createMenus(options);
  connectionManager.connect();
});

// 修改存储初始化逻辑
chrome.runtime.onInstalled.addListener(async () => {
  try {
    console.log('开始初始化存储...');
    await initOptions();
    // 仅记录错误不重启
    console.log('存储初始化完成');
  } catch (error) {
    console.error('初始化失败:', error);
  }
});

// 修改配置更新处理
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === 'optionsUpdated') {
    console.log('收到完整配置:', message.fullOptions);
    // 使用传递的配置代替存储读取
    await createMenus(message.fullOptions);
  }
});
