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

const clipSite = (id) => {
  return chrome.scripting
    .executeScript({
      target: { tabId: id },
      func: () => window.getSelectionAndDom(),
    })
    .then((result) => {
      console.log('clipSite脚本执行结果:', result.result, '&tabid:', id);
      if (result?.[0]?.result) {
        showOrHideClipOption(result[0].result.selection);
        let message = {
          type: 'clip',
          dom: result[0].result.dom,
          selection: result[0].result.selection,
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
      }
    })
    .catch((err) => {
      console.error('脚本执行失败:', err);
      showError(err);
      throw err;
    });
};

// inject the necessary scripts
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync
    .get(defaultOptions)
    .then((options) => {
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
          console.info('Successfully injected MarkDownload content script');
          return clipSite(id);
        })
        .catch((error) => {
          console.error(error);
          showError(error);
        });
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
  // show the hidden elements
  document.getElementById('container').style.display = 'flex';
  document.getElementById('spinner').style.display = 'none';
  cm.setValue(`Error clipping the page\n\n${err}`);
}
