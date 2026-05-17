/**
 * Liquid App — React Entry Point
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/fonts/fonts.css'  /* Local fonts — offline-ready, must be first */
import './styles/index.css'
import './styles/glass.css'
import './styles/animations.css'
import './i18n'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
