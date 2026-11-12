// Atualização automática do app de Windows pelas releases do GitHub (sem dependências extras).
// Instalado: baixa o instalador novo e instala em silêncio, reabrindo o app.
// Portátil: não dá para se trocar sozinho, então avisa e abre a página de download.
const { app, dialog, shell } = require('electron');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO = 'cassianovogt123-ai/Radar-Sul-SC';
const ASSET = 'VogtSonar-Sul-Instalador.exe';
const CHECK_MS = 30 * 60 * 1000;
const build = (v) => Number(String(v).split('.').pop()); // "v1.0.42" -> 42

function request(url, file, redirects = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'VogtSonar-Sul', Accept: file ? 'application/octet-stream' : 'application/vnd.github+json' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          return resolve(request(res.headers.location, file, redirects - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        if (!file) {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve(body));
          return;
        }
        const tmp = file + '.part';
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => out.close(() => fs.rename(tmp, file, (e) => (e ? reject(e) : resolve(file)))));
        out.on('error', reject);
      })
      .on('error', reject);
  });
}

let busy = false;
let asked = null; // versão que o usuário já mandou deixar para depois
let pendingInstaller = null;

function runInstaller(file) {
  // /S = instalação silenciosa do NSIS; --force-run reabre o app no fim
  spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
}

async function check(win) {
  if (busy || !app.isPackaged) return;
  busy = true;
  try {
    const rel = JSON.parse(await request(`https://api.github.com/repos/${REPO}/releases/latest`));
    const latest = build(rel.tag_name);
    if (!(latest > build(app.getVersion())) || asked === latest) return;
    const label = String(rel.tag_name).replace(/^v/, '');

    if (process.env.PORTABLE_EXECUTABLE_FILE) {
      asked = latest;
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        title: 'VogtSonar Sul',
        message: `Nova versão ${label} disponível`,
        detail: 'Esta é a versão portátil, que não se atualiza sozinha. Baixe a nova versão (ou use o instalador, que se atualiza automaticamente).',
        buttons: ['Baixar agora', 'Depois'],
        defaultId: 0,
      });
      if (response === 0) shell.openExternal(rel.html_url);
      return;
    }

    const asset = (rel.assets || []).find((a) => a.name === ASSET);
    if (!asset) return;
    const file = path.join(os.tmpdir(), `VogtSonar-Sul-Instalador-${label}.exe`);
    if (!fs.existsSync(file)) await request(asset.browser_download_url, file);
    pendingInstaller = file;
    asked = latest;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'VogtSonar Sul',
      message: `Versão ${label} pronta para instalar`,
      detail: 'O app fecha, atualiza e abre de novo sozinho em alguns segundos.',
      buttons: ['Atualizar agora', 'Ao fechar o app'],
      defaultId: 0,
    });
    if (response === 0) {
      pendingInstaller = null;
      runInstaller(file);
      app.quit();
    }
  } catch {
    // sem internet ou GitHub fora: tenta de novo na próxima rodada
  } finally {
    busy = false;
  }
}

function startAutoUpdate(win) {
  setTimeout(() => check(win), 15000);
  setInterval(() => check(win), CHECK_MS);
  app.on('will-quit', () => {
    if (pendingInstaller) runInstaller(pendingInstaller);
  });
}

module.exports = { startAutoUpdate, build };
