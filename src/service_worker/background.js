// 修改Service Worker注册方式
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/service_worker/background.js', {
        // 修正路径
        type: 'module',
        scope: '/',
      })
      .then((registration) => {
        console.log('SW registered with scope:', registration.scope);
        isServiceWorkerActive = true;
      })
      .catch((error) => {
        console.error('SW registration failed:', error);
        isServiceWorkerActive = false;
      });
  }
}
