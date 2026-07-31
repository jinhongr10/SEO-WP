import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatUserFacingError } from "../services/errorLogService";
import {
  ColorPicker as ArcoColorPicker,
  Input as ArcoInput,
  InputNumber as ArcoInputNumber,
  Select as ArcoSelect,
  Slider as ArcoSlider,
  Upload as ArcoUpload,
} from "@arco-design/web-react";
import {
  IconDesktop,
  IconEdit,
  IconEye,
  IconFullscreen,
  IconLock,
  IconMobile,
  IconMoonFill,
  IconPalette,
  IconSunFill,
  IconUnlock,
} from "@arco-design/web-react/icon";
import {
  SiteProfile,
  SiteStyleKit,
  SiteStyleKitImportEvidence,
  defaultSiteStyleKit,
  generateSiteStyleKit,
  importSiteStyleKit,
  saveSiteStyleKit,
} from "../services/clientProfileService";
import { Button } from "./ui";
import { IconCheck, IconCopy, IconImport, IconRefresh, IconSparkles, IconUpload } from "./Icons";

type Theme = {
  cardBorder: string;
  heading: string;
  subText: string;
  inputBg: string;
  inputBorder: string;
};

type BrandStarterDashboardProps = {
  theme: Theme;
  backendUrl: string;
  activeProfile: SiteProfile | null;
  onOpenSiteSettings?: () => void;
  onRefreshProfiles?: () => Promise<void> | void;
};

type BrandEditorTab = "colors" | "typography" | "buttons";
type BrandPreviewPreset = "saas" | "portfolio" | "agency" | "ecommerce" | "blog";
type BrandPreviewMode = "live" | "contrast";
type BrandPreviewTheme = "light" | "dark";

const BRAND_EDITOR_TABS: Array<{ key: BrandEditorTab; label: string; note: string }> = [
  { key: "colors", label: "颜色", note: "主色板、页面角色和导入的品牌色" },
  { key: "typography", label: "字体", note: "字体、字重和响应式字号" },
  { key: "buttons", label: "按钮", note: "按钮高度、圆角和动作状态" },
];

const BRAND_PREVIEW_PRESETS: Array<{ value: BrandPreviewPreset; label: string }> = [
  { value: "saas", label: "SaaS" },
  { value: "portfolio", label: "Portfolio" },
  { value: "agency", label: "Agency" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "blog", label: "Blog" },
];

type BrandPreviewMetric = {
  value: string;
  label: string;
  detail?: string;
  trend?: string;
};

type BrandPreviewCard = {
  label?: string;
  title: string;
  body?: string;
  meta?: string;
  result?: string;
};

type BrandPreviewCopy = {
  brandName: string;
  nav: string[];
  navCta?: string;
  kicker?: string;
  title: string;
  description?: string;
  primaryAction?: string;
  secondaryAction?: string;
  heroMetrics?: BrandPreviewMetric[];
  metricsSection?: { title: string; items: BrandPreviewMetric[] };
  servicesSection?: { eyebrow?: string; title: string; items: BrandPreviewCard[] };
  testimonialSection?: { title: string; company: string; quote: string; name: string; role: string };
  stripItems?: string[];
  benefitsSection?: { title: string; items: BrandPreviewCard[] };
  pricingSection?: {
    title: string;
    subtitle: string;
    items: Array<{ name: string; price: string; detail: string; features: string[]; highlight?: boolean; action: string }>;
  };
  faqSection?: { title: string; intro: string; items: Array<{ question: string; answer: string }> };
  workSection?: { title: string; action?: string; items: BrandPreviewCard[] };
  aboutSection?: { title: string; paragraphs: string[]; action?: string };
  statsSection?: { items: BrandPreviewMetric[] };
  categorySection?: { title: string; items: Array<{ title: string; count: string }> };
  productSection?: { title: string; action?: string; items: Array<{ title: string; rating: string; price: string }> };
  articleSection?: { title: string; items: Array<{ category: string; date: string; title: string }> };
  finalCta?: { title: string; body: string; action: string };
  footer: {
    brandName?: string;
    description?: string;
    nav?: string[];
    support?: string[];
    contact?: string[];
    social?: string[];
    copyright?: string;
  };
};

const BRAND_PREVIEW_COPY: Record<BrandPreviewPreset, BrandPreviewCopy> = {
  saas: {
    brandName: "Acme",
    nav: ["Home", "Features", "Pricing", "Contact"],
    navCta: "Get Started",
    kicker: "Analytics platform for modern teams",
    title: "Build something amazing",
    description: "Create beautiful designs with your custom color palette. Perfect for websites, apps, and branding.",
    primaryAction: "Get Started",
    secondaryAction: "Learn More",
    heroMetrics: [
      { label: "Revenue", value: "$48,290", trend: "+12.5%" },
      { label: "Users", value: "12,847", trend: "+8.2%" },
      { label: "Growth", value: "23.4%", trend: "+3.1%" },
    ],
    metricsSection: {
      title: "Trusted by teams worldwide",
      items: [
        { value: "189+", label: "Active Integrations" },
        { value: "3M+", label: "Data Points Processed" },
        { value: "99.9%", label: "Platform Uptime" },
      ],
    },
    servicesSection: {
      title: "Our Services",
      items: [
        { title: "Color Palettes", body: "Generate beautiful color schemes for your design projects instantly." },
        { title: "Code Export", body: "Export your palette as CSS variables, Tailwind config, or other formats." },
        { title: "Live Preview", body: "See how your colors look in real-world UI components instantly." },
      ],
    },
    testimonialSection: {
      title: "Hear from users who have saved thousands on their design spend",
      company: "Airmeet",
      quote: "Fortunately, Website Stylekit came to help, saving us valuable time and money in negotiation, keeping track of and even waiving charges in some cases. Having partnered has given us speed and negotiation leverage that would be super tough to build in house.",
      name: "Naga Subramanya BB",
      role: "Associate Director of Finance, Airmeet",
    },
    stripItems: [
      "Instant color palette generation",
      "Real-time preview updates",
      "Export to multiple formats",
    ],
    benefitsSection: {
      title: "The benefits",
      items: [
        { title: "Beautiful Design", body: "Create stunning color combinations that work perfectly together." },
        { title: "Instant Results", body: "Generate and preview your palette in real-time as you make changes." },
        { title: "Perfect Match", body: "Find the ideal color scheme for the current visual identity." },
        { title: "Accessible by Default", body: "Every palette is checked for contrast so your designs stay readable." },
      ],
    },
    pricingSection: {
      title: "Simple pricing",
      subtitle: "Choose the plan that works best for you",
      items: [
        { name: "Basic", price: "$9", detail: "/month", features: ["5 projects", "Basic analytics", "Email support"], action: "Choose Plan" },
        { name: "Pro", price: "$29", detail: "/month", features: ["Unlimited projects", "Advanced analytics", "Priority support", "Custom exports"], action: "Get Started", highlight: true },
        { name: "Enterprise", price: "$99", detail: "/month", features: ["Everything in Pro", "Team collaboration", "Dedicated support", "SLA guarantee"], action: "Choose Plan" },
      ],
    },
    faqSection: {
      title: "Frequently Asked Questions",
      intro: "Everything you need to know about our color palette generator and how to use it effectively.",
      items: [
        { question: "How do I generate a color palette?", answer: "Simply select a base color and our algorithm will automatically generate a harmonious palette with complementary colors, shades, and tints that work perfectly together." },
        { question: "Can I export my palette to different formats?", answer: "Yes! You can export your palette as CSS variables, Tailwind config, JSON, or other popular formats. Just click the export button and choose your preferred format." },
        { question: "Is the color palette customizable?", answer: "Absolutely! You can adjust individual colors, modify the generation algorithm, and fine-tune every aspect of the palette to match the current identity." },
        { question: "Do you offer contrast checking?", answer: "Yes, we include a built-in contrast checker to ensure your colors meet WCAG accessibility standards. You can test any color combination in real-time." },
        { question: "Can I save and share my palettes?", answer: "Yes! You can save your palettes to your account and generate shareable links to collaborate with your team or clients." },
      ],
    },
    finalCta: {
      title: "Ready to create your palette?",
      body: "Start with one color and let our algorithm generate a harmonious palette for your next project.",
      action: "Sign Up Free",
    },
    footer: {
      brandName: "Palette Generator",
      description: "Create beautiful color palettes for your next project.",
      nav: ["Home", "Features", "Pricing", "About", "Contact"],
      contact: ["hello@palette.com", "1-800-PALETTE", "123 Color Street"],
      copyright: "© 2026 Palette Generator. All rights reserved.",
    },
  },
  portfolio: {
    brandName: "Sarah Chen",
    nav: ["Work", "About", "Contact"],
    title: "I design digital experiences that inspire",
    description: "Product designer specializing in user interfaces, design systems, and brand identities for startups and established companies.",
    workSection: {
      title: "Selected Work",
      action: "View all",
      items: [
        { label: "UI/UX Design", title: "Meridian App Redesign" },
        { label: "Branding", title: "Flux Brand Identity" },
        { label: "Web App", title: "Horizon Dashboard" },
        { label: "Web Design", title: "Nova Marketing Site" },
        { label: "Product Design", title: "Pulse Health Platform" },
        { label: "UI/UX Design", title: "Atlas Data Visualization" },
      ],
    },
    aboutSection: {
      title: "About Me",
      paragraphs: [
        "With over 8 years of experience in digital product design, I help companies create intuitive and visually compelling experiences. My approach combines strategic thinking with meticulous attention to craft.",
        "Previously at Stripe, Figma, and several early-stage startups. Currently available for freelance projects and consulting.",
      ],
      action: "Get in Touch",
    },
    footer: {
      brandName: "Sarah Chen",
      social: ["Dribbble", "LinkedIn", "Twitter"],
      copyright: "2025",
    },
  },
  agency: {
    brandName: "KOVA",
    nav: ["Services", "Work", "About", "Careers", "Contact"],
    title: "We build brands that move people",
    description: "A creative agency partnering with ambitious companies to craft compelling identities and digital experiences.",
    primaryAction: "Start a Project",
    servicesSection: {
      title: "What We Do",
      items: [
        { label: "01", title: "Brand Strategy", body: "Positioning, messaging, and market differentiation" },
        { label: "02", title: "Visual Identity", body: "Logo, typography, color systems, and guidelines" },
        { label: "03", title: "Digital Experience", body: "Websites, apps, and interactive platforms" },
        { label: "04", title: "Motion & Video", body: "Animations, reels, and video production" },
      ],
    },
    workSection: {
      title: "Selected Work",
      items: [
        { label: "Brand Identity", title: "Vertex Tech", body: "A deep partnership across strategy, identity, and digital experience culminating in measurable market impact.", result: "+180% engagement" },
        { label: "Digital Product", title: "Bloom Health", body: "A deep partnership across strategy, identity, and digital experience culminating in measurable market impact.", result: "2.4M users acquired" },
        { label: "Rebrand", title: "Orion Finance", body: "A deep partnership across strategy, identity, and digital experience culminating in measurable market impact.", result: "$12M raised post-rebrand" },
        { label: "Motion & Video", title: "Lumen Studios", body: "A deep partnership across strategy, identity, and digital experience culminating in measurable market impact.", result: "3x campaign ROI" },
      ],
    },
    statsSection: {
      items: [
        { value: "150+", label: "Projects Delivered" },
        { value: "12", label: "Years Experience" },
        { value: "98%", label: "Client Retention" },
        { value: "40+", label: "Awards Won" },
      ],
    },
    finalCta: {
      title: "Have a project in mind?",
      body: "Let's talk about how we can help bring your vision to life.",
      action: "Get in Touch",
    },
    footer: {
      brandName: "KOVA",
      copyright: "2025. All rights reserved.",
    },
  },
  ecommerce: {
    brandName: "Maison",
    nav: ["Shop", "New Arrivals", "Collections", "Sale"],
    navCta: "3",
    title: "Spring Collection",
    description: "Thoughtfully designed pieces for modern living",
    primaryAction: "Shop Now",
    categorySection: {
      title: "Shop by Category",
      items: [
        { title: "Lighting", count: "24 items" },
        { title: "Furniture", count: "38 items" },
        { title: "Textiles", count: "16 items" },
      ],
    },
    productSection: {
      title: "Best Sellers",
      action: "View all",
      items: [
        { title: "Minimal Desk Lamp", rating: "4.8", price: "$129" },
        { title: "Ceramic Planter Set", rating: "4.9", price: "$68" },
        { title: "Linen Throw Blanket", rating: "4.7", price: "$95" },
        { title: "Oak Side Table", rating: "4.6", price: "$245" },
      ],
    },
    finalCta: {
      title: "Free Shipping on Orders Over $100",
      body: "Plus easy returns within 30 days. No questions asked.",
      action: "Start Shopping",
    },
    footer: {
      brandName: "Maison",
      description: "Modern home essentials",
      nav: ["All Products", "New Arrivals", "Sale"],
      support: ["Contact", "Shipping", "Returns"],
      copyright: "Maison 2025",
    },
  },
  blog: {
    brandName: "The Journal",
    nav: ["Articles", "Categories", "About", "Subscribe"],
    navCta: "Subscribe",
    kicker: "Featured | May 1, 2025",
    title: "Mastering Visual Hierarchy in Modern Web Design",
    description: "Exploring how typography, spacing, and color work together to guide users through content and create intuitive reading experiences across devices.",
    articleSection: {
      title: "Latest Articles",
      items: [
        { category: "Design", date: "Apr 28", title: "Designing for Accessibility in 2025" },
        { category: "Engineering", date: "Apr 22", title: "The Future of Component Architecture" },
        { category: "Process", date: "Apr 15", title: "Building a Design System from Scratch" },
        { category: "Design", date: "Apr 10", title: "Color Theory for Digital Products" },
        { category: "Engineering", date: "Apr 5", title: "Performance Optimization Strategies" },
        { category: "Design", date: "Mar 30", title: "Responsive Typography Best Practices" },
      ],
    },
    finalCta: {
      title: "Stay in the loop",
      body: "Get weekly insights on design, engineering, and product thinking delivered to your inbox.",
      action: "Subscribe",
    },
    footer: {
      brandName: "The Journal",
      social: ["Twitter", "RSS", "GitHub"],
      copyright: "2025",
    },
  },
};

export const FONT_PRESETS = [
  { family: "Poppins", tone: "现代", sample: "商业空间" },
  { family: "Manrope", tone: "精准", sample: "主题指南" },
  { family: "Montserrat", tone: "有力", sample: "产品系统" },
  { family: "DM Sans", tone: "清爽", sample: "读者标准" },
  { family: "Lato", tone: "亲和", sample: "设施规划" },
  { family: "Roboto", tone: "中性", sample: "规格说明" },
  { family: "Noto Sans SC", tone: "中英混排", sample: "品牌规范" },
  { family: "Source Sans 3", tone: "编辑感", sample: "应用笔记" },
  { family: "Merriweather", tone: "衬线", sample: "材料细节" },
  { family: "Playfair Display", tone: "高级", sample: "精选系列" },
  { family: "Source Serif 4", tone: "技术感", sample: "合规文案" },
  { family: "Oswald", tone: "紧凑", sample: "业务目录" },
];

const TYPE_SCALE_OPTIONS = [
  { value: 1.067, label: "小二度 (1.067)" },
  { value: 1.1, label: "1.100" },
  { value: 1.125, label: "大二度 (1.125)" },
  { value: 1.15, label: "1.150" },
  { value: 1.175, label: "1.175" },
  { value: 1.2, label: "小三度 (1.2)" },
  { value: 1.225, label: "1.225" },
  { value: 1.25, label: "大三度 (1.25)" },
  { value: 1.3, label: "1.300" },
  { value: 1.333, label: "纯四度 (1.333)" },
  { value: 1.375, label: "1.375" },
  { value: 1.414, label: "增四度 (1.414)" },
];

const TYPE_WEIGHT_OPTIONS = [
  { value: 300, label: "300（细）" },
  { value: 400, label: "400（常规）" },
  { value: 450, label: "450（书写感）" },
  { value: 500, label: "500（中等）" },
  { value: 600, label: "600（半粗）" },
  { value: 700, label: "700（加粗）" },
  { value: 800, label: "800（特粗）" },
];

const STYLE_ROLE_ITEMS: Array<{ key: keyof SiteStyleKit["roles"]; label: string; note: string }> = [
  { key: "pageBg", label: "页面背景", note: "整页底色" },
  { key: "sectionBg", label: "区块背景", note: "首屏和重点区" },
  { key: "cardBg", label: "内容背景", note: "卡片与表格" },
  { key: "text", label: "正文文字", note: "主要阅读文字" },
  { key: "mutedText", label: "辅助文字", note: "说明和弱信息" },
  { key: "link", label: "普通链接", note: "外链/资源链接" },
  { key: "internalLink", label: "内链颜色", note: "站内推荐链接" },
  { key: "primaryButtonBg", label: "主按钮背景", note: "主要行动按钮" },
  { key: "primaryButtonText", label: "主按钮文字", note: "按钮文字可读性" },
  { key: "ctaBg", label: "行动区背景", note: "转化区底色" },
];

const STYLE_ROLE_USAGE: Record<keyof SiteStyleKit["roles"], string> = {
  pageBg: "影响整页底色和预览外层背景。",
  sectionBg: "影响首屏、重点区块和大型横幅。",
  cardBg: "影响卡片、表格和内容容器。",
  text: "影响标题下方正文、导航和主要阅读文字。",
  mutedText: "影响说明、辅助信息和弱提示文字。",
  link: "影响外链、按钮描边和普通可点击文字。",
  internalLink: "影响站内推荐、内容内链和小型强调文字。",
  primaryButtonBg: "影响主行动按钮背景，也会作为默认品牌主色。",
  primaryButtonText: "影响主行动按钮上的文字颜色。",
  ctaBg: "影响底部转化区、提醒区和重点行动区域。",
};

type BrandColorToken = {
  id: string;
  name: string;
  usage: string;
  color: string;
  fallbackRole: keyof SiteStyleKit["roles"];
  roleKeys: Array<keyof SiteStyleKit["roles"]>;
  colorKeys: string[];
};

type HslColor = {
  h: number;
  s: number;
  l: number;
};

type ContrastPair = {
  id: string;
  foreground: BrandColorToken;
  background: BrandColorToken;
  ratio: number;
  label: string;
  tone: "excellent" | "good" | "large" | "fail";
};

const BRAND_COLOR_TOKEN_DEFS: Array<Omit<BrandColorToken, "color">> = [
  {
    id: "primary-brand-1",
    name: "品牌主色 1",
    usage: "主按钮、激活状态和核心品牌强调色。",
    fallbackRole: "primaryButtonBg",
    roleKeys: ["primaryButtonBg"],
    colorKeys: ["primary"],
  },
  {
    id: "primary-brand-2",
    name: "品牌主色 2",
    usage: "链接、描边和更强的品牌强调。",
    fallbackRole: "link",
    roleKeys: ["link"],
    colorKeys: ["primaryDark"],
  },
  {
    id: "primary-light-1",
    name: "浅色背景 1",
    usage: "页面主背景和最浅画布。",
    fallbackRole: "pageBg",
    roleKeys: ["pageBg"],
    colorKeys: ["primaryLight1"],
  },
  {
    id: "primary-light-2",
    name: "浅色背景 2",
    usage: "首屏和区块背景。",
    fallbackRole: "sectionBg",
    roleKeys: ["sectionBg"],
    colorKeys: ["primaryLight2"],
  },
  {
    id: "primary-light-3",
    name: "浅色背景 3",
    usage: "CTA 面板和柔和高亮区域。",
    fallbackRole: "ctaBg",
    roleKeys: ["ctaBg"],
    colorKeys: ["primaryLight3"],
  },
  {
    id: "primary-dark-1",
    name: "深色文字 1",
    usage: "H1、H2、导航和主要阅读文字。",
    fallbackRole: "text",
    roleKeys: ["text"],
    colorKeys: ["primaryDark1", "neutral"],
  },
  {
    id: "primary-dark-2",
    name: "深色文字 2",
    usage: "正文、描述、说明和辅助文字。",
    fallbackRole: "mutedText",
    roleKeys: ["mutedText"],
    colorKeys: ["primaryDark2"],
  },
  {
    id: "primary-dark-3",
    name: "深色强调 3",
    usage: "内部链接、标签和小型证明标记。",
    fallbackRole: "internalLink",
    roleKeys: ["internalLink"],
    colorKeys: ["primaryDark3"],
  },
];

const BRAND_PRESET_COLORS = [
  "#4444ee",
  "#1f1fc1",
  "#0f172a",
  "#f8fafc",
  "#ffffff",
  "#0f766e",
  "#2563eb",
  "#ea580c",
  "#16a34a",
  "#dc2626",
];

const STYLE_COLOR_LABELS: Record<string, string> = {
  primary: "当前主色",
  secondary: "辅助色",
  accent: "强调色",
  neutral: "深文字色",
};

const formatBrandColorCandidateLabel = (key: string) => {
  if (STYLE_COLOR_LABELS[key]) return STYLE_COLOR_LABELS[key];
  const logoMatch = key.match(/^logo(\d+)$/i);
  if (logoMatch) return `Logo 候选 ${logoMatch[1]}`;
  return key;
};

const normalizeHex = (value: string, fallback = "#1476d8") => {
  const clean = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) return clean.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(clean)) {
    return `#${clean.slice(1).split("").map(ch => ch + ch).join("")}`.toLowerCase();
  }
  return fallback;
};

const rgbToHex = (r: number, g: number, b: number) => (
  `#${[r, g, b].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`
);

const formatHexForUi = (value: string) => normalizeHex(value).toUpperCase();

const getBrandColorTokens = (styleKit: SiteStyleKit): BrandColorToken[] => (
  BRAND_COLOR_TOKEN_DEFS.map(def => {
    const colorFromPalette = def.colorKeys.map(key => styleKit.colors?.[key]).find(Boolean);
    const fallback = styleKit.roles[def.fallbackRole];
    return {
      ...def,
      color: normalizeHex(colorFromPalette || fallback, fallback),
    };
  })
);

const hexToRgb = (value: string, fallback = "#000000") => {
  const hex = normalizeHex(value, fallback).slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
};

const hexToHsl = (value: string): HslColor => {
  const { r, g, b } = hexToRgb(value);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;

  if (delta) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    if (max === bn) h = 60 * ((rn - gn) / delta + 4);
  }

  return {
    h: Math.round((h + 360) % 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

const hslToHex = ({ h, s, l }: HslColor) => {
  const hue = ((Math.round(h) % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
};

const relativeLuminance = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  const transform = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
};

const contrastRatio = (foreground: string, background: string) => {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
};

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));

const DERIVED_PRIMARY_TOKEN_KEYS: Record<string, keyof ReturnType<typeof derivePrimaryPalette>> = {
  "primary-brand-1": "primary",
  "primary-brand-2": "primaryDark",
  "primary-light-1": "primaryLight1",
  "primary-light-2": "primaryLight2",
  "primary-light-3": "primaryLight3",
  "primary-dark-1": "primaryDark1",
  "primary-dark-2": "primaryDark2",
  "primary-dark-3": "primaryDark3",
};

function derivePrimaryPalette(baseColor: string) {
  const base = normalizeHex(baseColor);
  const baseHsl = hexToHsl(base);
  const strongSaturation = clampNumber(baseHsl.s || 64, 38, 88);
  const lightSaturation = clampNumber(strongSaturation * 0.32, 16, 48);
  const midSaturation = clampNumber(strongSaturation * 0.46, 24, 62);
  const darkSaturation = clampNumber(strongSaturation * 0.78, 40, 86);
  const brandDarkLightness = clampNumber(baseHsl.l - 18, 20, 42);
  const primaryDark1 = hslToHex({ h: baseHsl.h, s: darkSaturation, l: 22 });
  const buttonText = contrastRatio("#ffffff", base) >= contrastRatio(primaryDark1, base) ? "#ffffff" : primaryDark1;

  return {
    primary: base,
    primaryDark: hslToHex({ h: baseHsl.h, s: clampNumber(strongSaturation * 0.95, 44, 90), l: brandDarkLightness }),
    primaryLight1: hslToHex({ h: baseHsl.h, s: lightSaturation, l: 98 }),
    primaryLight2: hslToHex({ h: baseHsl.h, s: midSaturation, l: 94 }),
    primaryLight3: hslToHex({ h: baseHsl.h, s: clampNumber(midSaturation + 8, 28, 72), l: 86 }),
    primaryDark1,
    primaryDark2: hslToHex({ h: baseHsl.h, s: clampNumber(darkSaturation - 8, 32, 78), l: 34 }),
    primaryDark3: hslToHex({ h: baseHsl.h, s: clampNumber(darkSaturation - 16, 26, 68), l: 46 }),
    buttonText,
  };
}

const applyDerivedPrimaryPalette = (
  styleKit: SiteStyleKit,
  primaryColor: string,
  lockedTokenIds: string[],
): SiteStyleKit => {
  const palette = derivePrimaryPalette(primaryColor);
  const locked = new Set(lockedTokenIds);
  const nextColors = { ...styleKit.colors };
  const nextRoles = { ...styleKit.roles };

  BRAND_COLOR_TOKEN_DEFS.forEach(def => {
    const paletteKey = DERIVED_PRIMARY_TOKEN_KEYS[def.id];
    if (!paletteKey || locked.has(def.id)) return;
    const next = palette[paletteKey];
    def.colorKeys.forEach(key => {
      nextColors[key] = next;
    });
    def.roleKeys.forEach(key => {
      nextRoles[key] = next;
    });
  });

  if (!locked.has("primary-brand-1")) {
    nextRoles.primaryButtonText = palette.buttonText;
  }

  return {
    ...styleKit,
    colors: nextColors,
    roles: nextRoles,
  };
};

const describeContrast = (ratio: number): Pick<ContrastPair, "label" | "tone"> => {
  if (ratio >= 7) return { label: "可读性优秀", tone: "excellent" };
  if (ratio >= 4.5) return { label: "对比度良好", tone: "good" };
  if (ratio >= 3) return { label: "仅适合大字", tone: "large" };
  return { label: "需要调整", tone: "fail" };
};

const buildContrastPairs = (tokens: BrandColorToken[]): ContrastPair[] => {
  const byId = new Map(tokens.map(token => [token.id, token]));
  const pairs = [
    ["primary-dark-1", "primary-light-1"],
    ["primary-brand-2", "primary-light-1"],
    ["primary-dark-1", "primary-light-2"],
    ["primary-brand-1", "primary-light-1"],
    ["primary-light-1", "primary-brand-1"],
    ["primary-light-1", "primary-dark-1"],
  ];

  return pairs.flatMap(([foregroundId, backgroundId]) => {
    const foreground = byId.get(foregroundId);
    const background = byId.get(backgroundId);
    if (!foreground || !background) return [];
    const ratio = contrastRatio(foreground.color, background.color);
    const contrast = describeContrast(ratio);
    return [{
      id: `${foreground.id}-on-${background.id}`,
      foreground,
      background,
      ratio,
      ...contrast,
    }];
  });
};

const typographyScale = (baseSize: number, ratio: number, lineHeight: number) => ({
  h1: Math.round(baseSize * Math.pow(ratio, 4)),
  h2: Math.round(baseSize * Math.pow(ratio, 3)),
  h3: Math.round(baseSize * Math.pow(ratio, 2)),
  body: Math.round(baseSize),
  lineHeight,
});

const withTypographyScale = (kit: SiteStyleKit): SiteStyleKit => ({
  ...kit,
  typography: {
    ...kit.typography,
    desktop: typographyScale(kit.typography.baseSize, kit.typography.desktopScale, kit.typography.desktop.lineHeight),
    mobile: typographyScale(kit.typography.baseSize, kit.typography.mobileScale, kit.typography.mobile.lineHeight),
  },
});

const extractLogoPalette = async (file: File): Promise<string[]> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("Logo 读取失败"));
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error("Logo 图片解析失败"));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 72;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve([]);
        return;
      }
      context.drawImage(img, 0, 0, size, size);
      const data = context.getImageData(0, 0, size, size).data;
      const buckets = new Map<string, number>();
      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        if (alpha < 128) continue;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        if (r > 244 && g > 244 && b > 244) continue;
        if (r < 12 && g < 12 && b < 12) continue;
        const hex = rgbToHex(Math.round(r / 16) * 16, Math.round(g / 16) * 16, Math.round(b / 16) * 16);
        buckets.set(hex, (buckets.get(hex) || 0) + 1);
      }
      resolve([...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([hex]) => hex));
    };
    img.src = String(reader.result || "");
  };
  reader.readAsDataURL(file);
});

const compactFontFamily = (font: string) => `${font}, "Noto Sans SC", ui-sans-serif, system-ui, sans-serif`;

const TokenTooltip: React.FC<{ token?: BrandColorToken; detail: string }> = ({ token, detail }) => {
  if (!token) return null;
  return (
    <span className="brand-token-tooltip" aria-hidden="true">
      <span className="brand-token-tooltip__swatch" style={{ background: token.color }} />
      <span>
        <strong>{token.name}</strong>
        <small>{formatHexForUi(token.color)}</small>
        <small>{detail}</small>
      </span>
    </span>
  );
};

const StylePreview: React.FC<{
  styleKit: SiteStyleKit;
  view: "desktop" | "mobile";
  preset: BrandPreviewPreset;
  tokens: BrandColorToken[];
  themeMode: BrandPreviewTheme;
}> = ({
  styleKit,
  view,
  preset,
  tokens,
  themeMode,
}) => {
  const scale = styleKit.typography[view];
  const copy = BRAND_PREVIEW_COPY[preset];
  const token = (id: string) => tokens.find(item => item.id === id);
  const brand1 = token("primary-brand-1");
  const brand2 = token("primary-brand-2");
  const light1 = token("primary-light-1");
  const light2 = token("primary-light-2");
  const light3 = token("primary-light-3");
  const dark1 = token("primary-dark-1");
  const dark2 = token("primary-dark-2");
  const dark3 = token("primary-dark-3");
  const isDark = themeMode === "dark";
  const pageToken = isDark ? dark1 : light1;
  const sectionToken = isDark ? dark3 : light2;
  const cardToken = isDark ? dark2 : light1;
  const textToken = isDark ? light1 : dark1;
  const mutedToken = isDark ? light2 : dark2;
  const subtleToken = isDark ? dark2 : light3;
  const internalToken = isDark ? light3 : dark3;
  const heroFontSize = view === "desktop" ? Math.min(Math.max(scale.h1, 42), 56) : Math.min(Math.max(scale.h1, 30), 40);
  const bodyFontSize = Math.min(Math.max(scale.body + 2, 16), 18);
  const h2FontSize = Math.min(scale.h2, 36);
  const h3FontSize = Math.min(scale.h3, 24);
  const pageBg = pageToken?.color || (isDark ? styleKit.roles.text : styleKit.roles.pageBg);
  const sectionBg = sectionToken?.color || (isDark ? styleKit.roles.internalLink : styleKit.roles.sectionBg);
  const cardBg = cardToken?.color || (isDark ? styleKit.roles.mutedText : styleKit.roles.cardBg);
  const textColor = textToken?.color || (isDark ? styleKit.roles.pageBg : styleKit.roles.text);
  const mutedColor = mutedToken?.color || (isDark ? styleKit.roles.sectionBg : styleKit.roles.mutedText);
  const borderColor = subtleToken?.color || styleKit.roles.ctaBg;
  const previewStyle = {
    "--brand-preview-page-bg": pageBg,
    "--brand-preview-section-bg": sectionBg,
    "--brand-preview-card-bg": isDark ? `color-mix(in srgb, ${cardBg} 78%, ${pageBg})` : cardBg,
    "--brand-preview-text": textColor,
    "--brand-preview-muted": mutedColor,
    "--brand-preview-brand": brand1?.color || styleKit.roles.primaryButtonBg,
    "--brand-preview-brand-strong": brand2?.color || styleKit.roles.link,
    "--brand-preview-brand-soft": subtleToken?.color || styleKit.roles.ctaBg,
    "--brand-preview-internal": internalToken?.color || styleKit.roles.internalLink,
    "--brand-preview-border": isDark ? `color-mix(in srgb, ${borderColor} 30%, transparent)` : borderColor,
    "--brand-preview-cta-bg": isDark ? `color-mix(in srgb, ${sectionBg} 82%, ${pageBg})` : light3?.color || styleKit.roles.ctaBg,
    "--brand-preview-button-text": styleKit.roles.primaryButtonText,
    "--brand-preview-tooltip-bg": isDark ? textColor : "#ffffff",
    "--brand-preview-tooltip-text": isDark ? pageBg : textColor,
    "--brand-preview-tooltip-muted": isDark ? sectionBg : mutedColor,
    fontFamily: compactFontFamily(styleKit.typography.bodyFont),
    fontWeight: styleKit.typography.bodyWeight,
  } as React.CSSProperties;
  const headingStyle = {
    fontFamily: compactFontFamily(styleKit.typography.headingFont),
    fontWeight: styleKit.typography.headingWeight,
    lineHeight: 1.08,
  };
  const primaryButtonStyle = {
    minHeight: Math.max(styleKit.buttons.height, 46),
    borderRadius: styleKit.buttons.radius,
    fontWeight: styleKit.buttons.fontWeight,
    background: "var(--brand-preview-brand)",
    color: "var(--brand-preview-button-text)",
  } as React.CSSProperties;
  const secondaryButtonStyle = {
    minHeight: Math.max(styleKit.buttons.height, 46),
    borderRadius: styleKit.buttons.radius,
    color: "var(--brand-preview-brand-strong)",
    borderColor: "var(--brand-preview-brand-strong)",
    fontWeight: styleKit.buttons.fontWeight,
  } as React.CSSProperties;

  return (
    <div className={`brand-live-preview brand-live-preview--${view} brand-live-preview--${themeMode}`} style={previewStyle}>
      <section className={`brand-reference-hero brand-reference-hero--${preset}`}>
        <nav className="brand-reference-nav">
          <div className="brand-reference-brand brand-token-anchor">
            <IconPalette className="size-5" />
            <strong>{copy.brandName}</strong>
            <TokenTooltip token={brand2} detail="Logo and navigation accent" />
          </div>
          <div className="brand-reference-links">
            {copy.nav.map(item => (
              <span key={item} className="brand-token-anchor brand-token-anchor--text">
                {item}
                <TokenTooltip token={brand2} detail="Navigation link color" />
              </span>
            ))}
          </div>
          {copy.navCta && (
            <Button
              className="brand-reference-nav-cta brand-token-anchor"
              style={{
                minHeight: Math.max(styleKit.buttons.height, 44),
                borderRadius: styleKit.buttons.radius,
                color: "var(--brand-preview-text)",
                borderColor: "var(--brand-preview-brand-strong)",
                fontWeight: styleKit.buttons.fontWeight,
              }}
            >
              {copy.navCta}
              <TokenTooltip token={brand2} detail="Outlined button border and text" />
            </Button>
          )}
        </nav>

        <div className="brand-reference-hero-copy">
          {copy.kicker && (
            <p className="brand-reference-kicker brand-token-anchor">
              {copy.kicker}
              <TokenTooltip token={mutedToken} detail="Eyebrow, date, and muted copy" />
            </p>
          )}
          <h1 className="brand-token-anchor" style={{ ...headingStyle, fontSize: heroFontSize }}>
            {copy.title}
            <TokenTooltip token={textToken} detail={`H1, ${heroFontSize}px, ${styleKit.typography.headingWeight} weight`} />
          </h1>
          {copy.description && (
            <p className="brand-token-anchor" style={{ fontSize: bodyFontSize, lineHeight: scale.lineHeight }}>
              {copy.description}
              <TokenTooltip token={mutedToken} detail={`Body copy, ${bodyFontSize}px, ${styleKit.typography.bodyWeight} weight`} />
            </p>
          )}
          {(copy.primaryAction || copy.secondaryAction) && (
            <div className="brand-reference-actions">
              {copy.primaryAction && (
                <Button className="brand-token-anchor" style={primaryButtonStyle}>
                  {copy.primaryAction}
                  <TokenTooltip token={brand1} detail="Primary button background" />
                </Button>
              )}
              {copy.secondaryAction && (
                <Button className="brand-token-anchor" style={secondaryButtonStyle}>
                  {copy.secondaryAction}
                  <TokenTooltip token={brand2} detail="Secondary button border and text" />
                </Button>
              )}
            </div>
          )}
        </div>

        {copy.heroMetrics && (
          <div className="brand-reference-hero-visual brand-token-anchor" aria-label="Dashboard preview">
            <div className="brand-reference-hero-stats">
              {copy.heroMetrics.map(metric => (
                <article key={metric.label}>
                  <span>{metric.label}</span>
                  <strong style={headingStyle}>{metric.value}</strong>
                  {metric.trend && <small>{metric.trend}</small>}
                </article>
              ))}
            </div>
            <div className="brand-reference-hero-chart">
              <strong>Performance Overview</strong>
              {Array.from({ length: 12 }).map((_, index) => (
                <i key={index} />
              ))}
            </div>
            <TokenTooltip token={subtleToken} detail="Hero dashboard surface, chart bars, and soft panels" />
          </div>
        )}
      </section>

      {copy.metricsSection && (
        <section className="brand-reference-section brand-reference-trust">
          <h2 className="brand-token-anchor brand-token-anchor--text" style={{ ...headingStyle, fontSize: h2FontSize }}>
            {copy.metricsSection.title}
            <TokenTooltip token={textToken} detail="Metric section heading color" />
          </h2>
          <div>
            {copy.metricsSection.items.map(metric => (
              <article key={metric.label} className="brand-token-anchor">
                <strong style={headingStyle}>{metric.value}</strong>
                <h3 style={{ ...headingStyle, fontSize: h3FontSize }}>{metric.label}</h3>
                {metric.detail && <p>{metric.detail}</p>}
                <TokenTooltip token={brand2} detail="Metric value and compact emphasis" />
              </article>
            ))}
          </div>
        </section>
      )}

      {copy.servicesSection && (
        <section className="brand-reference-section">
          {copy.servicesSection.eyebrow && (
            <p className="brand-reference-kicker brand-token-anchor brand-token-anchor--text">
              {copy.servicesSection.eyebrow}
              <TokenTooltip token={mutedToken} detail="Section eyebrow and muted text" />
            </p>
          )}
          <h2 className="brand-token-anchor brand-token-anchor--text" style={{ ...headingStyle, fontSize: h2FontSize }}>
            {copy.servicesSection.title}
            <TokenTooltip token={textToken} detail="Section heading color" />
          </h2>
          <div className="brand-reference-services">
            {copy.servicesSection.items.map(card => (
              <article key={card.title} className="brand-token-anchor">
                {card.label && <span>{card.label}</span>}
                <h3 style={{ ...headingStyle, fontSize: h3FontSize }}>{card.title}</h3>
                {card.body && <p>{card.body}</p>}
                <TokenTooltip token={internalToken} detail="Card labels and internal emphasis" />
              </article>
            ))}
          </div>
        </section>
      )}

      {copy.workSection && (
        <section className="brand-reference-section">
          <div className="brand-reference-section__heading-row">
            <h2 className="brand-token-anchor brand-token-anchor--text" style={{ ...headingStyle, fontSize: h2FontSize }}>
              {copy.workSection.title}
              <TokenTooltip token={textToken} detail="Work section heading color" />
            </h2>
            {copy.workSection.action && (
              <a href="#" className="brand-token-anchor brand-token-anchor--text">
                {copy.workSection.action}
                <TokenTooltip token={brand2} detail="Inline link color" />
              </a>
            )}
          </div>
          <div className="brand-reference-work-grid">
            {copy.workSection.items.map(item => (
              <article key={item.title} className="brand-token-anchor">
                {item.label && <span>{item.label}</span>}
                <h3 style={{ ...headingStyle, fontSize: h3FontSize }}>{item.title}</h3>
                {item.body && <p>{item.body}</p>}
                {item.result && <strong>{item.result}</strong>}
                <TokenTooltip token={cardToken} detail="Portfolio and case-study card surface" />
              </article>
            ))}
          </div>
        </section>
      )}

      {copy.aboutSection && (
        <section className="brand-reference-about">
          <h2 className="brand-token-anchor brand-token-anchor--text" style={{ ...headingStyle, fontSize: h2FontSize }}>
            {copy.aboutSection.title}
            <TokenTooltip token={textToken} detail="About heading color" />
          </h2>
          <div className="brand-token-anchor brand-token-anchor--block">
            {copy.aboutSection.paragraphs.map(paragraph => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <TokenTooltip token={mutedToken} detail="Long-form paragraph color and rhythm" />
          </div>
          {copy.aboutSection.action && (
            <Button className="brand-token-anchor" style={primaryButtonStyle}>
              {copy.aboutSection.action}
              <TokenTooltip token={brand1} detail="About section button background" />
            </Button>
          )}
        </section>
      )}

      {copy.statsSection && (
        <section className="brand-reference-stats">
          {copy.statsSection.items.map(metric => (
            <article key={metric.label} className="brand-token-anchor">
              <strong style={headingStyle}>{metric.value}</strong>
              <span>{metric.label}</span>
              <TokenTooltip token={brand2} detail="Stat value emphasis" />
            </article>
          ))}
        </section>
      )}

      {copy.categorySection && (
        <section className="brand-reference-section">
          <h2 className="brand-token-anchor brand-token-anchor--text" style={{ ...headingStyle, fontSize: h2FontSize }}>
            {copy.categorySection.title}
            <TokenTooltip token={textToken} detail="Category heading color" />
          </h2>
          <div className="brand-reference-commerce-grid">
            {copy.categorySection.items.map(item => (
              <article key={item.title} className="brand-token-anchor">
                <h3 style={{ ...headingStyle, fontSize: h3FontSize }}>{item.title}</h3>
                <p>{item.count}</p>
                <TokenTooltip token={cardToken} detail="Category card surface and text" />
              </article>
            ))}
          </div>
        </section>
      )}

      {copy.productSection && (
        <section className="brand-reference-section">
          <div className="brand-reference-section__heading-row">
            <h2 className="brand-token-anchor brand-token-anchor--text" style={{ ...headingStyle, fontSize: h2FontSize }}>
              {copy.productSection.title}
              <TokenTooltip token={textToken} detail="Product section heading color" />
            </h2>
            {copy.productSection.action && (
              <a href="#" className="brand-token-anchor brand-token-anchor--text">
                {copy.productSection.action}
                <TokenTooltip token={brand2} detail="Inline link color" />
              </a>
            )}
          </div>
          <div className="brand-reference-product-grid">
            {copy.productSection.items.map(item => (
              <article key={item.title} className="brand-token-anchor">
                <div className="brand-reference-product-image" />
                <h3 style={{ ...headingStyle, fontSize: h3FontSize }}>{item.title}</h3>
                <span>{item.rating}</span>
                <strong>{item.price}</strong>
                <TokenTooltip token={subtleToken} detail="Product image block and card surface" />
              </article>
            ))}
          </div>
        </section>
      )}

      {copy.articleSection && (
        <section className="brand-reference-section">
          <h2 className="brand-token-anchor brand-token-anchor--text" style={{ ...headingStyle, fontSize: h2FontSize }}>
            {copy.articleSection.title}
            <TokenTooltip token={textToken} detail="Article list heading color" />
          </h2>
          <div className="brand-reference-article-list">
            {copy.articleSection.items.map(item => (
              <article key={item.title} className="brand-token-anchor">
                <span>{item.category}</span>
                <small>{item.date}</small>
                <h3 style={{ ...headingStyle, fontSize: h3FontSize }}>{item.title}</h3>
                <TokenTooltip token={cardToken} detail="Article row surface and metadata" />
              </article>
            ))}
          </div>
        </section>
      )}

      {copy.testimonialSection && (
        <section className="brand-reference-testimonial">
          <h2 className="brand-token-anchor brand-token-anchor--text" style={{ ...headingStyle, fontSize: h2FontSize }}>
            {copy.testimonialSection.title}
            <TokenTooltip token={textToken} detail="Testimonial heading color" />
          </h2>
          <h3 style={{ ...headingStyle, fontSize: h3FontSize }}>{copy.testimonialSection.company}</h3>
          <blockquote className="brand-token-anchor" style={{ ...headingStyle, fontSize: Math.min(Math.max(scale.h3, 22), 28) }}>
            "{copy.testimonialSection.quote}"
            <TokenTooltip token={textToken} detail="Large testimonial text" />
          </blockquote>
          <div className="brand-token-anchor brand-token-anchor--text">
            <strong>{copy.testimonialSection.name}</strong>
            <span>{copy.testimonialSection.role}</span>
            <TokenTooltip token={mutedToken} detail="Testimonial author and role text" />
          </div>
        </section>
      )}

      {copy.stripItems && (
        <section className="brand-reference-strip">
          {copy.stripItems.map(item => (
            <p key={item} className="brand-token-anchor brand-token-anchor--text">
              {item}
              <TokenTooltip token={internalToken} detail="Compact benefit text emphasis" />
            </p>
          ))}
        </section>
      )}

      {copy.benefitsSection && (
        <section className="brand-reference-section brand-reference-trust">
          <h2 className="brand-token-anchor brand-token-anchor--text" style={{ ...headingStyle, fontSize: h2FontSize }}>
            {copy.benefitsSection.title}
            <TokenTooltip token={textToken} detail="Benefit section heading color" />
          </h2>
          <div>
            {copy.benefitsSection.items.map(benefit => (
              <article key={benefit.title} className="brand-token-anchor">
                <h3 style={{ ...headingStyle, fontSize: h3FontSize }}>{benefit.title}</h3>
                {benefit.body && <p>{benefit.body}</p>}
                <TokenTooltip token={cardToken} detail="Card surface and body copy area" />
              </article>
            ))}
          </div>
        </section>
      )}

      {copy.pricingSection && (
        <section className="brand-reference-section">
          <h2 className="brand-token-anchor brand-token-anchor--text" style={{ ...headingStyle, fontSize: h2FontSize }}>
            {copy.pricingSection.title}
            <TokenTooltip token={textToken} detail="Pricing heading color" />
          </h2>
          <p className="brand-token-anchor brand-token-anchor--block">
            {copy.pricingSection.subtitle}
            <TokenTooltip token={mutedToken} detail="Pricing subtitle color" />
          </p>
          <div className="brand-reference-pricing">
            {copy.pricingSection.items.map(plan => (
              <article key={plan.name} className={`${plan.highlight ? "is-highlighted" : ""} brand-token-anchor`}>
                {plan.highlight && <span>Most Popular</span>}
                <h3 style={{ ...headingStyle, fontSize: h3FontSize }}>{plan.name}</h3>
                <strong style={headingStyle}>{plan.price}</strong>
                <p>{plan.detail}</p>
                <ul>
                  {plan.features.map(feature => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Button style={plan.highlight ? primaryButtonStyle : secondaryButtonStyle}>{plan.action}</Button>
                <TokenTooltip token={plan.highlight ? brand1 : cardToken} detail="Pricing card surface and emphasis" />
              </article>
            ))}
          </div>
        </section>
      )}

      {copy.faqSection && (
        <section className="brand-reference-faq">
          <div className="brand-reference-faq__intro">
            <h2 className="brand-token-anchor brand-token-anchor--text" style={{ ...headingStyle, fontSize: h2FontSize }}>
              {copy.faqSection.title}
              <TokenTooltip token={textToken} detail="FAQ heading color" />
            </h2>
            <p className="brand-token-anchor brand-token-anchor--block">
              {copy.faqSection.intro}
              <TokenTooltip token={mutedToken} detail="FAQ intro text" />
            </p>
          </div>
          <div className="brand-reference-faq__items">
            {copy.faqSection.items.map(item => (
              <article key={item.question} className="brand-token-anchor">
                <h3 style={{ ...headingStyle, fontSize: h3FontSize }}>{item.question}</h3>
                <p>{item.answer}</p>
                <TokenTooltip token={cardToken} detail="FAQ card background and border" />
              </article>
            ))}
          </div>
        </section>
      )}

      {copy.finalCta && (
        <section className="brand-reference-final-cta">
          <div>
            <h2 className="brand-token-anchor brand-token-anchor--text" style={{ ...headingStyle, fontSize: h2FontSize }}>
              {copy.finalCta.title}
              <TokenTooltip token={textToken} detail="Final CTA heading color" />
            </h2>
            <p className="brand-token-anchor brand-token-anchor--block">
              {copy.finalCta.body}
              <TokenTooltip token={mutedToken} detail="Final CTA supporting copy" />
            </p>
          </div>
          <Button className="brand-token-anchor" style={primaryButtonStyle}>
            {copy.finalCta.action}
            <TokenTooltip token={brand1} detail="Final CTA button background" />
          </Button>
        </section>
      )}

      <footer className="brand-reference-footer">
        <div className="brand-reference-footer__brand brand-token-anchor">
          <IconPalette className="size-5" />
          <strong>{copy.footer.brandName || copy.brandName}</strong>
          {copy.footer.description && <p>{copy.footer.description}</p>}
          {copy.footer.copyright && <span>{copy.footer.copyright}</span>}
          <TokenTooltip token={mutedToken} detail="Footer brand copy and muted text" />
        </div>
        {copy.footer.nav && (
          <nav className="brand-reference-footer__links brand-token-anchor" aria-label="Footer navigation">
            <strong>Navigation</strong>
            {copy.footer.nav.map(item => (
              <a key={item} href="#">{item}</a>
            ))}
            <TokenTooltip token={brand2} detail="Footer links" />
          </nav>
        )}
        {(copy.footer.support || copy.footer.contact || copy.footer.social) && (
          <div className="brand-reference-footer__contact brand-token-anchor">
            <strong>{copy.footer.support ? "Support" : copy.footer.contact ? "Contact" : "Links"}</strong>
            {(copy.footer.support || copy.footer.contact || copy.footer.social || []).map(item => (
              <span key={item}>{item}</span>
            ))}
            <TokenTooltip token={mutedToken} detail="Footer support text" />
          </div>
        )}
      </footer>
    </div>
  );
};

const ContrastPreview: React.FC<{
  styleKit: SiteStyleKit;
  view: "desktop" | "mobile";
  tokens: BrandColorToken[];
  onCopyColor: (value: string) => void;
}> = ({ styleKit, view, tokens, onCopyColor }) => {
  const pairs = buildContrastPairs(tokens);
  const scale = styleKit.typography[view];
  const headingStyle = {
    fontFamily: compactFontFamily(styleKit.typography.headingFont),
    fontWeight: styleKit.typography.headingWeight,
    lineHeight: 1.08,
  };

  return (
    <div className={`brand-contrast-preview brand-contrast-preview--${view}`} style={{ fontFamily: compactFontFamily(styleKit.typography.bodyFont) }}>
      <header className="brand-contrast-preview__header">
        <IconEye className="size-6" />
        <div>
          <h2 style={{ ...headingStyle, fontSize: Math.min(scale.h2, 32) }}>WCAG 2.1 对比度检查</h2>
          <p>检查文字和背景组合是否满足可访问性阅读要求。</p>
        </div>
      </header>
      <p className="brand-contrast-preview__eyebrow">主色板组合</p>
      <div className="brand-contrast-grid">
        {pairs.map(pair => (
          <article key={pair.id} className="brand-contrast-card">
            <div className="brand-contrast-card__status">
              <span className={`brand-contrast-badge brand-contrast-badge--${pair.tone}`}>
                WCAG: {pair.ratio.toFixed(2)}:1
              </span>
              <strong>{pair.label}</strong>
            </div>
            <div
              className="brand-contrast-card__sample"
              style={{ background: pair.background.color, color: pair.foreground.color }}
            >
              <h3 style={{ ...headingStyle, fontSize: Math.min(Math.max(scale.h3, 22), 28) }}>标题示例文字</h3>
              <p>这是一段正文示例，用来检查文字放在当前背景色上是否足够清晰、稳定、容易阅读。</p>
            </div>
            <div className="brand-contrast-card__colors">
              {[pair.background, pair.foreground].map(colorToken => (
                <div key={colorToken.id}>
                  <span style={{ background: colorToken.color }} />
                  <div>
                    <strong>{colorToken.name}</strong>
                    <button type="button" onClick={() => onCopyColor(colorToken.color)}>
                      {formatHexForUi(colorToken.color)} <IconCopy className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export const BrandStarterDashboard: React.FC<BrandStarterDashboardProps> = ({
  theme,
  backendUrl,
  activeProfile,
  onOpenSiteSettings,
  onRefreshProfiles,
}) => {
  const [styleKit, setStyleKit] = useState<SiteStyleKit>(() => defaultSiteStyleKit());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importEvidence, setImportEvidence] = useState<SiteStyleKitImportEvidence | null>(null);
  const [editorTab, setEditorTab] = useState<BrandEditorTab>("colors");
  const [previewPreset, setPreviewPreset] = useState<BrandPreviewPreset>("saas");
  const [previewView, setPreviewView] = useState<"desktop" | "mobile">("desktop");
  const [previewMode, setPreviewMode] = useState<BrandPreviewMode>("live");
  const [previewTheme, setPreviewTheme] = useState<BrandPreviewTheme>("light");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [selectedColorTokenId, setSelectedColorTokenId] = useState("primary-brand-1");
  const [lockedColorTokenIds, setLockedColorTokenIds] = useState<string[]>([]);
  const [hexDraft, setHexDraft] = useState("1476D8");
  const [selectedColorRole, setSelectedColorRole] = useState<keyof SiteStyleKit["roles"]>("primaryButtonBg");
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const next = withTypographyScale({ ...defaultSiteStyleKit(), ...(activeProfile?.styleKit || {}) });
    setStyleKit(next);
    setImportUrl(activeProfile?.siteUrl || "");
    setImportEvidence(null);
    setError("");
    setNotice("");
  }, [activeProfile?.id, activeProfile?.styleKit, activeProfile?.siteUrl]);

  const profileId = activeProfile?.id || "";
  const selectedRoleMeta = STYLE_ROLE_ITEMS.find(item => item.key === selectedColorRole) || STYLE_ROLE_ITEMS[0];
  const selectedRoleValue = styleKit.roles[selectedRoleMeta.key];
  const colorTokens = useMemo(() => getBrandColorTokens(styleKit), [styleKit]);
  const selectedColorToken = colorTokens.find(token => token.id === selectedColorTokenId) || colorTokens[0];
  const selectedTokenHsl = useMemo(() => hexToHsl(selectedColorToken.color), [selectedColorToken.color]);
  const selectedTokenLocked = lockedColorTokenIds.includes(selectedColorToken.id);

  useEffect(() => {
    setHexDraft(formatHexForUi(selectedColorToken.color).slice(1));
  }, [selectedColorToken.color, selectedColorToken.id]);

  const brandColorCandidates = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ color: string; label: string; source: string }> = [];
    const add = (color: string, label: string, source: string) => {
      const next = normalizeHex(color);
      if (seen.has(next)) return;
      seen.add(next);
      rows.push({ color: next, label, source });
    };
    Object.entries(styleKit.colors || {}).forEach(([key, color]) => {
      if (typeof color !== "string") return;
      add(color, formatBrandColorCandidateLabel(key), key.startsWith("logo") ? "Logo 提取" : "色板");
    });
    importEvidence?.colors?.forEach((item, index) => {
      add(item.value, `网站候选 ${index + 1}`, item.source || "网站抓取");
    });
    return rows;
  }, [importEvidence, styleKit.colors]);
  const colorPresetOptions = useMemo(
    () => Array.from(new Set([
      ...Object.values(styleKit.colors || {}),
      ...Object.values(styleKit.roles || {}),
      ...BRAND_PRESET_COLORS,
    ].map(value => normalizeHex(typeof value === "string" ? value : "")).filter(Boolean))),
    [styleKit.colors, styleKit.roles],
  );
  const editorTabMeta = BRAND_EDITOR_TABS.find(tab => tab.key === editorTab) || BRAND_EDITOR_TABS[0];
  const fontOptions = useMemo(
    () => FONT_PRESETS.map(font => ({ value: font.family, label: `${font.family} · ${font.tone}` })),
    [],
  );
  const typePreviewRows = useMemo(() => ([
    { label: "标题字号 1", weight: "加粗", desktop: styleKit.typography.desktop.h1, mobile: styleKit.typography.mobile.h1, preview: "桌面" },
    { label: "标题字号 2", weight: "加粗", desktop: styleKit.typography.desktop.h2, mobile: styleKit.typography.mobile.h2, preview: "标题" },
    { label: "标题字号 3", weight: "加粗", desktop: styleKit.typography.desktop.h3, mobile: styleKit.typography.mobile.h3, preview: "分区" },
    { label: "正文", weight: "常规", desktop: styleKit.typography.desktop.body, mobile: styleKit.typography.mobile.body, preview: "易读正文" },
  ]), [styleKit.typography.desktop, styleKit.typography.mobile]);

  const patchRole = (key: keyof SiteStyleKit["roles"], value: string) => {
    setStyleKit(prev => ({
      ...prev,
      colors: {
        ...prev.colors,
        ...(key === "primaryButtonBg" ? { primary: normalizeHex(value, prev.roles[key]) } : {}),
        ...(key === "internalLink" ? { accent: normalizeHex(value, prev.roles[key]) } : {}),
      },
      roles: {
        ...prev.roles,
        [key]: normalizeHex(value, prev.roles[key]),
      },
    }));
  };

  const selectColorToken = (token: BrandColorToken) => {
    setSelectedColorTokenId(token.id);
    setSelectedColorRole(token.roleKeys[0] || token.fallbackRole);
  };

  const selectColorRole = (key: keyof SiteStyleKit["roles"]) => {
    setSelectedColorRole(key);
    const mappedToken = colorTokens.find(token => token.roleKeys.includes(key));
    if (mappedToken) setSelectedColorTokenId(mappedToken.id);
  };

  const patchColorToken = (tokenId: string, value: string) => {
    if (lockedColorTokenIds.includes(tokenId)) {
      setNotice("这个 token 已锁定，先解锁再编辑。");
      return;
    }
    setStyleKit(prev => {
      const token = getBrandColorTokens(prev).find(item => item.id === tokenId);
      if (!token) return prev;
      const next = normalizeHex(value, token.color);
      if (tokenId === "primary-brand-1") {
        return applyDerivedPrimaryPalette(prev, next, lockedColorTokenIds);
      }
      const nextColors = { ...prev.colors };
      const nextRoles = { ...prev.roles };
      token.colorKeys.forEach(key => {
        nextColors[key] = next;
      });
      token.roleKeys.forEach(key => {
        nextRoles[key] = next;
      });
      return {
        ...prev,
        colors: nextColors,
        roles: nextRoles,
      };
    });
  };

  const patchSelectedTokenColor = (value: string | unknown[]) => {
    if (typeof value !== "string") return;
    patchColorToken(selectedColorToken.id, value);
  };

  const patchSelectedTokenHsl = (key: keyof HslColor, value: number | undefined) => {
    if (!Number.isFinite(Number(value))) return;
    const nextHsl = {
      ...selectedTokenHsl,
      [key]: key === "h" ? Math.max(0, Math.min(360, Number(value))) : Math.max(0, Math.min(100, Number(value))),
    };
    patchSelectedTokenColor(hslToHex(nextHsl));
  };

  const handleHexDraftChange = (value: string) => {
    const next = value.replace(/#/g, "").replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
    setHexDraft(next);
    if (/^[0-9A-F]{3}$/.test(next) || /^[0-9A-F]{6}$/.test(next)) {
      patchSelectedTokenColor(`#${next}`);
    }
  };

  const resetSelectedTokenColor = () => {
    const fallbackToken = getBrandColorTokens(defaultSiteStyleKit()).find(token => token.id === selectedColorToken.id);
    if (fallbackToken) patchSelectedTokenColor(fallbackToken.color);
  };

  const toggleTokenLock = (tokenId: string) => {
    setLockedColorTokenIds(prev => (
      prev.includes(tokenId) ? prev.filter(id => id !== tokenId) : [...prev, tokenId]
    ));
  };

  const patchSelectedRoleColor = (value: string | unknown[]) => {
    if (typeof value !== "string") return;
    patchRole(selectedRoleMeta.key, value);
  };

  const applyPrimaryBrandColor = (value: string) => {
    const next = normalizeHex(value, styleKit.roles.primaryButtonBg);
    setStyleKit(prev => applyDerivedPrimaryPalette(prev, next, lockedColorTokenIds));
    setSelectedColorRole("primaryButtonBg");
    setSelectedColorTokenId("primary-brand-1");
    setNotice(`已将 ${formatHexForUi(next)} 设为主色，并同步生成同一色系的浅色、深色、链接和按钮色。`);
  };

  const resetSelectedRoleColor = () => {
    const fallback = defaultSiteStyleKit();
    patchRole(selectedRoleMeta.key, fallback.roles[selectedRoleMeta.key]);
  };

  const patchTypography = (
    key: keyof SiteStyleKit["typography"],
    value: string | number,
  ) => {
    setStyleKit(prev => withTypographyScale({
      ...prev,
      typography: {
        ...prev.typography,
        [key]: typeof value === "number" ? value : value,
      },
    }));
  };

  const patchButton = (key: keyof SiteStyleKit["buttons"], value: number) => {
    if (!Number.isFinite(value)) return;
    setStyleKit(prev => ({
      ...prev,
      buttons: {
        ...prev.buttons,
        [key]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!profileId) return;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const saved = await saveSiteStyleKit(profileId, withTypographyScale(styleKit), backendUrl);
      setStyleKit(withTypographyScale(saved));
      setNotice("品牌规范已保存。博客、页面计划、WooCommerce 行动按钮会优先使用这套样式。");
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "品牌启动器"));
    } finally {
      setBusy("");
    }
  };

  const handleGenerate = async () => {
    if (!profileId) return;
    setBusy("generate");
    setError("");
    setNotice("");
    try {
      const generated = await generateSiteStyleKit(profileId, backendUrl);
      setStyleKit(withTypographyScale(generated));
      setNotice("已根据当前站点资料生成品牌草稿，请检查实时预览后保存。");
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "品牌启动器"));
    } finally {
      setBusy("");
    }
  };

  const handleImport = async () => {
    if (!profileId) return;
    setBusy("import");
    setError("");
    setNotice("");
    try {
      const imported = await importSiteStyleKit(profileId, importUrl, backendUrl);
      setStyleKit(withTypographyScale(imported.styleKit));
      setImportEvidence(imported.evidence);
      setNotice(imported.warnings.length ? `已抓取品牌草稿：${imported.warnings.join(" / ")}` : "已从网站样式抓取品牌色和字体草稿，保存前可继续调整。");
    } catch (err: any) {
      setError(formatUserFacingError(err, "品牌启动器"));
    } finally {
      setBusy("");
    }
  };

  const handleLogoUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy("logo");
    setError("");
    setNotice("");
    try {
      const colors = await extractLogoPalette(file);
      if (!colors.length) {
        setNotice("Logo 已读取，但没有识别到足够稳定的非黑白主色。");
        return;
      }
      setStyleKit(prev => {
        const primary = colors[0];
        const accent = colors[1] || prev.colors.accent;
        return {
          ...prev,
          colors: {
            ...prev.colors,
            primary,
            accent,
            logo1: primary,
            ...(colors[1] ? { logo2: colors[1] } : {}),
            ...(colors[2] ? { logo3: colors[2] } : {}),
          },
          roles: {
            ...prev.roles,
            link: primary,
            primaryButtonBg: primary,
            internalLink: accent,
          },
        };
      });
      setNotice(`已从 Logo 提取 ${colors.length} 个候选色，保存前可继续调整。`);
    } catch (err: any) {
      setError(formatUserFacingError(err, "品牌启动器"));
    } finally {
      setBusy("");
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };
  const handleLogoUploadFile = (file: File) => {
    void handleLogoUpload({
      0: file,
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
    } as unknown as FileList);
    return false;
  };

  const copyColor = async (value: string) => {
    await navigator.clipboard?.writeText(value);
    setNotice(`已复制颜色 ${value}`);
  };

  if (!activeProfile) {
    return (
      <div className="control-page flex-1 overflow-y-auto p-4 md:p-8">
        <section className="homepage-panel mx-auto max-w-5xl overflow-hidden">
          <div className="homepage-panel-body flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className={`flex items-center gap-2 text-lg font-bold ${theme.heading}`}>
                <IconSparkles className="size-5" /> 品牌启动器
              </h2>
              <p className={`mt-1 text-sm leading-6 ${theme.subText}`}>
                先创建或选择站点，再抓取网站、上传 Logo 或手动设置品牌色和字体。
              </p>
            </div>
            <Button variant="primary" onClick={onOpenSiteSettings}>创建或选择站点</Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="brand-starter control-page flex-1 overflow-y-auto" data-overflow-policy="y-scroll">
      <div className="brand-starter__header">
        <div className="brand-starter__title">
          <div className="brand-starter__logo">WS</div>
          <div>
            <h2 className={theme.heading}>网站样式规范 <span>品牌启动器</span></h2>
            <p className={theme.subText}>颜色、字体、按钮和网页预览</p>
          </div>
        </div>
        <div className="brand-starter__header-actions">
          <Button variant="outline" onClick={handleGenerate} disabled={Boolean(busy)}>
            <IconSparkles className="size-4" /> {busy === "generate" ? "生成中..." : "AI 生成"}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={Boolean(busy)}>
            <IconCheck className="size-4" /> {busy === "save" ? "保存中..." : "保存品牌"}
          </Button>
        </div>
      </div>

      {(error || notice) && (
        <div className={`brand-starter__notice ${error ? "brand-starter__notice--error" : ""}`}>
          {error || notice}
        </div>
      )}

      <div className="brand-starter__workspace">
        <section className="brand-starter__controls">
          <div className="brand-editor-shell">
              <div className="brand-editor-main">
                <div className="brand-editor-tabs">
                  {BRAND_EDITOR_TABS.map(tab => (
                    <button
                      key={tab.key}
                    type="button"
                    className={editorTab === tab.key ? "is-selected" : ""}
                      onClick={() => setEditorTab(tab.key)}
                    >
                      <strong>{tab.label}</strong>
                    </button>
                  ))}
                </div>

              {editorTab !== "colors" && (
                <div className="brand-editor-pane-title">
                  <div>
                    <p>样式编辑</p>
                    <h3>{editorTabMeta.label}</h3>
                  </div>
                  <span>{editorTabMeta.note}</span>
                </div>
              )}

              {editorTab === "colors" && (
                <div className="brand-editor-pane brand-editor-pane--colors">
                  <div className="brand-palette-workbench" data-testid="brand-primary-palette">
                    <div className="brand-palette-heading">
                      <h3>主色板</h3>
                      <p>正在编辑 {selectedColorToken.name} · {formatHexForUi(selectedColorToken.color)}</p>
                    </div>

                    <div className="brand-reference-color-editor">
                      <label className="brand-reference-hex-field">
                        <span>HEX 颜色</span>
                        <div>
                          <strong>#</strong>
                          <ArcoInput
                            value={hexDraft}
                            onChange={handleHexDraftChange}
                            onBlur={() => setHexDraft(formatHexForUi(selectedColorToken.color).slice(1))}
                            disabled={selectedTokenLocked}
                          />
                        </div>
                      </label>
                      <label className="brand-reference-pick-field">
                        <span>选择颜色</span>
                        <div>
                          <label className={`brand-system-color-trigger ${selectedTokenLocked ? "is-disabled" : ""}`}>
                            <span className="brand-system-color-trigger__swatch" style={{ background: selectedColorToken.color }} />
                            <span className="brand-system-color-trigger__copy">
                              <strong>{formatHexForUi(selectedColorToken.color)}</strong>
                              <small>打开调色盘</small>
                            </span>
                            <IconPalette className="size-4" />
                            <input
                              type="color"
                              value={formatHexForUi(selectedColorToken.color)}
                              onChange={event => patchSelectedTokenColor(event.currentTarget.value)}
                              disabled={selectedTokenLocked}
                              aria-label="打开调色盘选择颜色"
                            />
                          </label>
                          <Button size="icon" variant="outline" onClick={resetSelectedTokenColor} disabled={selectedTokenLocked}>
                            <IconRefresh className="size-5" />
                          </Button>
                        </div>
                      </label>
                    </div>

                    <div className="brand-hsl-control-list" data-testid="brand-hsl-controls">
                      {([
                        { key: "h", label: "色相", max: 360, suffix: "°" },
                        { key: "s", label: "饱和度", max: 100, suffix: "%" },
                        { key: "l", label: "明度", max: 100, suffix: "%" },
                      ] as Array<{ key: keyof HslColor; label: string; max: number; suffix: string }>).map(row => (
                        <label key={row.key} className={`brand-hsl-row brand-hsl-row--${row.key}`}>
                          <span>{row.label}</span>
                          <input
                            type="range"
                            min={0}
                            max={row.max}
                            value={selectedTokenHsl[row.key]}
                            onChange={event => patchSelectedTokenHsl(row.key, Number(event.currentTarget.value))}
                            disabled={selectedTokenLocked}
                          />
                          <ArcoInputNumber
                            min={0}
                            max={row.max}
                            value={selectedTokenHsl[row.key]}
                            onChange={value => patchSelectedTokenHsl(row.key, Number(value))}
                            suffix={row.suffix}
                            hideControl
                            disabled={selectedTokenLocked}
                          />
                        </label>
                      ))}
                    </div>

                    <div className="brand-token-grid" data-testid="brand-token-grid">
                      {colorTokens.map(token => {
                        const selected = token.id === selectedColorToken.id;
                        const locked = lockedColorTokenIds.includes(token.id);
                        return (
                          <article key={token.id} className={`brand-token-card ${selected ? "is-selected" : ""} ${locked ? "is-locked" : ""}`}>
                            <button type="button" className="brand-token-card__select" onClick={() => selectColorToken(token)}>
                              <span className="brand-token-card__swatch" style={{ background: token.color }} />
                              <span>
                                <strong>{token.name}</strong>
                                <small>{formatHexForUi(token.color)} · {token.usage}</small>
                              </span>
                            </button>
                            <div className="brand-token-card__actions">
                              <button type="button" onClick={() => selectColorToken(token)} aria-label={`编辑 ${token.name}`}>
                                <IconEdit />
                              </button>
                              <button type="button" onClick={() => toggleTokenLock(token.id)} aria-label={`${locked ? "解锁" : "锁定"} ${token.name}`}>
                                {locked ? <IconLock /> : <IconUnlock />}
                              </button>
                              <button type="button" onClick={() => void copyColor(token.color)} aria-label={`复制 ${token.name}`}>
                                <IconCopy className="size-4" />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <Button variant="outline" className="brand-secondary-palette-button" onClick={() => selectColorToken(colorTokens[1] || colorTokens[0])}>
                      添加辅助色板
                    </Button>
                  </div>

                  <details className="brand-source-compact">
                    <summary>
                      <span><IconImport className="size-4" /> 品牌来源</span>
                      <small>从网址抓取或上传 Logo</small>
                    </summary>
                    <div className="brand-source-grid">
                      <label className="brand-field brand-field--wide">
                        <span>站点 URL</span>
                        <div className="brand-source-row">
                          <ArcoInput value={importUrl} onChange={setImportUrl} placeholder="https://example.com" />
                          <Button variant="primary" size="sm" onClick={handleImport} disabled={Boolean(busy) || !importUrl.trim()}>
                            <IconRefresh className={`size-4 ${busy === "import" ? "animate-spin" : ""}`} /> 从网站抓取
                          </Button>
                        </div>
                      </label>
                      <div>
                        <ArcoUpload accept="image/*" showUploadList={false} beforeUpload={(file) => handleLogoUploadFile(file as File)}>
                          <Button variant="outline" disabled={Boolean(busy)}>
                            <IconUpload className="size-4" /> 上传 Logo
                          </Button>
                        </ArcoUpload>
                      </div>
                    </div>
                    {importEvidence && (
                      <div className="brand-evidence">
                        <span>证据来源：{importEvidence.sourceUrl}</span>
                        <span>{importEvidence.colors.length} 个颜色</span>
                        <span>{importEvidence.fonts.length} 个字体</span>
                      </div>
                    )}
                    <div className="brand-source-candidates" data-testid="brand-source-candidates">
                      <div className="brand-source-candidates__header">
                        <strong>标志 / 网站候选主色</strong>
                        <span>候选色保持紧凑，不再铺满编辑区；可以套用到当前 token。</span>
                      </div>
                      <div className="brand-source-candidate-strip" data-overflow-policy="x-scroll">
                        {brandColorCandidates.map(candidate => (
                          <div key={`${candidate.source}-${candidate.color}`} className="brand-source-candidate-pill">
                            <span style={{ background: candidate.color }} />
                            <strong>{formatHexForUi(candidate.color)}</strong>
                            <Button size="xs" variant="primary" onClick={() => applyPrimaryBrandColor(candidate.color)}>
                              设为主色
                            </Button>
                            <Button size="xs" variant="outline" onClick={() => patchSelectedTokenColor(candidate.color)}>
                              套用
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>

                  <details className="brand-role-mapping-panel" open>
                    <summary>
                      <span>角色映射</span>
                      <small>{selectedRoleMeta.label}: {STYLE_ROLE_USAGE[selectedRoleMeta.key]}</small>
                    </summary>
                    <div className="brand-color-role-grid" data-testid="brand-color-role-grid">
                      {STYLE_ROLE_ITEMS.map(item => {
                        const color = styleKit.roles[item.key];
                        const selected = selectedRoleMeta.key === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            className={`brand-color-role-card ${selected ? "is-selected" : ""}`}
                            onClick={() => selectColorRole(item.key)}
                          >
                            <span className="brand-color-role-card__swatch" style={{ background: color }} />
                            <span className="brand-color-role-card__copy">
                              <strong>{item.label}</strong>
                              <small>{item.note}</small>
                            </span>
                            <code>{formatHexForUi(color)}</code>
                          </button>
                        );
                      })}
                    </div>
                    <div className="brand-role-quick-edit">
                      <span>当前角色快速编辑</span>
                      <ArcoColorPicker
                        value={selectedRoleValue}
                        onChange={patchSelectedRoleColor}
                        format="hex"
                        showText
                        showPreset
                        disabledAlpha
                        presetColors={colorPresetOptions.slice(0, 8)}
                      />
                      <Button variant="ghost" onClick={resetSelectedRoleColor}>
                        <IconRefresh className="size-4" /> 恢复默认
                      </Button>
                    </div>
                  </details>
                </div>
              )}

              {editorTab === "typography" && (
                <div className="brand-editor-pane">
                  <div className="brand-panel brand-panel--typography">
                    <div className="brand-panel__header">
                      <div>
                        <h3>选择字体</h3>
                        <p>先选字体和字重，右侧网页预览即时同步。</p>
                      </div>
                    </div>
                    <div className="brand-font-select-grid">
                      <label className="brand-select-card">
                        <span>标题字体</span>
                        <ArcoSelect
                          value={styleKit.typography.headingFont}
                          onChange={value => patchTypography("headingFont", String(value || ""))}
                          options={fontOptions}
                          showSearch
                        />
                        <small style={{ fontFamily: compactFontFamily(styleKit.typography.headingFont), fontWeight: styleKit.typography.headingWeight }}>标题示例</small>
                      </label>
                      <label className="brand-select-card">
                        <span>正文字体</span>
                        <ArcoSelect
                          value={styleKit.typography.bodyFont}
                          onChange={value => patchTypography("bodyFont", String(value || ""))}
                          options={fontOptions}
                          showSearch
                        />
                        <small style={{ fontFamily: compactFontFamily(styleKit.typography.bodyFont), fontWeight: styleKit.typography.bodyWeight }}>正文示例</small>
                      </label>
                      <label className="brand-select-card">
                        <span>标题字重</span>
                        <ArcoSelect
                          value={styleKit.typography.headingWeight}
                          onChange={value => patchTypography("headingWeight", Number(value))}
                          options={TYPE_WEIGHT_OPTIONS}
                        />
                        <small style={{ fontWeight: styleKit.typography.headingWeight }}>字重示例</small>
                      </label>
                      <label className="brand-select-card">
                        <span>正文字重</span>
                        <ArcoSelect
                          value={styleKit.typography.bodyWeight}
                          onChange={value => patchTypography("bodyWeight", Number(value))}
                          options={TYPE_WEIGHT_OPTIONS}
                        />
                        <small style={{ fontWeight: styleKit.typography.bodyWeight }}>字重示例</small>
                      </label>
                    </div>

                    <div className="brand-type-fluid">
                      <div className="brand-type-fluid__intro">
                        <h3>响应式字号</h3>
                        <p>定义标题在电脑端和手机端的缩放比例；正文保持稳定，标题在小屏自动收敛。</p>
                      </div>
                      <div className="brand-type-fluid__controls">
                        <label>
                          <span>基础字号 (px)</span>
                          <ArcoInputNumber min={12} max={22} value={styleKit.typography.baseSize} onChange={value => patchTypography("baseSize", Number(value))} />
                          <small>正文基础字号，电脑端和手机端共用。</small>
                        </label>
                        <label>
                          <span>电脑端比例</span>
                          <ArcoSelect
                            value={styleKit.typography.desktopScale}
                            onChange={value => patchTypography("desktopScale", Number(value))}
                            options={TYPE_SCALE_OPTIONS}
                          />
                          <small>控制电脑端标题放大的节奏。</small>
                        </label>
                        <label>
                          <span>手机端比例</span>
                          <ArcoSelect
                            value={styleKit.typography.mobileScale}
                            onChange={value => patchTypography("mobileScale", Number(value))}
                            options={TYPE_SCALE_OPTIONS}
                          />
                          <small>控制手机端标题放大的节奏。</small>
                        </label>
                      </div>
                    </div>

                    <div className="brand-type-preview-table">
                      <div className="brand-type-preview-table__head">
                        <span>层级</span>
                        <span>电脑端字号</span>
                        <span>手机端字号</span>
                        <span>预览</span>
                      </div>
                      {typePreviewRows.map(row => (
                        <div key={row.label} className="brand-type-preview-row">
                          <div>
                            <strong>{row.label}</strong>
                            <small>{row.weight}</small>
                          </div>
                          <span>{row.desktop}px</span>
                          <span>{row.mobile}px</span>
                          <p
                            style={{
                              fontFamily: compactFontFamily(row.label === "正文" ? styleKit.typography.bodyFont : styleKit.typography.headingFont),
                              fontWeight: row.label === "正文" ? styleKit.typography.bodyWeight : styleKit.typography.headingWeight,
                              fontSize: Math.min(row.desktop, 56),
                            }}
                          >
                            {row.preview}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {editorTab === "buttons" && (
                <div className="brand-editor-pane">
                  <div className="brand-panel">
                    <div className="brand-panel__header">
                      <div>
                        <h3>按钮系统</h3>
                        <p>调整行动按钮的高度、圆角和字重，右侧预览会立即同步。</p>
                      </div>
                    </div>
                    <div className="brand-button-controls">
                      <label>
                        <span>按钮高度</span>
                        <ArcoSlider min={34} max={56} value={styleKit.buttons.height} onChange={value => patchButton("height", Number(value))} />
                        <ArcoInputNumber min={34} max={56} value={styleKit.buttons.height} onChange={value => patchButton("height", Number(value))} />
                      </label>
                      <label>
                        <span>圆角</span>
                        <ArcoSlider min={0} max={28} value={styleKit.buttons.radius} onChange={value => patchButton("radius", Number(value))} />
                        <ArcoInputNumber min={0} max={28} value={styleKit.buttons.radius} onChange={value => patchButton("radius", Number(value))} />
                      </label>
                      <label>
                        <span>字重</span>
                        <ArcoSlider min={400} max={900} step={10} value={styleKit.buttons.fontWeight} onChange={value => patchButton("fontWeight", Number(value))} />
                        <ArcoInputNumber min={400} max={900} step={10} value={styleKit.buttons.fontWeight} onChange={value => patchButton("fontWeight", Number(value))} />
                      </label>
                    </div>
                    <div className="brand-button-preview" style={{ background: styleKit.roles.sectionBg }}>
                      <Button
                        style={{
                          minHeight: styleKit.buttons.height,
                          borderRadius: styleKit.buttons.radius,
                          fontWeight: styleKit.buttons.fontWeight,
                          background: styleKit.roles.primaryButtonBg,
                          color: styleKit.roles.primaryButtonText,
                        }}
                      >
                        主要动作示例
                      </Button>
                      <Button style={{ minHeight: styleKit.buttons.height, borderRadius: styleKit.buttons.radius, color: styleKit.roles.link, borderColor: styleKit.roles.link }}>
                        次要动作示例
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className={`brand-starter__preview ${previewExpanded ? "is-expanded" : ""}`}>
          <div className={`brand-preview-shell brand-preview-shell--${previewMode}`}>
            <div className="brand-preview-shell__bar">
              <div className="brand-preview-mode-tabs">
                <button
                  type="button"
                  className={previewMode === "live" ? "is-selected" : ""}
                  onClick={() => setPreviewMode("live")}
                >
                  <IconPalette className="size-4" /> 实时预览
                </button>
                <button
                  type="button"
                  className={previewMode === "contrast" ? "is-selected" : ""}
                  onClick={() => setPreviewMode("contrast")}
                >
                  <IconEye className="size-4" /> 对比度
                </button>
              </div>
              <div className="brand-preview-shell__controls">
                <ArcoSelect
                  value={previewPreset}
                  onChange={value => setPreviewPreset(value as BrandPreviewPreset)}
                  options={BRAND_PREVIEW_PRESETS}
                  triggerProps={{ autoAlignPopupWidth: false }}
                />
                <div className="brand-preview-icon-toggle" aria-label="预览设备">
                  <button
                    type="button"
                    className={previewView === "desktop" ? "is-selected" : ""}
                    onClick={() => setPreviewView("desktop")}
                    title="电脑端"
                  >
                    <IconDesktop className="size-4" /> 电脑端
                  </button>
                  <button
                    type="button"
                    className={previewView === "mobile" ? "is-selected" : ""}
                    onClick={() => setPreviewView("mobile")}
                    title="手机端"
                  >
                    <IconMobile className="size-4" /> 手机端
                  </button>
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setPreviewExpanded(value => !value)}
                  title="切换大预览"
                >
                  <IconFullscreen className="size-4" />
                </Button>
                <div className="brand-preview-theme-toggle" aria-label="预览主题">
                  <button
                    type="button"
                    className={previewTheme === "light" ? "is-selected" : ""}
                    onClick={() => setPreviewTheme("light")}
                    title="浅色预览"
                  >
                    <IconSunFill className="size-4" />
                  </button>
                  <button
                    type="button"
                    className={previewTheme === "dark" ? "is-selected" : ""}
                    onClick={() => setPreviewTheme("dark")}
                    title="深色预览"
                  >
                    <IconMoonFill className="size-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="brand-preview-scroll" data-overflow-policy="y-scroll">
              {previewMode === "live" ? (
                <StylePreview
                  styleKit={styleKit}
                  view={previewView}
                  preset={previewPreset}
                  tokens={colorTokens}
                  themeMode={previewTheme}
                />
              ) : (
                <ContrastPreview
                  styleKit={styleKit}
                  view={previewView}
                  tokens={colorTokens}
                  onCopyColor={value => void copyColor(value)}
                />
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
