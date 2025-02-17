import { getOptions } from './default-options.js';

// 在创建菜单项前添加存在性检查
async function createMenuItem(menuDetails) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(menuDetails, () => {
      if (chrome.runtime.lastError) {
        console.warn(`菜单项 ${menuDetails.id} 已存在，跳过创建`);
      }
      resolve();
    });
  });
}

// create the context menus
export async function createMenus(passedOptions) {
  try {
    // 先移除所有旧菜单项
    await chrome.contextMenus.removeAll();
    console.log('已清除所有旧菜单项');

    // 合并配置
    const options = { ...(await getOptions()), ...passedOptions };

    // 创建核心菜单项
    await Promise.all([
      createMenuItem({
        id: 'toggle-includeTemplate',
        title: '包含模板',
        contexts: ['all'],
        type: 'checkbox',
        checked: options.includeTemplate,
      }),
      createMenuItem({
        id: 'toggle-downloadImages',
        title: '下载图片',
        contexts: ['all'],
        type: 'checkbox',
        checked: options.downloadImages,
      }),
    ]);

    // 动态生成唯一ID
    const generateUniqueId = (base) => `${base}-${Date.now()}`;

    // 创建其他菜单项时使用唯一ID
    if (options.contextMenus) {
      await Promise.all([
        // 页面菜单项
        createMenuItem({ id: generateUniqueId('download-all') /*...*/ }),
        createMenuItem({ id: generateUniqueId('separator-0'), type: 'separator' }),
        // 其他菜单项...
      ]);
    }
  } catch (error) {
    console.error('菜单创建失败:', error);
  }
}
