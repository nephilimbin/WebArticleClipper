import { defaultOptions } from '/shared/default-options.js';

let options = defaultOptions;
let keyupTimeout = null;

const saveOptions = (e) => {
  e.preventDefault();

  options = {
    frontmatter: document.querySelector("[name='frontmatter']").value,
    backmatter: document.querySelector("[name='backmatter']").value,
    title: document.querySelector("[name='title']").value,
    disallowedChars: document.querySelector("[name='disallowedChars']").value,
    includeTemplate: document.querySelector("[name='includeTemplate']").checked,
    saveAs: document.querySelector("[name='saveAs']").checked,
    downloadImages: document.querySelector("[name='downloadImages']").checked,
    hidePictureMdUrl: document.querySelector("[name='hidePictureMdUrl']").checked,
    imagePrefix: document.querySelector("[name='imagePrefix']").value,
    mdClipsFolder: document.querySelector("[name='mdClipsFolder']").value,
    turndownEscape: document.querySelector("[name='turndownEscape']").checked,
    contextMenus: document.querySelector("[name='contextMenus']").checked,
    obsidianIntegration: document.querySelector("[name='obsidianIntegration']").checked,
    obsidianVault: document.querySelector("[name='obsidianVault']").value,
    obsidianFolder: document.querySelector("[name='obsidianFolder']").value,

    headingStyle: getCheckedValue(document.querySelectorAll("input[name='headingStyle']")),
    hr: getCheckedValue(document.querySelectorAll("input[name='hr']")),
    bulletListMarker: getCheckedValue(document.querySelectorAll("input[name='bulletListMarker']")),
    codeBlockStyle: getCheckedValue(document.querySelectorAll("input[name='codeBlockStyle']")),
    fence: getCheckedValue(document.querySelectorAll("input[name='fence']")),
    emDelimiter: getCheckedValue(document.querySelectorAll("input[name='emDelimiter']")),
    strongDelimiter: getCheckedValue(document.querySelectorAll("input[name='strongDelimiter']")),
    linkStyle: getCheckedValue(document.querySelectorAll("input[name='linkStyle']")),
    linkReferenceStyle: getCheckedValue(document.querySelectorAll("input[name='linkReferenceStyle']")),
    imageStyle: getCheckedValue(document.querySelectorAll("input[name='imageStyle']")),
    imageRefStyle: getCheckedValue(document.querySelectorAll("input[name='imageRefStyle']")),
    downloadMode: getCheckedValue(document.querySelectorAll("input[name='downloadMode']")),
    // obsidianPathType: getCheckedValue(document.querySelectorAll("input[name='obsidianPathType']")),
  };

  save();
};

const save = async () => {
  const spinner = document.getElementById('spinner');
  spinner.style.display = 'block';
  try {
    // 过滤空键值
    const cleanOptions = Object.keys(options).reduce((acc, key) => {
      if (key) acc[key] = options[key];
      return acc;
    }, {});

    await chrome.storage.sync.set(cleanOptions);

    // 新增：通知其他部分配置更新
    chrome.runtime.sendMessage({
      type: 'optionsUpdated',
      fullOptions: cleanOptions,
    });

    console.log('配置保存成功，菜单已更新');
    document.getElementById('status').textContent = '配置保存成功';
    document.getElementById('status').classList.remove('error');
  } catch (err) {
    console.error('保存失败:', err);
    document.getElementById('status').textContent = `保存失败: ${err.message}`;
    document.getElementById('status').classList.add('error');
  } finally {
    spinner.style.display = 'none';
  }
};

function hideStatus() {
  this.style.opacity = 0;
}

const setCurrentChoice = (result) => {
  options = result;

  // 先重置所有元素的显示状态
  document.querySelectorAll('[data-show-if]').forEach((el) => {
    el.style.display = 'block';
  });

  // 再执行正常更新
  document.querySelectorAll('[name]').forEach((element) => {
    const name = element.name;
    if (name in options) {
      if (element.type === 'checkbox') {
        element.checked = options[name];
      } else if (element.type === 'radio') {
        element.checked = element.value === options[name];
      } else {
        element.value = options[name];
      }
    }
  });

  refereshElements(); // 最后应用条件显示
};

const restoreOptions = async () => {
  try {
    const result = await chrome.storage.sync.get(null);
    console.log('从存储加载的原始数据:', result);

    const merged = {
      ...defaultOptions,
      ...result,
      mathRendering: {
        ...defaultOptions.mathRendering,
        ...(result.mathRendering || {}),
      },
    };
    setCurrentChoice(merged);
    refereshElements();
  } catch (error) {
    console.error('配置加载失败:', error);
    document.getElementById('status').textContent = `配置加载失败: ${error.message}`;
  }
};

function textareaInput() {
  this.parentNode.dataset.value = this.value;
}

const show = (el, show) => {
  el.style.height = show ? el.dataset.height + 'px' : '0';
  el.style.opacity = show ? '1' : '0';
};

const refereshElements = () => {
  // 更新可见性
  document.querySelectorAll('[data-show-if]').forEach((element) => {
    const condition = element.dataset.showIf;
    let shouldShow = true; // 默认显示所有元素

    switch (condition) {
      case 'downloadsApi':
        shouldShow = options.downloadMode === 'downloadsApi';
        break;
      case 'referenced':
        shouldShow = options.linkStyle === 'referenced';
        break;
      case 'fenced':
        shouldShow = options.codeBlockStyle === 'fenced';
        break;
      case 'imageMarkdown':
        shouldShow = options.imageStyle === 'markdown';
        break;
      case 'obsidianIntegration':
        shouldShow = options.obsidianIntegration;
        break;
      // 添加其他必要条件
      default:
        shouldShow = true; // 添加默认显示
    }

    element.style.display = shouldShow ? 'block' : 'none';
  });

  // 更新禁用状态
  document.querySelectorAll('[data-disable-if]').forEach((element) => {
    const condition = element.dataset.disableIf;
    let shouldDisable = false;

    switch (condition) {
      case '!downloadImages':
        shouldDisable = !options.downloadImages;
        break;
      case 'safariBrowser':
        shouldDisable = !chrome.downloads;
        break;
      // 添加其他必要条件
    }

    element.disabled = shouldDisable;
  });

  // 强制更新所有复选框状态
  document.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    const name = checkbox.name;
    if (options.hasOwnProperty(name)) {
      checkbox.checked = options[name];
    }
  });

  document
    .getElementById('downloadModeGroup')
    .querySelectorAll('.radio-container,.checkbox-container,.textbox-container')
    .forEach((container) => {
      show(container, options.downloadMode == 'downloadsApi');
    });

  // document.getElementById("obsidianUriGroup").querySelectorAll('.radio-container,.checkbox-container,.textbox-container').forEach(container => {
  //     show(container, options.downloadMode == 'obsidianUri')
  // });
  show(document.getElementById('mdClipsFolder'), options.downloadMode == 'downloadsApi');

  show(document.getElementById('linkReferenceStyle'), options.linkStyle == 'referenced');

  show(document.getElementById('imageRefOptions'), !options.imageStyle.startsWith('obsidian') && options.imageStyle != 'noImage');

  show(document.getElementById('fence'), options.codeBlockStyle == 'fenced');

  const downloadImages = options.downloadImages && options.downloadMode == 'downloadsApi';

  show(document.getElementById('imagePrefix'), downloadImages);

  document.getElementById('markdown').disabled = !downloadImages;
  document.getElementById('base64').disabled = !downloadImages;
  document.getElementById('obsidian').disabled = !downloadImages;
  document.getElementById('obsidian-nofolder').disabled = !downloadImages;

  // 添加对hidePictureMdUrl相关元素的显示控制
  const hidePictureEl = document.querySelector("[name='hidePictureMdUrl']");
  if (hidePictureEl) {
    hidePictureEl.checked = options.hidePictureMdUrl;
  }
};

const inputChange = (e) => {
  if (e?.target?.name === 'import-file') {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/json') {
      console.error('无效文件类型:', file?.type);
      return;
    }

    const reader = new FileReader();
    reader.onloadstart = () => console.log('开始读取文件...');
    reader.onloadend = () => console.log('文件读取完成');

    reader.onload = async (event) => {
      try {
        console.log('文件原始内容:', event.target.result.substring(0, 100)); // 打印前100字符
        const importedOptions = JSON.parse(event.target.result);
        console.log('解析后的导入配置:', importedOptions);

        // 深度合并所有配置项
        options = {
          ...defaultOptions,
          ...importedOptions,
          mathRendering: {
            ...defaultOptions.mathRendering,
            ...(importedOptions.mathRendering || {}),
          },
          hidePictureMdUrl: importedOptions.hidePictureMdUrl ?? defaultOptions.hidePictureMdUrl,
        };
        console.log('合并后的完整配置:', options);

        // 强制更新UI
        setCurrentChoice(options);
        refereshElements();

        // 立即保存
        await save();

        // 验证存储中的实际值
        const stored = await chrome.storage.sync.get(null);
        console.log('当前存储中的配置:', stored);
      } catch (error) {
        console.error('导入失败:', error);
        document.getElementById('status').textContent = `导入失败: ${error.message}`;
        document.getElementById('status').classList.add('error');
      }
    };

    reader.readAsText(file);
  } else {
    if (e) {
      let key = e.target.name;
      let value = e.target.value;
      if (e.target.type == 'checkbox') value = e.target.checked;
      options[key] = value;

      if (key == 'contextMenus') {
        if (value) {
          createMenus();
        } else {
          chrome.contextMenus.removeAll();
        }
      }

      save();
      refereshElements();
    }
  }
};

const inputKeyup = (e) => {
  if (keyupTimeout) clearTimeout(keyupTimeout);
  keyupTimeout = setTimeout(inputChange, 500, e);
};

const buttonClick = (e) => {
  if (e.target.id == 'import') {
    document.getElementById('import-file').click();
  } else if (e.target.id == 'export') {
    console.log('export');
    const json = JSON.stringify(options, null, 2);
    var blob = new Blob([json], { type: 'text/json' });
    var url = URL.createObjectURL(blob);
    var d = new Date();

    var datestring = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    chrome.downloads.download({
      url: url,
      saveAs: true,
      filename: `MarkDownload-export-${datestring}.json`,
    });
  }
};

const init = async () => {
  try {
    await new Promise((resolve) => {
      const checkElements = () => {
        if (document.querySelector("[name='title']")) resolve();
        else setTimeout(checkElements, 50);
      };
      checkElements();
    });

    await restoreOptions();

    document.querySelectorAll('input,textarea,button').forEach((input) => {
      if (input.tagName === 'TEXTAREA' || input.type === 'text') {
        input.addEventListener('keyup', inputKeyup);
      } else if (input.tagName === 'BUTTON') {
        input.addEventListener('click', buttonClick);
      } else {
        input.addEventListener('change', inputChange);
      }
    });
  } catch (error) {
    console.error('初始化失败:', error);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  init().catch(console.error);
});

document.querySelectorAll('.save').forEach((el) => el.addEventListener('click', saveOptions));
document.querySelectorAll('.status').forEach((el) => el.addEventListener('click', hideStatus));
document.querySelectorAll('.input-sizer > textarea').forEach((el) => el.addEventListener('input', textareaInput));

/// https://www.somacon.com/p143.php
// return the value of the radio button that is checked
// return an empty string if none are checked, or
// there are no radio buttons
function getCheckedValue(radioObj) {
  if (!radioObj) return '';
  var radioLength = radioObj.length;
  if (radioLength == undefined)
    if (radioObj.checked) return radioObj.value;
    else return '';
  for (var i = 0; i < radioLength; i++) {
    if (radioObj[i].checked) {
      return radioObj[i].value;
    }
  }
  return '';
}

// set the radio button with the given value as being checked
// do nothing if there are no radio buttons
// if the given value does not exist, all the radio buttons
// are reset to unchecked
function setCheckedValue(radioObj, newValue) {
  if (!radioObj) return;
  var radioLength = radioObj.length;
  if (radioLength == undefined) {
    radioObj.checked = radioObj.value == newValue.toString();
    return;
  }
  for (var i = 0; i < radioLength; i++) {
    radioObj[i].checked = false;
    if (radioObj[i].value == newValue.toString()) {
      radioObj[i].checked = true;
    }
  }
}
