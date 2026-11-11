import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApiRequestError } from '@eventra/api-client';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { i18n } from './i18n';
import { notifyError } from './lib/notifications';
import './index.css';

// Error tak tertangani (mis. handler async pada Button) tetap tampil sebagai notifikasi.
// Error API sudah dinotifikasi oleh client Axios, jadi dilewati agar tidak dobel.
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason instanceof ApiRequestError) return;
  notifyError(i18n.t('errors.generic'));
});

const root = document.getElementById('root');
if (!root) throw new Error('Elemen #root tidak ditemukan');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
