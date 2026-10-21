// App para Windows (Electron): abre a mesma interface do radar e busca os dados
// direto na Defesa Civil SC, sem precisar de servidor.
const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');

const SIFAP_HOST = 'sifap.defesacivil.sc.gov.br';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#050b18',
    title: 'VogtSonar Sul',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      // permite que a página consulte a API pública da Defesa Civil (sem CORS)
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // links externos abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`https://${SIFAP_HOST}/*`] },
    (details, callback) => {
      details.requestHeaders['Referer'] = `https://${SIFAP_HOST}/radarsc/`;
      details.requestHeaders['User-Agent'] =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      callback({ requestHeaders: details.requestHeaders });
    }
  );
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// A Defesa Civil SC usa certificado ICP-Brasil, que nem todo Windows reconhece.
// Aceita somente para o domínio oficial do SIFAP.
app.on('certificate-error', (event, _wc, url, _err, _cert, callback) => {
  try {
    if (new URL(url).hostname === SIFAP_HOST) {
      event.preventDefault();
      return callback(true);
    }
  } catch {}
  callback(false);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
