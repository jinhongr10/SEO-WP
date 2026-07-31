import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outDir = path.resolve("import_templates");

const importColumns = [
  "ID",
  "Type",
  "SKU",
  "GTIN, UPC, EAN, or ISBN",
  "Name",
  "Published",
  "Is featured?",
  "Visibility in catalog",
  "Tax status",
  "Tax class",
  "In stock?",
  "Stock",
  "Low stock amount",
  "Backorders allowed?",
  "Sold individually?",
  "Weight (lbs)",
  "Length (in)",
  "Width (in)",
  "Height (in)",
  "Description",
  "Short description",
  "Meta: short_description",
  "Meta: product_extra_info——seo",
  "Meta: _aioseo_title",
  "Meta: _aioseo_description",
  "Meta: _aioseo_og_title",
  "Meta: _aioseo_og_description",
  "Meta: _aioseo_og_article_section",
  "Meta: _aioseo_twitter_title",
  "Meta: _aioseo_twitter_description",
  "Categories",
  "Tags",
  "Brands",
  "Images",
  "Parent",
  "Position",
  "Meta: ast-site-content-layout",
  "Meta: site-content-style",
  "Meta: site-sidebar-layout",
  "Meta: site-sidebar-style",
  "Meta: theme-transparent-header-meta",
  "Meta: astra-migrate-meta-layouts",
  "Sale price",
  "Regular price",
  "Attribute 1 name",
  "Attribute 1 value(s)",
  "Attribute 1 default",
  "Attribute 1 visible",
  "Attribute 1 global",
  "Attribute 2 name",
  "Attribute 2 value(s)",
  "Attribute 2 default",
  "Attribute 2 visible",
  "Attribute 2 global",
  "Attribute 3 name",
  "Attribute 3 value(s)",
  "Attribute 3 default",
  "Attribute 3 visible",
  "Attribute 3 global",
];

const title = "MODEL-001 Product Name";
const parentSku = "MODEL-001";
const tags = "";

const fullDescription = [
  "<h2>Product Overview</h2>",
  "<p>Fill the full product description here. You can paste the content from the WordPress Product description editor, including HTML.</p>",
  "<h2>Features</h2>",
  "<ul><li>Replace with your product feature</li><li>Replace with your material or process detail</li><li>Replace with your application scenario</li></ul>",
].join("");

const shortDescription = [
  "<table>",
  "<tbody>",
  "<tr><td>Model</td><td>MODEL-001</td></tr>",
  "<tr><td>Product</td><td>Product Name</td></tr>",
  "<tr><td>Application</td><td>Replace with your customer use case</td></tr>",
  "<tr><td>Option</td><td>Option A, Option B</td></tr>",
  "</tbody>",
  "</table>",
].join("");

const baseSummary =
  "MODEL-001 is a product name.";

const seoDescription =
  "MODEL-001 product name.";

function blankRow() {
  return Object.fromEntries(importColumns.map((column) => [column, ""]));
}

function parentRow() {
  return {
    ...blankRow(),
    ID: "",
    Type: "variable",
    SKU: parentSku,
    "GTIN, UPC, EAN, or ISBN": "",
    Name: title,
    Published: "-1",
    "Is featured?": "0",
    "Visibility in catalog": "visible",
    "Tax status": "taxable",
    "Tax class": "",
    "In stock?": "1",
    Stock: "",
    "Low stock amount": "",
    "Backorders allowed?": "0",
    "Sold individually?": "0",
    "Weight (lbs)": "",
    "Length (in)": "",
    "Width (in)": "",
    "Height (in)": "",
    Description: fullDescription,
    "Short description": shortDescription,
    "Meta: short_description": baseSummary,
    "Meta: product_extra_info——seo": baseSummary,
    "Meta: _aioseo_title": `${title}`,
    "Meta: _aioseo_description": seoDescription,
    "Meta: _aioseo_og_title": `${title}`,
    "Meta: _aioseo_og_description": seoDescription,
    "Meta: _aioseo_og_article_section": "Products",
    "Meta: _aioseo_twitter_title": `${title}`,
    "Meta: _aioseo_twitter_description": seoDescription,
    Categories: "Product Category > Product Subcategory",
    Tags: tags,
    Brands: "",
    Images:
      "https://example.com/model-001-main.webp, https://example.com/model-001-gallery-1.webp, https://example.com/model-001-gallery-2.webp",
    Parent: "",
    Position: "0",
    "Meta: ast-site-content-layout": "full-width-container",
    "Meta: site-content-style": "default",
    "Meta: site-sidebar-layout": "no-sidebar",
    "Meta: site-sidebar-style": "default",
    "Meta: theme-transparent-header-meta": "default",
    "Meta: astra-migrate-meta-layouts": "set",
    "Sale price": "",
    "Regular price": "",
    "Attribute 1 name": "Color",
    "Attribute 1 value(s)": "Black, White",
    "Attribute 1 default": "Black",
    "Attribute 1 visible": "1",
    "Attribute 1 global": "0",
  };
}

function variationRow({ sku, name, color, image }) {
  return {
    ...blankRow(),
    ID: "",
    Type: "variation",
    SKU: sku,
    Name: name,
    Published: "-1",
    "Is featured?": "0",
    "Visibility in catalog": "visible",
    "Tax status": "taxable",
    "In stock?": "1",
    Stock: "",
    "Backorders allowed?": "0",
    "Sold individually?": "0",
    Images: image,
    Parent: parentSku,
    Position: "0",
    "Sale price": "",
    "Regular price": "",
    "Attribute 1 name": "Color",
    "Attribute 1 value(s)": color,
    "Attribute 1 visible": "1",
    "Attribute 1 global": "0",
  };
}

const importRows = [
  parentRow(),
  variationRow({
    sku: "MODEL-001-OPTION-A",
    name: "MODEL-001 Option A Product Name",
    color: "Option A",
    image: "https://example.com/model-001-option-a.webp",
  }),
  variationRow({
    sku: "MODEL-001-OPTION-B",
    name: "MODEL-001 Option B Product Name",
    color: "Option B",
    image: "https://example.com/model-001-option-b.webp",
  }),
];

const fillFormRows = [
  [
    "顶部标题",
    "Product title",
    "Name",
    title,
    "变体标题写成：型号 + 属性 + 产品名",
    "可导入",
  ],
  [
    "顶部链接",
    "Permalink",
    "无稳定 CSV 字段",
    "留空，WordPress 自动生成",
    "留空",
    "如果要批量控制 slug，需要再导出含 slug 的样品确认字段",
  ],
  [
    "Product description",
    "产品长描述",
    "Description",
    fullDescription,
    "留空",
    "父产品填写，支持 HTML",
  ],
  [
    "Product Extra Info——SEO",
    "Short Description",
    "Meta: product_extra_info——seo",
    baseSummary,
    "留空",
    "对应你截图里的 Product Extra Info——SEO",
  ],
  [
    "Product short description",
    "产品短描述",
    "Short description",
    shortDescription,
    "留空",
    "对应 WooCommerce Product short description，支持 HTML 表格",
  ],
  [
    "AIOSEO General",
    "Product Title",
    "Meta: _aioseo_title",
    `${title}`,
    "留空",
    "建议控制在 60 字符左右；你截图当前 110 偏长",
  ],
  [
    "AIOSEO General",
    "Meta Description",
    "Meta: _aioseo_description",
    seoDescription,
    "留空",
    "建议 150-160 字符左右",
  ],
  [
    "AIOSEO Social",
    "Facebook Title",
    "Meta: _aioseo_og_title",
    `${title}`,
    "留空",
    "不填通常会继承 SEO title",
  ],
  [
    "AIOSEO Social",
    "Facebook Description",
    "Meta: _aioseo_og_description",
    seoDescription,
    "留空",
    "不填通常会继承 SEO description",
  ],
  [
    "AIOSEO Social",
    "X/Twitter Title",
    "Meta: _aioseo_twitter_title",
    `${title}`,
    "留空",
    "不填通常会继承 SEO title",
  ],
  [
    "AIOSEO Social",
    "X/Twitter Description",
    "Meta: _aioseo_twitter_description",
    seoDescription,
    "留空",
    "不填通常会继承 SEO description",
  ],
  [
    "Product data",
    "Product type",
    "Type",
    "variable",
    "variation",
    "父产品一行 variable，每个变体一行 variation",
  ],
  [
    "Product data / Inventory",
    "SKU",
    "SKU",
    parentSku,
    "MODEL-001-OPTION-A / MODEL-001-OPTION-B",
    "所有 SKU 必须唯一",
  ],
  [
    "Product data / Inventory",
    "GTIN, UPC, EAN, or ISBN",
    "GTIN, UPC, EAN, or ISBN",
    "有就填，没有留空",
    "通常留空",
    "对应截图库存页 GTIN 字段",
  ],
  [
    "Product data / Inventory",
    "Quantity",
    "Stock",
    "父级库存可留空",
    "变体库存可留空或填数量",
    "如果你实际销售，建议库存放在变体行",
  ],
  [
    "Product data / Inventory",
    "Allow backorders",
    "Backorders allowed?",
    "0",
    "0",
    "0=Do not allow",
  ],
  [
    "Product data / Inventory",
    "Sold individually",
    "Sold individually?",
    "0",
    "0",
    "0=不限制每单数量",
  ],
  [
    "Product data / Attributes",
    "Attributes",
    "Attribute 1 name / value(s)",
    "Option = Option A, Option B",
    "Option = 当前选项",
    "父产品填全部属性值；变体只填自己的值",
  ],
  [
    "Product data / Variations",
    "Variations",
    "Parent",
    "留空",
    parentSku,
    "变体行用 Parent 关联父 SKU",
  ],
  [
    "Astra Settings",
    "Container Layout",
    "Meta: ast-site-content-layout",
    "full-width-container",
    "留空",
    "对应 Full Width",
  ],
  [
    "Astra Settings",
    "Container Style",
    "Meta: site-content-style",
    "default",
    "留空",
    "对应 Customizer Setting",
  ],
  [
    "Astra Settings",
    "Sidebar Layout",
    "Meta: site-sidebar-layout",
    "no-sidebar",
    "留空",
    "对应 No Sidebar",
  ],
  [
    "Astra Settings",
    "Sidebar Style",
    "Meta: site-sidebar-style",
    "default",
    "留空",
    "对应 Customizer Setting",
  ],
  [
    "Astra Settings",
    "Transparent Header",
    "Meta: theme-transparent-header-meta",
    "default",
    "留空",
    "对应 Customizer Setting",
  ],
  ["右侧栏", "Product tags", "Tags", tags, "留空", "英文逗号分隔"],
  ["右侧栏", "Brands", "Brands", "", "留空", "对应 Brands 勾选"],
  [
    "右侧栏",
    "Product image / Product gallery",
    "Images",
    "第一张主图 URL，后面相册 URL",
    "当前变体图 URL",
    "图片必须是可公开访问的 URL",
  ],
  [
    "右侧栏",
    "Product categories",
    "Categories",
    "Product Category > Product Subcategory",
    "留空",
    "用 > 表示层级；多个分类用英文逗号",
  ],
  [
    "右侧栏",
    "SELECT PRIMARY CATEGORY",
    "暂不放入真实导入 CSV",
    "先把主分类放在 Categories 第一个",
    "留空",
    "需要再导出一个已设置主分类的产品，确认它的 meta key 后才能稳定批量导入",
  ],
];

function escapeCsvValue(value) {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows, columns) {
  const header = columns.map(escapeCsvValue).join(",");
  const body = rows
    .map((row) => columns.map((column) => escapeCsvValue(row[column])).join(","))
    .join("\r\n");
  return `\uFEFF${header}\r\n${body}\r\n`;
}

function matrixFromObjects(rows, columns) {
  return [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))];
}

await fs.mkdir(outDir, { recursive: true });

await fs.writeFile(
  path.join(outDir, "wc-single-variable-admin-fields-template.csv"),
  toCsv(importRows, importColumns),
  "utf8",
);

const fillColumns = [
  "后台区域",
  "后台字段",
  "CSV字段",
  "父产品填写",
  "变体填写",
  "说明",
];
await fs.writeFile(
  path.join(outDir, "wc-single-product-fill-form.csv"),
  toCsv(
    fillFormRows.map((row) => Object.fromEntries(fillColumns.map((column, index) => [column, row[index]]))),
    fillColumns,
  ),
  "utf8",
);

const workbook = Workbook.create();
const formSheet = workbook.worksheets.add("填写表单");
formSheet.getRange(`A1:F${fillFormRows.length + 1}`).values = [fillColumns, ...fillFormRows];

const importSheet = workbook.worksheets.add("Woo导入CSV");
const importMatrix = matrixFromObjects(importRows, importColumns);
importSheet.getRange(`A1:BG${importMatrix.length}`).values = importMatrix;

const noteSheet = workbook.worksheets.add("使用说明");
noteSheet.getRange("A1:B8").values = [
  ["使用步骤", "说明"],
  ["1", "先填写“填写表单”中的父产品信息和变体信息。"],
  ["2", "真实导入 WooCommerce 时使用 wc-single-variable-admin-fields-template.csv。"],
  ["3", "新增产品时 ID 留空，Published=-1 代表草稿，确认无误后可改为 1 发布。"],
  ["4", "Parent 只填在变体行，值必须等于父产品 SKU。"],
  ["5", "Images 中父产品第一张 URL 是产品主图，后面是相册图；变体行放当前变体图片。"],
  ["6", "SELECT PRIMARY CATEGORY 暂不放入真实导入 CSV，先把主分类放在 Categories 第一个。"],
  ["7", "如果必须批量导入 Primary Category，先手动设置一个产品再导出 CSV 给我确认 meta key。"],
];

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outDir, "wc-single-product-fill-form.xlsx"));

console.log(path.join(outDir, "wc-single-variable-admin-fields-template.csv"));
console.log(path.join(outDir, "wc-single-product-fill-form.csv"));
console.log(path.join(outDir, "wc-single-product-fill-form.xlsx"));
