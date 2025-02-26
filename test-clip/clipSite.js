import Readability from './Readability.js';
import { defaultOptions, getOptions } from './shared/default-options.js';

/**
 * 主函数：根据URL获取网页内容并解析为文章对象
 * @param {string} url - 要抓取的网页URL
 * @param {Object} options - 可选的配置选项
 * @returns {Promise<Object>} - 解析后的文章对象
 */
async function clipSiteByUrl(url, customOptions = {}) {
  try {
    console.log('开始抓取URL:', url);

    // 获取配置选项
    const options = customOptions.useDefaultOnly ? { ...defaultOptions, ...customOptions } : await getOptions().then((opts) => ({ ...opts, ...customOptions }));

    console.log('使用配置选项:', options);

    // 获取网页内容
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP错误: ${response.status}`);
    }

    const html = await response.text();
    console.log('获取到HTML内容，长度:', html.length);

    // 解析DOM获取文章
    const article = await getArticleFromDom(html, options);

    if (!article?.content) {
      throw new Error('无法解析文章内容');
    }

    console.log('成功解析文章:', article.title);
    return article;
  } catch (error) {
    console.error('抓取失败:', error);
    throw error;
  }
}

/**
 * 从DOM字符串解析文章内容
 * @param {string} domString - HTML字符串
 * @param {Object} options - 配置选项
 * @returns {Object} - 解析后的文章对象
 */
async function getArticleFromDom(domString, options = {}) {
  try {
    console.log('开始解析DOM，原始数据长度:', domString?.length);
    console.debug('DOM前200字符:', domString?.slice(0, 200));

    // 添加前置校验
    if (!domString || domString.length < 100) {
      throw new Error('无效的DOM内容');
    }

    // 使用DOMParser解析HTML
    const parser = new DOMParser();
    const dom = parser.parseFromString(domString, 'text/html');

    if (dom.documentElement.nodeName === 'parsererror') {
      throw new Error('DOM解析错误');
    }

    // 处理数学公式 (仅当mathJaxRendering选项启用时)
    const math = {};
    if (options.mathJaxRendering) {
      // 生成随机ID的函数
      const generateRandomId = () => {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return 'math-' + array[0].toString(36);
      };

      // 处理MathJax元素
      dom.body.querySelectorAll('script[id^=MathJax-Element-]')?.forEach((mathSource) => {
        const type = mathSource.getAttribute('type');
        const id = generateRandomId();
        mathSource.id = id;
        math[id] = {
          tex: mathSource.textContent,
          inline: type ? !type.includes('mode=display') : false,
        };
      });

      // 处理Latex标记
      dom.body.querySelectorAll('[markdownload-latex]')?.forEach((mathJax3Node) => {
        const tex = mathJax3Node.getAttribute('markdownload-latex');
        const display = mathJax3Node.getAttribute('display');
        const inline = !(display === 'true');

        const mathNode = document.createElement(inline ? 'i' : 'p');
        mathNode.textContent = tex;
        mathJax3Node.parentNode.replaceChild(mathNode, mathJax3Node);

        const id = generateRandomId();
        mathNode.id = id;
        math[id] = { tex, inline };
      });

      // 处理KaTeX元素
      dom.body.querySelectorAll('.katex-mathml')?.forEach((kaTeXNode) => {
        const annotation = kaTeXNode.querySelector('annotation');
        if (annotation) {
          const id = generateRandomId();
          kaTeXNode.id = id;
          math[id] = {
            tex: annotation.textContent,
            inline: true,
          };
        }
      });
    }

    // 处理代码块
    dom.body.querySelectorAll('[class*=highlight-text],[class*=highlight-source]')?.forEach((codeSource) => {
      const language = codeSource.className.match(/highlight-(?:text|source)-([a-z0-9]+)/)?.[1];
      if (codeSource.firstChild?.nodeName === 'PRE') {
        codeSource.firstChild.id = `code-lang-${language}`;
      }
    });

    dom.body.querySelectorAll('[class*=language-]')?.forEach((codeSource) => {
      const language = codeSource.className.match(/language-([a-z0-9]+)/)?.[1];
      codeSource.id = `code-lang-${language}`;
    });

    dom.body.querySelectorAll('pre br')?.forEach((br) => {
      br.outerHTML = '<br-keep></br-keep>';
    });

    dom.body.querySelectorAll('.codehilite > pre')?.forEach((codeSource) => {
      if (codeSource.firstChild?.nodeName !== 'CODE' && !codeSource.className.includes('language')) {
        codeSource.id = 'code-lang-text';
      }
    });

    // 标题清理
    dom.body.querySelectorAll('h1, h2, h3, h4, h5, h6')?.forEach((header) => {
      header.className = '';
      header.outerHTML = header.outerHTML;
    });

    // 根元素清理
    dom.documentElement.removeAttribute('class');

    // 使用Readability解析
    const article = new Readability(dom, {
      // 传递Readability选项
      charThreshold: 20,
      classesToPreserve: ['page'],
      keepClasses: options.keepClasses || false,
    }).parse();

    if (!article) {
      throw new Error('Readability解析返回空结果');
    }

    console.debug(
      '解析响应结构:',
      JSON.stringify(
        {
          title: article.title,
          byline: article.byline,
          excerpt: article.excerpt,
          contentLength: article.content?.length,
        },
        null,
        2
      )
    );

    // 提取元数据
    const url = new URL(dom.baseURI || 'about:blank');
    article.baseURI = dom.baseURI || url.href;
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

    // 提取关键词
    if (dom.head) {
      const metaKeywords = dom.head.querySelector('meta[name="keywords"]');
      if (metaKeywords) {
        article.keywords = metaKeywords.content.split(',').map((s) => s.trim());
      } else {
        article.keywords = [];
      }

      // 提取其他meta标签
      dom.head.querySelectorAll('meta[name][content], meta[property][content]')?.forEach((meta) => {
        const key = meta.getAttribute('name') || meta.getAttribute('property');
        const val = meta.getAttribute('content');
        if (key && val && !article[key]) {
          article[key] = val;
        }
      });
    }

    // 内容清理 (如果autoSanitize选项启用)
    if (options.autoSanitize) {
      // 这里可以添加内容清理逻辑
      // 例如移除特定标签、属性等
    }

    console.debug('文章元数据:', {
      title: article.title,
      contentLength: article.content.length,
      baseURI: article.baseURI,
    });

    console.log('DOM解析完成，文章标题:', article.title);
    return article;
  } catch (error) {
    console.error('DOM解析失败:', error.message);
    throw error;
  }
}

/**
 * 获取网页选中内容和DOM
 * 用于在浏览器环境中执行
 * @returns {Object} 包含选中内容和DOM的对象
 */
function getSelectionAndDom() {
  try {
    // 获取选中内容
    const selection = window.getSelection().toString();

    // 获取完整DOM
    const dom = document.documentElement.outerHTML;

    console.debug('DOM内容长度:', dom?.length);
    console.debug('选中内容长度:', selection?.length);

    return { selection, dom };
  } catch (e) {
    console.error('获取DOM和选中内容失败:', e);
    return { error: e.message };
  }
}

/**
 * 剪切网页内容
 * @param {number} tabId - 浏览器标签页ID
 * @param {Object} customOptions - 自定义选项
 * @returns {Promise<Object>} 剪切结果
 */
async function clipSite(tabId, customOptions = {}) {
  try {
    // 获取配置
    const options = await getOptions().then((opts) => ({ ...opts, ...customOptions }));

    // 执行内容脚本获取DOM和选中内容
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: getSelectionAndDom,
    });

    if (!results?.[0]?.result) {
      throw new Error('未获取到有效结果');
    }

    const { dom, selection } = results[0].result;
    console.log('DOM内容长度:', dom?.length);
    console.log('选中内容长度:', selection?.length);

    // 根据clipSelection选项决定是否只处理选中内容
    const article = await getArticleFromDom(dom, options);

    // 如果有选中内容且clipSelection为true，则只处理选中内容
    if (selection && options.clipSelection) {
      article.selectedContent = selection;
      // 这里可以添加选中内容的处理逻辑
    }

    return article;
  } catch (error) {
    console.error('剪切失败:', error);
    throw error;
  }
}

// 导出主要函数
export { clipSiteByUrl, getArticleFromDom, getSelectionAndDom, clipSite };

// 如果直接运行此脚本，提供简单的使用示例
if (typeof window !== 'undefined' && window.location.href !== 'about:blank') {
  console.log('直接运行clipSite.js，正在解析当前页面...');
  clipSiteByUrl(window.location.href)
    .then((article) => {
      console.log('解析结果:', article);
      // 在控制台中显示结果
      console.log('文章标题:', article.title);
      console.log('文章内容长度:', article.content.length);
      console.log('文章摘要:', article.excerpt);
    })
    .catch((error) => {
      console.error('解析失败:', error);
    });
}
