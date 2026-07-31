export type BlogDocxSourceFormat = 'markdown' | 'html';

export interface BlogDocxInput {
  title: string;
  content: string;
  sourceFormat: BlogDocxSourceFormat;
}

export interface BlogDocxPackage {
  bytes: Uint8Array;
  entries: Record<string, Uint8Array>;
  filename: string;
}

export interface BlogDocxBlobResult {
  blob: Blob;
  filename: string;
}

type ParagraphBlock = { type: 'paragraph'; text: string };
type HeadingBlock = { type: 'heading'; level: 1 | 2 | 3; text: string };
type ListBlock = { type: 'list'; ordered: boolean; items: string[] };
type TableBlock = { type: 'table'; rows: string[][] };
type DocxBlock = ParagraphBlock | HeadingBlock | ListBlock | TableBlock;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const textEncoder = new TextEncoder();

export const sanitizeDocxFilename = (title: string): string => {
  const base = String(title || '')
    .replace(/\.docx$/i, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `${base || 'blog-post'}.docx`;
};

const cleanText = (value: string): string => (
  decodeHtmlEntities(String(value || ''))
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
);

const decodeHtmlEntities = (value: string): string => (
  String(value || '').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity) => {
    const key = String(entity).toLowerCase();
    if (key === 'amp') return '&';
    if (key === 'lt') return '<';
    if (key === 'gt') return '>';
    if (key === 'quot') return '"';
    if (key === 'apos') return "'";
    if (key === 'nbsp') return ' ';
    if (key.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    }
    if (key.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    }
    return _match;
  })
);

const escapeXml = (value: string): string => (
  String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
);

const splitMarkdownTableRow = (line: string): string[] => {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  return text.split('|').map(cell => cleanText(cell.replace(/\\\|/g, '|')));
};

const isMarkdownTableSeparator = (line: string): boolean => {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.trim()));
};

const parseMarkdownBlocks = (content: string): DocxBlock[] => {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: DocxBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let orderedList = false;

  const flushParagraph = () => {
    const text = cleanText(paragraph.join(' '));
    if (text) blocks.push({ type: 'paragraph', text });
    paragraph = [];
  };

  const flushList = () => {
    const items = listItems.map(cleanText).filter(Boolean);
    if (items.length) blocks.push({ type: 'list', ordered: orderedList, items });
    listItems = [];
    orderedList = false;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isMarkdownTableSeparator(lines[i + 1])) {
      flushParagraph();
      flushList();
      const tableLines = [line, lines[i + 1].trim()];
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      i -= 1;
      const rows = [splitMarkdownTableRow(tableLines[0]), ...tableLines.slice(2).map(splitMarkdownTableRow)]
        .filter(row => row.some(Boolean));
      if (rows.length) blocks.push({ type: 'table', rows });
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(3, Math.max(1, heading[1].length)) as 1 | 2 | 3;
      const text = cleanText(heading[2]);
      if (text) blocks.push({ type: 'heading', level, text });
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const nextOrdered = Boolean(numbered);
      if (listItems.length && orderedList !== nextOrdered) flushList();
      orderedList = nextOrdered;
      listItems.push((bullet || numbered)?.[1] || '');
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
};

const htmlTableToMarkdown = (tableHtml: string): string => {
  const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(rowMatch => {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cellMatch => (
      cleanText(cellMatch[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
        .replace(/\|/g, '\\|')
    ));
    return cells;
  }).filter(row => row.some(Boolean));

  if (!rows.length) return '\n';
  const width = Math.max(...rows.map(row => row.length));
  const normalized = rows.map(row => [...row, ...Array.from({ length: width - row.length }, () => '')]);
  const header = normalized[0];
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...normalized.slice(1).map(row => `| ${row.join(' | ')} |`),
  ].join('\n');
};

const htmlImageText = (imageTag: string): string => {
  const attr = (name: string) => {
    const match = new RegExp(`${name}=["']([^"']+)["']`, 'i').exec(imageTag);
    return match?.[1] || '';
  };
  const value = cleanText(attr('alt') || attr('title') || attr('src'));
  return value ? `\nImage: ${value}\n` : '\n';
};

const htmlToMarkdownish = (html: string): string => (
  String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '\n')
    .replace(/<table\b[\s\S]*?<\/table>/gi, htmlTableToMarkdown)
    .replace(/<img\b[^>]*>/gi, htmlImageText)
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href, label) => `${cleanText(label)} (${href})`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h1\b[^>]*>/gi, '\n# ')
    .replace(/<\/h1>/gi, '\n\n')
    .replace(/<h2\b[^>]*>/gi, '\n## ')
    .replace(/<\/h2>/gi, '\n\n')
    .replace(/<h3\b[^>]*>/gi, '\n### ')
    .replace(/<\/h3>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<p\b[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<div\b[^>]*>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
);

const blocksFromInput = (input: BlogDocxInput): DocxBlock[] => {
  const content = input.sourceFormat === 'html' ? htmlToMarkdownish(input.content) : input.content;
  const blocks = parseMarkdownBlocks(content);
  if (blocks.length) return blocks;
  const fallback = cleanText(input.content || input.title);
  return fallback ? [{ type: 'paragraph', text: fallback }] : [];
};

const textRun = (text: string): string => `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

const paragraphXml = (text: string, style?: string): string => (
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${textRun(text)}</w:p>`
);

const tableXml = (rows: string[][]): string => (
  `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/><w:left w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D9E2EC"/></w:tblBorders></w:tblPr>${rows.map(row => `<w:tr>${row.map(cell => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${paragraphXml(cleanText(cell))}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`
);

const documentXml = (input: BlogDocxInput): string => {
  const body = blocksFromInput(input).map(block => {
    if (block.type === 'heading') return paragraphXml(block.text, `Heading${block.level}`);
    if (block.type === 'list') {
      return block.items.map((item, index) => paragraphXml(`${block.ordered ? `${index + 1}.` : '\u2022'} ${item}`)).join('');
    }
    if (block.type === 'table') return tableXml(block.rows);
    return paragraphXml(block.text);
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body || paragraphXml('')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
};

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="30"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
</w:styles>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const makeCrcTable = (): number[] => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
};

const CRC_TABLE = makeCrcTable();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16 = (target: Uint8Array, offset: number, value: number) => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
};

const writeUint32 = (target: Uint8Array, offset: number, value: number) => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
};

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const buildZip = (entries: Record<string, Uint8Array>): Uint8Array => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const names = Object.keys(entries);

  for (const name of names) {
    const nameBytes = textEncoder.encode(name);
    const data = entries[name];
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0x0800);
    writeUint16(local, 8, 0);
    writeUint16(local, 10, 0);
    writeUint16(local, 12, 0);
    writeUint32(local, 14, crc);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, nameBytes.length);
    writeUint16(local, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0x0800);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, 0);
    writeUint16(central, 14, 0);
    writeUint32(central, 16, crc);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, data.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const localData = concatBytes(localParts);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 4, 0);
  writeUint16(end, 6, 0);
  writeUint16(end, 8, names.length);
  writeUint16(end, 10, names.length);
  writeUint32(end, 12, centralDirectory.length);
  writeUint32(end, 16, localData.length);
  writeUint16(end, 20, 0);

  return concatBytes([localData, centralDirectory, end]);
};

export const buildBlogDocxPackage = (input: BlogDocxInput): BlogDocxPackage => {
  const filename = sanitizeDocxFilename(input.title);
  const entries: Record<string, Uint8Array> = {
    '[Content_Types].xml': textEncoder.encode(contentTypesXml),
    '_rels/.rels': textEncoder.encode(rootRelsXml),
    'word/document.xml': textEncoder.encode(documentXml(input)),
    'word/styles.xml': textEncoder.encode(stylesXml),
    'word/_rels/document.xml.rels': textEncoder.encode(documentRelsXml),
  };

  return {
    filename,
    entries,
    bytes: buildZip(entries),
  };
};

export const buildBlogDocxBlob = (input: BlogDocxInput): BlogDocxBlobResult => {
  const pkg = buildBlogDocxPackage(input);
  return {
    filename: pkg.filename,
    blob: new Blob([pkg.bytes], { type: DOCX_MIME }),
  };
};

export const downloadBlogDocx = (input: BlogDocxInput): void => {
  const { blob, filename } = buildBlogDocxBlob(input);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const downloadBlogDocxFromMarkdown = (title: string, content: string): void => {
  downloadBlogDocx({ title, content, sourceFormat: 'markdown' });
};

export const downloadBlogDocxFromHtml = (title: string, content: string): void => {
  downloadBlogDocx({ title, content, sourceFormat: 'html' });
};
