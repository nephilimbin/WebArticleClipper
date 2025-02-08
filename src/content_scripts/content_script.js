import { addLatexToMathJax3 } from './page_context.js';

function notifyExtension() {
  // send a message that the content should be clipped
  chrome.runtime.sendMessage({ type: 'clip', dom: content });
}

function getHTMLOfDocument() {
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
  return document.documentElement.outerHTML;
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

export function getSelectionAndDom() {
  return {
    selection: getHTMLOfSelection(),
    dom: getHTMLOfDocument(),
  };
}

// 确保函数已附加到window对象
window.getSelectionAndDom = function () {
  return {
    selection: getHTMLOfSelection(),
    dom: getHTMLOfDocument(),
  };
};

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

async function downloadImage(filename, url) {
  try {
    const blob = await ImageHandler.downloadImage(url, filename);
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 清理 blob URL
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

    return true;
  } catch (error) {
    console.error('Error downloading image:', error);
    return false;
  }
}

// MathJax处理函数（原page_context.js内容）
function addLatexToMathJax3() {
  // 检查 window.MathJax 是否存在
  if (typeof window.MathJax === 'undefined') {
    console.debug('MathJax not found on page');
    return;
  }

  // 检查必要的 MathJax 属性
  if (!window.MathJax?.startup?.document?.math) {
    console.debug('MathJax not initialized');
    return;
  }

  try {
    for (const math of window.MathJax.startup.document.math) {
      if (math.typesetRoot && math.math) {
        math.typesetRoot.setAttribute('markdownload-latex', math.math);
      }
    }
  } catch (error) {
    console.debug('Error processing MathJax:', error);
  }
}

function injectMathJaxScript() {
  const script = document.createElement('script');
  script.textContent = `
    (${addLatexToMathJax3.toString()})(); 
    
    // 执行时机处理
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addLatexToMathJax3);
    } else {
      addLatexToMathJax3();
    }
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

// 添加消息处理函数
function handleMessage(message, sender, sendResponse) {
  if (message.type === 'copyToClipboard') {
    copyToClipboard(message.text);
  } else if (message.type === 'downloadMarkdown') {
    downloadMarkdown(message.filename, message.text);
  } else if (message.type === 'downloadImage') {
    downloadImage(message.filename, message.url).then(sendResponse);
    return true; // 保持消息通道开放
  }
}

// 消息监听器
chrome.runtime.onMessage.addListener(handleMessage);
