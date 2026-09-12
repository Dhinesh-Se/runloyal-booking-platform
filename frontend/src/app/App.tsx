import { BrowserRouter } from 'react-router-dom'
import { OktaProvider } from '@/auth/OktaProvider'
import { QueryProvider } from './QueryProvider'
import { Router } from './Router'
import { Toaster } from 'react-hot-toast'

export function App() {
  return (
    <BrowserRouter>
      <OktaProvider>
        <QueryProvider>
          <Router />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                fontSize: 'var(--font-size-base)',
                fontFamily: 'var(--font-family)',
              },
              success: {
                iconTheme: { primary: 'var(--color-success)', secondary: 'var(--bg-elevated)' },
              },
              error: {
                iconTheme: { primary: 'var(--color-danger)', secondary: 'var(--bg-elevated)' },
              },
            }}
          />
        </QueryProvider>
      </OktaProvider>
    </BrowserRouter>
  )
}
