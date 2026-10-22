import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById('root')!)

function mountApp() {
  void import('./App.tsx').then(({ default: App }) => {
    root.render(<StrictMode><App /></StrictMode>)
  })
}

if (import.meta.env.DEV) {
  const previewPath = /^\/__ui-preview\/(AU02|AU05|GL01|AC01|AC02|AC03|AC04|AC05|AC06|AC07|AC08|AC09|SC01|SC02|SC03|SC05|SC06|AT01|AT02|AT03|AT04|AT05|BL01|BL02|BL03|BL04|BL05|BL06|BL07|BL08|BL09|BL10|BL11|AS01|AS02|AS03|AS04|AS05|AS06|AS07)\/?$/.exec(window.location.pathname)
  if (previewPath) {
    void import('./ui-preview/PreviewApp.tsx').then(({ PreviewApp }) => {
      root.render(<StrictMode><PreviewApp screenId={previewPath[1]} /></StrictMode>)
    })
  } else {
    mountApp()
  }
} else {
  mountApp()
}
