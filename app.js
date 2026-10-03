// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('Service Worker registered:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}

// Handle opening .vav files via ChromeOS Files App
if ('launchQueue' in window) {
  launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files || !launchParams.files.length) {
      return;
    }

    // Retrieve the file handle passed from ChromeOS
    const fileHandle = launchParams.files[0];
    const file = await fileHandle.getFile();

    // Read text contents from the .vav file
    const content = await file.text();

    // Display filename and content in UI
    document.getElementById('file-name').textContent = `Loaded File: ${file.name}`;
    document.getElementById('file-content').textContent = content;

    console.log(`Successfully loaded ${file.name}`);
  });
}