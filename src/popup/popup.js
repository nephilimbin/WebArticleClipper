import ImageHandler from '../shared/image-handler.js';
import Readability from '../service_worker/Readability.js';
import TurndownService from '../service_worker/turndown.js';
import { gfmPlugin } from '../service_worker/turndown-plugin-gfm.js';

var selectedText = null;
var imageList = null;
var mdClipsFolder = '';

const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
const cm = CodeMirror.fromTextArea(document.getElementById('md'), {
  theme: darkMode ? 'xq-dark' : 'xq-light',
  mode: 'markdown',
  lineWrapping: true,
});
cm.on('cursorActivity', (cm) => {
  const somethingSelected = cm.somethingSelected();
  var a = document.getElementById('downloadSelection');

  if (somethingSelected) {
    if (a.style.display != 'block') a.style.display = 'block';
  } else {
    if (a.style.display != 'none') a.style.display = 'none';
  }
});
const downloadBtn = document.getElementById('download');
if (downloadBtn) {
  downloadBtn.addEventListener('click', download);
} else {
  console.error('下载按钮元素未找到');
}
document.getElementById('downloadSelection').addEventListener('click', downloadSelection);

const defaultOptions = {
  includeTemplate: false,
  clipSelection: true,
  downloadImages: false,
  hidePictureMdUrl: false,
};

const checkInitialSettings = (options) => {
  if (options.includeTemplate) document.querySelector('#includeTemplate').classList.add('checked');

  if (options.downloadImages) document.querySelector('#downloadImages').classList.add('checked');

  if (options.hidePictureMdUrl) document.querySelector('#hidePictureMdUrl').classList.add('checked');

  if (options.clipSelection) document.querySelector('#selected').classList.add('checked');
  else document.querySelector('#document').classList.add('checked');
};

const toggleClipSelection = (options) => {
  options.clipSelection = !options.clipSelection;
  document.querySelector('#selected').classList.toggle('checked');
  document.querySelector('#document').classList.toggle('checked');
  chrome.storage.sync
    .set(options)
    .then(() => clipSite())
    .catch((error) => {
      console.error(error);
    });
};

const toggleIncludeTemplate = (options) => {
  options.includeTemplate = !options.includeTemplate;
  document.querySelector('#includeTemplate').classList.toggle('checked');
  chrome.storage.sync
    .set(options)
    .then(() => {
      chrome.contextMenus.update('toggle-includeTemplate', {
        checked: options.includeTemplate,
      });
      try {
        chrome.contextMenus.update('tabtoggle-includeTemplate', {
          checked: options.includeTemplate,
        });
      } catch {}
      return clipSite();
    })
    .catch((error) => {
      console.error(error);
    });
};

const toggleDownloadImages = (options) => {
  options.downloadImages = !options.downloadImages;
  document.querySelector('#downloadImages').classList.toggle('checked');
  chrome.storage.sync
    .set(options)
    .then(() => {
      chrome.contextMenus.update('toggle-downloadImages', {
        checked: options.downloadImages,
      });
      try {
        chrome.contextMenus.update('tabtoggle-downloadImages', {
          checked: options.downloadImages,
        });
      } catch {}
    })
    .catch((error) => {
      console.error(error);
    });
};

function toggleHidePictureMdUrl(options) {
  options.hidePictureMdUrl = !options.hidePictureMdUrl;
  chrome.storage.sync
    .set(options)
    .then(() => clipSite())
    .catch((error) => {
      console.error(error);
    });
  document.querySelector('#hidePictureMdUrl').classList.toggle('checked');
}

const showOrHideClipOption = (selection) => {
  if (selection) {
    document.getElementById('clipOption').style.display = 'flex';
  } else {
    document.getElementById('clipOption').style.display = 'none';
  }
};

async function handleParseDOM(request, sender, sendResponse) {
  console.log('📡 内容脚本消息监听器已激活', {
    url: location.href,
    readyState: document.readyState,
    request: request,
  });

  if (request.type === 'parseDOM') {
    console.log('开始解析DOM，内容长度:', request.domString?.length);
    const startTime = Date.now();
    const domString = request.domString;
    (async () => {
      try {
        const parser = new DOMParser();
        const dom = parser.parseFromString(domString, 'text/html');

        if (dom.documentElement.nodeName == 'parsererror') {
          console.error('error while parsing');
        }

        const math = {};

        const storeMathInfo = (el, mathInfo) => {
          let randomId = URL.createObjectURL(new Blob([]));
          randomId = randomId.substring(randomId.length - 36);
          el.id = randomId;
          math[randomId] = mathInfo;
        };

        dom.body.querySelectorAll('script[id^=MathJax-Element-]')?.forEach((mathSource) => {
          const type = mathSource.attributes.type.value;
          storeMathInfo(mathSource, {
            tex: mathSource.innerText,
            inline: type ? !type.includes('mode=display') : false,
          });
        });

        dom.body.querySelectorAll('[markdownload-latex]')?.forEach((mathJax3Node) => {
          const tex = mathJax3Node.getAttribute('markdownload-latex');
          const display = mathJax3Node.getAttribute('display');
          const inline = !(display && display === 'true');

          const mathNode = document.createElement(inline ? 'i' : 'p');
          mathNode.textContent = tex;
          mathJax3Node.parentNode.insertBefore(mathNode, mathJax3Node.nextSibling);
          mathJax3Node.parentNode.removeChild(mathJax3Node);

          storeMathInfo(mathNode, {
            tex: tex,
            inline: inline,
          });
        });

        dom.body.querySelectorAll('.katex-mathml')?.forEach((kaTeXNode) => {
          storeMathInfo(kaTeXNode, {
            tex: kaTeXNode.querySelector('annotation').textContent,
            inline: true,
          });
        });

        dom.body.querySelectorAll('[class*=highlight-text],[class*=highlight-source]')?.forEach((codeSource) => {
          const language = codeSource.className.match(/highlight-(?:text|source)-([a-z0-9]+)/)?.[1];
          if (codeSource.firstChild.nodeName == 'PRE') {
            codeSource.firstChild.id = `code-lang-${language}`;
          }
        });

        dom.body.querySelectorAll('[class*=language-]')?.forEach((codeSource) => {
          const language = codeSource.className.match(/language-([a-z0-9]+)/)?.[1];
          codeSource.id = `code-lang-${language}`;
        });

        dom.body.querySelectorAll('pre br')?.forEach((br) => {
          br.outerHTML = '<br-keep></br-keep>';
        });

        dom.body.querySelectorAll('.codehilite > pre')?.forEach((codeSource) => {
          if (codeSource.firstChild.nodeName !== 'CODE' && !codeSource.className.includes('language')) {
            codeSource.id = `code-lang-text`;
          }
        });

        dom.body.querySelectorAll('h1, h2, h3, h4, h5, h6')?.forEach((header) => {
          header.className = '';
          header.outerHTML = header.outerHTML;
        });

        dom.documentElement.removeAttribute('class');

        const article = new Readability(dom).parse();

        article.baseURI = dom.baseURI;
        article.pageTitle = dom.title;
        const url = new URL(dom.baseURI);
        article.hash = url.hash;
        article.host = url.host;
        article.origin = url.origin;
        article.hostname = url.hostname;
        article.pathname = url.pathname;
        article.port = url.port;
        article.protocol = url.protocol;
        article.search = url.search;

        if (dom.head) {
          article.keywords = dom.head
            .querySelector('meta[name="keywords"]')
            ?.content?.split(',')
            ?.map((s) => s.trim());

          dom.head.querySelectorAll('meta[name][content], meta[property][content]')?.forEach((meta) => {
            const key = meta.getAttribute('name') || meta.getAttribute('property');
            const val = meta.getAttribute('content');
            if (key && val && !article[key]) {
              article[key] = val;
            }
          });
        }
        article.math = math;

        console.log('(handleParseDOM)发送解析结果');
        sendResponse({ article });
      } catch (error) {
        console.error('解析过程中出错:', error);
        sendResponse({ error: error.message });
      }
      console.log(`⏱️ 解析耗时: ${Date.now() - startTime}ms`);
    })();

    return true;
  }
}
chrome.runtime.onMessage.addListener(handleParseDOM);

// 在clipSite函数中调用
async function clipSite(tabId) {
  return chrome.scripting
    .executeScript({
      target: { tabId: tabId },
      func: () => {
        try {
          return window.getSelectionAndDom();
        } catch (e) {
          console.error('内容脚本执行异常:', e);
          return { error: e.message };
        }
      },
    })
    .then((results) => {
      if (results?.[0]?.result) {
        console.log('(clipSite) DOM内容长度:', results[0].result.dom?.length);
        showOrHideClipOption(results[0].result.selection);
        let message = {
          type: 'clip',
          dom: results[0].result.dom,
          selection: results[0].result.selection,
          tabId: tabId,
        };
        return chrome.storage.sync
          .get(defaultOptions)
          .then((options) => {
            console.log('从存储获取的选项:', options);
            options = { ...defaultOptions, ...options };
            console.log('合并后选项:', options);
            return chrome.runtime.sendMessage({
              ...message,
              ...options,
            });
          })
          .catch((err) => {
            console.error('获取选项失败:', err);
            showError(err);
            return chrome.runtime.sendMessage({
              ...message,
              ...defaultOptions,
            });
          });
      } else {
        console.warn('(clipSite) 未获取到有效结果，可能原因:', results?.[0]?.error);
      }
    })
    .catch((err) => {
      console.error('(clipSite) 脚本执行完整错误:', err.stack);
      showError(err);
      throw err;
    });
}

// 添加连接管理器
const connectionManager = {
  port: null,
  retries: 0,
  maxRetries: 3,

  connect() {
    this.port = chrome.runtime.connect({
      name: 'markdownload',
      includeTlsChannelId: true,
    });

    this.port.onMessage.addListener((msg) => {
      if (msg.type === 'ping') {
        console.log('❤️ 收到服务端心跳');
        this.port.postMessage({ type: 'pong' });
      }
    });

    this.port.onDisconnect.addListener(() => {
      console.log('🔌 连接断开');
      if (this.retries < this.maxRetries) {
        setTimeout(() => this.connect(), 1000 * ++this.retries);
      }
    });
  },
};

// 弹出页面加载
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('container').style.display = 'flex';
  document.getElementById('spinner').style.display = 'none';
  connectionManager.connect();
  chrome.storage.sync
    .get(defaultOptions)
    .then((options) => {
      console.log('DOMContentLoaded加载中');
      checkInitialSettings(options);

      const bindSafeListener = (id, handler) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('click', handler);
        } else {
          console.warn(`元素 ${id} 未找到`);
        }
      };

      bindSafeListener('selected', (e) => {
        e.preventDefault();
        toggleClipSelection(options);
      });

      bindSafeListener('document', (e) => {
        e.preventDefault();
        toggleClipSelection(options);
      });

      const includeTemplateElement = document.getElementById('includeTemplate');
      if (includeTemplateElement) {
        includeTemplateElement.addEventListener('click', (e) => {
          e.preventDefault();
          toggleIncludeTemplate(options);
        });
      }
      const downloadImagesElement = document.getElementById('downloadImages');
      if (downloadImagesElement) {
        downloadImagesElement.addEventListener('click', (e) => {
          e.preventDefault();
          toggleDownloadImages(options);
        });
      }
      const hidePictureMdUrlElement = document.getElementById('hidePictureMdUrl');
      if (hidePictureMdUrlElement) {
        hidePictureMdUrlElement.addEventListener('click', (e) => {
          e.preventDefault();
          toggleHidePictureMdUrl(options);
        });
      }

      return chrome.tabs.query({
        currentWindow: true,
        active: true,
      });
    })
    .then((tabs) => {
      var id = tabs[0].id;
      var url = tabs[0].url;
      console.log('DomContentLoaded:', tabs);
      chrome.scripting
        .executeScript({
          target: { tabId: id },
          files: ['/browser-polyfill.min.js'],
        })
        .then(() => {
          return chrome.scripting.executeScript({
            target: { tabId: id },
            files: ['/content_scripts/content_script.js'],
          });
        })
        .then(() => {
          console.info('Successfully injected MarkDownload content script:', id);
          return clipSite(id);
        })
        .catch((error) => {
          console.error(error);
          showError(error);
        });
      console.log('DOMContentLoaded结束');
    });
});

// listen for notifications from the background page
chrome.runtime.onMessage.addListener(notify);

//function to send the download message to the background page
async function sendDownloadMessage(text) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return chrome.runtime.sendMessage({
    type: 'download',
    markdown: text,
    title: document.getElementById('title').value,
    tab: tab,
    imageList: imageList,
    mdClipsFolder: mdClipsFolder,
  });
}

// event handler for download button
async function download(e) {
  e.preventDefault();
  await sendDownloadMessage(cm.getValue());
  window.close();
}

// event handler for download selected button
async function downloadSelection(e) {
  e.preventDefault();
  if (cm.somethingSelected()) {
    await sendDownloadMessage(cm.getSelection());
  }
}

function notify(message) {
  if (message.type === 'display.md') {
    cm.setValue(message.markdown);
    document.getElementById('title').value = message.article.title;
    imageList = message.imageList;
    mdClipsFolder = message.mdClipsFolder;

    document.getElementById('container').style.display = 'flex';
    document.getElementById('spinner').style.display = 'none';
    document.getElementById('download').focus();
    cm.refresh();
  }
}

function showError(err) {
  document.getElementById('container').style.display = 'flex';
  document.getElementById('spinner').style.display = 'none';
  cm.setValue(`Error clipping the page\n\n${err}`);

  setTimeout(() => {
    if (!document.hasFocus()) {
      window.close();
    }
  }, 3000);
}

// 处理markdown
function processMarkdown(request, sender, sendResponse) {
  // chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'processMarkdown') {
    (async () => {
      try {
        const result = turndownProcessing(request.content, request.options, request.article);
        sendResponse({
          type: 'processMarkdownResult',
          result: result,
        });
      } catch (error) {
        sendResponse({
          type: 'error',
          error: error.message,
        });
      }
    })();
    return true;
  }
}
chrome.runtime.onMessage.addListener(processMarkdown);

// 创建turndown服务
TurndownService.prototype.defaultEscape = TurndownService.prototype.escape;

// 执行markdown处理
function turndownProcessing(content, options, article) {
  if (options.turndownEscape) TurndownService.prototype.escape = TurndownService.prototype.defaultEscape;
  else TurndownService.prototype.escape = (s) => s;

  var turndownService = new TurndownService(options);

  turndownService.use(gfmPlugin);

  turndownService.keep(['iframe', 'sub', 'sup', 'u', 'ins', 'del', 'small', 'big']);

  const imageList = {};
  turndownService.addRule('images', {
    filter: function (node, tdopts) {
      if (node.nodeName == 'IMG' && node.getAttribute('src')) {
        let src = node.getAttribute('src');
        const validatedSrc = validateUri(src, article.baseURI);
        node.setAttribute('src', validatedSrc);

        if (options.downloadImages) {
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
        if (options.hidePictureMdUrl) {
          return true;
        }
      }
      return node.nodeName === 'IMG';
    },
    replacement: function (content, node, tdopts) {
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

  turndownService.addRule('links', {
    filter: (node, tdopts) => {
      if (node.nodeName == 'A' && node.getAttribute('href')) {
        const href = node.getAttribute('href');
        const validatedHref = validateUri(href, article.baseURI);
        node.setAttribute('href', validatedHref);

        const img = node.querySelector('img');
        if (img) {
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

          if (options.hidePictureMdUrl) {
            return true;
          }
        }

        return options.linkStyle == 'stripLinks';
      }
      return false;
    },
    replacement: (content, node, tdopts) => {
      const hasImage = node.querySelector('img');
      if (hasImage && options.hidePictureMdUrl) {
        return '';
      }
      if (hasImage) {
        const img = node.querySelector('img');
        const alt = img.alt || '';
        const href = node.getAttribute('href');
        const title = img.title || '';
        const titlePart = title ? ' "' + title + '"' : '';
        return '![' + alt + '](' + href + titlePart + ')';
      }
      if (options.linkStyle == 'stripLinks') {
        return content;
      }
      var href = node.getAttribute('href');
      var title = node.title ? ' "' + node.title + '"' : '';
      if (!content || content.trim() === '') {
        content = href;
      }
      return '[' + content + '](' + href + title + ')';
    },
  });

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

  turndownService.addRule('pre', {
    filter: (node, tdopts) => {
      return node.nodeName == 'PRE' && (!node.firstChild || node.firstChild.nodeName != 'CODE') && !node.querySelector('img');
    },
    replacement: (content, node, tdopts) => {
      return convertToFencedCodeBlock(node, tdopts);
    },
  });

  let markdown = options.frontmatter + turndownService.turndown(content) + options.backmatter;

  markdown = markdown.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff\ufff9-\ufffc]/g, '');

  return { markdown: markdown, imageList: imageList };
}

function cleanAttribute(attribute) {
  return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : '';
}

function validateUri(href, baseURI) {
  try {
    new URL(href);
  } catch {
    const baseUri = new URL(baseURI);

    if (href.startsWith('/')) {
      href = baseUri.origin + href;
    } else {
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

  if (prependFilePath) {
    const validFolderName = generateValidFileName(options.title, options.disallowedChars);
    imagePrefix = `${validFolderName}/`;
  }

  if (filename.includes(';base64,')) {
    filename = 'image.' + filename.substring(0, filename.indexOf(';'));
  }

  let extension = filename.substring(filename.lastIndexOf('.'));
  if (extension == filename) {
    filename = filename + '.idunno';
  }

  filename = generateValidFileName(filename, options.disallowedChars);

  return imagePrefix + filename;
}

function injectMathJaxScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content_scripts/mathjax-inject.js');
  script.onload = function () {
    this.remove();
  };

  (document.head || document.documentElement).appendChild(script);
}

// 保持原有事件监听逻辑
if (document.readyState === 'complete') {
  console.log('document.readyState === complete');
  injectMathJaxScript();
} else {
  window.addEventListener('load', injectMathJaxScript);
}

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
