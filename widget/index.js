window.CUSDIS = window.CUSDIS || {}
// Define Cusdis custom element
class CusdisWidget extends HTMLElement {
  iframe;
  darkModeQuery;
  classObserver;
  onMessage;
  onChangeColorScheme;

  connectedCallback() {
    this.createIframe();
    this.setupEventListeners();
  }

  disconnectedCallback() {
    if (this.onMessage) {
      window.removeEventListener('message', this.onMessage);
    }
    
    if (this.darkModeQuery && this.onChangeColorScheme) {
      this.darkModeQuery.removeEventListener('change', this.onChangeColorScheme);
    }
    
    this.classObserver?.disconnect();
    this.iframe?.remove();
  }

  makeIframeContent() {
    const host = this.dataset.host || 'https://cusdis.com'
    const iframeJsPath = this.dataset.iframe || `${host}/js/iframe.umd.js`
    const cssPath = this.dataset.css || `${host}/js/style.css`

    return `<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="${cssPath}">
    <base target="_parent" />
    <link>
    <script>
      window.CUSDIS_LOCALE = ${JSON.stringify(window.CUSDIS_LOCALE)}
      window.__DATA__ = ${JSON.stringify(this.dataset)}
    </script>
    <style>
      html, body { margin: 0; overflow-y: hidden; }
      /* Hide scrollbars inside the iframe while we drive height from parent */
      * { scrollbar-width: none; }
      *::-webkit-scrollbar { display: none; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="${iframeJsPath}" type="module"></script>
  </body>
</html>`
  }

  createIframe() {
    // Create iframe
    this.iframe = document.createElement('iframe');
    this.iframe.srcdoc = this.makeIframeContent();
    this.iframe.style.width = '100%';
    this.iframe.style.border = '0';
    
    // Clear content and append iframe
    this.innerHTML = '';
    this.appendChild(this.iframe);
  }

  postMessageToChild(event, data) {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage(
        JSON.stringify({
          from: 'cusdis',
          event,
          data,
        }),
        '*'
      );
    }
  }

  onMessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.from === 'cusdis') {
        switch (msg.event) {
          case 'onload': {
            const ds = (this.dataset.theme || '').toLowerCase();
            const htmlIsDark = document.documentElement.classList.contains('dark');
            const prefersDark = this.darkModeQuery.matches;
            const themeToSend = ds === 'dark' ? 'dark'
              : ds === 'light' ? 'light'
              : ds === 'auto' ? (prefersDark ? 'dark' : 'light')
              : (htmlIsDark ? 'dark' : 'light');
            this.postMessageToChild('setTheme', themeToSend);
          }
          break;
          case 'resize':
            if (this.iframe) {
              this.iframe.style.height = msg.data + 'px';
            }
            break;
        }
      }
    } catch (e) {}
  }

  onChangeColorScheme = (e) => {
    const isDarkMode = e.matches;
    if (this.dataset.theme === 'auto') {
      this.postMessageToChild('setTheme', isDarkMode ? 'dark' : 'light');
    }
  }

  onClassChange = () => {
    const isDark = document.documentElement.classList.contains('dark');
    this.postMessageToChild('setTheme', isDark ? 'dark' : 'light');
  }

  setupEventListeners() {
    this.darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.classObserver = new MutationObserver(this.onClassChange);

    // Set up listeners
    window.addEventListener('message', this.onMessage);
    this.darkModeQuery.addEventListener('change', this.onChangeColorScheme);
    this.classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
}

// Register the custom element
customElements.define('cusdis-widget', CusdisWidget);
