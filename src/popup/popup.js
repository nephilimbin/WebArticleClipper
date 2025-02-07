// default variables
var selectedText = null;
var imageList = null;
var mdClipsFolder = '';

// 模块导入路径修正
import ImageHandler from '../shared/image-handler.js';

// 初始化CodeMirror（完整实现）
let cm;
function initCodeMirror() {
  const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  cm = CodeMirror.fromTextArea(document.getElementById('md'), {
    theme: darkMode ? 'xq-dark' : 'xq-light',
    mode: 'markdown',
    lineWrapping: true,
    extraKeys: {
      'Ctrl-S': saveDraft,
      'Cmd-S': saveDraft,
    },
  });
}

// 完整事件绑定
function bindEventListeners() {
  document.getElementById('download').addEventListener('click', handleDownload);
  document.getElementById('downloadSelection').addEventListener('click', handleSelectionDownload);
  document.getElementById('options').addEventListener('click', openOptionsPage);
}

// 完整初始化流程
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initCodeMirror();
    bindEventListeners();
    await loadUserSettings();
    await checkServiceWorker();
    initializeClipboard();
  } catch (error) {
    console.error('Initialization failed:', error);
    showError(error);
  }
});

// Service Worker状态检查
async function checkServiceWorker() {
  if (!navigator.serviceWorker?.controller) {
    console.warn('SW not ready, retrying...');
    await new Promise((resolve) => setTimeout(resolve, 500));
    return checkServiceWorker();
  }
}

// 完整下载处理
async function handleDownload(e) {
  e.preventDefault();
  try {
    const markdown = cm.getValue();
    const title = document.getElementById('title').value;
    await chrome.runtime.sendMessage({
      type: 'download',
      markdown,
      title,
      imageList,
    });
    window.close();
  } catch (error) {
    showError(error);
  }
}

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
  chrome.runtime.sendMessage({ type: 'setOptions', options: options }, (response) => {
    if (response && response.success) {
      clipSite();
    } else {
      console.error('Error setting options:', response);
    }
  });
};

const toggleIncludeTemplate = (options) => {
  options.includeTemplate = !options.includeTemplate;
  document.querySelector('#includeTemplate').classList.toggle('checked');
  chrome.runtime.sendMessage({ type: 'setOptions', options: options }, (response) => {
    if (response && response.success) {
      browser.contextMenus.update('toggle-includeTemplate', {
        checked: options.includeTemplate,
      });
      try {
        browser.contextMenus.update('tabtoggle-includeTemplate', {
          checked: options.includeTemplate,
        });
      } catch {}
      clipSite();
    } else {
      console.error('Error setting options:', response);
    }
  });
};

const toggleDownloadImages = (options) => {
  options.downloadImages = !options.downloadImages;
  document.querySelector('#downloadImages').classList.toggle('checked');
  chrome.runtime.sendMessage({ type: 'setOptions', options: options }, (response) => {
    if (response && response.success) {
      browser.contextMenus.update('toggle-downloadImages', {
        checked: options.downloadImages,
      });
      try {
        browser.contextMenus.update('tabtoggle-downloadImages', {
          checked: options.downloadImages,
        });
      } catch {}
    } else {
      console.error('Error setting options:', response);
    }
  });
};

function toggleHidePictureMdUrl(options) {
  options.hidePictureMdUrl = !options.hidePictureMdUrl;
  chrome.runtime.sendMessage({ type: 'setOptions', options: options }, (response) => {
    if (response && response.success) {
      clipSite();
    } else {
      console.error('Error setting options:', response);
    }
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

const clipSite = (id) => {
  return browser.tabs
    .executeScript(id, { code: 'getSelectionAndDom()' })
    .then((result) => {
      if (result && result[0]) {
        showOrHideClipOption(result[0].selection);
        let message = {
          type: 'clip',
          dom: result[0].dom,
          selection: result[0].selection,
        };
        return chrome.runtime.sendMessage({ type: 'getOptions' }, (response) => {
          if (response && response.options) {
            // 确保所有选项都有默认值
            const options = { ...defaultOptions, ...response.options };
            console.log('Options from storage:', options);
            console.log('hidePictureMdUrl value:', options.hidePictureMdUrl);
            chrome.runtime.sendMessage(
              {
                ...message,
                ...options,
              },
              (sendResponse) => {
                if (sendResponse && sendResponse.success) {
                  return clipSite(id);
                } else {
                  console.error('Error sending message:', sendResponse);
                  showError(sendResponse);
                  return clipSite(id);
                }
              }
            );
          } else {
            console.error('Error getting options:', response);
            showError(response);
            return clipSite(id);
          }
        });
      }
    })
    .catch((err) => {
      console.error('Error executing script:', err);
      showError(err);
    });
};

// inject the necessary scripts
chrome.runtime.sendMessage({ type: 'getOptions' }, (response) => {
  if (response && response.options) {
    checkInitialSettings(response.options);

    document.getElementById('selected').addEventListener('click', (e) => {
      e.preventDefault();
      toggleClipSelection(response.options);
    });
    document.getElementById('document').addEventListener('click', (e) => {
      e.preventDefault();
      toggleClipSelection(response.options);
    });
    document.getElementById('includeTemplate').addEventListener('click', (e) => {
      e.preventDefault();
      toggleIncludeTemplate(response.options);
    });
    document.getElementById('downloadImages').addEventListener('click', (e) => {
      e.preventDefault();
      toggleDownloadImages(response.options);
    });
    document.getElementById('hidePictureMdUrl').addEventListener('click', (e) => {
      e.preventDefault();
      toggleHidePictureMdUrl(response.options);
    });

    return browser.tabs.query({
      currentWindow: true,
      active: true,
    });
  }
});

// listen for notifications from the background page
chrome.runtime.onMessage.addListener(notify);

//function to send the download message to the background page
function sendDownloadMessage(text) {
  if (text != null) {
    return browser.tabs
      .query({
        currentWindow: true,
        active: true,
      })
      .then((tabs) => {
        var message = {
          type: 'download',
          markdown: text,
          title: document.getElementById('title').value,
          tab: tabs[0],
          imageList: imageList,
          mdClipsFolder: mdClipsFolder,
        };
        return chrome.runtime.sendMessage(message);
      });
  }
}

// event handler for download button
async function download(e) {
  e.preventDefault();
  await sendDownloadMessage(cm.getValue());
  window.close();
}

// event handler for download selected button
async function handleSelectionDownload(e) {
  e.preventDefault();
  try {
    if (cm.somethingSelected()) {
      const selection = cm.getSelection();
      await chrome.runtime.sendMessage({
        type: 'download',
        markdown: selection,
        title: document.getElementById('title').value + '_selection',
        imageList,
      });
    }
  } catch (error) {
    showError(error);
  }
}

// function that handles messages from the injected script into the site
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
  // show the hidden elements
  document.getElementById('container').style.display = 'flex';
  document.getElementById('spinner').style.display = 'none';
  cm.setValue(`Error clipping the page\n\n${err}`);
}

// 在DOM加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
  // 添加安全检测
  const downloadBtn = document.getElementById('download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      try {
        await ImageHandler.downloadImages(imageList);
      } catch (error) {
        console.error('Image download error:', error);
      }
    });
  } else {
    console.warn('Download button not found in DOM');
  }

  // 其他初始化代码...
});

// 添加缺失的函数实现
function openOptionsPage(e) {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
}

// 补充草稿保存功能
function saveDraft() {
  const content = cm.getValue();
  chrome.storage.local.set({ draft: content });
}

// 初始化剪贴板功能
function initializeClipboard() {
  cm.on('cursorActivity', (instance) => {
    const hasSelection = instance.somethingSelected();
    document.getElementById('downloadSelection').style.display = hasSelection ? 'block' : 'none';
  });
}

// 加载用户设置
async function loadUserSettings() {
  const result = await chrome.storage.sync.get(defaultOptions);
  checkInitialSettings(result);
}

// 在文件底部添加错误处理
window.addEventListener('error', (e) => {
  console.error('Global error:', e);
  showError(e.error);
});
