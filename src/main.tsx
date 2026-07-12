import React from 'react';
import ReactDOM from 'react-dom/client';
import MzdovaKalkulacka from './MzdovaKalkulacka';

const el = document.getElementById('mk-app');
if (el && !(el as any).__mounted) {
  (el as any).__mounted = true;
  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <MzdovaKalkulacka />
    </React.StrictMode>
  );
}
