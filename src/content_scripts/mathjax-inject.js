// 将原有内联脚本内容移动到这里
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addLatexToMathJax3);
} else {
  addLatexToMathJax3();
}
