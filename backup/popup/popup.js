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
document.getElementById('download').addEventListener('click', download);
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
  browser.storage.sync
    .set(options)
    .then(() => clipSite())
    .catch((error) => {
      console.error(error);
    });
};

const toggleIncludeTemplate = (options) => {
  options.includeTemplate = !options.includeTemplate;
  document.querySelector('#includeTemplate').classList.toggle('checked');
  browser.storage.sync
    .set(options)
    .then(() => {
      browser.contextMenus.update('toggle-includeTemplate', {
        checked: options.includeTemplate,
      });
      try {
        browser.contextMenus.update('tabtoggle-includeTemplate', {
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
  browser.storage.sync
    .set(options)
    .then(() => {
      browser.contextMenus.update('toggle-downloadImages', {
        checked: options.downloadImages,
      });
      try {
        browser.contextMenus.update('tabtoggle-downloadImages', {
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
  browser.storage.sync
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
        return browser.storage.sync
          .get(defaultOptions)
          .then((options) => {
            // 确保所有选项都有默认值
            options = { ...defaultOptions, ...options };
            console.log('Options from storage:', options);
            console.log('hidePictureMdUrl value:', options.hidePictureMdUrl);
            browser.runtime.sendMessage({
              ...message,
              ...options,
            });
          })
          .catch((err) => {
            console.error('Error getting options:', err);
            showError(err);
            return browser.runtime.sendMessage({
              ...message,
              ...defaultOptions,
            });
          })
          .catch((err) => {
            console.error('Error sending message:', err);
            showError(err);
          });
      }
    })
    .catch((err) => {
      console.error('Error executing script:', err);
      showError(err);
    });
};

// inject the necessary scripts
browser.storage.sync
  .get(defaultOptions)
  .then((options) => {
    checkInitialSettings(options);

    document.getElementById('selected').addEventListener('click', (e) => {
      e.preventDefault();
      toggleClipSelection(options);
    });
    document.getElementById('document').addEventListener('click', (e) => {
      e.preventDefault();
      toggleClipSelection(options);
    });
    document.getElementById('includeTemplate').addEventListener('click', (e) => {
      e.preventDefault();
      toggleIncludeTemplate(options);
    });
    document.getElementById('downloadImages').addEventListener('click', (e) => {
      e.preventDefault();
      toggleDownloadImages(options);
    });
    document.getElementById('hidePictureMdUrl').addEventListener('click', (e) => {
      e.preventDefault();
      toggleHidePictureMdUrl(options);
    });

    return browser.tabs.query({
      currentWindow: true,
      active: true,
    });
  })
  .then((tabs) => {
    var id = tabs[0].id;
    var url = tabs[0].url;
    browser.tabs
      .executeScript(id, {
        file: '/browser-polyfill.min.js',
      })
      .then(() => {
        return browser.tabs.executeScript(id, {
          file: '/content_scripts/content_script.js',
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

// listen for notifications from the background page
browser.runtime.onMessage.addListener(notify);

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
        return browser.runtime.sendMessage(message);
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

// 在弹出页面的下载按钮点击处理中
document.getElementById('download-btn').addEventListener('click', async () => {
  try {
    await ImageHandler.downloadImages(imageList);
  } catch (error) {
    if (error.message.includes('not ready')) {
      // 添加自动重试机制
      setTimeout(async () => {
        await ImageHandler.downloadImages(imageList);
      }, 500);
    }
  }
});
