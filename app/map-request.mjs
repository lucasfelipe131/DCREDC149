/** Authenticated map requests always settle, including stale sessions and invalid responses. */
export async function mapRequest(path, method = 'GET', body, options = {}) {
  const { signal, timeoutMs = 15000 } = options;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Credit-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401)
      throw Error(
        'Sua sessão precisa ser autenticada novamente. Recarregue a página e entre no sistema.',
      );
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw Error(
        'O servidor retornou uma resposta inesperada. Tente novamente.',
      );
    }
    if (!response.ok)
      throw Object.assign(
        Error(data.error || 'Não foi possível consultar o mapa.'),
        { status: response.status },
      );
    return data;
  } catch (error) {
    if (timedOut)
      throw Error(
        'A consulta demorou mais que o esperado. Confira a conexão e tente novamente.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
export function historyRows(value) {
  if (
    !Array.isArray(value) ||
    value.some(
      (v) =>
        !v ||
        !Number.isInteger(v.revision) ||
        v.revision < 1 ||
        typeof v.created_at !== 'string',
    )
  )
    throw Error('Não foi possível ler a lista de versões. Tente novamente.');
  return value;
}
