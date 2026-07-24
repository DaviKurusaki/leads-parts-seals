from io import BytesIO
from pathlib import Path

from reportlab.graphics import renderPDF
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from svglib.svglib import svg2rlg


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "apresentacao-comercial-parts-seals-v2.pdf"
ASSETS = ROOT / "assets"
ICONS = ASSETS / "icons" / "tabler"

LOGO_DARK = ASSETS / "logo-parts-seals-original.png"
LOGO_WHITE = ASSETS / "logo-parts-seals-white.png"
HERO = ASSETS / "site-hero-industrial.jpg"
PHOTO_COMPONENTS = ASSETS / "site-seals-components.jpg"
PHOTO_GUIDES = ASSETS / "site-product-aneis-guia.jpg"
PHOTO_DPDH = ASSETS / "site-product-dp-dh.jpg"
PHOTO_CUSTOM = ASSETS / "site-product-pecas-tecnicas.jpg"

W, H = A4
RED = HexColor("#C20E19")
RED_DARK = HexColor("#860811")
RED_DEEP = HexColor("#64050B")
RED_LIGHT = HexColor("#F9E7E9")
CHARCOAL = HexColor("#111217")
GRAPHITE = HexColor("#202229")
GRAPHITE_2 = HexColor("#2B2E37")
MID = HexColor("#656873")
LIGHT = HexColor("#F2F3F5")
LINE = HexColor("#E0E2E6")
BLACK = HexColor("#111217")
GOLD = HexColor("#C69A45")


pdfmetrics.registerFont(TTFont("Segoe", r"C:\Windows\Fonts\segoeui.ttf"))
pdfmetrics.registerFont(TTFont("Segoe-Semibold", r"C:\Windows\Fonts\seguisb.ttf"))
pdfmetrics.registerFont(TTFont("Segoe-Bold", r"C:\Windows\Fonts\segoeuib.ttf"))


def paragraph(c, text, x, y_top, width, font="Segoe", size=9, leading=None,
              color=BLACK, align=TA_LEFT):
    style = ParagraphStyle(
        name="inline",
        fontName=font,
        fontSize=size,
        leading=leading or size * 1.3,
        textColor=color,
        alignment=align,
        spaceAfter=0,
        spaceBefore=0,
    )
    item = Paragraph(text, style)
    _, height = item.wrap(width, H)
    item.drawOn(c, x, y_top - height)
    return height


def draw_cover_image(c, image_path, x, y, width, height, focus_x=0.5, focus_y=0.5):
    image = ImageReader(str(image_path))
    iw, ih = image.getSize()
    scale = max(width / iw, height / ih)
    draw_w, draw_h = iw * scale, ih * scale
    dx = x + (width - draw_w) * focus_x
    dy = y + (height - draw_h) * focus_y
    c.saveState()
    clip = c.beginPath()
    clip.rect(x, y, width, height)
    c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(image, dx, dy, draw_w, draw_h, mask="auto")
    c.restoreState()


def draw_rounded_image(c, image_path, x, y, width, height, radius=9,
                       focus_x=0.5, focus_y=0.5):
    image = ImageReader(str(image_path))
    iw, ih = image.getSize()
    scale = max(width / iw, height / ih)
    draw_w, draw_h = iw * scale, ih * scale
    dx = x + (width - draw_w) * focus_x
    dy = y + (height - draw_h) * focus_y
    c.saveState()
    clip = c.beginPath()
    clip.roundRect(x, y, width, height, radius)
    c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(image, dx, dy, draw_w, draw_h, mask="auto")
    c.restoreState()


def draw_contain_image(c, image_path, x, y, width, height):
    image = ImageReader(str(image_path))
    iw, ih = image.getSize()
    scale = min(width / iw, height / ih)
    draw_w, draw_h = iw * scale, ih * scale
    c.drawImage(
        image,
        x + (width - draw_w) / 2,
        y + (height - draw_h) / 2,
        draw_w,
        draw_h,
        mask="auto",
    )


def color_hex(color):
    return color.hexval().replace("0x", "#")


def draw_svg(c, icon_name, x, y, size, color=RED):
    svg_path = ICONS / f"{icon_name}.svg"
    source = svg_path.read_text(encoding="utf-8")
    source = source.replace("currentColor", color_hex(color))
    drawing = svg2rlg(BytesIO(source.encode("utf-8")))
    if not drawing or not drawing.width or not drawing.height:
        return
    scale = min(size / drawing.width, size / drawing.height)
    draw_w, draw_h = drawing.width * scale, drawing.height * scale
    c.saveState()
    c.translate(x + (size - draw_w) / 2, y + (size - draw_h) / 2)
    c.scale(scale, scale)
    renderPDF.draw(drawing, c, 0, 0)
    c.restoreState()


def top_rule(c):
    c.setFillColor(RED)
    c.rect(0, H - 7, W, 7, fill=1, stroke=0)


def page_footer(c, page_number, dark=False):
    color = HexColor("#A7AAB2") if dark else MID
    c.setFillColor(color)
    c.setFont("Segoe", 6.5)
    c.drawString(34, 19, "PARTS SEALS | VEDAÇÕES INDUSTRIAIS SOB MEDIDA")
    c.drawRightString(W - 34, 19, f"{page_number:02d}")


def link_text(c, label, url, x, y, font="Segoe-Semibold", size=8.5,
              color=white):
    c.setFont(font, size)
    c.setFillColor(color)
    c.drawString(x, y, label)
    width = pdfmetrics.stringWidth(label, font, size)
    c.linkURL(url, (x, y - 2, x + width, y + size + 2), relative=0)
    return width


def link_button(c, label, url, x, y, width, height, fill=RED, text_color=white):
    c.setFillColor(fill)
    c.roundRect(x, y, width, height, height / 2, fill=1, stroke=0)
    c.setFillColor(text_color)
    c.setFont("Segoe-Semibold", 8.5)
    c.drawCentredString(x + width / 2, y + height / 2 - 3, label)
    c.linkURL(url, (x, y, x + width, y + height), relative=0)


def dark_feature_card(c, x, y, width, height, icon_name, title, body):
    c.setFillColor(GRAPHITE)
    c.setStrokeColor(HexColor("#3B3E47"))
    c.setLineWidth(0.7)
    c.roundRect(x, y, width, height, 10, fill=1, stroke=1)
    c.setFillColor(Color(0.76, 0.05, 0.09, alpha=0.14))
    c.circle(x + 30, y + height - 31, 19, fill=1, stroke=0)
    draw_svg(c, icon_name, x + 19, y + height - 42, 22, RED)
    paragraph(c, title, x + 18, y + height - 61, width - 36,
              font="Segoe-Semibold", size=9, leading=11, color=white)
    paragraph(c, body, x + 18, y + height - 81, width - 36,
              font="Segoe", size=6.8, leading=8.5, color=HexColor("#C9CBD1"))


def solution_card(c, x, y, width, height, icon_name, title, body):
    c.setFillColor(white)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.roundRect(x, y, width, height, 10, fill=1, stroke=1)
    c.setFillColor(RED_LIGHT)
    c.circle(x + 29, y + height - 29, 18, fill=1, stroke=0)
    draw_svg(c, icon_name, x + 18, y + height - 40, 22, RED)
    paragraph(c, title, x + 55, y + height - 18, width - 68,
              font="Segoe-Semibold", size=9.3, leading=11.5, color=BLACK)
    paragraph(c, body, x + 55, y + height - 43, width - 68,
              font="Segoe", size=6.9, leading=8.7, color=MID)


def photo_tile(c, image_path, x, y, width, height, label):
    draw_rounded_image(c, image_path, x, y, width, height, radius=9)
    c.saveState()
    c.setFillColor(Color(0.02, 0.02, 0.03, alpha=0.68))
    c.roundRect(x, y, width, 35, 9, fill=1, stroke=0)
    c.rect(x, y + 15, width, 20, fill=1, stroke=0)
    c.restoreState()
    c.setFillColor(white)
    c.setFont("Segoe-Semibold", 7.6)
    c.drawString(x + 12, y + 13, label)


def sector_pill(c, x, y, width, icon_name, label):
    c.setFillColor(GRAPHITE_2)
    c.setStrokeColor(HexColor("#484B55"))
    c.setLineWidth(0.65)
    c.roundRect(x, y, width, 34, 8, fill=1, stroke=1)
    draw_svg(c, icon_name, x + 9, y + 8, 18, RED)
    c.setFillColor(white)
    c.setFont("Segoe-Semibold", 7.1)
    c.drawString(x + 34, y + 12, label)


def page_one(c):
    c.setFillColor(CHARCOAL)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    draw_cover_image(c, HERO, 0, H - 520, W, 520, focus_x=0.67, focus_y=0.5)

    c.saveState()
    c.setFillColor(Color(0.01, 0.01, 0.015, alpha=0.38))
    c.rect(0, H - 520, W, 520, fill=1, stroke=0)
    c.setFillColor(Color(0.01, 0.01, 0.015, alpha=0.76))
    c.rect(0, H - 520, 315, 520, fill=1, stroke=0)
    c.restoreState()

    top_rule(c)
    draw_contain_image(c, LOGO_WHITE, 34, H - 91, 212, 62)

    c.setFillColor(RED)
    c.roundRect(34, H - 130, 137, 23, 11.5, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Segoe-Semibold", 7.2)
    c.drawCentredString(102.5, H - 122, "APRESENTAÇÃO COMERCIAL | 2026")

    paragraph(
        c,
        "Vedações industriais<br/><b>sob medida</b> para<br/>quem não pode parar.",
        34,
        H - 165,
        340,
        font="Segoe",
        size=25.5,
        leading=29.5,
        color=white,
    )
    c.setStrokeColor(RED)
    c.setLineWidth(3.2)
    c.line(34, H - 280, 105, H - 280)
    paragraph(
        c,
        "Precisão, agilidade e materiais de alta performance para manutenção, reposição e aplicações críticas.",
        34,
        H - 299,
        290,
        font="Segoe",
        size=9.2,
        leading=12.5,
        color=HexColor("#E1E2E5"),
    )

    c.setFillColor(CHARCOAL)
    c.rect(0, 0, W, 325, fill=1, stroke=0)
    c.setFillColor(RED)
    c.rect(0, 320, W, 5, fill=1, stroke=0)

    cards = [
        ("ruler-measure", "Fabricação sob medida",
         "Por amostra, desenho, foto ou medidas da aplicação."),
        ("microscope", "Atendimento técnico",
         "Análise de geometria, material e condições de trabalho."),
        ("bolt", "Agilidade no orçamento",
         "Resposta objetiva para urgências e paradas de máquina."),
    ]
    for index, card in enumerate(cards):
        dark_feature_card(c, 34 + index * 176, 196, 160, 106, *card)

    c.setFillColor(GRAPHITE)
    c.roundRect(34, 50, W - 68, 121, 12, fill=1, stroke=0)
    paragraph(c, "Da necessidade à peça pronta.", 52, 147, 310,
              font="Segoe-Bold", size=15, leading=18, color=white)
    paragraph(
        c,
        "Envie uma amostra, desenho ou dados técnicos. Nossa equipe avalia a solução e orienta o próximo passo.",
        52,
        122,
        315,
        font="Segoe",
        size=7.8,
        leading=10.4,
        color=HexColor("#C9CBD1"),
    )
    link_button(c, "FALAR COM UM ESPECIALISTA", "https://wa.me/5519983011817",
                388, 103, 153, 34)
    link_text(c, "vendas@parts-seals.com.br", "mailto:vendas@parts-seals.com.br",
              388, 76, size=7.4, color=HexColor("#E6E7E9"))
    page_footer(c, 1, dark=True)


def page_two(c):
    c.setFillColor(white)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    top_rule(c)
    draw_contain_image(c, LOGO_DARK, 34, H - 77, 165, 42)

    paragraph(c, "Linhas e soluções", 34, H - 104, 270,
              font="Segoe-Bold", size=21, leading=25, color=BLACK)
    paragraph(
        c,
        "Portfólio técnico para complementar itens padronizados e desenvolver peças especiais.",
        34,
        H - 132,
        470,
        font="Segoe",
        size=8.6,
        leading=11.5,
        color=MID,
    )

    photo_tile(c, PHOTO_COMPONENTS, 34, H - 318, 166, 145,
               "Gaxetas, anéis e raspadores")
    photo_tile(c, PHOTO_GUIDES, 215, H - 318, 166, 145,
               "Anéis guia e componentes")
    photo_tile(c, PHOTO_CUSTOM, 396, H - 318, 165, 145,
               "Peças técnicas sob medida")

    solutions = [
        ("droplet", "Vedações hidráulicas",
         "Gaxetas de haste e pistão, raspadores, anéis guia e kits para cilindros."),
        ("wind", "Vedações pneumáticas",
         "Perfis de baixo atrito, atuadores, gaxetas, raspadores e guias."),
        ("rotate-clockwise-2", "Vedações rotativas",
         "Retentores especiais, anéis e reposições para conjuntos rotativos."),
        ("ruler-measure", "Peças sob medida",
         "Fabricação por desenho ou amostra, inclusive medidas fora de catálogo."),
        ("circles-relation", "Perfis DP, DH e back-up",
         "PTFE puro ou carregado, PU e outros materiais conforme aplicação."),
        ("tool", "Reposição e manutenção",
         "Itens descontinuados, equipamentos antigos, urgências e kits especiais."),
    ]
    card_w, card_h = 255, 86
    xs = [34, 306]
    ys = [H - 438, H - 534, H - 630]
    for index, item in enumerate(solutions):
        solution_card(c, xs[index % 2], ys[index // 2],
                      card_w, card_h, *item)

    c.setFillColor(CHARCOAL)
    c.roundRect(34, 48, W - 68, 142, 12, fill=1, stroke=0)
    paragraph(c, "Materiais de alta performance", 52, 166, 300,
              font="Segoe-Bold", size=12.5, leading=15, color=white)
    paragraph(
        c,
        "A especificação considera pressão, temperatura, fluido, movimento, desgaste e condições do equipamento.",
        52,
        145,
        480,
        font="Segoe",
        size=7.2,
        leading=9.2,
        color=HexColor("#C9CBD1"),
    )
    materials = ["PU", "PTFE", "NBR", "FKM", "POM", "PEEK", "NYLON", "CELERON"]
    for index, label in enumerate(materials):
        x = 52 + index * 61
        c.setFillColor(RED if index < 4 else GRAPHITE_2)
        c.roundRect(x, 93, 52, 25, 12.5, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Segoe-Semibold", 6.8)
        c.drawCentredString(x + 26, 102, label)
    paragraph(
        c,
        "PTFE com bronze, molibdênio, grafite e outras cargas técnicas.",
        52,
        77,
        470,
        font="Segoe",
        size=6.8,
        leading=8.5,
        color=HexColor("#E0E1E4"),
    )
    page_footer(c, 2, dark=False)


def page_three(c):
    c.setFillColor(white)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    top_rule(c)
    draw_contain_image(c, LOGO_DARK, 34, H - 77, 165, 42)

    paragraph(c, "Atendimento para operações contínuas", 34, H - 105, 480,
              font="Segoe-Bold", size=19, leading=23, color=BLACK)
    paragraph(
        c,
        "Da indústria de processo à manutenção pesada, apoiamos equipes técnicas na reposição e no desenvolvimento de vedações.",
        34,
        H - 132,
        500,
        font="Segoe",
        size=8.4,
        leading=11.2,
        color=MID,
    )

    panel_y, panel_h = H - 480, 300
    c.setFillColor(CHARCOAL)
    c.roundRect(24, panel_y, W - 48, panel_h, 13, fill=1, stroke=0)
    paragraph(c, "Setores e linhas atendidas", 42, panel_y + panel_h - 27, 290,
              font="Segoe-Bold", size=14.5, leading=18, color=white)
    paragraph(
        c,
        "Soluções para ambientes que exigem precisão, confiabilidade e resposta rápida.",
        42,
        panel_y + panel_h - 50,
        460,
        font="Segoe",
        size=7.4,
        leading=9.5,
        color=HexColor("#C9CBD1"),
    )
    sectors = [
        ("home", "Linha branca"),
        ("droplet", "Óleo e gás"),
        ("chef-hat", "Alimentícia"),
        ("pill", "Farmacêutica"),
        ("building-factory-2", "Mineração"),
        ("building", "Construção"),
        ("tractor", "Máquinas agrícolas"),
        ("building-factory-2", "Metalurgia"),
        ("leaf", "Papel e celulose"),
        ("tools", "Manutenção industrial"),
        ("droplet", "Hidráulica"),
        ("wind", "Pneumática"),
        ("truck", "Linha amarela"),
        ("tractor", "Linha verde"),
    ]
    pill_w = 160
    for index, (icon_name, label) in enumerate(sectors):
        col = index % 3
        row = index // 3
        sector_pill(c, 42 + col * 171, panel_y + 188 - row * 44,
                    pill_w, icon_name, label)

    paragraph(c, "Um fluxo claro, do briefing à entrega", 34, panel_y - 30, 390,
              font="Segoe-Bold", size=13.5, leading=17, color=BLACK)
    steps = [
        ("file-upload", "Você envia", "Amostra, foto,<br/>medidas ou desenho"),
        ("microscope", "Analisamos", "Aplicação, geometria,<br/>material e urgência"),
        ("settings-code", "Desenvolvemos", "Perfil, tolerâncias<br/>e especificação"),
        ("tool", "Produzimos", "Precisão e qualidade<br/>dimensional"),
        ("package", "Entregamos", "Pronto para apoiar<br/>sua operação"),
    ]
    line_y = panel_y - 100
    c.setStrokeColor(LINE)
    c.setLineWidth(2)
    c.line(71, line_y + 17, 520, line_y + 17)
    for index, (icon_name, title, body) in enumerate(steps):
        x = 34 + index * 105
        c.setFillColor(RED)
        c.circle(x + 17, line_y + 17, 17, fill=1, stroke=0)
        draw_svg(c, icon_name, x + 8, line_y + 8, 18, white)
        paragraph(c, title, x, line_y - 12, 95,
                  font="Segoe-Semibold", size=7.6, leading=9.5, color=BLACK)
        paragraph(c, body, x, line_y - 30, 95,
                  font="Segoe", size=6.2, leading=7.5, color=MID)

    c.setFillColor(RED)
    c.roundRect(24, 42, W - 48, 132, 12, fill=1, stroke=0)
    paragraph(c, "Vamos avaliar uma aplicação real?", 42, 151, 320,
              font="Segoe-Bold", size=15, leading=18, color=white)
    paragraph(
        c,
        "Envie um desenho, uma amostra ou os dados de trabalho. Nossa equipe retorna com a análise inicial.",
        42,
        128,
        470,
        font="Segoe",
        size=7.7,
        leading=10,
        color=HexColor("#FBEDEE"),
    )
    link_text(c, "(19) 3626-3552", "tel:+551936263552", 42, 91, size=8.1)
    link_text(c, "WhatsApp: (19) 98301-1817", "https://wa.me/5519983011817",
              145, 91, size=8.1)
    link_text(c, "vendas@parts-seals.com.br", "mailto:vendas@parts-seals.com.br",
              309, 91, size=8.1)
    link_text(c, "parts-seals.com.br", "https://parts-seals.com.br",
              42, 66, size=8.1)
    paragraph(
        c,
        "R. José Adhemar Petrini, 60 - Pq. Ind. Bandeirantes - Santa Bárbara d'Oeste/SP - CEP 13457-174",
        171,
        73,
        360,
        font="Segoe",
        size=6.6,
        leading=8,
        color=HexColor("#FBEDEE"),
    )
    c.setFillColor(MID)
    c.setFont("Segoe", 6.3)
    c.drawString(34, 20, "CNPJ 30.705.918/0001-05  |  I.E. 606.270.534.118  |  © 2026 Parts Seals")
    c.drawRightString(W - 34, 20, "03")


def generate():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle("Apresentação Comercial Parts Seals")
    c.setAuthor("Parts Seals Vedações Industriais")
    c.setSubject("Linhas, setores, materiais e soluções de vedação industrial")
    c.setKeywords("vedações industriais, peças sob medida, hidráulica, pneumática, PTFE")
    page_one(c)
    c.showPage()
    page_two(c)
    c.showPage()
    page_three(c)
    c.showPage()
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    generate()
