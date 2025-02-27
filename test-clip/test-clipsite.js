// 导入必要的模块
import { JSDOM } from 'jsdom';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 模拟浏览器环境 - 这是关键部分
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://example.com/',
  referrer: 'https://example.com/',
  contentType: 'text/html',
});

global.DOMParser = dom.window.DOMParser;
global.document = dom.window.document;

// 创建自定义 crypto 对象
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
  location: { href: 'https://example.com/' },
  navigator: {
    userAgent: 'Mozilla/5.0 (Node.js)',
  },
};

global.URL = URL;

// 导入 clipSite.js
import { clipSiteByUrl, clipSiteToMarkdown } from './clipSite.js';

// 测试函数
async function runTest() {
  try {
    // 使用 GitHub 仓库作为测试 URL
    const url = process.argv[2] || 'https://blog.csdn.net/ken2232/article/details/136071216';

    console.log('正在测试抓取:', url);

    // 测试1: 使用clipSiteByUrl获取文章
    console.log('测试1: 使用clipSiteByUrl获取文章');
    const article = await clipSiteByUrl(url, {
      saveToFile: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    console.log('测试1成功!');
    console.log('文章标题:', article.title);
    console.log('文章内容长度:', article.content.length);
    console.log('文章摘要:', article.excerpt);

    // 测试2: 使用clipSiteToMarkdown获取文章并转换为Markdown
    console.log('\n测试2: 使用clipSiteToMarkdown获取文章并转换为Markdown');
    const result = await clipSiteToMarkdown(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      downloadImages: true,
    });

    console.log('测试2成功!');
    console.log('文章标题:', result.article.title);
    console.log('Markdown内容长度:', result.markdown.length);
    console.log('图片数量:', Object.keys(result.imageList).length);

    // 保存Markdown到文件
    await fs.writeFile(path.join(__dirname, 'article-markdown.md'), result.markdown);
    console.log('已保存Markdown到文件: article-markdown.md');

    // 保存图片列表到文件
    await fs.writeFile(path.join(__dirname, 'image-list.json'), JSON.stringify(result.imageList, null, 2));
    console.log('已保存图片列表到文件: image-list.json');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

// 执行测试
runTest();
