import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = promisify(execFile);
const options = {
  timeout: 45000,
  maxBuffer: 2 * 1024 * 1024,
  env: { PATH: process.env.PATH, LANG: 'C.UTF-8', OMP_THREAD_LIMIT: '1' },
};
export function detectMime(buffer) {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return 'image/jpeg';
  if (buffer.includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return 'text/plain';
  } catch {
    return null;
  }
}
const labels = {
  revenue: 'receita (?:anual|operacional)',
  otherIncome: 'outras (?:receitas|entradas)',
  operatingCosts: 'custos (?:anuais|operacionais)',
  householdCosts: 'retiradas familiares',
  existingDebtService: 'parcelas (?:anuais|existentes)',
  principal: '(?:valor solicitado|credito solicitado)',
  monthlyRate: '(?:taxa mensal|juros mensais)',
  termMonths: 'prazo(?: total)?',
  collateral: 'valor das garantias',
};
export function extractSuggestions(pages) {
  const items = [];
  for (let i = 0; i < pages.length; i++) {
    const text = pages[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const [key, label] of Object.entries(labels)) {
      const re = new RegExp(
        `(?:${label})\\s*[:=]\\s*(?:R\\$\\s*)?([0-9][0-9.,]*)`,
        'gi',
      );
      for (const match of text.matchAll(re)) {
        const raw = match[1];
        const value = raw.includes(',')
          ? Number(raw.replace(/\./g, '').replace(',', '.'))
          : Number(raw);
        if (Number.isFinite(value))
          items.push({
            key,
            value,
            raw,
            page: i + 1,
            snippet: match[0],
            method: 'campo rotulado; conferir separador decimal',
          });
      }
    }
  }
  return items.slice(0, 100);
}
export async function extractDocument(content, mime) {
  const buffer = Buffer.from(content);
  const deadline = Date.now() + 240000;
  if (mime === 'image/png') {
    if (
      buffer.length < 24 ||
      buffer.readUInt32BE(16) * buffer.readUInt32BE(20) > 25000000
    )
      throw Error(
        'Imagem acima de 25 megapixels ou inválida. Reduza a resolução.',
      );
  }
  if (mime === 'image/jpeg') {
    let offset = 2,
      found = false;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 255) break;
      const marker = buffer[offset + 1],
        length = buffer.readUInt16BE(offset + 2);
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        const pixels =
          buffer.readUInt16BE(offset + 5) * buffer.readUInt16BE(offset + 7);
        if (pixels > 25000000)
          throw Error('Imagem acima de 25 megapixels. Reduza a resolução.');
        found = true;
        break;
      }
      if (length < 2) break;
      offset += 2 + length;
    }
    if (!found)
      throw Error('JPEG inválido ou não suportado. Converta para PNG ou PDF.');
  }
  if (mime === 'text/plain') {
    const text = buffer.toString('utf8');
    if (text.length > 150000)
      throw Error(
        'Texto excede o limite de 150 mil caracteres. Divida o documento.',
      );
    return {
      text,
      pages: 1,
      method: 'texto',
      suggestions: extractSuggestions([text]),
    };
  }
  const dir = await mkdtemp(join(tmpdir(), 'credito-ocr-'));
  try {
    const input = join(dir, 'document');
    await writeFile(input, buffer);
    let pages = [],
      method = 'OCR';
    if (mime === 'application/pdf') {
      const info = await run('pdfinfo', [input], options);
      const count = Number(info.stdout.match(/Pages:\s*(\d+)/)?.[1]);
      if (!count || count > 20)
        throw Error(
          'PDF deve ter no máximo 20 páginas. Divida o arquivo para leitura completa.',
        );
      for (let p = 1; p <= count; p++) {
        if (Date.now() > deadline)
          throw Error(
            'Tempo de leitura excedido. Divida o PDF em arquivos menores.',
          );
        const out = join(dir, `text-${p}`);
        await run(
          'pdftotext',
          ['-f', String(p), '-l', String(p), '-layout', input, out],
          options,
        );
        let t = (await readFile(out, 'utf8')).trim();
        if (t.replace(/\s/g, '').length < 40) {
          const image = join(dir, `page-${p}`);
          await run(
            'pdftoppm',
            [
              '-f',
              String(p),
              '-l',
              String(p),
              '-singlefile',
              '-scale-to',
              '1800',
              '-png',
              input,
              image,
            ],
            options,
          );
          t = (
            await run(
              'tesseract',
              [image + '.png', 'stdout', '-l', 'por+eng'],
              options,
            )
          ).stdout;
        }
        pages.push(t);
      }
      method = 'PDF: texto nativo e OCR nas páginas sem texto';
    } else
      pages = [
        (await run('tesseract', [input, 'stdout', '-l', 'por+eng'], options))
          .stdout,
      ];
    if (pages.join('').length > 150000)
      throw Error('Texto excede 150 mil caracteres. Divida o documento.');
    if (pages.join('').trim().length < 10)
      throw Error(
        'Não foi possível extrair texto suficiente. Envie imagem legível ou PDF com texto.',
      );
    return {
      text: pages.map((t, i) => `--- Página ${i + 1} ---\n${t}`).join('\n\n'),
      pages: pages.length,
      method,
      suggestions: extractSuggestions(pages),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
