import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import './index.css';

/**
 * PROVIDER ORDER MATTERS.
 *
 *   BrowserRouter  outermost - everything else may call useNavigate/Link
 *     ToastProvider           - AuthProvider logs out on 401 and shows a toast
 *       AuthProvider          - components read `user` from context
 *
 * If ToastProvider sat inside AuthProvider, the 401 handler could not show a
 * "session expired" toast, because no toast component would be mounted yet.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);