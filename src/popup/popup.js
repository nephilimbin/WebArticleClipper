// 模块导入路径修正
import ImageHandler from '../shared/image-handler.js';
import Readability from '../service_worker/Readability.js';

// default variables
var selectedText = null;
var imageList = null;
var mdClipsFolder = '';

const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
// set up event handlers
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
    // 添加异步处理标记
    (async () => {
      try {
        // parse the dom
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
          // we need to keep <br> tags because they are removed by Readability.js
          br.outerHTML = '<br-keep></br-keep>';
        });

        dom.body.querySelectorAll('.codehilite > pre')?.forEach((codeSource) => {
          if (codeSource.firstChild.nodeName !== 'CODE' && !codeSource.className.includes('language')) {
            codeSource.id = `code-lang-text`;
          }
        });

        dom.body.querySelectorAll('h1, h2, h3, h4, h5, h6')?.forEach((header) => {
          // Readability.js will strip out headings from the dom if certain words appear in their className
          // See: https://github.com/mozilla/readability/issues/807
          header.className = '';
          header.outerHTML = header.outerHTML;
        });

        // Prevent Readability from removing the <html> element if has a 'class' attribute
        // which matches removal criteria.
        // Note: The document element is guaranteed to be the HTML tag because the 'text/html'
        // mime type was used when the DOM was created.
        dom.documentElement.removeAttribute('class');

        // simplify the dom into an article
        const article = new Readability(dom).parse();

        // get the base uri from the dom and attach it as important article info
        article.baseURI = dom.baseURI;
        // also grab the page title
        article.pageTitle = dom.title;
        // and some URL info
        const url = new URL(dom.baseURI);
        article.hash = url.hash;
        article.host = url.host;
        article.origin = url.origin;
        article.hostname = url.hostname;
        article.pathname = url.pathname;
        article.port = url.port;
        article.protocol = url.protocol;
        article.search = url.search;

        // make sure the dom has a head
        if (dom.head) {
          // and the keywords, should they exist, as an array
          article.keywords = dom.head
            .querySelector('meta[name="keywords"]')
            ?.content?.split(',')
            ?.map((s) => s.trim());

          // add all meta tags, so users can do whatever they want
          dom.head.querySelectorAll('meta[name][content], meta[property][content]')?.forEach((meta) => {
            const key = meta.getAttribute('name') || meta.getAttribute('property');
            const val = meta.getAttribute('content');
            if (key && val && !article[key]) {
              article[key] = val;
            }
          });
        }
        article.math = math;

        // 添加响应确认
        console.log('(content_script)发送解析结果');
        sendResponse({ article });
      } catch (error) {
        console.error('解析过程中出错:', error);
        sendResponse({ error: error.message });
      }
      console.log(`⏱️ 解析耗时: ${Date.now() - startTime}ms`);
    })();

    return true; // 保持通道开放
  }
}
// 监听消息
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
      console.log('clipSite开始执行');
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

// inject the necessary scripts
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('container').style.display = 'flex'; // 强制显示
  document.getElementById('spinner').style.display = 'none';
  connectionManager.connect();
  chrome.storage.sync
    .get(defaultOptions)
    .then((options) => {
      console.log('DOMContentLoaded加载中');
      checkInitialSettings(options);

      // 在DOMContentLoaded回调中添加安全检查
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

//function that handles messages from the injected script into the site
function notify(message) {
  // message for displaying markdown
  if (message.type == 'display.md') {
    // set the values from the message
    //document.getElementById("md").value = message.markdown;
    cm.setValue(message.markdown);
    document.getElementById('title').value = message.article.title;
    imageList = message.imageList;
    mdClipsFolder = message.mdClipsFolder;

    // show the hidden elements
    document.getElementById('container').style.display = 'flex';
    document.getElementById('spinner').style.display = 'none';
    // focus the download button
    document.getElementById('download').focus();
    cm.refresh();
  }
}

function showError(err) {
  // 先显示错误信息再关闭窗口
  document.getElementById('container').style.display = 'flex';
  document.getElementById('spinner').style.display = 'none';
  cm.setValue(`Error clipping the page\n\n${err}`);

  // 添加延迟关闭
  setTimeout(() => {
    if (!document.hasFocus()) {
      // 检查窗口是否仍在前台
      window.close();
    }
  }, 3000); // 3秒后自动关闭
}
