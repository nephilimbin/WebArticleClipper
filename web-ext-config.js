module.exports = {
  sourceDir: 'src',
  artifactsDir: 'web-ext-artifacts',
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: ['https://www.aibase.com/zh/news/15387'],
    browserConsole: true,
    keepProfileChanges: false,
  },
};
