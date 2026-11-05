import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')
createRoot(container).render(<App />)