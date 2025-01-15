function addLatexToMathJax3() {
  // 检查 window.MathJax 是否存在
  if (typeof window.MathJax === 'undefined') {
    console.debug('MathJax not found on page');
    return;
  }

  // 检查必要的 MathJax 属性
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

// 等待页面加载完成后再执行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addLatexToMathJax3);
} else {
  addLatexToMathJax3();
}
