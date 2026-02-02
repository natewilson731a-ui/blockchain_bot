import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { ChakraProvider, ColorModeScript, extendTheme } from '@chakra-ui/react';
import { BrowserRouter } from 'react-router-dom';

// Suppress common browser extension and ResizeObserver errors that don't affect functionality
const originalError = console.error;
console.error = (...args) => {
  const message = args[0];
  if (typeof message === 'string' && 
      (message.includes('Could not establish connection') || 
       message.includes('Receiving end does not exist') ||
       message.includes('Extension context invalidated') ||
       message.includes('Tabs cannot be edited right now') ||
       message.includes('user may be dragging a tab') ||
       message.includes('ResizeObserver loop completed') ||
       message.includes('ResizeObserver loop limit exceeded'))) {
    // Suppress these common extension/browser/ResizeObserver errors
    return;
  }
  originalError.apply(console, args);
};

// Also suppress ResizeObserver errors at the window level
window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('ResizeObserver loop')) {
    e.stopImmediatePropagation();
    e.preventDefault();
    return false;
  }
});

// Color mode config
const config = {
  initialColorMode: 'light',
  useSystemColorMode: false,
};

// Extend the theme
const theme = extendTheme({ config });

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ChakraProvider theme={theme}>
        <ColorModeScript initialColorMode={theme.config.initialColorMode} />
    <App />
      </ChakraProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
