// 在文件顶部添加Service Worker生命周期管理
const SW_VERSION = '3.5.0-fix1';
console.log(`Service Worker启动 (${SW_VERSION})`);
let isServiceWorkerActive = false;

// 添加模块导入
import './browser-polyfill.min.js';
import TurndownService from './service_worker/turndown.js';
import { gfmPlugin } from './service_worker/turndown-plugin-gfm.js';
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

// 在类外部扩展原型方法
TurndownService.prototype.defaultEscape = TurndownService.prototype.escape;

// function to convert the article content to markdown using Turndown
function turndown(content, options, article) {
  console.log('Options in turndown:', options);
  console.log('hidePictureMdUrl value in turndown:', options.hidePictureMdUrl);

  if (options.turndownEscape) TurndownService.prototype.escape = TurndownService.prototype.defaultEscape;
  else TurndownService.prototype.escape = (s) => s;

  var turndownService = new TurndownService(options);

  // 应用GFM插件
  turndownService.use(gfmPlugin);

  turndownService.keep(['iframe', 'sub', 'sup', 'u', 'ins', 'del', 'small', 'big']);

  let imageList = {};
  // add an image rule
  turndownService.addRule('images', {
    filter: function (node, tdopts) {
      // if we're looking at an img node with a src
      if (node.nodeName == 'IMG' && node.getAttribute('src')) {
        // get the original src
        let src = node.getAttribute('src');
        // set the new src
        const validatedSrc = validateUri(src, article.baseURI);
        node.setAttribute('src', validatedSrc);

        // 总是处理图片下载，不受 hidePictureMdUrl 影响
        if (options.downloadImages) {
          // generate a file name for the image
          let imageFilename = getImageFilename(validatedSrc, options, false);
          if (!imageList[validatedSrc] || imageList[validatedSrc] != imageFilename) {
            // if the imageList already contains this file, add a number to differentiate
            let i = 1;
            while (Object.values(imageList).includes(imageFilename)) {
              const parts = imageFilename.split('.');
              if (i == 1) parts.splice(parts.length - 1, 0, i++);
              else parts.splice(parts.length - 2, 1, i++);
              imageFilename = parts.join('.');
            }
            // add it to the list of images to download later
            imageList[validatedSrc] = imageFilename;
          }
        }

        // 如果启用了隐藏图片URL，返回true让turndown处理
        if (options.hidePictureMdUrl) {
          return true;
        }
      }
      return node.nodeName === 'IMG';
    },
    replacement: function (content, node, tdopts) {
      // 如果启用了隐藏图片URL，返回空字符串
      if (options.hidePictureMdUrl) {
        return '';
      }
      var alt = node.alt || '';
      var src = node.getAttribute('src') || '';
      var title = node.title || '';
      var titlePart = title ? ' "' + title + '"' : '';
      return src ? '![' + alt + ']' + '(' + src + titlePart + ')' : '';
    },
  });

  // add a rule for links
  turndownService.addRule('links', {
    filter: (node, tdopts) => {
      // check that this is indeed a link
      if (node.nodeName == 'A' && node.getAttribute('href')) {
        // get the href
        const href = node.getAttribute('href');
        // set the new href
        const validatedHref = validateUri(href, article.baseURI);
        node.setAttribute('href', validatedHref);

        // 检查是否包含图片
        const img = node.querySelector('img');
        if (img) {
          // 总是处理图片下载，不受 hidePictureMdUrl 影响
          const src = img.getAttribute('src');
          if (options.downloadImages && src) {
            const validatedSrc = validateUri(src, article.baseURI);
            let imageFilename = getImageFilename(validatedSrc, options, false);
            if (!imageList[validatedSrc] || imageList[validatedSrc] != imageFilename) {
              let i = 1;
              while (Object.values(imageList).includes(imageFilename)) {
                const parts = imageFilename.split('.');
                if (i == 1) parts.splice(parts.length - 1, 0, i++);
                else parts.splice(parts.length - 2, 1, i++);
                imageFilename = parts.join('.');
              }
              imageList[validatedSrc] = imageFilename;
            }
          }

          // 如果启用了隐藏图片URL，返回true让turndown处理
          if (options.hidePictureMdUrl) {
            return true;
          }
        }

        // if we are to strip links, the filter needs to pass
        return options.linkStyle == 'stripLinks';
      }
      // we're not passing the filter, just do the normal thing.
      return false;
    },
    replacement: (content, node, tdopts) => {
      // 如果是包含图片的链接且启用了hidePictureMdUrl，返回空字符串
      const hasImage = node.querySelector('img');
      if (hasImage && options.hidePictureMdUrl) {
        return '';
      }
      // 如果是包含图片的链接，直接返回图片的 Markdown
      if (hasImage) {
        const img = node.querySelector('img');
        const alt = img.alt || '';
        const href = node.getAttribute('href');
        const title = img.title || '';
        const titlePart = title ? ' "' + title + '"' : '';
        return '![' + alt + '](' + href + titlePart + ')';
      }
      // 如果是普通链接且设置了stripLinks
      if (options.linkStyle == 'stripLinks') {
        return content;
      }
      // 默认返回带链接的内容
      var href = node.getAttribute('href');
      var title = node.title ? ' "' + node.title + '"' : '';
      if (!content || content.trim() === '') {
        content = href;
      }
      return '[' + content + '](' + href + title + ')';
    },
  });

  // handle multiple lines math
  turndownService.addRule('mathjax', {
    filter(node, options) {
      return article.math.hasOwnProperty(node.id);
    },
    replacement(content, node, options) {
      const math = article.math[node.id];
      let tex = math.tex.trim().replaceAll('\xa0', '');

      if (math.inline) {
        tex = tex.replaceAll('\n', ' ');
        return `$${tex}$`;
      } else return `$$\n${tex}\n$$`;
    },
  });

  function repeat(character, count) {
    return Array(count + 1).join(character);
  }

  function convertToFencedCodeBlock(node, options) {
    node.innerHTML = node.innerHTML.replaceAll('<br-keep></br-keep>', '<br>');
    const langMatch = node.id?.match(/code-lang-(.+)/);
    const language = langMatch?.length > 0 ? langMatch[1] : '';

    const code = node.innerText;

    const fenceChar = options.fence.charAt(0);
    let fenceSize = 3;
    const fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm');

    let match;
    while ((match = fenceInCodeRegex.exec(code))) {
      if (match[0].length >= fenceSize) {
        fenceSize = match[0].length + 1;
      }
    }

    const fence = repeat(fenceChar, fenceSize);

    return '\n\n' + fence + language + '\n' + code.replace(/\n$/, '') + '\n' + fence + '\n\n';
  }

  turndownService.addRule('fencedCodeBlock', {
    filter: function (node, options) {
      return options.codeBlockStyle === 'fenced' && node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
    },
    replacement: function (content, node, options) {
      return convertToFencedCodeBlock(node.firstChild, options);
    },
  });

  // handle <pre> as code blocks
  turndownService.addRule('pre', {
    filter: (node, tdopts) => {
      return node.nodeName == 'PRE' && (!node.firstChild || node.firstChild.nodeName != 'CODE') && !node.querySelector('img');
    },
    replacement: (content, node, tdopts) => {
      return convertToFencedCodeBlock(node, tdopts);
    },
  });

  let markdown = options.frontmatter + turndownService.turndown(content) + options.backmatter;
  console.log('Final markdown:', markdown);

  // strip out non-printing special characters which CodeMirror displays as a red dot
  // see: https://codemirror.net/doc/manual.html#option_specialChars
  markdown = markdown.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff\ufff9-\ufffc]/g, '');

  return { markdown: markdown, imageList: imageList };
}

function cleanAttribute(attribute) {
  return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : '';
}

function validateUri(href, baseURI) {
  // check if the href is a valid url
  try {
    new URL(href);
  } catch {
    // if it's not a valid url, that likely means we have to prepend the base uri
    const baseUri = new URL(baseURI);

    // if the href starts with '/', we need to go from the origin
    if (href.startsWith('/')) {
      href = baseUri.origin + href;
    }
    // otherwise we need to go from the local folder
    else {
      href = baseUri.href + (baseUri.href.endsWith('/') ? '/' : '') + href;
    }
  }
  return href;
}

function getImageFilename(src, options, prependFilePath = true) {
  const slashPos = src.lastIndexOf('/');
  const queryPos = src.indexOf('?');
  let filename = src.substring(slashPos + 1, queryPos > 0 ? queryPos : src.length);

  let imagePrefix = options.imagePrefix || '';

  if (prependFilePath && options.title.includes('/')) {
    imagePrefix = options.title.substring(0, options.title.lastIndexOf('/') + 1) + imagePrefix;
  } else if (prependFilePath) {
    imagePrefix = options.title + (imagePrefix.startsWith('/') ? '' : '/') + imagePrefix;
  }

  if (filename.includes(';base64,')) {
    // this is a base64 encoded image, so what are we going to do for a filename here?
    filename = 'image.' + filename.substring(0, filename.indexOf(';'));
  }

  let extension = filename.substring(filename.lastIndexOf('.'));
  if (extension == filename) {
    // there is no extension, so we need to figure one out
    // for now, give it an 'idunno' extension and we'll process it later
    filename = filename + '.idunno';
  }

  filename = generateValidFileName(filename, options.disallowedChars);

  return imagePrefix + filename;
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
  console.log('文章对象结构:', Object.keys(article)); // 调试用
  console.log('hidePictureMdUrl value in convertArticleToMarkdown:', options.hidePictureMdUrl);

  if (!article?.content) {
    console.error('无效的文章对象:', article);
    throw new Error('文章内容未定义');
  }

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

  let result = turndown(article.content, options, article);
  console.log('Markdown result:', result);

  if (options.downloadImages && options.downloadMode == 'downloadsApi') {
    // pre-download the images
    result = await preDownloadImages(result.imageList, result.markdown);
  }
  return result;
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
  let newImageList = {};

  await Promise.all(
    Object.entries(imageList).map(
      ([src, filename]) =>
        new Promise(async (resolve, reject) => {
          try {
            const result = await ImageHandler.downloadImage(src, filename);
            if (options.imageStyle == 'base64') {
              const reader = new FileReader();
              reader.onloadend = function () {
                markdown = markdown.replaceAll(src, reader.result);
                resolve();
              };
              reader.readAsDataURL(result);
            } else {
              const blobUrl = URL.createObjectURL(result);
              newImageList[blobUrl] = filename;
              resolve();
            }
          } catch (error) {
            console.error('Failed to download image:', error);
            reject(error);
          }
        })
    )
  );

  return { imageList: newImageList, markdown: markdown };
}

// function to actually download the markdown file
async function downloadMarkdown(markdown, title, tabId, imageList = {}, mdClipsFolder = '') {
  // get the options
  const options = await getOptions();

  // download via the downloads API
  if (options.downloadMode == 'downloadsApi' && chrome.downloads) {
    // create the object url with markdown data as a blob
    const url = URL.createObjectURL(
      new Blob([markdown], {
        type: 'text/markdown;charset=utf-8',
      })
    );

    try {
      if (mdClipsFolder && !mdClipsFolder.endsWith('/')) mdClipsFolder += '/';
      // start the download
      const id = await chrome.downloads.download({
        url: url,
        filename: mdClipsFolder + title + '.md',
        saveAs: options.saveAs,
      });

      // add a listener for the download completion
      chrome.downloads.onChanged.addListener(downloadListener(id, url));

      // download images (if enabled)
      if (options.downloadImages) {
        // get the relative path of the markdown file (if any) for image path
        let destPath = mdClipsFolder + title.substring(0, title.lastIndexOf('/'));
        if (destPath && !destPath.endsWith('/')) destPath += '/';
        Object.entries(imageList).forEach(async ([src, filename]) => {
          // start the download of the image
          const imgId = await chrome.downloads.download({
            url: src,
            // set a destination path (relative to md file)
            filename: destPath ? destPath + filename : filename,
            saveAs: false,
          });
          // add a listener (so we can release the blob url)
          chrome.downloads.onChanged.addListener(downloadListener(imgId, src));
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
      const code = `downloadMarkdown("${filename}","${base64EncodeUnicode(markdown)}");`;
      await chrome.tabs.executeScript(tabId, { code: code });
    } catch (error) {
      // This could happen if the extension is not allowed to run code in
      // the page, for example if the tab is a privileged page.
      console.error('Failed to execute script: ' + error);
    }
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
    console.error('(notify)消息处理失败，完整错误信息:', {
      message: message,
      error: error.stack,
    });
    console.error('(notify)处理消息时发生错误:', error);
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
  // 新增tabId参数
  try {
    // 直接使用传入的tabId，不再查询标签页
    console.log('使用传入的tabId:', tabId);

    const response = await Promise.race([
      chrome.tabs.sendMessage(tabId, {
        type: 'parseDOM',
        domString: domString,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('消息响应超时')), 5000)),
    ]);

    console.log('(getArticleFromDom)已收到响应');

    if (!response?.article?.content) {
      throw new Error('文章内容为空');
    }

    const article = response.article;
    console.debug('文章元数据:', {
      title: article.title,
      contentLength: article.content.length,
      baseURI: article.baseURI,
    });

    // 补充必要字段
    if (article) {
      console.log('成功解析文章:', article.title);
      if (!article.math) article.math = {};
      if (!article.keywords) article.keywords = [];
    } else {
      console.warn('收到空文章对象');
    }
    return article;
  } catch (error) {
    console.error('DOM解析失败:', {
      error: error.message,
      tabId: tabId, // 显示当前使用的tabId
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
      const { markdown } = turndown(`<a href="${info.linkUrl}">${info.linkText || info.selectionText}</a>`, { ...options, downloadImages: false }, article);
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

// 重构连接管理逻辑
const connectionManager = {
  port: null,
  retryCount: 0,
  maxRetries: 5,
  heartbeatInterval: null,

  connect: function () {
    if (this.retryCount >= this.maxRetries) {
      console.error('达到最大重试次数，停止连接');
      return;
    }

    if (this.port) {
      this.port.disconnect();
    }

    this.port = chrome.runtime.connect({ name: 'markdownload' });

    this.port.onDisconnect.addListener(() => {
      console.log('连接断开，尝试重连...');
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      this.retryCount++;
      setTimeout(() => this.connect(), Math.min(1000 * this.retryCount, 30000));
    });

    this.startHeartbeat();
  },

  startHeartbeat: function () {
    // 使用固定间隔防止多个定时器
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      if (this.port) {
        try {
          this.port.postMessage({ type: 'ping' });
          console.debug('发送心跳信号');
        } catch (err) {
          console.error('心跳发送失败:', err);
          this.connect(); // 触发重连
        }
      }
    }, 25000);
  },
};

// 初始化连接
connectionManager.connect();

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

// 增强消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 添加ping/pong机制
  if (message.type === 'ping') {
    sendResponse({ type: 'pong' });
    return true;
  }

  // 其他消息处理保持不变...
});

// 正确使用方式示例
async function logTabs() {
  console.log('当前所有标签页:', await chrome.tabs.query({}));
}
logTabs(); // 在async函数内调用

let retries = 0;
const maxRetries = 3;

async function sendMessageWithRetry(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'ping' });
  } catch (error) {
    if (retries < maxRetries) {
      retries++;
      await new Promise((r) => setTimeout(r, 1000));
      return sendMessageWithRetry(tabId);
    }
    throw error;
  }
}

let port = null;

async function maintainConnection() {
  port = chrome.runtime.connect({ name: 'keepalive' });
  port.onDisconnect.addListener(() => {
    console.log('连接断开，尝试重连...');
    setTimeout(maintainConnection, 1000);
  });
}

maintainConnection();
