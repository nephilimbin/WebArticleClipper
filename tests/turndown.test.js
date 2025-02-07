const { JSDOM } = require('jsdom');
const assert = require('assert');
const TurndownService = require('../src/service_worker/turndown.js');
const gfmPlugin = require('../src/service_worker/turndown-plugin-gfm.js');
const { DateTime } = require('luxon'); // 确保Luxon已正确安装
const fs = require('fs');

// 初始化DOM环境
const dom = new JSDOM('<!DOCTYPE html>', {
  url: 'http://localhost/',
  referrer: 'http://localhost/',
  contentType: 'text/html',
  includeNodeLocations: true,
  storageQuota: 10000000,
});

// 设置全局变量
global.document = dom.window.document;
global.window = dom.window;
global.Node = dom.window.Node;

// 模拟浏览器环境
global.chrome = {
  runtime: {
    getManifest: () => ({ version: '3.5.0' }),
  },
};

// 提升turndown实例到全局
let turndown;

describe('GFM功能测试', function () {
  before(() => {
    // 添加缺失的DOM API支持
    global.window.HTMLTableCellElement = dom.window.HTMLTableCellElement;
    global.window.HTMLTableRowElement = dom.window.HTMLTableRowElement;

    // 添加表格cells属性支持
    Object.defineProperty(dom.window.HTMLTableRowElement.prototype, 'cells', {
      get() {
        return this.querySelectorAll('th, td');
      },
    });

    // 初始化转换器实例
    turndown = new TurndownService({
      headingStyle: 'atx', // 使用更标准的标题样式
      codeBlockStyle: 'fenced', // 启用围栏代码块
      fence: '```', // 使用标准围栏符号
      emDelimiter: '*', // 使用星号作为强调
      bulletListMarker: '-', // 使用减号作为列表标记
      linkStyle: 'inlined', // 强制使用内联链接
    });
    turndown.use(gfmPlugin);
  });

  it('转换表格', () => {
    const html = `
      <table>
        <tr><th>Header1</th><th>Header2</th></tr>
        <tr><td>Data1</td><td>Data2</td></tr>
      </table>
    `;
    const md = turndown.turndown(html);
    assert.ok(md.includes('| Header1 | Header2 |'), '表格头转换失败');
    assert.ok(md.includes('| Data1 | Data2 |'), '表格数据转换失败');
  });

  it('转换任务列表', () => {
    const html = `
      <ul>
        <li><input type="checkbox" checked>完成</li>
        <li><input type="checkbox">未完成</li>
      </ul>
    `;
    const md = turndown.turndown(html);
    assert.ok(md.includes('- [x] 完成'), '已完成任务项转换失败');
    assert.ok(md.includes('- [ ] 未完成'), '未完成任务项转换失败');
  });

  it('转换删除线', () => {
    const html = '<del>text</del>';
    const md = turndown.turndown(html);
    assert.ok(md.includes('~~text~~'), '删除线转换失败');
  });
});

// 添加网页内容测试用例
const testUrl = 'https://www.aibase.com/zh/news/14991';

const htmlSnapshot = fs.readFileSync('./tests/fixtures/aibase_14991.html', 'utf-8');

async function getTestContent() {
  return new JSDOM(htmlSnapshot, { url: testUrl });
}

describe('真实网页内容测试', function () {
  this.timeout(10000); // 设置超时时间

  it('转换复杂表格', async () => {
    const dom = await getTestContent();
    const tables = dom.window.document.querySelectorAll('table');

    tables.forEach((table) => {
      const md = turndown.turndown(table.outerHTML);
      assert.ok(md.includes('|'), '表格转换失败');
      assert.ok(md.match(/^[\s\S]*\-+\|/gm), '缺少表头分隔线');
    });
  });

  it('转换混合内容', async () => {
    const dom = await getTestContent();
    const mainContent = dom.window.document.body; // 使用更通用的选择器

    const md = turndown.turndown(mainContent.innerHTML);

    // 添加容错断言
    assert.ok(md.match(/^#+/m), '标题转换正确');
    assert.ok(md.match(/\*\*.+?\*\*/), '加粗文本转换');
  });
});
