import * as XLSX from 'xlsx';
import type { VotingOption } from '../types';

export interface ImportResult {
  options: VotingOption[];
  fileName: string;
  count: number;
}

// Limpa strings
function clean(str: unknown): string {
  if (typeof str !== 'string' && typeof str !== 'number') return '';
  return String(str).trim();
}

/**
 * Processa arquivos .txt, .csv, .xls, .xlsx e retorna uma lista de VotingOption
 */
export async function parseImportFile(file: File): Promise<ImportResult> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (extension === 'xlsx' || extension === 'xls') {
    return parseExcelFile(file);
  } else if (extension === 'csv') {
    return parseCsvFile(file);
  } else if (extension === 'txt') {
    return parseTxtFile(file);
  } else {
    throw new Error('Formato não suportado. Por favor utilize arquivos .txt, .csv, .xls ou .xlsx');
  }
}

// 1. Processador de Arquivos Excel (.xls, .xlsx)
async function parseExcelFile(file: File): Promise<ImportResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Converte para JSON
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('A planilha está vazia.');
  }

  const options: VotingOption[] = [];

  rawRows.forEach((row, idx) => {
    // Busca inteligente de colunas
    let name = '';
    let subtitle = '';
    let photoUrl = '';

    const keys = Object.keys(row);

    // Procura por coluna de Nome / Tema / Opção / Brinde
    for (const key of keys) {
      const lower = key.toLowerCase();
      const val = clean(row[key]);
      if (!val) continue;

      if (
        lower.includes('nome') ||
        lower.includes('name') ||
        lower.includes('candidato') ||
        lower.includes('tema') ||
        lower.includes('opcao') ||
        lower.includes('opção') ||
        lower.includes('brinde') ||
        lower.includes('item') ||
        lower.includes('titulo') ||
        lower.includes('título')
      ) {
        if (!name) name = val;
      } else if (
        lower.includes('subtitulo') ||
        lower.includes('subtítulo') ||
        lower.includes('cargo') ||
        lower.includes('funcao') ||
        lower.includes('função') ||
        lower.includes('departamento') ||
        lower.includes('descricao') ||
        lower.includes('descrição') ||
        lower.includes('detalhe')
      ) {
        if (!subtitle) subtitle = val;
      } else if (lower.includes('foto') || lower.includes('imagem') || lower.includes('img') || lower.includes('url')) {
        if (!photoUrl) photoUrl = val;
      }
    }

    // Se não encontrou colunas nomeadas, pega pela ordem das colunas
    if (!name && keys.length > 0) {
      name = clean(row[keys[0]]);
      if (keys.length > 1) subtitle = clean(row[keys[1]]);
      if (keys.length > 2) photoUrl = clean(row[keys[2]]);
    }

    if (name) {
      options.push({
        id: 'opt_' + Date.now() + '_' + idx,
        name,
        subtitle: subtitle || undefined,
        photoUrl: photoUrl || undefined,
        votesCount: 0,
      });
    }
  });

  return {
    options,
    fileName: file.name,
    count: options.length,
  };
}

// 2. Processador de Arquivos CSV (.csv)
async function parseCsvFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error('O arquivo CSV está vazio.');
  }

  // Detecta separador (vírgula, ponto-e-vírgula ou tab)
  const firstLine = lines[0];
  let separator = ',';
  if (firstLine.includes(';')) separator = ';';
  else if (firstLine.includes('\t')) separator = '\t';

  // Verifica se a primeira linha é cabeçalho
  const headers = firstLine.split(separator).map((h) => h.toLowerCase().trim().replace(/['"]/g, ''));
  const hasHeader = headers.some(
    (h) =>
      h.includes('nome') ||
      h.includes('tema') ||
      h.includes('opcao') ||
      h.includes('candidato') ||
      h.includes('brinde') ||
      h.includes('item')
  );

  const startIndex = hasHeader ? 1 : 0;
  const options: VotingOption[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const parts = lines[i].split(separator).map((p) => p.trim().replace(/^['"]|['"]$/g, ''));
    if (!parts[0]) continue;

    options.push({
      id: 'opt_' + Date.now() + '_' + i,
      name: parts[0],
      subtitle: parts[1] || undefined,
      photoUrl: parts[2] || undefined,
      votesCount: 0,
    });
  }

  return {
    options,
    fileName: file.name,
    count: options.length,
  };
}

// 3. Processador de Arquivos de Texto Puro (.txt)
async function parseTxtFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error('O arquivo de texto está vazio.');
  }

  const options: VotingOption[] = [];

  lines.forEach((line, idx) => {
    // Suporta formatos como:
    // "Carlos Eduardo - Diácono"
    // "Tema 1: Conectados com Deus | Acampamento 2026"
    // "Bíblia de Estudo ; Brinde para o sorteio"
    let name = line;
    let subtitle = '';

    if (line.includes(' - ')) {
      const parts = line.split(' - ');
      name = parts[0].trim();
      subtitle = parts.slice(1).join(' - ').trim();
    } else if (line.includes(';')) {
      const parts = line.split(';');
      name = parts[0].trim();
      subtitle = parts[1]?.trim() || '';
    } else if (line.includes('|')) {
      const parts = line.split('|');
      name = parts[0].trim();
      subtitle = parts[1]?.trim() || '';
    }

    if (name) {
      options.push({
        id: 'opt_' + Date.now() + '_' + idx,
        name,
        subtitle: subtitle || undefined,
        votesCount: 0,
      });
    }
  });

  return {
    options,
    fileName: file.name,
    count: options.length,
  };
}
