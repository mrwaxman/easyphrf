import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.jsx';
import './index.css';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

if (!publishableKey) {
  // eslint-disable-next-line no-console
  console.warn('VITE_CLERK_PUBLISHABLE_KEY is not set — admin sign-in will not work.');
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={publishableKey} signInUrl="/sign-in">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ClerkProvider>
  </React.StrictMode>
);
