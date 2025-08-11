import Widget from './Widget.svelte'

window.CUSDIS = window.CUSDIS || {}

const parent = window.parent
const target = document.querySelector('#root')

const dataset = window.__DATA__
const widget = new Widget({
  target,
  props: {
    attrs: dataset,
  },
})

function postMessage(event, data = {}) {
  parent.postMessage(
    JSON.stringify({
      from: 'cusdis',
      event,
      data,
    }),
  )
}

postMessage('onload')
requestResize()

function requestResize() {
  postMessage('resize', document.documentElement.offsetHeight)
}

// Observe size/layout changes (works during textarea drag)
const ro = new ResizeObserver(() => requestResize())
ro.observe(document.documentElement)
if (document.body) ro.observe(document.body)

const resizeObserve = new MutationObserver(() => {
  requestResize()
})

resizeObserve.observe(document, {
  childList: true,
  subtree: true
})

document.addEventListener('drag', requestResize, true)
