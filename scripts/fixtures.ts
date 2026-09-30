import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import sharp from 'sharp';
import type { CourseDraft, LessonBlock } from '../src/lib/schemas';
export function fixtureId(name: string) {
  const h = createHash('sha256').update(`academy-seed:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function pdfFile() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const content =
    'BT /F1 28 Tf 60 740 Td (ACADEMY / FIELD NOTES) Tj 0 -55 Td /F1 14 Tf (01. Define the problem.) Tj 0 -30 Td (02. Test your assumptions.) Tj 0 -30 Td (03. Learn from the evidence.) Tj ET';
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(output));
    output += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((x) => `${String(x).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(output);
}
export async function demoAssets() {
  const cover = (color: string, kind: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#111c32"/></linearGradient><radialGradient id="orb" cx="30%" cy="25%"><stop stop-color="#fff"/><stop offset=".28" stop-color="${color}"/><stop offset="1" stop-color="#13234e"/></radialGradient><filter id="s"><feGaussianBlur stdDeviation="28"/></filter></defs><rect width="1600" height="1000" fill="url(#bg)"/><g fill="none" stroke="#ffffff" opacity=".1">${Array.from({ length: 14 }, (_, i) => `<path d="M${i * 140 - 300} 1000L${i * 140 + 500} 0"/>`).join('')}</g><ellipse cx="820" cy="780" rx="400" ry="60" fill="#081125" opacity=".5" filter="url(#s)"/>${kind === 0 ? '<circle cx="870" cy="440" r="320" fill="url(#orb)"/><ellipse cx="870" cy="460" rx="510" ry="100" transform="rotate(-25 870 460)" fill="none" stroke="#e8f1ff" stroke-width="14"/><ellipse cx="870" cy="460" rx="480" ry="100" transform="rotate(40 870 460)" fill="none" stroke="#d3ff75" stroke-width="6"/>' : kind === 1 ? '<g transform="translate(530 230) rotate(-12 300 250)"><rect x="150" y="0" width="480" height="480" rx="72" fill="#d4f2a1"/><rect x="50" y="100" width="480" height="480" rx="72" fill="#8cad52"/><rect x="-50" y="200" width="480" height="480" rx="72" fill="#eeffd0"/><circle cx="190" cy="440" r="130" fill="#32452b"/><path d="M130 445l40 40 100-100" fill="none" stroke="#eeffd0" stroke-width="18"/></g>' : '<g transform="translate(480 200)"><path d="M0 400L240 0 480 400 240 800Z" fill="#eadcff"/><path d="M280 400L520 0 760 400 520 800Z" fill="#9679cb"/><path d="M140 400L380 0 620 400 380 800Z" fill="#bea2ef" opacity=".85"/></g>'}<text x="70" y="95" font-family="Arial" font-size="26" letter-spacing="8" fill="#fff" opacity=".7">ACADEMY / ${String(kind + 1).padStart(2, '0')}</text><text x="70" y="930" font-family="Arial" font-size="20" letter-spacing="4" fill="#fff" opacity=".6">LEARN. MAKE. CHANGE.</text></svg>`;
  const rels =
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const word = zipSync({
    '[Content_Types].xml': strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(rels),
    'word/document.xml': strToU8(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Рабочая тетрадь: гипотеза, эксперимент, результат.</w:t></w:r></w:p></w:body></w:document>',
    ),
  });
  const sheet = zipSync({
    '[Content_Types].xml': strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(rels.replace('word/document.xml', 'xl/workbook.xml')),
    'xl/workbook.xml': strToU8(
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Гипотезы" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      rels
        .replace('word/document.xml', 'worksheets/sheet1.xml')
        .replace('relationships/officeDocument"', 'relationships/worksheet"'),
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Гипотеза</t></is></c><c r="B1" t="inlineStr"><is><t>Приоритет</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Проверить потребность</t></is></c><c r="B2"><v>1</v></c></row></sheetData></worksheet>',
    ),
  });
  const assets = [
    ...(await Promise.all(
      ['#416be8', '#638340', '#8660be'].map(async (color, i) => ({
        name: `cover-${i}`,
        filename: `Обложка-${i + 1}.webp`,
        mime: 'image/webp',
        bytes: await sharp(Buffer.from(cover(color, i)))
          .webp({ quality: 90 })
          .toBuffer(),
      })),
    )),
    { name: 'pdf', filename: 'Полевые заметки.pdf', mime: 'application/pdf', bytes: pdfFile() },
    {
      name: 'docx',
      filename: 'Рабочая тетрадь.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: Buffer.from(word),
    },
    {
      name: 'xlsx',
      filename: 'Матрица гипотез.xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: Buffer.from(sheet),
    },
    {
      name: 'zip',
      filename: 'Материалы программы.zip',
      mime: 'application/zip',
      bytes: Buffer.from(
        zipSync({
          'Полевые заметки.pdf': pdfFile(),
          'README.txt': strToU8(
            'Учебные материалы Академии. Используйте их для самостоятельной практики.',
          ),
        }),
      ),
    },
  ];
  return assets.flatMap((asset) =>
    asset.name.startsWith('cover-')
      ? [asset]
      : Array.from({ length: 3 }, (_, i) => ({ ...asset, name: `${asset.name}-${i}` })),
  );
}
const texts = [
  [
    'ИИ: от идеи к продукту',
    'Научитесь превращать возможности искусственного интеллекта в полезные продукты. От первой гипотезы до рабочего прототипа.',
    'Алексей Морозов',
    'blue',
    'ai-product',
    ['мышление', 'ИИ', 'продукт'],
  ],
  [
    'Продуктовое мышление',
    'Системный взгляд на задачи пользователей. Находите точки роста, проверяйте решения и создавайте ценность.',
    'Мария Власова',
    'lime',
    'product-thinking',
    ['исследования', 'стратегия'],
  ],
  [
    'Дизайн ясных решений',
    'Создавайте интерфейсы, которые помогают человеку. Типографика, композиция и работа с вниманием.',
    'Анна Лебедева',
    'lilac',
    'clear-design',
    ['дизайн', 'интерфейсы'],
  ],
] as const;
const lessonNames = [
  [
    'Новая роль ИИ в работе',
    'От задачи к точной гипотезе',
    'Собираем первый прототип',
    'Проверяем результат',
  ],
  [
    'Начните с правильного вопроса',
    'Исследование без предубеждений',
    'Приоритизация возможностей',
    'Метрики, которые помогают',
  ],
  [
    'Дизайн начинается с смысла',
    'Иерархия и ритм',
    'Система вместо набора экранов',
    'Проверка на реальных задачах',
  ],
];
export function demoCourses(): CourseDraft[] {
  return texts.map((c, ci) => ({
    id: fixtureId(`course-${ci}`),
    version: 0,
    slug: c[4],
    title: c[0],
    summary: c[1],
    description: `${c[1]}\n\nВ этой программе теория сразу превращается в практику. Разбирайте примеры, пробуйте инструменты на своей задаче и возвращайтесь к материалам в удобном темпе.\n\nПосле программы у вас будет собственный проект и понятный план следующих шагов.`,
    author: c[2],
    categoryId: fixtureId(`category-${ci}`),
    tags: [...c[5]],
    coverId: fixtureId(`asset-cover-${ci}`),
    accent: c[3],
    featured: ci === 0,
    accessMode: ci === 2 ? 'registered' : 'restricted',
    sequential: ci === 1,
    modules: Array.from({ length: 2 }, (_, mi) => ({
      id: fixtureId(`module-${ci}-${mi}`),
      title: mi === 0 ? 'Сначала — понимание' : 'От знания к действию',
      lessons: Array.from({ length: 2 }, (_, li) => {
        const n = mi * 2 + li,
          key = `lesson-${ci}-${n}`;
        const block = (type: string, data: unknown, suffix = type) =>
          ({ id: fixtureId(`${key}-${suffix}`), version: 1, type, data }) as LessonBlock;
        const blocks: LessonBlock[] = [
          block('heading', { text: lessonNames[ci][n], level: 2 }),
          block('rich_text', {
            document: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Хорошее решение начинается не с инструмента, а с понимания задачи. В этом уроке разберём подход, который помогает отделить важное от второстепенного и перейти к осмысленному действию.',
                    },
                  ],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Выберите одну рабочую задачу. Запишите, для кого вы её решаете, что должно измениться и по каким признакам вы поймёте, что результат достигнут.',
                      marks: [{ type: 'bold' }],
                    },
                  ],
                },
              ],
            },
          }),
        ];
        if (n === 0)
          blocks.push(
            block('video', {
              provider: 'youtube',
              url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
              title: 'Вводное видео · демонстрация плеера',
            }),
            block('callout', {
              text: 'Перед просмотром сформулируйте вопрос, на который хотите найти ответ. Это поможет учиться внимательнее.',
              tone: 'info',
            }),
          );
        if (n === 1)
          blocks.push(
            block('image', {
              assetId: fixtureId(`asset-cover-${ci}`),
              alt: 'Визуальная метафора программы',
              caption: 'От отдельных идей — к целостной системе.',
            }),
            block('quote', {
              text: 'Учиться — значит менять способ, которым вы смотрите на задачу.',
              author: 'Команда Академии',
            }),
            block('divider', {}),
          );
        if (n === 2)
          blocks.push(
            block('code', {
              language: 'text',
              code: 'Гипотеза → Эксперимент → Наблюдение → Следующий шаг',
            }),
            block('gallery', {
              items: [
                { assetId: fixtureId('asset-cover-0'), alt: 'Исследование возможностей' },
                { assetId: fixtureId('asset-cover-1'), alt: 'Системный подход' },
              ],
            }),
          );
        if (n === 3)
          blocks.push(
            block('link', {
              url: 'https://www.wikipedia.org/',
              label: 'Библиотека для дальнейшего исследования',
            }),
            block('callout', {
              text: 'Вернитесь к своей исходной гипотезе. Что вы теперь сформулируете иначе?',
              tone: 'success',
            }),
          );
        blocks.push(
          block('file', {
            assetId: fixtureId(`asset-${['pdf', 'docx', 'xlsx', 'zip'][n]}-${ci}`),
            label: ['Полевые заметки', 'Рабочая тетрадь', 'Матрица гипотез', 'Все материалы'][n],
          }),
        );
        return {
          id: fixtureId(key),
          slug: `lesson-${n + 1}`,
          title: lessonNames[ci][n],
          duration: [18, 24, 32, 16][n],
          published: true,
          blocks,
        };
      }),
    })),
  }));
}
