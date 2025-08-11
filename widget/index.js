window.CUSDIS = window.CUSDIS || {}

const makeIframeContent = (target) => {
  const host = target.dataset.host || 'https://cusdis.com'
  const iframeJsPath = target.dataset.iframe || `${host}/js/iframe.umd.js`
  const cssPath = target.dataset.css || `${host}/js/style.css`

  // Decide initial theme for the iframe based on dataset, parent html .dark, or prefers-color-scheme
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const htmlIsDark = document.documentElement.classList.contains('dark')
  const ds = (target.dataset.theme || '').toLowerCase()

  return `<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="${cssPath}">
    <base target="_parent" />
    <link>
    <script>
      window.CUSDIS_LOCALE = ${JSON.stringify(window.CUSDIS_LOCALE)}
      window.__DATA__ = ${JSON.stringify(target.dataset)}
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

let singleTonIframe
function createIframe(target) {
  if (!singleTonIframe) {
    singleTonIframe = document.createElement('iframe')
    listenEvent(singleTonIframe, target)
  }
  // srcdoc dosen't work on IE11
  singleTonIframe.srcdoc = makeIframeContent(target)
  singleTonIframe.style.width = '100%'
  singleTonIframe.style.border = '0'

  return singleTonIframe
}

function sendMessageToChild(event, data) {
  if (singleTonIframe) {
    singleTonIframe.contentWindow.postMessage(
      JSON.stringify({
        from: 'cusdis',
        event,
        data,
      }),
    )
  }
}

function listenEvent(iframe, target) {
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')

  const onMessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.from === 'cusdis') {
        switch (msg.event) {
          case 'onload': {
            const ds = (target.dataset.theme || '').toLowerCase()
            const htmlIsDark = document.documentElement.classList.contains('dark')
            const prefersDark = darkModeQuery.matches
            const themeToSend = ds === 'dark' ? 'dark'
              : ds === 'light' ? 'light'
              : ds === 'auto' ? (prefersDark ? 'dark' : 'light')
              : (htmlIsDark ? 'dark' : 'light')
            sendMessageToChild('setTheme', themeToSend)
          }
          break
          case 'resize':
            {
              iframe.style.height = msg.data + 'px'
            }
            break
        }
      }
    } catch (e) {}
  }

  window.addEventListener('message', onMessage)

  function onChangeColorScheme(e) {
    const isDarkMode = e.matches
    if (target.dataset.theme === 'auto') {
      sendMessageToChild('setTheme', isDarkMode ? 'dark' : 'light')
    }
  }

  darkModeQuery.addEventListener('change', onChangeColorScheme)

  // Sync when parent toggles Tailwind `.dark` class
  const classObserver = new MutationObserver(() => {
    const isDark = document.documentElement.classList.contains('dark')
    sendMessageToChild('setTheme', isDark ? 'dark' : 'light')
  })
  classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  return () => {
    darkModeQuery.removeEventListener('change', onChangeColorScheme)
    window.removeEventListener('message', onMessage)
    classObserver.disconnect()
  }
}

function render(target) {
  if (target) {
    target.innerHTML = ''
    const iframe = createIframe(target)
    target.appendChild(iframe)
  }
}

// deprecated
window.renderCusdis = render

window.CUSDIS.renderTo = render

window.CUSDIS.setTheme = function (theme) {
  sendMessageToChild('setTheme', theme)
}

function initial() {
  let target

  if (window.cusdisElementId) {
    target = document.querySelector(`#${window.cusdisElementId}`)
  } else if (document.querySelector('#cusdis_thread')) {
    target = document.querySelector('#cusdis_thread')
  } else if (document.querySelector('#cusdis')) {
    console.warn(
      'id `cusdis` is deprecated. Please use `cusdis_thread` instead',
    )
    target = document.querySelector('#cusdis')
  }

  if (window.CUSDIS_PREVENT_INITIAL_RENDER === true) {
  } else {
    if (target) {
      render(target)
    }
  }
}

// initialize
window.CUSDIS.initial = initial

initial()
