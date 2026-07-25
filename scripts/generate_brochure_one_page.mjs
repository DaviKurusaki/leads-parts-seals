import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import SVGtoPDF from "svg-to-pdfkit";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ASSETS = path.join(ROOT, "assets");
const OUTPUT = path.join(
  ROOT,
  "output",
  "pdf",
  "apresentacao-comercial-parts-seals.pdf",
);

const PAGE = { width: 595.28, height: 841.89 };
const COLORS = {
  red: "#D80716",
  redDark: "#94000A",
  redSoft: "#FCE9EB",
  ink: "#111318",
  graphite: "#20242C",
  mid: "#686E79",
  pale: "#F4F5F7",
  line: "#DDE0E5",
  white: "#FFFFFF",
  warm: "#F0C9CD",
};

const CONTACT = {
  whatsapp: `https://wa.me/5519983011817?text=${encodeURIComponent(
    "Olá, vim pela apresentação da Parts Seals e quero avaliar uma aplicação.",
  )}`,
  phone: "tel:+551936263552",
  email: "mailto:vendas@parts-seals.com.br",
  site: "https://parts-seals.com.br",
};

const fonts = {
  regular: "C:/Windows/Fonts/segoeui.ttf",
  semibold: "C:/Windows/Fonts/seguisb.ttf",
  bold: "C:/Windows/Fonts/segoeuib.ttf",
};

function roundRect(doc, x, y, width, height, radius, fill, stroke = null) {
  doc.roundedRect(x, y, width, height, radius);
  if (fill && stroke) {
    doc.fillAndStroke(fill, stroke);
  } else if (fill) {
    doc.fill(fill);
  } else if (stroke) {
    doc.stroke(stroke);
  }
}

function drawIcon(doc, name, x, y, size, color) {
  const icons = {
    phone: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>`,
    mail: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
    whatsapp: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.7-4A9 9 0 1 1 8 20.1L3 21"/><path d="M9 8.5c.2 2.3 2.2 4.3 4.5 4.6l1.3-1.3 2.2 1v2c0 .6-.4 1-1 1A8 8 0 0 1 8 8c0-.6.4-1 1-1h2l1 2.2-1.3 1.3"/></svg>`,
    globe: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.5 3.7 5.5 3.7 9S14.4 18.5 12 21M12 3c-2.4 2.5-3.7 5.5-3.7 9s1.3 6.5 3.7 9"/></svg>`,
  };
  SVGtoPDF(doc, icons[name], x, y, {
    width: size,
    height: size,
    assumePt: true,
  });
}

function contactRow(doc, { x, y, icon, label, value, url, valueSize = 8 }) {
  doc.circle(x + 9, y + 10, 9).fill(COLORS.white);
  drawIcon(doc, icon, x + 4.5, y + 5.5, 9, COLORS.redDark);
  doc
    .font("Semibold")
    .fontSize(4.5)
    .fillColor("#FFD8DC")
    .text(label, x + 25, y + 1, { width: 120, lineBreak: false });
  doc
    .font("Semibold")
    .fontSize(valueSize)
    .fillColor(COLORS.white)
    .text(value, x + 25, y + 8, { width: 135, lineBreak: false });
  doc.link(x, y, 132, 22, url);
}

function coverImage(doc, imagePath, x, y, width, height, radius = 0) {
  doc.save();
  if (radius) {
    doc.roundedRect(x, y, width, height, radius).clip();
  } else {
    doc.rect(x, y, width, height).clip();
  }
  doc.image(imagePath, x, y, {
    cover: [width, height],
    align: "center",
    valign: "center",
  });
  doc.restore();
}

function trackingText(doc, text, x, y, options = {}) {
  doc
    .font(options.font || "Semibold")
    .fontSize(options.size || 6.5)
    .fillColor(options.color || COLORS.red)
    .text(text, x, y, {
      width: options.width,
      characterSpacing: options.tracking ?? 1.1,
      align: options.align,
      lineBreak: false,
    });
}

function benefitPill(doc, x, y, width, index, label) {
  roundRect(doc, x, y, width, 28, 14, "#2A2E36", "#3A3F49");
  doc.circle(x + 15, y + 14, 8).fill(COLORS.red);
  doc
    .font("Bold")
    .fontSize(6)
    .fillColor(COLORS.white)
    .text(String(index), x + 12.7, y + 10.1, { width: 5, align: "center" });
  doc
    .font("Semibold")
    .fontSize(7.1)
    .fillColor(COLORS.white)
    .text(label, x + 28, y + 9.2, { width: width - 36, lineBreak: false });
}

function productCard(doc, { x, image, title, body }) {
  const y = 337;
  const width = 163;
  const height = 107;
  roundRect(doc, x, y, width, height, 11, COLORS.white, COLORS.line);
  coverImage(doc, image, x, y, width, 55, 11);
  doc.rect(x, y + 43, width, 12).fillOpacity(0.82).fill(COLORS.ink);
  doc.fillOpacity(1);
  doc
    .font("Semibold")
    .fontSize(7.6)
    .fillColor(COLORS.white)
    .text(title, x + 10, y + 45.5, { width: width - 20, lineBreak: false });
  doc
    .font("Regular")
    .fontSize(6.4)
    .fillColor(COLORS.mid)
    .text(body, x + 10, y + 67, {
      width: width - 20,
      height: 31,
      lineGap: 1.3,
    });
}

function bullet(doc, x, y, text, color = COLORS.ink) {
  doc.circle(x + 3.5, y + 5, 3.5).fill(COLORS.red);
  doc
    .font("Semibold")
    .fontSize(6.9)
    .fillColor(color)
    .text(text, x + 13, y, { width: 154, lineBreak: false });
}

function flowStep(doc, x, number, title, body) {
  const y = 658;
  doc.circle(x + 16, y + 16, 16).fill(COLORS.red);
  doc
    .font("Bold")
    .fontSize(7.2)
    .fillColor(COLORS.white)
    .text(number, x + 7, y + 11.3, { width: 18, align: "center" });
  doc
    .font("Bold")
    .fontSize(7.1)
    .fillColor(COLORS.ink)
    .text(title, x, y + 41, { width: 112, lineBreak: false });
  doc
    .font("Regular")
    .fontSize(6.1)
    .fillColor(COLORS.mid)
    .text(body, x, y + 54, { width: 112, lineGap: 1 });
}

async function generate() {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const qrBuffer = await QRCode.toBuffer(CONTACT.whatsapp, {
    width: 280,
    margin: 1,
    color: { dark: COLORS.ink, light: COLORS.white },
    errorCorrectionLevel: "M",
  });

  const doc = new PDFDocument({
    size: [PAGE.width, PAGE.height],
    margin: 0,
    info: {
      Title: "Apresentação Comercial Parts Seals - Soluções em Vedação Industrial",
      Author: "Parts Seals Vedações Industriais",
      Subject:
        "Vedações industriais sob medida, suporte técnico e condições diferenciadas para revendedores",
      Keywords:
        "vedações industriais, peças sob medida, revendedores, hidráulica, pneumática, PTFE, PU",
    },
  });
  doc.pipe(fs.createWriteStream(OUTPUT));
  doc.registerFont("Regular", fonts.regular);
  doc.registerFont("Semibold", fonts.semibold);
  doc.registerFont("Bold", fonts.bold);

  doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.pale);

  // Hero
  doc.rect(0, 0, PAGE.width, 280).fill(COLORS.ink);
  coverImage(
    doc,
    path.join(ASSETS, "brochure-hero.png"),
    350,
    0,
    PAGE.width - 350,
    280,
  );
  const heroGradient = doc.linearGradient(320, 0, 410, 0);
  heroGradient.stop(0, COLORS.ink, 1).stop(1, COLORS.ink, 0);
  doc.rect(300, 0, 120, 280).fill(heroGradient);
  doc.rect(0, 0, PAGE.width, 7).fill(COLORS.red);

  doc.image(path.join(ASSETS, "logo-parts-seals-white.png"), 34, 26, {
    fit: [166, 48],
    align: "left",
    valign: "center",
  });
  trackingText(doc, "SOLUÇÕES EM VEDAÇÃO INDUSTRIAL", 34, 84, {
    color: "#F29BA2",
    size: 6.4,
  });
  doc
    .font("Bold")
    .fontSize(22.8)
    .fillColor(COLORS.white)
    .text("VEDAÇÕES SOB MEDIDA.", 34, 112, {
      width: 305,
      lineBreak: false,
    });
  doc
    .font("Bold")
    .fontSize(22.8)
    .fillColor(COLORS.white)
    .text("RESPOSTA TÉCNICA.", 34, 145, {
      width: 310,
      lineBreak: false,
    });
  doc
    .font("Bold")
    .fontSize(19.2)
    .fillColor(COLORS.red)
    .text("PARA QUEM NÃO PODE PARAR.", 34, 178, {
      width: 310,
      lineBreak: false,
    });
  doc
    .font("Regular")
    .fontSize(8.2)
    .fillColor("#D1D4DA")
    .text(
      "Peças especiais por amostra, desenho, foto ou medidas - com orientação de material e geometria para sua aplicação.",
      34,
      211,
      { width: 300, lineGap: 1.8 },
    );

  benefitPill(doc, 34, 242, 92, 1, "SOB MEDIDA");
  benefitPill(doc, 132, 242, 110, 2, "SUPORTE TÉCNICO");
  benefitPill(doc, 247, 242, 101, 3, "RESPOSTA ÁGIL");

  doc.fillOpacity(0.9);
  roundRect(doc, 390, 220, 170, 38, 10, COLORS.ink, "#4B505A");
  doc.fillOpacity(1);
  doc
    .font("Semibold")
    .fontSize(6.8)
    .fillColor("#E7E9ED")
    .text("PARA INDÚSTRIAS, MANUTENÇÃO", 402, 229, {
      width: 146,
      align: "center",
      lineBreak: false,
    });
  doc
    .font("Semibold")
    .fontSize(6.8)
    .fillColor(COLORS.white)
    .text("E REVENDEDORES", 402, 241.5, {
      width: 146,
      align: "center",
      lineBreak: false,
    });

  // Product promise and solution cards
  trackingText(doc, "DA APLICAÇÃO À SOLUÇÃO CERTA", 34, 299, {
    color: COLORS.red,
    size: 6.3,
  });
  doc
    .font("Bold")
    .fontSize(16.5)
    .fillColor(COLORS.ink)
    .text("Soluções que o catálogo não resolve.", 34, 313, {
      width: 330,
      lineBreak: false,
    });
  doc
    .font("Regular")
    .fontSize(7.3)
    .fillColor(COLORS.mid)
    .text(
      "Reposição, desenvolvimento e peças técnicas para aplicações críticas, urgências e equipamentos fora de linha.",
      355,
      303,
      { width: 206, lineGap: 1.5 },
    );

  productCard(doc, {
    x: 34,
    image: path.join(ASSETS, "site-seals-components.jpg"),
    title: "Gaxetas, anéis e raspadores",
    body: "Perfis para haste, pistão, cilindros e kits especiais.",
  });
  productCard(doc, {
    x: 216,
    image: path.join(ASSETS, "site-product-aneis-guia.jpg"),
    title: "Anéis guia e componentes",
    body: "Guias, buchas, arruelas e peças para conjuntos hidráulicos.",
  });
  productCard(doc, {
    x: 398,
    image: path.join(ASSETS, "site-product-pecas-tecnicas.jpg"),
    title: "Peças técnicas sob medida",
    body: "Desenvolvimento por aplicação, desenho, amostra ou medidas.",
  });

  // Technical specification panel
  roundRect(doc, 34, 461, 325, 148, 12, COLORS.white, COLORS.line);
  trackingText(doc, "ENGENHARIA APLICADA À VEDAÇÃO", 50, 478, {
    size: 6.1,
  });
  doc
    .font("Bold")
    .fontSize(13.3)
    .fillColor(COLORS.ink)
    .text("O material certo para a condição real.", 50, 493, {
      width: 280,
      lineBreak: false,
    });
  doc
    .font("Regular")
    .fontSize(6.8)
    .fillColor(COLORS.mid)
    .text(
      "A especificação considera fluido, pressão, temperatura, movimento e desgaste - inclusive PTFE puro ou carregado.",
      50,
      515,
      { width: 278, lineGap: 1.3 },
    );

  doc.circle(53, 546, 3).fill(COLORS.red);
  doc
    .font("Semibold")
    .fontSize(5.2)
    .fillColor(COLORS.mid)
    .text("VEDAÇÃO E PERFORMANCE", 61, 542.5, {
      width: 96,
      lineBreak: false,
    });
  doc.circle(175, 546, 3).fill(COLORS.graphite);
  doc
    .font("Semibold")
    .fontSize(5.2)
    .fillColor(COLORS.mid)
    .text("GUIAS E COMPONENTES", 183, 542.5, {
      width: 118,
      lineBreak: false,
    });

  const sealingMaterials = [
    ["PU", 50, 63],
    ["PTFE", 121, 63],
    ["NBR", 192, 63],
    ["FKM", 263, 63],
  ];
  sealingMaterials.forEach(([material, x, width]) => {
    roundRect(doc, x, 554, width, 20, 10, COLORS.red);
    doc
      .font("Semibold")
      .fontSize(6.3)
      .fillColor(COLORS.white)
      .text(material, x, 560.2, { width, align: "center", lineBreak: false });
  });

  const componentMaterials = [
    ["POM", 50, 36],
    ["PEEK", 91, 38],
    ["NYLON", 134, 43],
    ["CELERON", 182, 48],
    ["TECHNYL", 235, 48],
    ["PEAD", 288, 38],
  ];
  componentMaterials.forEach(([material, x, width]) => {
    roundRect(doc, x, 581, width, 20, 10, COLORS.graphite);
    doc
      .font("Semibold")
      .fontSize(5.8)
      .fillColor(COLORS.white)
      .text(material, x, 587.3, { width, align: "center", lineBreak: false });
  });

  // Reseller offer panel
  roundRect(doc, 374, 461, 187, 148, 12, COLORS.redSoft, "#F2C6CA");
  roundRect(doc, 390, 476, 116, 20, 10, COLORS.red);
  trackingText(doc, "PARA REVENDEDORES", 397, 482.2, {
    width: 102,
    color: COLORS.white,
    size: 5.7,
    tracking: 0.55,
    align: "center",
  });
  doc
    .font("Bold")
    .fontSize(10.5)
    .fillColor(COLORS.redDark)
    .text("Vantagens para sua revenda.", 390, 505, {
      width: 155,
      lineBreak: false,
    });
  doc
    .font("Regular")
    .fontSize(6.2)
    .fillColor("#5E3337")
    .text("Mais portfólio, apoio técnico e capacidade de entrega para o seu cliente.", 390, 526, {
      width: 151,
      lineGap: 0.8,
    });
  bullet(doc, 390, 551, "Condições comerciais diferenciadas", COLORS.redDark);
  bullet(doc, 390, 568, "Prazos diferenciados por demanda", COLORS.redDark);
  bullet(doc, 390, 585, "Apoio técnico em peças especiais", COLORS.redDark);
  doc
    .font("Regular")
    .fontSize(4.8)
    .fillColor("#8D6266")
    .text("* Consulte critérios conforme volume, recorrência e complexidade.", 390, 600, {
      width: 153,
      lineBreak: false,
    });

  // Process flow
  trackingText(doc, "FLUXO COMERCIAL CLARO", 34, 621, {
    color: COLORS.red,
    size: 6.1,
  });
  doc
    .font("Bold")
    .fontSize(13.6)
    .fillColor(COLORS.ink)
    .text("Da urgência à peça pronta, sem ruído.", 34, 635, {
      width: 305,
      lineBreak: false,
    });
  doc
    .moveTo(66, 674)
    .lineTo(502, 674)
    .lineWidth(1.2)
    .strokeColor(COLORS.line)
    .stroke();
  [145, 276, 407].forEach((x) => {
    doc
      .moveTo(x, 669)
      .lineTo(x + 7, 674)
      .lineTo(x, 679)
      .lineWidth(1.2)
      .strokeColor("#BFC3CA")
      .stroke();
  });
  flowStep(doc, 50, "01", "VOCÊ ENVIA", "Amostra, foto, desenho, medidas ou dados da aplicação.");
  flowStep(doc, 181, "02", "NÓS ANALISAMOS", "Geometria, material, condição de trabalho e urgência.");
  flowStep(doc, 312, "03", "VOCÊ RECEBE", "Proposta técnica e comercial objetiva para decidir.");
  flowStep(doc, 443, "04", "NÓS ENTREGAMOS", "Produção sob medida e peça pronta para sua operação.");

  // CTA
  roundRect(doc, 24, 740, 547, 84, 13, COLORS.red);
  doc
    .font("Bold")
    .fontSize(14.5)
    .fillColor(COLORS.white)
    .text("Vamos avaliar sua aplicação real?", 43, 751, {
      width: 320,
      lineBreak: false,
    });
  doc
    .font("Regular")
    .fontSize(6.9)
    .fillColor("#FFEDEF")
    .text(
      "Envie os dados da aplicação e fale diretamente com um especialista.",
      43,
      773,
      { width: 300, lineBreak: false },
    );
  roundRect(doc, 43, 794, 225, 23, 11.5, COLORS.white);
  drawIcon(doc, "whatsapp", 56, 800, 11, COLORS.redDark);
  doc
    .font("Bold")
    .fontSize(7.1)
    .fillColor(COLORS.redDark)
    .text("ENVIAR APLICAÇÃO NO WHATSAPP  →", 72, 801.2, {
      width: 184,
      align: "center",
      lineBreak: false,
    });
  doc.link(43, 794, 225, 23, CONTACT.whatsapp);

  contactRow(doc, {
    x: 284,
    y: 744,
    icon: "phone",
    label: "TELEFONE",
    value: "(19) 3626-3552",
    url: CONTACT.phone,
    valueSize: 8.2,
  });
  contactRow(doc, {
    x: 284,
    y: 771,
    icon: "mail",
    label: "E-MAIL",
    value: "vendas@parts-seals.com.br",
    url: CONTACT.email,
    valueSize: 7.2,
  });
  contactRow(doc, {
    x: 284,
    y: 798,
    icon: "globe",
    label: "SITE",
    value: "parts-seals.com.br",
    url: CONTACT.site,
    valueSize: 7.5,
  });

  roundRect(doc, 486, 747, 69, 69, 7, COLORS.white);
  doc.image(qrBuffer, 491, 752, { width: 59, height: 59 });
  doc.link(486, 747, 69, 69, CONTACT.whatsapp);
  doc
    .font("Semibold")
    .fontSize(4.8)
    .fillColor(COLORS.white)
    .text("APONTE A CÂMERA", 430, 773, {
      width: 47,
      align: "right",
      lineBreak: false,
    });
  doc
    .font("Regular")
    .fontSize(4.6)
    .fillColor("#FFEDEF")
    .text("e inicie a conversa", 430, 783, {
      width: 47,
      align: "right",
      lineBreak: false,
    });

  // Footer
  doc
    .font("Regular")
    .fontSize(5.2)
    .fillColor("#646A74")
    .text(
      "Parts Seals Vedações Industriais  •  Santa Bárbara d'Oeste/SP  •  CNPJ 30.705.918/0001-05",
      34,
      830,
      { width: 420, lineBreak: false },
    );
  doc
    .font("Semibold")
    .fontSize(5.4)
    .fillColor(COLORS.red)
    .text("parts-seals.com.br", 466, 830, {
      width: 95,
      align: "right",
      lineBreak: false,
    });
  doc.link(500, 829, 61, 10, CONTACT.site);

  doc.end();
  await new Promise((resolve) => doc.on("end", resolve));
  console.log(OUTPUT);
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
