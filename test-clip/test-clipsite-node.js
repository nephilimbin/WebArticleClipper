// 导入必要的模块
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import https from 'https';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 模拟浏览器环境
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://www.zhihu.com/',
  referrer: 'https://www.zhihu.com/',
  contentType: 'text/html',
  includeNodeLocations: true,
});

global.DOMParser = dom.window.DOMParser;
global.document = dom.window.document;

// 创建一个自定义的 crypto 对象
const customCrypto = {
  getRandomValues: (arr) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 1000000);
    }
    return arr;
  },
};

// 设置 window 对象
global.window = {
  crypto: customCrypto,
  location: { href: 'https://www.zhihu.com/' },
  navigator: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
};

global.URL = URL;

// 导入自定义的Readability模块
import Readability from './Readability.js';

// 模拟defaultOptions
const defaultOptions = {
  mathJaxRendering: true,
  autoSanitize: true,
  clipSelection: true,
  keepClasses: false,
};

// 模拟getOptions函数
async function getOptions() {
  return defaultOptions;
}

// 从DOM字符串解析文章内容
async function getArticleFromDom(domString, options = {}) {
  try {
    console.log('开始解析DOM，原始数据长度:', domString?.length);

    // 使用DOMParser解析HTML
    const parser = new DOMParser();
    const dom = parser.parseFromString(domString, 'text/html');

    // 使用Readability解析
    const article = new Readability(dom, {
      charThreshold: 20,
      classesToPreserve: ['page'],
      keepClasses: options.keepClasses || false,
    }).parse();

    if (!article) {
      throw new Error('Readability解析返回空结果');
    }

    // 提取元数据
    article.baseURI = dom.baseURI || 'about:blank';
    article.pageTitle = dom.title;

    console.log('DOM解析完成，文章标题:', article.title);
    return article;
  } catch (error) {
    console.error('DOM解析失败:', error.message);
    throw error;
  }
}

// 主函数：根据URL获取网页内容并解析为文章对象
async function clipSiteByUrl(url) {
  try {
    console.log('开始抓取URL:', url);

    // 创建一个更完整的请求头
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'max-age=0',
      Connection: 'keep-alive',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      Referer: 'https://www.zhihu.com/',
      Cookie: '_zap=cd50d1ed-4ef1-437e-87e6-254a791b7d77; d_c0=AICQ3XYYnRaPTqXtYsVo3YQDvYby-Gj0Ffc=|1680000000',
    };

    // 使用 https 模块直接请求，以便更好地控制请求过程
    const html = await new Promise((resolve, reject) => {
      const req = https.get(url, { headers }, (res) => {
        if (res.statusCode === 403) {
          reject(new Error(`HTTP错误: 403 - 知乎拒绝访问，可能需要登录或更完整的Cookie`));
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP错误: ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(data);
        });
      });

      req.on('error', (e) => {
        reject(new Error(`请求错误: ${e.message}`));
      });

      req.end();
    });

    console.log('获取到HTML内容，长度:', html.length);

    // 解析DOM获取文章
    const article = await getArticleFromDom(html, defaultOptions);

    if (!article?.content) {
      throw new Error('无法解析文章内容');
    }

    console.log('成功解析文章:', article.title);

    // 保存结果到文件
    await fs.writeFile(path.join(__dirname, 'article-result.json'), JSON.stringify(article, null, 2));
    await fs.writeFile(path.join(__dirname, 'article-content.html'), article.content);

    return article;
  } catch (error) {
    console.error('抓取失败:', error);
    throw error;
  }
}

// 执行测试 - 使用一个更容易访问的网站进行测试
async function runTest() {
  try {
    // 知乎需要登录，改用其他网站测试
    const url = 'https://www.aibase.com/zh/news/15726'; // 阮一峰的博客更容易抓取

    console.log('正在测试抓取:', url);
    const article = await clipSiteByUrl(url);

    console.log('测试成功!');
    console.log('文章标题:', article.title);
    console.log('文章内容长度:', article.content.length);
    console.log('文章摘要:', article.excerpt);
    console.log('文章内容:', article.content);
  } catch (error) {
    console.error('测试失败:', error);
  }
}

runTest();
