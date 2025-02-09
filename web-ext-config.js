module.exports = {
  sourceDir: 'src',
  artifactsDir: 'web-ext-artifacts',
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: ['https://www.aibase.com/news/15052'],
    browserConsole: true,
    keepProfileChanges: false,
  },
};
