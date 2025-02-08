// default variables
var selectedText = null;
var imageList = null;
var mdClipsFolder = '';

// 模块导入路径修正
import ImageHandler from '../shared/image-handler.js';
import { defaultOptions, getOptions } from '../shared/default-options.js';

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
  const downloadBtn = document.getElementById('download-btn');
  const downloadSelection = document.getElementById('downloadSelection');
  const optionsBtn = document.getElementById('options');
  const includeTemplateBtn = document.querySelector('#includeTemplate');
  const downloadImagesBtn = document.querySelector('#downloadImages');
  const hidePictureBtn = document.querySelector('#hidePictureMdUrl');

  if (downloadBtn) {
    downloadBtn.addEventListener('click', handleDownload);
  } else {
    console.error('Download button not found');
  }

  if (downloadSelection) {
    downloadSelection.addEventListener('click', handleSelectionDownload);
  }

  if (optionsBtn) {
    optionsBtn.addEventListener('click', openOptionsPage);
  }

  if (includeTemplateBtn) {
    includeTemplateBtn.addEventListener('click', async () => {
      const options = await getOptions();
      toggleIncludeTemplate(options);
    });
  }

  if (downloadImagesBtn) {
    downloadImagesBtn.addEventListener('click', async () => {
      const options = await getOptions();
      toggleDownloadImages(options);
    });
  }

  if (hidePictureBtn) {
    hidePictureBtn.addEventListener('click', async () => {
      const options = await getOptions();
      toggleHidePictureMdUrl(options);
    });
  }
}

// 完整初始化流程
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initCodeMirror();
    bindEventListeners();
    await loadUserSettings();
    await checkServiceWorker();
    initializeClipboard();

    // 添加元素存在性检查
    const container = document.getElementById('container');
    const spinner = document.getElementById('spinner');
    if (container && spinner) {
      container.style.display = 'flex';
      spinner.style.display = 'none';
    }
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

// 保留并修正异步版本函数
async function toggleIncludeTemplate() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const options = await getOptions();
  options.includeTemplate = !options.includeTemplate;
  await chrome.runtime.sendMessage({
    type: 'setOptions',
    options: options,
  });
  document.querySelector('#includeTemplate').classList.toggle('checked');
  clipSite(tab.id);
}

async function toggleDownloadImages() {
  const options = await getOptions();
  options.downloadImages = !options.downloadImages;
  await chrome.runtime.sendMessage({
    type: 'setOptions',
    options: options,
  });
  document.querySelector('#downloadImages').classList.toggle('checked');
}

async function toggleHidePictureMdUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const options = await getOptions();
  options.hidePictureMdUrl = !options.hidePictureMdUrl;
  await chrome.runtime.sendMessage({
    type: 'setOptions',
    options: options,
  });
  document.querySelector('#hidePictureMdUrl').classList.toggle('checked');
  clipSite(tab.id);
}

const showOrHideClipOption = (selection) => {
  if (selection) {
    document.getElementById('clipOption').style.display = 'flex';
  } else {
    document.getElementById('clipOption').style.display = 'none';
  }
};

const clipSite = (id) => {
  return chrome.scripting
    .executeScript({
      target: { tabId: id },
      func: () => window.getSelectionAndDom(),
    })
    .then(async (result) => {
      if (result && result[0]) {
        showOrHideClipOption(result[0].selection);
        let message = {
          type: 'clip',
          dom: result[0].dom,
          selection: result[0].selection,
        };

        const response = await chrome.runtime.sendMessage({
          type: 'get_current_options',
        });

        if (response && response.options) {
          const options = { ...defaultOptions, ...response.options };
          return chrome.runtime.sendMessage({
            ...message,
            ...options,
          });
        }
      }
    })
    .catch((err) => {
      console.error('Error executing script:', err);
      showError(err);
    });
};

// inject the necessary scripts
const options = await chrome.runtime.sendMessage({ type: 'getOptions' });

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
    document.getElementById('download-btn').focus();
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
  const downloadBtn = document.getElementById('download-btn');
  if (!downloadBtn) {
    console.error('Download button not found! Current DOM:', document.documentElement.innerHTML);
  }

  // 添加安全检测
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
  try {
    const result = await chrome.storage.sync.get(defaultOptions);
    checkInitialSettings({ ...defaultOptions, ...result });
  } catch (error) {
    console.error('Failed to load user settings:', error);
    checkInitialSettings(defaultOptions);
  }
}

// 在文件底部添加错误处理
window.addEventListener('error', (e) => {
  console.error('Global error:', e);
  showError(e.error);
});
