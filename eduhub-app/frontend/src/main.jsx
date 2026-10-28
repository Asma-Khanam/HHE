import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import './styles/tokens.css'
import App from './App.jsx'
import { initNativeApp } from './lib/native.js'
import { initTheme } from './lib/theme.js'

initTheme()
initNativeApp()

// A "data router" (instead of <BrowserRouter>) so a screen can ask "are you sure
// you want to leave?" when something has not saved yet. App still owns every
// route, so nothing else changes.
const router = createBrowserRouter([{ path: '*', element: <App /> }])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
