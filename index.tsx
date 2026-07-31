import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from '@arco-design/web-react';
import '@arco-design/web-react/dist/css/arco.css';
import './src/styles.css';
import './src/layout-guardrails.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

document.documentElement.dataset.platform = window.seoWpSyncDesktop?.platform ?? 'browser';

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ConfigProvider size="default" componentConfig={{ Button: { shape: 'square' }, Select: { allowClear: false } }}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
