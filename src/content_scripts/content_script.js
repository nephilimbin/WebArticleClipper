// console.log('🚀 内容脚本已加载', {
//   location: window.location.href,
//   readyState: document.readyState,
// });

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

// 修改点：将 MathJax 处理逻辑内联到 content_script
// 原 page_context.js 的功能已整合到当前文件，符合 MV3 禁止远程代码执行的规范
function injectMathJaxScript() {
  const script = document.createElement('script');
  script.textContent = `
    function addLatexToMathJax3() {
      // 完全恢复旧版 page_context.js 的原始逻辑
      if (typeof window.MathJax === 'undefined') {
        console.debug('MathJax not found on page');
        return;
      }
    
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

    // 恢复旧版事件绑定结构
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addLatexToMathJax3);
    } else {
      addLatexToMathJax3();
    }
  `;

  // 保持安全注入方式
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

// 保持原有事件监听逻辑
if (document.readyState === 'complete') {
  injectMathJaxScript();
} else {
  window.addEventListener('load', injectMathJaxScript);
}

// 修改消息监听器，添加状态验证
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📡 内容脚本消息监听器已激活', {
    url: location.href,
    readyState: document.readyState,
  });

  // 添加跨域安全检查
  if (sender.origin !== chrome.runtime.getURL('').slice(0, -1)) {
    console.warn('非法消息来源:', sender.origin);
    return false;
  }

  console.log('📨 收到消息:', request.type, {
    tabId: sender.tab?.id,
    frameId: sender.frameId,
  });

  if (request.type === 'parseDOM') {
    console.log('开始解析DOM，内容长度:', request.domString?.length);
    const startTime = Date.now();

    // 添加异步处理标记
    (async () => {
      try {
        // 步骤1: 创建DOM解析器
        const parser = new DOMParser();
        const dom = parser.parseFromString(request.domString, 'text/html');

        // 新增DOM有效性检查
        console.debug('解析后的DOM结构:', {
          title: dom.title,
          bodyLength: dom.body?.innerHTML?.length,
          baseURI: dom.baseURI,
        });

        // 步骤2: 错误检查
        if (dom.documentElement.nodeName === 'parsererror') {
          throw new Error('DOM解析错误');
        }

        // 步骤3: 数学公式处理
        const math = {};
        const generateRandomId = () => {
          const array = new Uint32Array(1);
          crypto.getRandomValues(array);
          return 'math-' + array[0].toString(36);
        };

        // 处理MathJax元素
        dom.body.querySelectorAll('script[id^=MathJax-Element-]').forEach((mathSource) => {
          const type = mathSource.getAttribute('type');
          const id = generateRandomId();
          mathSource.id = id;
          math[id] = {
            tex: mathSource.textContent,
            inline: type ? !type.includes('mode=display') : false,
          };
        });

        // 处理Latex标记
        dom.body.querySelectorAll('[markdownload-latex]').forEach((mathJax3Node) => {
          const tex = mathJax3Node.getAttribute('markdownload-latex');
          const display = mathJax3Node.getAttribute('display');
          const inline = !(display === 'true');

          const mathNode = document.createElement(inline ? 'i' : 'p');
          mathNode.textContent = tex;
          mathJax3Node.parentNode.replaceChild(mathNode, mathJax3Node);

          const id = generateRandomId();
          math[id] = { tex, inline };
        });

        // 步骤4: 代码块处理
        dom.body.querySelectorAll('pre br').forEach((br) => {
          br.outerHTML = '<br-keep></br-keep>';
        });

        // 步骤5: 使用Readability解析文章
        console.debug('Readability解析详情:', {
          title: article?.title,
          contentLength: article?.content?.length,
          excerpt: article?.excerpt?.substring(0, 50),
        });

        // 步骤6: 提取元数据
        const url = new URL(dom.baseURI);
        article.baseURI = dom.baseURI;
        article.pageTitle = dom.title;
        article.hash = url.hash;
        article.host = url.host;
        article.origin = url.origin;
        article.hostname = url.hostname;
        article.pathname = url.pathname;
        article.port = url.port;
        article.protocol = url.protocol;
        article.search = url.search;
        article.math = math;

        // 步骤7: 关键词提取
        const metaKeywords = dom.head.querySelector('meta[name="keywords"]');
        if (metaKeywords) {
          article.keywords = metaKeywords.content.split(',').map((s) => s.trim());
        }

        // 补充其他meta标签处理
        dom.head.querySelectorAll('meta[name][content], meta[property][content]').forEach((meta) => {
          const key = meta.getAttribute('name') || meta.getAttribute('property');
          const val = meta.getAttribute('content');
          if (key && val && !article[key]) {
            article[key] = val;
          }
        });

        // 补充标题清理逻辑
        dom.body.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((header) => {
          header.className = '';
          header.outerHTML = header.outerHTML;
        });

        // 补充根元素清理
        dom.documentElement.removeAttribute('class');

        console.log('DOM解析完成，文章标题:', article.title);

        // 修改Readability解析部分
        const article = new Readability(dom).parse();
        if (!article) {
          throw new Error('Readability解析返回空结果');
        }

        // 添加必要字段检查
        const requiredFields = ['title', 'content', 'byline'];
        requiredFields.forEach((field) => {
          if (!article[field]) {
            console.warn(`文章缺少必要字段: ${field}`);
            article[field] = '';
          }
        });

        // 添加解析结果验证
        if (!article?.content) {
          console.error('解析结果无效', {
            title: article?.title,
            contentLength: article?.content?.length,
            domState: dom.documentElement.outerHTML.length,
          });
          throw new Error('文章内容为空');
        }

        // 在解析DOM后添加结构检查
        if (!dom.body || dom.body.children.length === 0) {
          throw new Error('无效的DOM结构，body为空');
        }

        // 在解析前清理干扰元素
        dom.querySelectorAll('script, style, noscript').forEach((el) => el.remove());

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
});
