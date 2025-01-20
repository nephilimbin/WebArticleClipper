module.exports = {
  sourceDir: 'src',
  artifactsDir: 'web-ext-artifacts',
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: [],
    browserConsole: true,
    keepProfileChanges: false,
  },
};
