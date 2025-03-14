/**
 * clipSite.js - 网页内容抓取和解析工具
 * 支持在 Node.js 和浏览器环境中运行
 */

// 检测运行环境
const isNode = typeof window === 'undefined' || !window.document;

// 环境初始化标志，确保只初始化一次
let environmentInitialized = false;

// 根据环境导入依赖
let Readability, https, fs, path, JSDOM, URL, fileURLToPath;

/**
 * 简单的日志工具
 */
const logger = {
  level: 'info', // 可选: 'debug', 'info', 'warn', 'error'

  debug: function (...args) {
    if (['debug'].includes(this.level)) {
      console.debug('[DEBUG]', ...args);
    }
  },

  info: function (...args) {
    if (['debug', 'info'].includes(this.level)) {
      console.log('[INFO]', ...args);
    }
  },

  warn: function (...args) {
    if (['debug', 'info', 'warn'].includes(this.level)) {
      console.warn('[WARN]', ...args);
    }
  },

  error: function (...args) {
    if (['debug', 'info', 'warn', 'error'].includes(this.level)) {
      console.error('[ERROR]', ...args);
    }
  },

  // 设置日志级别
  setLevel: function (level) {
    if (['debug', 'info', 'warn', 'error'].includes(level)) {
      this.level = level;
    } else {
      console.warn(`无效的日志级别: ${level}，使用默认级别 'info'`);
      this.level = 'info';
    }
  },
};

/**
 * 初始化运行环境
 * 确保只执行一次，避免在批量处理时重复初始化
 */
async function initializeEnvironment() {
  if (environmentInitialized) return;

  if (isNode) {
    // Node.js 环境
    const module = await import('module');
    const require = module.createRequire(import.meta.url);

    https = await import('https');
    fs = await import('fs/promises');
    path = await import('path');
    JSDOM = (await import('jsdom')).JSDOM;
    URL = global.URL;
    fileURLToPath = (await import('url')).fileURLToPath;

    // 设置 Node.js 环境
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://example.com/',
      referrer: 'https://example.com/',
      contentType: 'text/html',
    });

    global.DOMParser = dom.window.DOMParser;
    global.document = dom.window.document;

    // 创建自定义 crypto 对象
    if (!global.window) {
      global.window = {
        crypto: {
          getRandomValues: (arr) => {
            for (let i = 0; i < arr.length; i++) {
              arr[i] = Math.floor(Math.random() * 1000000);
            }
            return arr;
          },
        },
        location: { href: 'https://example.com/' },
        navigator: {
          userAgent: 'Mozilla/5.0 (Node.js)',
        },
      };
    }

    // 尝试导入 Readability
    try {
      Readability = (await import('./Readability.js')).default;
    } catch (e) {
      console.warn('无法导入本地 Readability.js，尝试使用 @mozilla/readability');
      try {
        Readability = require('@mozilla/readability').Readability;
      } catch (e2) {
        throw new Error('无法加载 Readability 库，请确保已安装依赖');
      }
    }
  } else {
    // 浏览器环境
    try {
      Readability = (await import('./Readability.js')).default;
    } catch (e) {
      console.error('无法加载 Readability 库:', e);
      throw e;
    }
  }

  environmentInitialized = true;
}

// 确保在使用前初始化环境
await initializeEnvironment();

// 修改 TurndownService 导入部分
let TurndownService, gfmPlugin;

if (isNode) {
  // Node.js 环境
  try {
    // 尝试从本地 lib 目录导入
    TurndownService = (await import('./lib/turndown.js')).default;
    gfmPlugin = (await import('./lib/turndown-plugin-gfm.js')).gfmPlugin;
  } catch (e) {
    console.warn('无法从 lib 目录导入 Turndown，尝试使用 npm 包', e);
    try {
      const module = await import('module');
      const require = module.createRequire(import.meta.url);
      TurndownService = require('turndown');
      gfmPlugin = require('turndown-plugin-gfm').gfmPlugin;
    } catch (e2) {
      console.error('无法加载 Turndown 库:', e2);
      throw new Error('无法加载 Turndown 库，请确保已安装依赖');
    }
  }
} else {
  // 浏览器环境
  try {
    TurndownService = (await import('./lib/turndown.js')).default;
    gfmPlugin = (await import('./lib/turndown-plugin-gfm.js')).gfmPlugin;
  } catch (e) {
    console.error('无法加载 Turndown 库:', e);
    throw e;
  }
}

// 默认选项 - 从配置文件加载
let defaultOptions = {};
let configLastLoaded = 0; // 记录上次加载配置的时间戳

/**
 * 从配置文件加载选项
 * @returns {Promise<Object>} 配置选项
 */
async function loadConfig() {
  // 默认配置，当无法加载配置文件时使用
  const fallbackOptions = {
    mathJaxRendering: true,
    autoSanitize: true,
    clipSelection: true,
    keepClasses: false,
    headingStyle: 'atx',
    hr: '___',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    imageStyle: 'markdown',
    disallowedChars: '[]#^',
    hidePictureMdUrl: false,
    saveToFile: true,
    saveArticleJson: true,
    saveArticleContent: false,
    saveImageLinks: true,
    logLevel: 'info',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  };

  try {
    let configContent;

    // 根据环境获取配置文件内容
    if (isNode) {
      // Node.js环境
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const configPath = path.join(__dirname, 'config.jsonc');
      configContent = await fs.readFile(configPath, 'utf8');
    } else {
      // 浏览器环境
      const response = await fetch('./config.jsonc');
      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }
      configContent = await response.text();
    }

    // 移除JSON注释并解析
    const jsonContent = configContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    defaultOptions = JSON.parse(jsonContent);
    logger.info('已从配置文件加载选项');

    // 设置日志级别
    if (defaultOptions.logLevel) {
      logger.setLevel(defaultOptions.logLevel);
      logger.debug('日志级别设置为:', defaultOptions.logLevel);
    }
  } catch (error) {
    logger.warn('无法加载配置文件，使用内置默认选项:', error.message);
    defaultOptions = fallbackOptions;
  }

  return defaultOptions;
}

/**
 * 获取配置选项
 * @param {boolean} forceReload - 是否强制重新加载配置
 * @returns {Promise<Object>} 配置选项
 */
async function getOptions(forceReload = false) {
  const now = Date.now();
  // 如果配置为空，或者强制重新加载，或者距离上次加载超过5分钟，则重新加载
  if (Object.keys(defaultOptions).length === 0 || forceReload || now - configLastLoaded > 300000) {
    await loadConfig();
    configLastLoaded = now;
  }
  return defaultOptions;
}

/**
 * 从DOM字符串解析文章内容
 * @param {string} domString - HTML字符串
 * @param {Object} options - 配置选项
 * @returns {Object} - 解析后的文章对象
 */
async function getArticleFromDom(domString, options = {}) {
  try {
    logger.info('开始解析DOM，原始数据长度:', domString?.length);

    // 获取最新配置并合并选项
    const defaultOpts = await getOptions();
    options = { ...defaultOpts, ...options };

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
        window.crypto.getRandomValues(array);
        return 'math-' + array[0].toString(36);
      };

      // 处理MathJax元素
      dom.body.querySelectorAll('script[id^=MathJax-Element-]')?.forEach((mathSource) => {
        const type = mathSource.getAttribute('type');
        const id = generateRandomId();
        mathSource.id = id;
        mathSource.textContent = mathSource.textContent.trim();
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

    logger.info('DOM解析完成，文章标题:', article.title);
    return article;
  } catch (error) {
    logger.error('DOM解析失败:', error.message);
    throw error;
  }
}

/**
 * 根据环境选择不同的网络请求方法
 * @param {string} url - 请求URL
 * @param {Object} headers - 请求头
 * @returns {Promise<string>} - HTML内容
 */
async function fetchContent(url, headers = {}) {
  // 默认请求头
  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'max-age=0',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };

  // 合并请求头
  const mergedHeaders = { ...defaultHeaders, ...headers };

  // 检查URL是否需要Cookie
  const urlObj = new URL(url);
  const needsCookie = checkIfSiteNeedsCookie(urlObj.hostname);

  if (needsCookie && !hasCookieHeader(mergedHeaders)) {
    logger.warn(`警告: ${urlObj.hostname} 可能需要Cookie才能访问`);
  }

  if (isNode) {
    // Node.js 环境使用 https
    return new Promise((resolve, reject) => {
      // 解析URL以获取主机名和路径
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: mergedHeaders,
        // 添加超时设置
        timeout: 30000, // 30秒超时
      };

      logger.debug('请求选项:', {
        url: url,
        hostname: options.hostname,
        path: options.path,
      });

      const req = https.request(options, (res) => {
        logger.debug('状态码:', res.statusCode);

        // 处理重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          logger.debug(`重定向到: ${res.headers.location}`);
          return fetchContent(res.headers.location, mergedHeaders).then(resolve).catch(reject);
        }

        // 处理403错误 - 需要Cookie
        if (res.statusCode === 403) {
          if (needsCookie) {
            // 创建一个空的HTML模板，包含错误信息
            const errorHtml = createErrorHtml(url, '此网站需要Cookie才能访问');
            logger.warn('返回空内容模板，因为网站需要Cookie');
            resolve(errorHtml);
            return;
          } else {
            reject(new Error(`HTTP错误: 403 - 访问被拒绝，可能需要登录或更完整的Cookie`));
            return;
          }
        }

        // 处理其他错误
        if (res.statusCode !== 200) {
          if (res.statusCode === 404) {
            const errorHtml = createErrorHtml(url, '页面不存在 (404)');
            logger.warn('返回空内容模板，因为页面不存在');
            resolve(errorHtml);
            return;
          } else {
            reject(new Error(`HTTP错误: ${res.statusCode}`));
            return;
          }
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(data);
        });
      });

      // 添加错误处理
      req.on('error', (e) => {
        logger.error('请求错误:', e);
        reject(new Error(`请求错误: ${e.message}`));
      });

      // 添加超时处理
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时'));
      });

      req.end();
    });
  } else {
    // 浏览器环境使用 fetch API
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: mergedHeaders,
        credentials: needsCookie ? 'include' : 'same-origin',
        redirect: 'follow',
      });

      // 处理HTTP错误
      if (!response.ok) {
        if (response.status === 403 && needsCookie) {
          return createErrorHtml(url, '此网站需要Cookie才能访问');
        } else if (response.status === 404) {
          return createErrorHtml(url, '页面不存在 (404)');
        }
        throw new Error(`HTTP错误: ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      logger.error('Fetch错误:', error);
      throw error;
    }
  }
}

/**
 * 检查网站是否需要Cookie
 * @param {string} hostname - 主机名
 * @returns {boolean} - 是否需要Cookie
 */
function checkIfSiteNeedsCookie(hostname) {
  // 已知需要Cookie的网站列表
  const sitesNeedingCookie = ['zhihu.com', 'zhuanlan.zhihu.com', 'medium.com', 'juejin.cn', 'weibo.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com'];

  return sitesNeedingCookie.some((site) => hostname.includes(site));
}

/**
 * 检查请求头中是否有Cookie
 * @param {Object} headers - 请求头
 * @returns {boolean} - 是否有Cookie
 */
function hasCookieHeader(headers) {
  return !!headers.Cookie || !!headers.cookie;
}

/**
 * 创建错误HTML模板
 * @param {string} url - 请求的URL
 * @param {string} message - 错误信息
 * @returns {string} - HTML模板
 */
function createErrorHtml(url, message) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>访问受限 - ${new URL(url).hostname}</title>
  <meta charset="UTF-8">
</head>
<body>
  <article>
    <h1>无法访问此内容</h1>
    <p>${message}</p>
    <p>URL: ${url}</p>
    <div class="content">
      <p>此网站需要登录或Cookie才能访问内容。请考虑以下选项：</p>
      <ul>
        <li>在浏览器中登录此网站，然后尝试使用浏览器扩展版本</li>
        <li>提供有效的Cookie到请求头中</li>
        <li>尝试其他不需要登录的网站</li>
      </ul>
    </div>
  </article>
</body>
</html>
  `;
}

/**
 * 主函数：根据URL获取网页内容并解析为文章对象
 * @param {string} url - 要抓取的网页URL
 * @param {Object} customOptions - 自定义选项
 * @returns {Promise<Object>} - 解析后的文章对象
 */
async function clipSiteByUrl(url, customOptions = {}) {
  try {
    logger.info('开始抓取URL:', url);

    // 获取最新配置选项
    const options = { ...(await getOptions()), ...customOptions };

    // 获取网页内容
    const html = await fetchContent(url, customOptions.headers || options.headers);
    logger.info('获取到HTML内容，长度:', html.length);

    // 解析DOM获取文章
    const article = await getArticleFromDom(html, options);

    if (!article?.content) {
      throw new Error('无法解析文章内容');
    }
    logger.info('成功解析文章:', article.title);
    return article;
  } catch (error) {
    logger.error('抓取失败:', error);
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

    return { selection, dom };
  } catch (e) {
    logger.error('获取DOM和选中内容失败:', e);
    return { error: e.message };
  }
}

/**
 * 验证URI，确保是完整的URL
 * @param {string} href - 原始URI
 * @param {string} baseURI - 基础URI
 * @returns {string} - 验证后的URI
 */
function validateUri(href, baseURI) {
  try {
    new URL(href);
  } catch {
    const baseUrl = new URL(baseURI);

    if (href.startsWith('/')) {
      href = baseUrl.origin + href;
    } else {
      href = baseUrl.href + (baseUrl.href.endsWith('/') ? '' : '/') + href;
    }
  }
  return href;
}

/**
 * 生成有效的文件名
 * @param {string} title - 原始标题
 * @param {string} disallowedChars - 不允许的字符
 * @returns {string} - 处理后的文件名
 */
function generateValidFileName(title, disallowedChars = null) {
  if (typeof title !== 'string') {
    logger.warn('无效的标题类型:', typeof title);
    title = String(title || '');
  }

  // 移除非法字符
  var illegalRe = /[\/\?<>\\:\*\|":]/g;
  var name = title.replace(illegalRe, '').replace(new RegExp('\u00A0', 'g'), ' ').replace(new RegExp(/\s+/, 'g'), ' ').trim();

  if (disallowedChars) {
    for (let c of disallowedChars) {
      if (`[\\^$.|?*+()`.includes(c)) c = `\\${c}`;
      name = name.replace(new RegExp(c, 'g'), '');
    }
  }

  return name;
}

/**
 * 获取图片文件名
 * @param {string} src - 图片源URL
 * @param {Object} options - 配置选项
 * @param {boolean} prependFilePath - 是否添加文件路径前缀
 * @returns {string} - 图片文件名
 */
function getImageFilename(src, options, prependFilePath = true) {
  const slashPos = src.lastIndexOf('/');
  const queryPos = src.indexOf('?');
  let filename = src.substring(slashPos + 1, queryPos > 0 ? queryPos : src.length);

  let imagePrefix = options.imagePrefix || '';

  if (prependFilePath) {
    const validFolderName = generateValidFileName(options.title, options.disallowedChars);
    imagePrefix = `${validFolderName}/`;
  }

  if (filename.includes(';base64,')) {
    filename = 'image.' + filename.substring(0, filename.indexOf(';'));
  }

  let extension = filename.substring(filename.lastIndexOf('.'));
  if (extension == filename) {
    filename = filename + '.png';
  }

  filename = generateValidFileName(filename, options.disallowedChars);

  return imagePrefix + filename;
}

/**
 * 替换文本中的占位符
 * @param {string} string - 包含占位符的字符串
 * @param {Object} article - 文章对象
 * @param {string} disallowedChars - 不允许的字符
 * @returns {string} - 替换后的字符串
 */
function textReplace(string, article, disallowedChars = null) {
  // 检查输入参数
  if (typeof string !== 'string') {
    logger.warn('textReplace: 输入不是字符串类型:', typeof string);
    return '';
  }

  if (!article || typeof article !== 'object') {
    logger.warn('textReplace: 文章对象无效');
    return string;
  }

  try {
    // 字段替换
    for (const key in article) {
      if (article.hasOwnProperty(key) && key !== 'content') {
        // 确保值是字符串
        let s = '';
        if (article[key] !== undefined && article[key] !== null) {
          s = String(article[key]);
        }

        if (s && disallowedChars) {
          s = generateValidFileName(s, disallowedChars);
        }

        // 执行各种替换
        string = string
          .replace(new RegExp('{' + key + '}', 'g'), s)
          .replace(new RegExp('{' + key + ':lower}', 'g'), s.toLowerCase())
          .replace(new RegExp('{' + key + ':upper}', 'g'), s.toUpperCase())
          .replace(new RegExp('{' + key + ':kebab}', 'g'), s.replace(/ /g, '-').toLowerCase())
          .replace(new RegExp('{' + key + ':mixed-kebab}', 'g'), s.replace(/ /g, '-'))
          .replace(new RegExp('{' + key + ':snake}', 'g'), s.replace(/ /g, '_').toLowerCase())
          .replace(new RegExp('{' + key + ':mixed_snake}', 'g'), s.replace(/ /g, '_'))
          .replace(new RegExp('{' + key + ':obsidian-cal}', 'g'), s.replace(/ /g, '-').replace(/-{2,}/g, '-'))
          .replace(
            new RegExp('{' + key + ':camel}', 'g'),
            s.replace(/ ./g, (str) => str.trim().toUpperCase()).replace(/^./, (str) => str.toLowerCase())
          )
          .replace(
            new RegExp('{' + key + ':pascal}', 'g'),
            s.replace(/ ./g, (str) => str.trim().toUpperCase()).replace(/^./, (str) => str.toUpperCase())
          );
      }
    }

    // 处理日期
    const now = new Date();
    const dateRegex = /{date:(.+?)}/g;
    const matches = string.match(dateRegex);
    if (matches && matches.length > 0) {
      matches.forEach((match) => {
        const format = match.substring(6, match.length - 1);
        // 简化的日期格式化
        const dateString = now.toISOString().split('T')[0];
        string = string.replace(match, dateString);
      });
    }

    // 处理关键字
    const keywordRegex = /{keywords:?(.*)?}/g;
    const keywordMatches = string.match(keywordRegex);
    if (keywordMatches && keywordMatches.length > 0) {
      keywordMatches.forEach((match) => {
        let separator = match.substring(10, match.length - 1);
        const keywordsArray = Array.isArray(article.keywords) ? article.keywords : [];
        const keywordsString = keywordsArray.join(separator || '');
        string = string.replace(match, keywordsString);
      });
    }

    // 移除剩余的花括号占位符
    const defaultRegex = /{(.*?)}/g;
    string = string.replace(defaultRegex, '');

    return string;
  } catch (error) {
    logger.error('textReplace 错误:', error);
    return string;
  }
}

/**
 * 将文章内容转换为Markdown
 * @param {string} content - HTML内容
 * @param {Object} options - 配置选项
 * @param {Object} article - 文章对象
 * @returns {Object} - 包含markdown和imageList的对象
 */
function turndownProcessing(content, options, article) {
  if (!content || typeof content !== 'string') {
    logger.warn('turndownProcessing: 内容为空或不是字符串');
    content = '<p>无内容</p>';
  }

  if (!article || typeof article !== 'object') {
    logger.warn('turndownProcessing: 文章对象无效');
    article = { baseURI: 'about:blank', math: {} };
  }

  if (!article.math) {
    article.math = {};
  }

  // 设置 escape 方法
  if (options.turndownEscape) {
    TurndownService.prototype.escape =
      TurndownService.prototype.defaultEscape ||
      function (text) {
        return text.replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      };
  } else {
    TurndownService.prototype.escape = (s) => s;
  }

  // 创建 Turndown 服务实例
  const turndownService = new TurndownService(options);

  // 使用 GFM 插件
  if (gfmPlugin) {
    turndownService.use(gfmPlugin);
  }

  // 保留特定标签
  turndownService.keep(['iframe', 'sub', 'sup', 'u', 'ins', 'del', 'small', 'big']);

  // 图片处理规则
  const imageList = {};
  turndownService.addRule('images', {
    filter: function (node, tdopts) {
      if (node.nodeName == 'IMG' && node.getAttribute('src')) {
        let src = node.getAttribute('src');
        const validatedSrc = processImageUrl(src, article.baseURI, options, imageList);
        node.setAttribute('src', validatedSrc);

        if (options.hidePictureMdUrl) {
          return true;
        }
      }
      return node.nodeName === 'IMG';
    },
    replacement: function (content, node, tdopts) {
      if (options.hidePictureMdUrl) {
        return '';
      }
      var alt = node.alt || '';
      var src = node.getAttribute('src') || '';
      var title = node.title || '';
      var titlePart = title ? ' "' + title + '"' : '';
      return src ? '![' + alt + ']' + '(' + src + titlePart + ')' : '';
    },
  });

  // 链接处理规则
  turndownService.addRule('links', {
    filter: (node, tdopts) => {
      if (node.nodeName == 'A' && node.getAttribute('href')) {
        const href = node.getAttribute('href');
        const validatedHref = validateUri(href, article.baseURI);
        node.setAttribute('href', validatedHref);

        const img = node.querySelector('img');
        if (img) {
          const src = img.getAttribute('src');
          if (options.saveImageLinks && src) {
            processImageUrl(src, article.baseURI, options, imageList);
          }

          if (options.hidePictureMdUrl) {
            return true;
          }
        }

        return options.linkStyle == 'stripLinks';
      }
      return false;
    },
    replacement: (content, node, tdopts) => {
      const hasImage = node.querySelector('img');
      if (hasImage && options.hidePictureMdUrl) {
        return '';
      }
      if (hasImage) {
        const img = node.querySelector('img');
        const alt = img.alt || '';
        const href = node.getAttribute('href');
        const title = img.title || '';
        const titlePart = title ? ' "' + title + '"' : '';
        return '![' + alt + '](' + href + titlePart + ')';
      }
      if (options.linkStyle == 'stripLinks') {
        return content;
      }
      var href = node.getAttribute('href');
      var title = node.title ? ' "' + node.title + '"' : '';
      if (!content || content.trim() === '') {
        content = href;
      }
      return '[' + content + '](' + href + title + ')';
    },
  });

  // 数学公式处理规则
  turndownService.addRule('mathjax', {
    filter(node, options) {
      return article.math && article.math.hasOwnProperty(node.id);
    },
    replacement(content, node, options) {
      const math = article.math[node.id];
      if (!math) return content;

      let tex = math.tex.trim().replaceAll('\xa0', '');

      if (math.inline) {
        tex = tex.replaceAll('\n', ' ');
        return `$${tex}$`;
      } else return `$$\n${tex}\n$$`;
    },
  });

  // 代码块处理辅助函数
  function repeat(character, count) {
    return Array(count + 1).join(character);
  }

  function convertToFencedCodeBlock(node, options) {
    if (typeof node.innerHTML === 'string') {
      node.innerHTML = node.innerHTML.replaceAll('<br-keep></br-keep>', '<br>');
    }

    const langMatch = node.id?.match(/code-lang-(.+)/);
    const language = langMatch?.length > 0 ? langMatch[1] : '';

    const code = node.innerText || node.textContent || '';

    const fenceChar = (options.fence || '```').charAt(0);
    let fenceSize = 3;
    const fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm');

    let match;
    while ((match = fenceInCodeRegex.exec(code))) {
      if (match[0].length >= fenceSize) {
        fenceSize = match[0].length + 1;
      }
    }

    const fence = repeat(fenceChar, fenceSize);

    return '\n\n' + fence + language + '\n' + code.replace(/\n$/, '') + '\n' + fence + '\n\n';
  }

  // 代码块处理规则
  turndownService.addRule('fencedCodeBlock', {
    filter: function (node, options) {
      return options.codeBlockStyle === 'fenced' && node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
    },
    replacement: function (content, node, options) {
      return convertToFencedCodeBlock(node.firstChild, options);
    },
  });

  // 预格式化文本处理规则
  turndownService.addRule('pre', {
    filter: (node, tdopts) => {
      return node.nodeName == 'PRE' && (!node.firstChild || node.firstChild.nodeName != 'CODE') && !node.querySelector('img');
    },
    replacement: (content, node, tdopts) => {
      return convertToFencedCodeBlock(node, tdopts);
    },
  });

  // 转换内容
  let markdown = options.frontmatter + turndownService.turndown(content) + options.backmatter;

  // 清理不可见字符
  markdown = markdown.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff\ufff9-\ufffc]/g, '');

  return { markdown: markdown, imageList: imageList };
}

/**
 * 将文章对象转换为Markdown
 * @param {Object} article - 文章对象
 * @param {boolean} saveImageLinks - 是否保存图片链接
 * @returns {Promise<Object>} - 包含markdown和imageList的对象
 */
async function convertArticleToMarkdown(article, saveImageLinks = null) {
  if (!article || typeof article !== 'object') {
    throw new Error('无效的文章对象，类型：' + typeof article);
  }

  // 获取最新配置选项
  let options = { ...(await getOptions()) };
  logger.info('使用选项:', options);

  try {
    if (saveImageLinks != null) {
      options.saveImageLinks = saveImageLinks;
    }

    // 设置默认值
    options.frontmatter = '';
    options.backmatter = '';
    options.imagePrefix = '';

    // 处理模板
    if (options.includeTemplate) {
      try {
        // 使用空字符串作为默认值
        const frontmatter = typeof options.frontmatter === 'string' ? options.frontmatter : '';
        const backmatter = typeof options.backmatter === 'string' ? options.backmatter : '';

        options.frontmatter = frontmatter ? textReplace(frontmatter, article) + '\n' : '';
        options.backmatter = backmatter ? '\n' + textReplace(backmatter, article) : '';
      } catch (error) {
        logger.error('模板处理错误:', error);
        options.frontmatter = '';
        options.backmatter = '';
      }
    }

    // 处理图片前缀
    try {
      if (options.imagePrefix && typeof options.imagePrefix === 'string') {
        options.imagePrefix = textReplace(options.imagePrefix, article, options.disallowedChars)
          .split('/')
          .map((s) => generateValidFileName(s, options.disallowedChars))
          .join('/');
      }
    } catch (error) {
      logger.error('图片前缀处理错误:', error);
      options.imagePrefix = '';
    }

    logger.info('转换前内容长度:', article.content.length);
    const result = turndownProcessing(article.content, options, article);
    logger.info('转换后结果:', {
      markdownLength: result.markdown.length,
      imageCount: Object.keys(result.imageList).length,
    });

    return result;
  } catch (error) {
    logger.error('Markdown处理失败:', error);
    throw error;
  }
}

/**
 * 将网页内容转换为Markdown
 * @param {string} url - 网页URL
 * @param {Object} customOptions - 自定义选项
 * @returns {Promise<Object>} - 包含article、markdown和imageList的对象
 */
async function clipSiteToMarkdown(url, customOptions = {}) {
  try {
    logger.info('开始抓取并转换URL:', url);

    // 获取最新配置选项并合并自定义选项
    const options = { ...(await getOptions()), ...customOptions };

    // 获取文章对象
    const article = await clipSiteByUrl(url, options);

    if (!article?.content) {
      throw new Error('无法获取文章内容');
    }

    // 转换为Markdown
    const { markdown, imageList } = await convertArticleToMarkdown(article, options.saveImageLinks);

    // 将markdown和imageList添加到article对象中
    article.markdown = markdown;
    article.imageList = imageList;
    article.url = url;

    // 如果需要保存到文件
    if (options.saveToFile) {
      try {
        // 使用let而不是const，因为后面可能会修改这个变量
        let filename = '';

        // 添加唯一id
        if (options.id) {
          article.id = options.id;
          filename = `article-${article.id}`;
        } else {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          filename = `article-${timestamp}`;
        }

        // 获取当前目录
        const __dirname = isNode ? path.dirname(fileURLToPath(import.meta.url)) : '.';

        // 保存Markdown到文件
        await fs.writeFile(path.join(__dirname, `${filename}.md`), markdown);
        logger.info(`已保存Markdown到文件: ${filename}.md`);

        // 可选：保存完整的文章对象
        if (options.saveArticleJson) {
          await fs.writeFile(path.join(__dirname, `${filename}.json`), JSON.stringify(article, null, 2));
          logger.info(`已保存完整文章对象到文件: ${filename}.json`);
        }
      } catch (error) {
        logger.error('保存文件失败:', error);
        // 继续执行，不中断流程
      }
    }

    // 返回结果
    return article;
  } catch (error) {
    logger.error('抓取并转换失败:', error);
    throw error;
  }
}

/**
 * 处理图片URL并添加到图片列表
 * @param {string} src - 图片源URL
 * @param {string} baseURI - 基础URI
 * @param {Object} options - 配置选项
 * @param {Object} imageList - 图片列表对象
 * @returns {string} - 验证后的图片URL
 */
function processImageUrl(src, baseURI, options, imageList) {
  // 验证URL
  const validatedSrc = validateUri(src, baseURI);

  // 如果需要保存图片链接
  if (options.saveImageLinks) {
    let imageFilename = getImageFilename(validatedSrc, options, false);
    if (!imageList[validatedSrc] || imageList[validatedSrc] != imageFilename) {
      let i = 1;
      while (Object.values(imageList).includes(imageFilename)) {
        const parts = imageFilename.split('.');
        if (i == 1) parts.splice(parts.length - 1, 0, i++);
        else parts.splice(parts.length - 2, 1, i++);
        imageFilename = parts.join('.');
      }
      imageList[validatedSrc] = imageFilename;
    }
  }

  return validatedSrc;
}

// 导出新增的函数
export { clipSiteByUrl, getArticleFromDom, getSelectionAndDom, fetchContent, clipSiteToMarkdown, convertArticleToMarkdown };

const url = 'https://blog.csdn.net/ken2232/article/details/136071216';
const article = await clipSiteToMarkdown(url);
logger.info('抓取成功!');
logger.info('文章标题:', article.title);
