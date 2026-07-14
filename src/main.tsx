import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext'
import { CurrentUserProvider } from './context/CurrentUser'
import { I18nProvider } from './i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <CurrentUserProvider>
          <App />
        </CurrentUserProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
)
