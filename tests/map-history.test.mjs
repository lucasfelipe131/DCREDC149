import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mapRequest, historyRows } from '../app/map-request.mjs';

test('histórico distingue vazio, carregamento, erro e versões; edições bloqueiam troca', async () => {
  const source = await readFile(
    new URL('../app/map-versions.tsx', import.meta.url),
    'utf8',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const moduleUrl = new URL(
    `../app/map-versions-test-${process.pid}.mjs`,
    import.meta.url,
  );
  await writeFile(moduleUrl, compiled.outputText);
  try {
    const { MapVersions } = await import(moduleUrl.href);
    const props = {
      versions: [],
      loading: false,
      error: '',
      propertyId: 'imovel-teste',
      currentRevision: 2,
      shownRevision: 2,
      locked: false,
      onRetry() {},
      onView() {},
      onReturn() {},
    };
    const render = (overrides = {}) =>
      renderToStaticMarkup(
        createElement(MapVersions, { ...props, ...overrides }),
      );
    assert.match(render(), /Nenhuma versão salva ainda/);
    assert.match(render(), /Salvar somente o pin não cria uma versão/);
    assert.match(
      render({ propertyId: undefined }),
      /Cadastre a propriedade primeiro/,
    );
    const loading = render({ loading: true });
    assert.match(loading, /Carregando versões do mapa/);
    assert.doesNotMatch(loading, /Nenhuma versão salva/);
    const failed = render({ error: 'Falha de conexão' });
    assert.match(failed, /role="alert"/);
    assert.match(failed, /Tentar novamente/);
    assert.doesNotMatch(failed, /Nenhuma versão salva/);
    const versions = [
      {
        revision: 1,
        created_at: '2026-09-06T12:00:00Z',
        actor_name: 'Analista <teste>',
        summary: { total_count: 1, total_ha: 12.5, productive_ha: 8 },
      },
    ];
    const saved = render({ versions });
    assert.match(saved, /Versão 1/);
    assert.match(saved, /Abrir no mapa/);
    assert.match(saved, /Analista &lt;teste&gt;/);
    assert.match(saved, /\/mapping\/kml\?revision=1/);
    const locked = render({
      versions,
      locked: true,
      lockMessage: 'Conclua e salve as alterações.',
    });
    assert.match(locked, /button type="button" disabled=""[^>]*>Abrir no mapa/);
    assert.match(locked, /Conclua e salve/);
    assert.match(
      locked,
      /href="\/api\/properties\/imovel-teste\/mapping\/kml\?revision=1"/,
    );
  } finally {
    await unlink(moduleUrl);
  }
});

test('consulta do mapa preserva vazio e explica sessão, resposta inválida, timeout e cancelamento', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/properties/1/mapping/versions');
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.headers['X-Credit-Request'], '1');
      return new Response('[]', { status: 200 });
    };
    assert.deepEqual(
      historyRows(await mapRequest('/properties/1/mapping/versions')),
      [],
    );
    assert.throws(() => historyRows({ error: 'bad' }), /lista de versões/);
    assert.throws(
      () => historyRows([{ revision: '1', created_at: 'bad' }]),
      /lista de versões/,
    );
    globalThis.fetch = async () =>
      new Response('Unauthorized', { status: 401 });
    await assert.rejects(mapRequest('/test'), /autenticada novamente/);
    globalThis.fetch = async () =>
      new Response('<html>proxy error</html>', { status: 502 });
    await assert.rejects(mapRequest('/test'), /resposta inesperada/);
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: 'Mapa alterado por outro usuário' }),
        { status: 409 },
      );
    await assert.rejects(
      mapRequest('/test'),
      (error) => error.status === 409 && /outro usuário/.test(error.message),
    );
    globalThis.fetch = async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    await assert.rejects(
      mapRequest('/slow', 'GET', undefined, { timeoutMs: 10 }),
      /demorou mais/,
    );
    const controller = new AbortController();
    const cancelled = mapRequest('/stale', 'GET', undefined, {
      signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
