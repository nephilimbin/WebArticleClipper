module.exports = {
  sourceDir: 'src',
  artifactsDir: 'web-ext-artifacts',
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: ['https://github.com/easychen/one-person-businesses-methodology-v2.0', 'https://github.com/easychen/one-person-businesses-methodology-v2.0/blob/master/README.md'],
    browserConsole: true,
    keepProfileChanges: false,
  },
};
