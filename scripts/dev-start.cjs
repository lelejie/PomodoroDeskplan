'use strict';

// `electron .` does not make the package entry the CommonJS `require.main` in
// current Electron releases, so src/main.cjs only auto-starts when it is the
// direct main module (packaged app or explicit launcher). This wrapper starts
// the same app for local development.
const { app, dialog } = require('electron');
const { tr } = require('../src/i18n.js');
const { start } = require('../src/main.cjs');

start().catch(error => {
  console.error(error);
  dialog.showErrorBox(tr('日序无法启动'), error.message);
  app.quit();
});
