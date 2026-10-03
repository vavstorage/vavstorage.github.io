// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('Service Worker registered:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}

// Utility to escape regex special characters
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// MIME Type resolver
function getMimeType(fileName) {
  if (fileName.endsWith('.html')) return 'text/html';
  if (fileName.endsWith('.css')) return 'text/css';
  if (fileName.endsWith('.js')) return 'text/javascript';
  if (fileName.endsWith('.json')) return 'application/json';
  if (fileName.endsWith('.png')) return 'image/png';
  if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return 'image/jpeg';
  if (fileName.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

// Extract and prepare .vav package
async function renderVavFile(file) {
  const zip = await JSZip.loadAsync(file);

  // 1. Normalize paths in archive (strip leading ./ or /)
  const fileEntries = {};
  for (const path of Object.keys(zip.files)) {
    if (!zip.files[path].dir) {
      const cleanPath = path.replace(/^\.[\/\\]/, '').replace(/^[\/\\]/, '');
      fileEntries[cleanPath] = zip.files[path];
    }
  }

  // 2. Identify manifest or main html entry point
  let mainHtmlPath = null;
  const manifestEntry = fileEntries['name.json'] || fileEntries['manifest.json'];

  if (manifestEntry) {
    try {
      const manifestText = await manifestEntry.async('string');
      const meta = JSON.parse(manifestText);
      if (meta.main || meta.index || meta.start_url) {
        mainHtmlPath = meta.main || meta.index || meta.start_url;
      }
    } catch (e) {
      console.warn('Could not parse manifest metadata:', e);
    }
  }

  if (!mainHtmlPath || !fileEntries[mainHtmlPath.replace(/^\.[\/\\]/, '')]) {
    mainHtmlPath = Object.keys(fileEntries).find(k => k.endsWith('.html'));
  }

  if (!mainHtmlPath) {
    throw new Error('No valid HTML entry point found inside .vav file.');
  }

  mainHtmlPath = mainHtmlPath.replace(/^\.[\/\\]/, '');

  // 3. Create Blob URLs for non-HTML assets
  const blobUrls = {};
  for (const [path, zipObj] of Object.entries(fileEntries)) {
    const blob = await zipObj.async('blob');
    const mimeType = getMimeType(path);
    blobUrls[path] = URL.createObjectURL(new Blob([blob], { type: mimeType }));
  }

  // 4. Resolve relative asset links in CSS files
  for (const [path, zipObj] of Object.entries(fileEntries)) {
    if (path.endsWith('.css')) {
      let cssText = await zipObj.async('string');
      for (const [assetPath, blobUrl] of Object.entries(blobUrls)) {
        if (assetPath !== path) {
          const pattern = new RegExp(`(['"]?)(?:\\.\\/|\\/)?${escapeRegExp(assetPath)}\\1`, 'g');
          cssText = cssText.replace(pattern, `$1${blobUrl}$1`);
        }
      }
      blobUrls[path] = URL.createObjectURL(new Blob([cssText], { type: 'text/css' }));
    }
  }

  // 5. Resolve relative attribute references (src, href, action) in main HTML
  let htmlContent = await fileEntries[mainHtmlPath].async('string');
  for (const [assetPath, blobUrl] of Object.entries(blobUrls)) {
    if (assetPath !== mainHtmlPath) {
      const pattern = new RegExp(`((?:src|href|action|data)=['"])(?:\\.\\/|\\/)?${escapeRegExp(assetPath)}(['"])`, 'g');
      htmlContent = htmlContent.replace(pattern, `$1${blobUrl}$2`);
    }
  }

  return htmlContent;
}

// Launch queue consumer for ChromeOS Files App
if ('launchQueue' in window) {
  launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files || !launchParams.files.length) return;

    const fileHandle = launchParams.files[0];
    const file = await fileHandle.getFile();

    document.getElementById('file-name').textContent = `Loaded File: ${file.name}`;

    try {
      const htmlContent = await renderVavFile(file);
      const frame = document.getElementById('app-frame');
      frame.srcdoc = htmlContent;
      console.log(`Successfully rendered ${file.name}`);
    } catch (err) {
      console.error(err);
      document.getElementById('file-name').textContent = `Error loading ${file.name}: ${err.message}`;
    }
  });
}