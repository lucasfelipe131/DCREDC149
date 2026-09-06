import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from '../app/page';
import Operational from '../app/operational';
import '../app/globals.css';
import '../app/operational.css';

const demo = new URLSearchParams(location.search).get('demo') === '1';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {demo ? (
      <>
        <div className="demo-warning">
          DEMONSTRAÇÃO · Dados fictícios, sem gravação no banco.{' '}
          <a href="/">Voltar à operação real</a>
        </div>
        <Home />
      </>
    ) : (
      <Operational />
    )}
  </React.StrictMode>,
);
