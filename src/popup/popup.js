// 模块导入路径修正
import ImageHandler from '../shared/image-handler.js';

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

// 修改注入逻辑，增加双重保障
async function ensureContentScript(tabId) {
  try {
    // 方法1：使用manifest声明式注入
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          return typeof getSelectionAndDom === 'function';
        } catch {
          return false;
        }
      },
    });

    // 方法2：显式注入作为后备
    if (!results?.[0]?.result) {
      console.log('⚠️ 声明式注入失败，尝试显式注入');
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['/content_scripts/content_script.js'],
      });
    }

    // 最终验证
    const finalCheck = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        console.log('✅ 内容脚本状态验证');
        return {
          loaded: typeof getSelectionAndDom === 'function',
          readyState: document.readyState,
        };
      },
    });

    console.log('内容脚本最终状态:', finalCheck[0]?.result);
  } catch (error) {
    console.error('内容脚本加载失败:', error);
    throw error;
  }
}

// 在clipSite函数中调用
async function clipSite(tabId) {
  await ensureContentScript(tabId);
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
  // 修改注入逻辑，添加错误捕获和路径修正
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        files: ['/content_scripts/content_script.js'], // 添加斜杠确保根目录路径
      })
      .then(() => {
        console.log('✅ 内容脚本已注入');
        // 添加二次验证
        chrome.scripting
          .executeScript({
            target: { tabId: tab.id },
            func: () => {
              console.log('🔄 内容脚本函数验证中...');
              return typeof getSelectionAndDom === 'function';
            },
          })
          .then(([result]) => {
            console.log(`📊 内容脚本验证结果：${result.result ? '成功' : '失败'}`);
          });
      })
      .catch((err) => {
        console.error('❌ 脚本注入失败：', err);
        showError(`注入失败：${err.message}`);
      });
  });

  // 在popup页面建立连接
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

// 添加全局Promise拒绝处理
window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的Promise拒绝:', event.reason);
  showError(event.reason);
  event.preventDefault();
});
