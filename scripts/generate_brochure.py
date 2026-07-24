from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "apresentacao-comercial-parts-seals.pdf"
HERO = ROOT / "assets" / "brochure-hero.png"

W, H = A4
RED = HexColor("#B41218")
RED_DARK = HexColor("#81080D")
RED_LIGHT = HexColor("#F7E8E9")
CHARCOAL = HexColor("#17191F")
GRAPHITE = HexColor("#292C34")
MID = HexColor("#60636B")
LIGHT = HexColor("#F3F4F6")
LINE = HexColor("#E2E4E8")
BLACK = HexColor("#111217")


pdfmetrics.registerFont(TTFont("Segoe", r"C:\Windows\Fonts\segoeui.ttf"))
pdfmetrics.registerFont(TTFont("Segoe-Semibold", r"C:\Windows\Fonts\seguisb.ttf"))
pdfmetrics.registerFont(TTFont("Segoe-Bold", r"C:\Windows\Fonts\segoeuib.ttf"))


def paragraph(c, text, x, y_top, width, font="Segoe", size=9, leading=None,
              color=BLACK, align=TA_LEFT):
    leading = leading or size * 1.3
    style = ParagraphStyle(
        name="inline",
        fontName=font,
        fontSize=size,
        leading=leading,
        textColor=color,
        alignment=align,
        spaceAfter=0,
        spaceBefore=0,
    )
    p = Paragraph(text, style)
    _, height = p.wrap(width, H)
    p.drawOn(c, x, y_top - height)
    return height


def draw_cover_image(c, image_path, x, y, width, height):
    image = ImageReader(str(image_path))
    iw, ih = image.getSize()
    scale = max(width / iw, height / ih)
    draw_w, draw_h = iw * scale, ih * scale
    c.saveState()
    clip = c.beginPath()
    clip.rect(x, y, width, height)
    c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(
        image,
        x + (width - draw_w) / 2,
        y + (height - draw_h) / 2,
        draw_w,
        draw_h,
        mask="auto",
    )
    c.restoreState()


def brand(c, x, y, dark=False):
    primary = white if dark else BLACK
    c.setFillColor(RED)
    c.roundRect(x, y - 5, 8, 23, 2, fill=1, stroke=0)
    c.setFillColor(primary)
    c.setFont("Segoe-Bold", 17)
    c.drawString(x + 15, y, "PARTS")
    c.setFillColor(RED)
    c.drawString(x + 69, y, "SEALS")
    c.setFillColor(primary)
    c.setFont("Segoe", 6.8)
    c.drawString(x + 16, y - 11, "VEDAÇÕES INDUSTRIAIS")


def icon(c, kind, cx, cy):
    c.saveState()
    c.setStrokeColor(RED)
    c.setFillColor(RED_LIGHT)
    c.setLineWidth(1.6)
    c.circle(cx, cy, 17, fill=1, stroke=0)
    c.setFillColor(Color(0, 0, 0, alpha=0))
    if kind == "hydraulic":
        c.rect(cx - 9, cy - 5, 18, 10, fill=0, stroke=1)
        c.line(cx - 13, cy, cx - 9, cy)
        c.line(cx + 9, cy, cx + 14, cy)
        c.line(cx, cy - 5, cx, cy + 5)
    elif kind == "pneumatic":
        c.circle(cx - 4, cy, 6, fill=0, stroke=1)
        c.line(cx + 2, cy, cx + 12, cy)
        c.line(cx + 8, cy - 4, cx + 12, cy)
        c.line(cx + 8, cy + 4, cx + 12, cy)
    elif kind == "rotary":
        c.circle(cx, cy, 9, fill=0, stroke=1)
        c.circle(cx, cy, 3, fill=0, stroke=1)
        c.arc(cx - 13, cy - 13, cx + 13, cy + 13, 30, 95)
        c.line(cx + 11, cy + 7, cx + 13, cy + 12)
    elif kind == "custom":
        c.line(cx - 10, cy - 8, cx + 9, cy + 10)
        c.circle(cx - 7, cy - 5, 3, fill=0, stroke=1)
        c.rect(cx + 3, cy + 3, 7, 7, fill=0, stroke=1)
    elif kind == "components":
        c.circle(cx - 5, cy, 7, fill=0, stroke=1)
        c.circle(cx - 5, cy, 3, fill=0, stroke=1)
        c.rect(cx + 4, cy - 7, 7, 14, fill=0, stroke=1)
    else:
        c.line(cx - 9, cy + 8, cx + 9, cy - 8)
        c.line(cx - 9, cy - 8, cx + 9, cy + 8)
        c.circle(cx, cy, 4, fill=0, stroke=1)
    c.restoreState()


def product_card(c, x, y, width, height, kind, title, body):
    c.setFillColor(white)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.roundRect(x, y, width, height, 8, fill=1, stroke=1)
    icon(c, kind, x + 30, y + height - 31)
    paragraph(c, title, x + 55, y + height - 17, width - 67,
              font="Segoe-Semibold", size=10.2, leading=12, color=BLACK)
    paragraph(c, body, x + 55, y + height - 40, width - 67,
              font="Segoe", size=7.7, leading=10, color=MID)


def industry_chip(c, x, y, width, title, detail):
    c.setFillColor(GRAPHITE)
    c.setStrokeColor(HexColor("#474B55"))
    c.roundRect(x, y, width, 46, 8, fill=1, stroke=1)
    c.setFillColor(RED)
    c.circle(x + 18, y + 23, 4, fill=1, stroke=0)
    paragraph(c, title, x + 30, y + 34, width - 39,
              font="Segoe-Semibold", size=8.8, leading=10.5, color=white)
    paragraph(c, detail, x + 30, y + 19, width - 39,
              font="Segoe", size=6.8, leading=8, color=HexColor("#C9CBD1"))


def link_text(c, label, url, x, y, font="Segoe-Semibold", size=9, color=white):
    c.setFont(font, size)
    c.setFillColor(color)
    c.drawString(x, y, label)
    width = pdfmetrics.stringWidth(label, font, size)
    c.linkURL(url, (x, y - 2, x + width, y + size + 2), relative=0)
    return width


def page_one(c):
    hero_h = 322
    draw_cover_image(c, HERO, 0, H - hero_h, W, hero_h)

    c.saveState()
    c.setFillColor(Color(0.02, 0.02, 0.03, alpha=0.63))
    c.rect(0, H - hero_h, W, hero_h, fill=1, stroke=0)
    c.restoreState()

    c.setFillColor(RED)
    c.rect(0, H - 7, W, 7, fill=1, stroke=0)
    brand(c, 34, H - 48, dark=True)

    c.setFillColor(RED)
    c.roundRect(34, H - 95, 118, 22, 11, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Segoe-Semibold", 7.5)
    c.drawCentredString(93, H - 88, "APRESENTAÇÃO COMERCIAL")

    paragraph(
        c,
        "Soluções em<br/><b>vedações industriais</b>",
        34,
        H - 119,
        330,
        font="Segoe",
        size=27,
        leading=31,
        color=white,
    )
    paragraph(
        c,
        "Engenharia, materiais de alto desempenho e fabricação sob medida para demandas que não cabem no catálogo.",
        35,
        H - 202,
        305,
        font="Segoe",
        size=10.2,
        leading=14,
        color=HexColor("#E5E5E7"),
    )
    c.setStrokeColor(RED)
    c.setLineWidth(3)
    c.line(35, H - 265, 112, H - 265)
    paragraph(
        c,
        "<b>Por desenho ou amostra.</b> Do item unitário às pequenas e médias séries.",
        35,
        H - 279,
        310,
        font="Segoe",
        size=8.5,
        leading=11,
        color=white,
    )

    content_top = H - hero_h - 25
    paragraph(c, "Linhas que atendemos", 34, content_top, 300,
              font="Segoe-Bold", size=18, leading=21, color=BLACK)
    paragraph(
        c,
        "Portfólio técnico para complementar linhas padronizadas e resolver aplicações especiais.",
        34,
        content_top - 25,
        500,
        font="Segoe",
        size=8.5,
        leading=11,
        color=MID,
    )

    cards = [
        ("hydraulic", "Vedações hidráulicas",
         "Gaxetas de haste e pistão • Raspadores • Anéis guia • Kits para cilindros"),
        ("pneumatic", "Vedações pneumáticas",
         "Baixo atrito • Atuadores • Gaxetas • Raspadores • Anéis guia"),
        ("rotary", "Vedações rotativas",
         "Retentores especiais • Anéis • Reposições industriais"),
        ("custom", "Peças sob medida",
         "Por desenho ou amostra • Fora de catálogo • Pequenas e médias séries"),
        ("components", "Juntas e componentes",
         "PTFE puro ou carregado • NBR • FKM • PU • Materiais técnicos"),
        ("service", "Reposição e manutenção",
         "Itens descontinuados • Urgências • Equipamentos antigos • Kits especiais"),
    ]
    card_w, card_h = 255, 78
    xs = [34, 306]
    ys = [content_top - 122, content_top - 210, content_top - 298]
    for index, (kind, title, body) in enumerate(cards):
        product_card(c, xs[index % 2], ys[index // 2], card_w, card_h, kind, title, body)

    c.setFillColor(LIGHT)
    c.roundRect(34, 58, W - 68, 91, 10, fill=1, stroke=0)
    paragraph(c, "Por que Parts Seals", 49, 132, 180,
              font="Segoe-Bold", size=10.5, leading=13, color=BLACK)
    differentiators = [
        ("Análise personalizada", "A aplicação vem antes da escolha do material."),
        ("Alta performance", "Componentes definidos para as condições reais de trabalho."),
        ("Agilidade e flexibilidade", "Apoio a urgências, reposições e séries especiais."),
    ]
    for index, (title, detail) in enumerate(differentiators):
        x = 49 + index * 171
        c.setFillColor(RED)
        c.circle(x + 4, 101, 4, fill=1, stroke=0)
        paragraph(c, title, x + 14, 116, 145, font="Segoe-Semibold",
                  size=7.7, leading=9.5, color=RED_DARK)
        paragraph(c, detail, x + 14, 98, 145, font="Segoe",
                  size=6.7, leading=8.2, color=MID)

    c.setFillColor(RED)
    c.rect(0, 0, W, 36, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Segoe-Semibold", 8.5)
    c.drawString(34, 13, "PARTS SEALS | ENGENHARIA E TECNOLOGIA EM VEDAÇÃO")
    link_text(c, "parts-seals.com.br", "https://parts-seals.com.br", 448, 13,
              font="Segoe-Semibold", size=8.5, color=white)


def page_two(c):
    c.setFillColor(white)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(RED)
    c.rect(0, H - 7, W, 7, fill=1, stroke=0)
    brand(c, 34, H - 45, dark=False)

    paragraph(c, "Da aplicação à solução", 34, H - 88, 360,
              font="Segoe-Bold", size=20, leading=24, color=BLACK)
    paragraph(
        c,
        "Cada vedação é definida a partir das condições reais de trabalho.",
        34,
        H - 116,
        480,
        font="Segoe",
        size=9,
        leading=12,
        color=MID,
    )

    process = [
        ("01", "Entendimento", "Pressão, temperatura,<br/>fluido e velocidade"),
        ("02", "Engenharia", "Desenho ou amostra,<br/>alojamento e tolerâncias"),
        ("03", "Material", "Polímero ou elastômero<br/>adequado à aplicação"),
        ("04", "Entrega", "Peças especiais, séries<br/>e reposições"),
    ]
    node_y = H - 184
    c.setStrokeColor(LINE)
    c.setLineWidth(2)
    c.line(76, node_y + 19, 511, node_y + 19)
    for index, (number, title, detail) in enumerate(process):
        x = 34 + index * 137
        c.setFillColor(RED)
        c.circle(x + 18, node_y + 19, 18, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Segoe-Bold", 9)
        c.drawCentredString(x + 18, node_y + 16, number)
        paragraph(c, title, x, node_y - 10, 120, font="Segoe-Semibold",
                  size=8.8, leading=11, color=BLACK)
        paragraph(c, detail, x, node_y - 27, 120, font="Segoe",
                  size=6.9, leading=8.5, color=MID)

    panel_y, panel_h = H - 465, 185
    c.setFillColor(CHARCOAL)
    c.roundRect(24, panel_y, W - 48, panel_h, 12, fill=1, stroke=0)
    paragraph(c, "Setores atendidos", 42, panel_y + panel_h - 25, 250,
              font="Segoe-Bold", size=15, leading=18, color=white)
    paragraph(
        c,
        "Soluções para ambientes produtivos que exigem confiabilidade, compatibilidade química e desempenho.",
        42,
        panel_y + panel_h - 49,
        495,
        font="Segoe",
        size=7.8,
        leading=10,
        color=HexColor("#C9CBD1"),
    )
    industries = [
        ("Metalmecânico", "Máquinas e linhas produtivas"),
        ("Automotivo", "Componentes e manutenção"),
        ("Alimentos e farmacêutico", "Processos e utilidades"),
        ("Óleo, gás e químico", "Fluidos e condições severas"),
        ("Energia e mineração", "Equipamentos críticos"),
        ("Manutenção industrial", "Reposições e reformas"),
    ]
    chip_w = 160
    for index, (title, detail) in enumerate(industries):
        col = index % 3
        row = index // 3
        industry_chip(c, 42 + col * 171, panel_y + 63 - row * 56,
                      chip_w, title, detail)

    materials_top = panel_y - 24
    paragraph(c, "Materiais e compostos", 34, materials_top, 250,
              font="Segoe-Bold", size=15, leading=18, color=BLACK)
    paragraph(
        c,
        "A seleção final considera todos os dados técnicos da aplicação.",
        34,
        materials_top - 21,
        400,
        font="Segoe",
        size=7.6,
        leading=10,
        color=MID,
    )

    c.setFillColor(LIGHT)
    c.roundRect(34, materials_top - 118, 330, 84, 8, fill=1, stroke=0)
    paragraph(c, "Polímeros e elastômeros", 48, materials_top - 47, 210,
              font="Segoe-Semibold", size=9, leading=11, color=RED_DARK)
    paragraph(
        c,
        "NBR • FKM / Viton • PU • PTFE • Nylon • PEEK<br/>"
        "Poliacetal • UHMW • Silicone • EPDM • Celeron",
        48,
        materials_top - 68,
        295,
        font="Segoe",
        size=7.8,
        leading=11,
        color=BLACK,
    )

    c.setFillColor(RED_LIGHT)
    c.roundRect(376, materials_top - 118, 185, 84, 8, fill=1, stroke=0)
    paragraph(c, "Compostos para PTFE", 390, materials_top - 47, 155,
              font="Segoe-Semibold", size=9, leading=11, color=RED_DARK)
    paragraph(
        c,
        "Bronze • Carbono • Fibra de vidro<br/>"
        "Grafite • Molibdênio • T-46",
        390,
        materials_top - 68,
        150,
        font="Segoe",
        size=7.8,
        leading=11,
        color=BLACK,
    )

    c.setFillColor(RED)
    c.roundRect(24, 42, W - 48, 120, 12, fill=1, stroke=0)
    paragraph(c, "Vamos avaliar uma aplicação real?", 42, 142, 300,
              font="Segoe-Bold", size=15, leading=18, color=white)
    paragraph(
        c,
        "Envie um desenho, uma amostra ou os dados de trabalho. Nossa equipe retorna com a análise inicial.",
        42,
        119,
        500,
        font="Segoe",
        size=8,
        leading=10.5,
        color=HexColor("#FBEDEE"),
    )
    link_text(c, "(19) 3626-3552", "tel:+551936263552", 42, 80, size=8.4)
    link_text(c, "WhatsApp: (19) 98301-1817", "https://wa.me/5519983011817",
              147, 80, size=8.4)
    link_text(c, "vendas@parts-seals.com.br", "mailto:vendas@parts-seals.com.br",
              313, 80, size=8.4)
    link_text(c, "parts-seals.com.br", "https://parts-seals.com.br",
              42, 59, size=8.4)
    paragraph(
        c,
        "Rua José Adhemar Petrini, 60 - Parque Industrial Bandeirantes - Santa Bárbara d'Oeste/SP - CEP 13457-174",
        170,
        66,
        370,
        font="Segoe",
        size=6.8,
        leading=8,
        color=HexColor("#FBEDEE"),
    )

    c.setFillColor(MID)
    c.setFont("Segoe", 6.5)
    c.drawString(34, 21, "CNPJ 30.705.918/0001-05  |  I.E. 606.270.534.118  |  © 2026 Parts Seals")


def generate():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle("Apresentação Comercial Parts Seals")
    c.setAuthor("Parts Seals Vedações Industriais")
    c.setSubject("Linhas, materiais e aplicações atendidas")
    page_one(c)
    c.showPage()
    page_two(c)
    c.showPage()
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    generate()
