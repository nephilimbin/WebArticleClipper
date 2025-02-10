import './browser-polyfill.min.js';
import { defaultOptions } from '../shared/default-options.js';

let options = { ...defaultOptions };
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
    clipSelection: document.querySelector("[name='clipSelection']").checked,

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

const save = () => {
  const spinner = document.getElementById('spinner');
  spinner.style.display = 'block';
  chrome.storage.sync
    .set(options)
    .then(() => {
      chrome.contextMenus.update('toggle-includeTemplate', {
        checked: options.includeTemplate,
      });
      try {
        chrome.contextMenus.update('tabtoggle-includeTemplate', {
          checked: options.includeTemplate,
        });
      } catch {}

      chrome.contextMenus.update('toggle-downloadImages', {
        checked: options.downloadImages,
      });
      try {
        chrome.contextMenus.update('tabtoggle-downloadImages', {
          checked: options.downloadImages,
        });
      } catch {}
    })
    .then(() => {
      document.querySelectorAll('.status').forEach((statusEl) => {
        statusEl.textContent = 'Options Saved 💾';
        statusEl.classList.remove('error');
        statusEl.classList.add('success');
        statusEl.style.opacity = 1;
      });
      setTimeout(() => {
        document.querySelectorAll('.status').forEach((statusEl) => {
          statusEl.style.opacity = 0;
        });
      }, 5000);
      spinner.style.display = 'none';
    })
    .catch((err) => {
      console.error('保存失败:', err);
      spinner.style.display = 'none';
    });
};

function hideStatus() {
  this.style.opacity = 0;
}

const setCurrentChoice = (result) => {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      try {
        console.log('开始更新UI元素...');

        // 修复checkbox处理逻辑
        const setCheckbox = (selector, value) => {
          const el = document.querySelector(selector);
          if (el) {
            el.checked = Boolean(value);
            console.log(`设置 ${selector} 状态:`, Boolean(value)); // 添加调试日志
          } else {
            console.error('元素未找到:', selector);
          }
        };

        // 设置表单值
        const setValue = (selector, value) => {
          const el = document.querySelector(selector);
          if (!el) {
            console.error(`元素未找到: ${selector}`);
            return;
          }
          if (el.type === 'checkbox') {
            el.checked = Boolean(value);
          } else {
            el.value = value || '';
          }
        };

        // 设置单选按钮
        const setRadio = (selector, value) => {
          document.querySelectorAll(selector).forEach((radio) => {
            radio.checked = radio.value === value;
          });
        };

        // 应用配置到表单元素
        setValue("[name='title']", result.title);
        setValue("[name='frontmatter']", result.frontmatter);
        setValue("[name='backmatter']", result.backmatter);
        setValue("[name='disallowedChars']", result.disallowedChars);
        setCheckbox('#includeTemplate', result.includeTemplate);
        setValue("[name='saveAs']", result.saveAs);
        setValue("[name='downloadImages']", result.downloadImages);
        setValue("[name='hidePictureMdUrl']", result.hidePictureMdUrl);
        setValue("[name='imagePrefix']", result.imagePrefix);
        setValue("[name='mdClipsFolder']", result.mdClipsFolder);
        setValue("[name='turndownEscape']", result.turndownEscape);
        setValue("[name='contextMenus']", result.contextMenus);
        setValue("[name='obsidianIntegration']", result.obsidianIntegration);
        setValue("[name='obsidianVault']", result.obsidianVault);
        setValue("[name='obsidianFolder']", result.obsidianFolder);
        setCheckbox('#clipSelection', result.clipSelection);

        setRadio("[name='headingStyle']", result.headingStyle);
        setRadio("[name='hr']", result.hr);
        setRadio("[name='bulletListMarker']", result.bulletListMarker);
        setRadio("[name='codeBlockStyle']", result.codeBlockStyle);
        setRadio("[name='fence']", result.fence);
        setRadio("[name='emDelimiter']", result.emDelimiter);
        setRadio("[name='strongDelimiter']", result.strongDelimiter);
        setRadio("[name='linkStyle']", result.linkStyle);
        setRadio("[name='linkReferenceStyle']", result.linkReferenceStyle);
        setRadio("[name='imageStyle']", result.imageStyle);
        setRadio("[name='imageRefStyle']", result.imageRefStyle);
        setRadio("[name='downloadMode']", result.downloadMode);

        options = { ...defaultOptions, ...result };
        console.log('Loaded options:', options);
        console.log('Setting UI elements with:', {
          frontmatter: options.frontmatter,
          backmatter: options.backmatter,
          title: options.title,
        });

        if (!options.downloadMode) {
          options.downloadMode = defaultOptions.downloadMode;
          console.warn('Reset invalid downloadMode');
        }

        const downloadImages = options.downloadImages && options.downloadMode == 'downloadsApi';

        if (!downloadImages && (options.imageStyle == 'markdown' || options.imageStyle.startsWith('obsidian'))) {
          options.imageStyle = 'originalSource';
        }

        Object.keys(defaultOptions).forEach((key) => {
          if (options[key] === undefined) {
            options[key] = defaultOptions[key];
          }
        });

        refereshElements();
        window.dispatchEvent(new Event('resize'));

        console.log('UI元素更新完成');
        resolve();
      } catch (error) {
        console.error('更新UI时发生错误:', error);
        resolve();
      }
    });
  });
};

const restoreOptions = async () => {
  try {
    const result = await chrome.storage.sync.get(null);
    console.log('从存储加载的原始数据:', result);

    if (Object.keys(result).length === 0) {
      console.warn('检测到空存储，初始化默认配置');
      await chrome.storage.sync.set(defaultOptions);
      return defaultOptions;
    }
    return { ...defaultOptions, ...result };
  } catch (error) {
    console.error('配置加载失败，使用默认值:', error);
    return defaultOptions;
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
  document
    .getElementById('downloadModeGroup')
    .querySelectorAll('.radio-container,.checkbox-container,.textbox-container')
    .forEach((container) => {
      show(container, options.downloadMode == 'downloadsApi');
    });

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
};

const inputChange = (e) => {
  console.log('inputChange');

  if (e) {
    let key = e.target.name;
    let value = e.target.value;
    if (key == 'import-file') {
      fr = new FileReader();
      fr.onload = (ev) => {
        let lines = ev.target.result;
        options = JSON.parse(lines);
        setCurrentChoice(options);
        chrome.contextMenus.removeAll();
        createMenus();
        save();
        refereshElements();
      };
      fr.readAsText(e.target.files[0]);
    } else {
      if (e.target.type == 'checkbox') value = e.target.checked;
      options[key] = value;

      if (key == 'contextMenus') {
        if (value) {
          chrome.contextMenus.removeAll();
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
  try {
    if (e.target.id === 'import') {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.onchange = async (event) => {
        const file = event.target.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const newOptions = JSON.parse(e.target.result);
            chrome.storage.sync.set(newOptions);
            setCurrentChoice(newOptions);
            console.log('配置导入成功');
          } catch (error) {
            console.error('配置导入失败:', error);
          }
        };
        reader.readAsText(file);
      };
      fileInput.click();
    } else if (e.target.id === 'export') {
      chrome.storage.sync.get(null).then((result) => {
        const data = JSON.stringify(result, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `markdownload-config-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }
  } catch (error) {
    console.error('按钮操作失败:', error);
  }
};

const loaded = () => {
  const init = () => {
    try {
      console.log('开始初始化事件监听...');

      // 绑定表单元素事件
      document.querySelectorAll('input, textarea').forEach((input) => {
        input.addEventListener('change', inputChange);
        input.addEventListener('keyup', inputKeyup);
      });

      // 绑定按钮事件
      document.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', buttonClick);
      });

      // 异步初始化核心逻辑
      setTimeout(() => {
        initOptions();

        // 添加就绪状态检测
        const checkReady = () => {
          if (document.querySelector("[name='title']").value) {
            console.log('UI初始化确认完成');
          } else {
            setTimeout(checkReady, 50);
          }
        };
        checkReady();
      }, 0);
    } catch (error) {
      console.error('初始化失败:', error);
    }
  };

  if (document.readyState === 'complete') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded事件触发');

  // 添加加载状态检测
  const loadCheck = setInterval(() => {
    if (document.readyState === 'complete') {
      clearInterval(loadCheck);
      initOptions();
    }
  }, 50);
});

document.querySelectorAll('.save').forEach((el) => el.addEventListener('click', saveOptions));
document.querySelectorAll('.status').forEach((el) => el.addEventListener('click', hideStatus));
document.querySelectorAll('.input-sizer > textarea').forEach((el) => el.addEventListener('input', textareaInput));

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

const initOptions = () => {
  const init = async () => {
    try {
      // 等待所有关键元素加载
      await new Promise((resolve) => {
        const checkElements = () => {
          if (document.getElementById('includeTemplate')) resolve();
          else setTimeout(checkElements, 50);
        };
        checkElements();
      });

      const result = await restoreOptions();
      console.log('恢复的配置:', result);

      requestAnimationFrame(() => {
        setCurrentChoice(result);
        refereshElements();
      });
    } catch (error) {
      console.error('初始化失败:', error);
    }
  };
  init();
};

const bindEvents = () => {
  // 解绑旧事件后重新绑定
  const importBtn = document.getElementById('import');
  const newImportBtn = importBtn.cloneNode(true);
  importBtn.parentNode.replaceChild(newImportBtn, importBtn);

  newImportBtn.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = handleFileImport;
    fileInput.click();
  });

  // 导出按钮同理
};
