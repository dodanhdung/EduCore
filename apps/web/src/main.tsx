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
  const previewPath = /^\/__ui-preview\/(AU02|AU05|GL01)\/?$/.exec(window.location.pathname)
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
