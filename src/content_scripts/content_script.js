// 在文件顶部添加初始化代码
if (!window._markdownload) {
  window._markdownload = {
    initialized: false,
    downloadQueue: new Set(),
  };
}

// 只初始化一次消息监听
if (!window._markdownload.initialized) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'downloadImage') {
      // 添加请求ID校验
      const requestId = `${message.filename}|${message.src.substring(0, 100)}`;
      if (window._markdownload.downloadQueue.has(requestId)) {
        console.warn('重复请求已忽略:', requestId);
        return true;
      }

      window._markdownload.downloadQueue.add(requestId);
      downloadImage(message.filename, message.src, message.isBase64)
        .finally(() => {
          window._markdownload.downloadQueue.delete(requestId);
        })
        .then((success) => sendResponse({ success }))
        .catch((error) => sendResponse({ error }));
      return true;
    }
  });
  window._markdownload.initialized = true;
}

function notifyExtension() {
  // send a message that the content should be clipped
  chrome.runtime.sendMessage({ type: 'clip', dom: content });
}

function getHTMLOfDocument() {
  try {
    // 保留原有所有逻辑
    // make sure a title tag exists so that pageTitle is not empty and
    // a filename can be genarated.
    if (document.head.getElementsByTagName('title').length == 0) {
      let titleEl = document.createElement('title');
      // prepate a good default text (the text displayed in the window title)
      titleEl.innerText = document.title;
      document.head.append(titleEl);
    }

    // if the document doesn't have a "base" element make one
    // this allows the DOM parser in future steps to fix relative uris

    let baseEls = document.head.getElementsByTagName('base');
    let baseEl;

    if (baseEls.length > 0) {
      baseEl = baseEls[0];
    } else {
      baseEl = document.createElement('base');
      document.head.append(baseEl);
    }

    // make sure the 'base' element always has a good 'href`
    // attribute so that the DOMParser generates usable
    // baseURI and documentURI properties when used in the
    // background context.

    let href = baseEl.getAttribute('href');

    if (!href || !href.startsWith(window.location.origin)) {
      baseEl.setAttribute('href', window.location.href);
    }

    // remove the hidden content from the page
    removeHiddenNodes(document.body);

    // get the content of the page as a string
    const originalHTML = document.documentElement.outerHTML;

    // 新增调试日志
    console.debug('DOM结构详情:', {
      titleExists: document.head.querySelector('title') !== null,
      baseHref: baseEl.getAttribute('href'),
      hiddenNodesRemoved: document.querySelectorAll('[hidden]').length,
    });

    // 添加完整性检查
    if (originalHTML.length < 100) {
      console.warn('(getHTMLOfDocument) 获取的DOM内容过短，当前长度:', originalHTML.length);
      // 但依然返回原始内容
      return originalHTML;
    }

    return originalHTML;
  } catch (error) {
    // 保留原有异常处理逻辑
    const fallbackHTML = document.documentElement.outerHTML;
    console.error('(getHTMLOfDocument) DOM获取失败，返回原始内容:', {
      error: error.message,
      stack: error.stack,
      fallbackLength: fallbackHTML.length,
    });
    return fallbackHTML; // 保持原有异常处理方式
  }
}

// code taken from here: https://www.reddit.com/r/javascript/comments/27bcao/anyone_have_a_method_for_finding_all_the_hidden/
function removeHiddenNodes(root) {
  let nodeIterator,
    node,
    i = 0;

  nodeIterator = document.createNodeIterator(root, NodeFilter.SHOW_ELEMENT, function (node) {
    let nodeName = node.nodeName.toLowerCase();
    if (nodeName === 'script' || nodeName === 'style' || nodeName === 'noscript' || nodeName === 'math') {
      return NodeFilter.FILTER_REJECT;
    }
    if (node.offsetParent === void 0) {
      return NodeFilter.FILTER_ACCEPT;
    }
    let computedStyle = window.getComputedStyle(node, null);
    if (computedStyle.getPropertyValue('visibility') === 'hidden' || computedStyle.getPropertyValue('display') === 'none') {
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while ((node = nodeIterator.nextNode()) && ++i) {
    if (node.parentNode instanceof HTMLElement) {
      node.parentNode.removeChild(node);
    }
  }
  return root;
}

// code taken from here: https://stackoverflow.com/a/5084044/304786
function getHTMLOfSelection() {
  var range;
  if (document.selection && document.selection.createRange) {
    range = document.selection.createRange();
    return range.htmlText;
  } else if (window.getSelection) {
    var selection = window.getSelection();
    if (selection.rangeCount > 0) {
      let content = '';
      for (let i = 0; i < selection.rangeCount; i++) {
        range = selection.getRangeAt(0);
        var clonedSelection = range.cloneContents();
        var div = document.createElement('div');
        div.appendChild(clonedSelection);
        content += div.innerHTML;
      }
      return content;
    } else {
      return '';
    }
  } else {
    return '';
  }
}

function getSelectionAndDom() {
  return {
    selection: getHTMLOfSelection(),
    dom: getHTMLOfDocument(),
  };
}

// This function must be called in a visible page, such as a browserAction popup
// or a content script. Calling it in a background page has no effect!
function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
}

function downloadMarkdown(filename, text) {
  let datauri = `data:text/markdown;base64,${text}`;
  var link = document.createElement('a');
  link.download = filename;
  link.href = datauri;
  link.click();
}

// 下载图片
async function downloadImage(filename, url, isBase64 = false) {
  try {
    let blob;
    if (isBase64) {
      // 直接处理base64数据
      const byteString = atob(url.split(',')[1]);
      const mimeType = url.match(/:(.*?);/)[1];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      blob = new Blob([ab], { type: mimeType });
    } else {
      // 原始URL下载
      blob = await ImageHandler.parseImage(url, filename);
    }

    // 在内容脚本中使用 URL.createObjectURL
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

    console.groupEnd();
    return true;
  } catch (error) {
    console.error('下载失败:', { filename, error });
    throw error;
  }
}
