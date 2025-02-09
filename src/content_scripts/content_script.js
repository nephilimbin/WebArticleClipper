import { addLatexToMathJax3 } from './page_context.js';
import Readability from '../service_worker/Readability.js';

function notifyExtension() {
  try {
    const result = getSelectionAndDom();
    if (!result?.article?.content) {
      throw new Error('文章解析失败');
    }
    chrome.runtime.sendMessage({
      type: 'clip',
      dom: {
        ...result.article,
        // 确保可序列化
        math: JSON.parse(JSON.stringify(result.article.math)),
      },
      selection: result.selection,
    });
  } catch (error) {
    console.error('消息发送失败:', error);
    chrome.runtime.sendMessage({
      type: 'clipError',
      error: error.message,
    });
  }
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

export async function getSelectionAndDom() {
  try {
    // 存储可用性检查
    await new Promise((resolve, reject) => {
      chrome.storage.sync.get('healthCheck', (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Storage unavailable'));
        } else {
          resolve();
        }
      });
    });

    // 检查存储连接
    const storageTest = await chrome.storage.sync.get('test');
    if (chrome.runtime.lastError) {
      throw new Error('Storage connection failed');
    }

    const options = await new Promise((resolve) => chrome.storage.sync.get(defaultOptions, resolve));

    const domString = getHTMLOfDocument();
    const parser = new DOMParser();
    const doc = parser.parseFromString(domString, 'text/html');

    // 保留原始处理逻辑
    const math = {};
    const storeMathInfo = (el, mathInfo) => {
      const randomId = URL.createObjectURL(new Blob([])).slice(-36);
      el.id = randomId;
      math[randomId] = mathInfo;
    };

    // 处理MathJax元素
    doc.body.querySelectorAll('script[id^=MathJax-Element-]').forEach((mathSource) => {
      const type = mathSource.getAttribute('type');
      storeMathInfo(mathSource, {
        tex: mathSource.textContent,
        inline: type ? !type.includes('mode=display') : false,
      });
    });

    // 处理自定义数学标记
    doc.body.querySelectorAll('[markdownload-latex]').forEach((mathNode) => {
      const tex = mathNode.getAttribute('markdownload-latex');
      const display = mathNode.getAttribute('display');
      const newElem = document.createElement(display === 'true' ? 'div' : 'span');
      newElem.textContent = tex;
      mathNode.parentNode.replaceChild(newElem, mathNode);
      storeMathInfo(newElem, { tex, inline: display !== 'true' });
    });

    // 处理代码块语言标识
    doc.body.querySelectorAll('[class*="highlight-"], [class*="language-"]').forEach((codeElem) => {
      const lang = codeElem.className.match(/(highlight-(?:text|source)-|language-)(\w+)/)?.[2];
      if (lang && codeElem.firstElementChild?.tagName === 'PRE') {
        codeElem.firstElementChild.id = `code-lang-${lang}`;
      }
    });

    // 处理pre标签中的换行
    doc.body.querySelectorAll('pre br').forEach((br) => {
      br.outerHTML = '<br-keep></br-keep>';
    });

    // 清理标题类名
    doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((header) => {
      header.className = '';
      header.outerHTML = header.outerHTML;
    });

    // 清理HTML根元素类
    doc.documentElement.removeAttribute('class');

    // 使用Readability解析文档
    const readabilityOptions = {
      charThreshold: options.charThreshold || 500,
      nbTopCandidates: options.nbTopCandidates || 5,
    };
    const article = new Readability(doc, readabilityOptions).parse();

    // 确保兼容旧版Readability输出结构
    if (!article.content) {
      console.error('Readability解析异常，文档结构:', doc);
      throw new Error('Failed to parse article content');
    }

    // 添加调试日志
    console.debug('解析后的文章内容:', {
      title: article.title,
      content: article.content.length,
      baseURI: article.baseURI,
    });

    // 添加原始处理数据
    article.math = math;
    article.baseURI = doc.baseURI;
    article.pageTitle = doc.title;

    // 添加URL信息
    const url = new URL(doc.baseURI);
    Object.assign(article, {
      hash: url.hash,
      host: url.host,
      origin: url.origin,
      hostname: url.hostname,
      pathname: url.pathname,
      port: url.port,
      protocol: url.protocol,
      search: url.search,
    });

    // 提取元数据
    if (doc.head) {
      article.keywords = [...doc.head.querySelectorAll('meta[name="keywords"]')].map((meta) => meta?.content?.split(',').map((s) => s.trim())) || [];

      doc.head.querySelectorAll('meta[name][content], meta[property][content]').forEach((meta) => {
        const key = meta.getAttribute('name') || meta.getAttribute('property');
        const value = meta.getAttribute('content');
        if (key && value && !article[key]) {
          article[key] = value;
        }
      });
    }

    return {
      selection: getHTMLOfSelection(),
      article: article,
    };
  } catch (error) {
    console.error('Storage check failed:', error);
    throw error;
  }
}

// 修改window对象暴露的方法
window.getSelectionAndDom = async function () {
  const article = new Readability(document).parse();
  // 添加必要的处理逻辑（同export函数）
  const url = new URL(document.baseURI);
  Object.assign(article, {
    hash: url.hash,
    host: url.host,
    // ...其他属性
  });
  return {
    selection: getHTMLOfSelection(),
    article: article,
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
