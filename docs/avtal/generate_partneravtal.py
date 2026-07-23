#!/usr/bin/env python3
"""Genererar ViaEats Partneravtal som ifyllbar (AcroForm) PDF.

Kör:  python3 docs/avtal/generate_partneravtal.py
Ut:   docs/avtal/ViaEats-Partneravtal.pdf
"""

import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOGO_FULL = os.path.join(ROOT, "Logotyp/exports/logo-orange-smiley-2line-transparent.png")
LOGO_MARK = os.path.join(ROOT, "Logotyp/exports/logo-orange-smiley-only-transparent.png")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ViaEats-Partneravtal.pdf")

# ---------------------------------------------------------------- varumärke
ORANGE = colors.HexColor("#F04F1A")
ORANGE_SOFT = colors.HexColor("#FDEDE5")
CREAM = colors.HexColor("#FEF7F0")
INK = colors.HexColor("#1B2430")
BODY = colors.HexColor("#2E3844")
MUTED = colors.HexColor("#7A8794")
RULE = colors.HexColor("#E3E7EC")

PAGE_W, PAGE_H = A4
ML = MR = 20 * mm
MT = 24 * mm
MB = 20 * mm
CONTENT_W = PAGE_W - ML - MR

# ---------------------------------------------------------------- typsnitt
DISPLAY = "Helvetica-Bold"
try:
    pdfmetrics.registerFont(
        TTFont("ViaRound", "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf")
    )
    DISPLAY = "ViaRound"
except Exception:
    pass

SANS = "Helvetica"
SANS_B = "Helvetica-Bold"
SANS_I = "Helvetica-Oblique"

# ---------------------------------------------------------------- stilar
S = {}
S["body"] = ParagraphStyle(
    "body", fontName=SANS, fontSize=9.2, leading=14.2, textColor=BODY,
    alignment=TA_JUSTIFY, spaceAfter=6,
)
S["lead"] = ParagraphStyle("lead", parent=S["body"], fontSize=9.8, leading=15.4, textColor=INK)
S["h1"] = ParagraphStyle(
    "h1", fontName=DISPLAY, fontSize=13, leading=16, textColor=INK,
    spaceBefore=2, spaceAfter=7,
)
S["h2"] = ParagraphStyle(
    "h2", fontName=SANS_B, fontSize=9.4, leading=13, textColor=ORANGE,
    spaceBefore=7, spaceAfter=3,
)
S["bullet"] = ParagraphStyle(
    "bullet", parent=S["body"], leftIndent=13, bulletIndent=3,
    spaceAfter=2.5, alignment=TA_JUSTIFY,
)
S["note"] = ParagraphStyle(
    "note", fontName=SANS_I, fontSize=8.3, leading=12.2, textColor=MUTED, spaceAfter=6,
)
S["fieldlabel"] = ParagraphStyle("fl", fontName=SANS_B, fontSize=6.6, textColor=MUTED)
S["toc0"] = ParagraphStyle(
    "toc0", fontName=SANS, fontSize=9.2, leading=15.6, textColor=BODY,
    leftIndent=14, firstLineIndent=-14,
)
S["cover_title"] = ParagraphStyle(
    "ct", fontName=DISPLAY, fontSize=31, leading=35, textColor=INK, alignment=TA_CENTER,
)
S["cover_sub"] = ParagraphStyle(
    "cs", fontName=SANS, fontSize=10.5, leading=16, textColor=MUTED, alignment=TA_CENTER,
)
S["kicker"] = ParagraphStyle(
    "kick", fontName=SANS_B, fontSize=8, leading=11, textColor=ORANGE, alignment=TA_CENTER,
)

FIELD_SEQ = {"n": 0}


# ---------------------------------------------------------------- flowables
class HRule(Flowable):
    def __init__(self, width=CONTENT_W, thickness=0.6, color=RULE, space=0):
        Flowable.__init__(self)
        self.width, self.thickness, self.color, self.space = width, thickness, color, space

    def wrap(self, aw, ah):
        return (self.width, self.thickness + self.space)

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.space / 2, self.width, self.space / 2)


class SectionHead(Flowable):
    """Numrerad kapitelrubrik med orange sifferplatta."""

    def __init__(self, number, title):
        Flowable.__init__(self)
        self.number = str(number) if number is not None else None
        self.title = title
        self.h = 20

    def wrap(self, aw, ah):
        return (CONTENT_W, self.h + 6)

    def draw(self):
        c = self.canv
        y = 6
        c.setFillColor(ORANGE)
        if self.number is None:
            c.roundRect(0, y, 5, 15, 2.5, stroke=0, fill=1)
            x = 13
        else:
            c.roundRect(0, y, 19, 15, 3.4, stroke=0, fill=1)
            c.setFillColor(colors.white)
            c.setFont(SANS_B, 9)
            c.drawCentredString(9.5, y + 4.6, self.number)
            x = 26
        c.setFillColor(INK)
        c.setFont(DISPLAY, 12.6)
        c.drawString(x, y + 4.2, self.title)

    @property
    def toc_label(self):
        return self.title if self.number is None else "%s. %s" % (self.number, self.title)


class Field(Flowable):
    """Ett ifyllbart AcroForm-textfält med etikett ovanför."""

    def __init__(self, label, width, height=15, value="", name=None, multiline=False, fontsize=9):
        Flowable.__init__(self)
        FIELD_SEQ["n"] += 1
        self.label = label
        self.width = width
        self.height = height
        self.value = value
        self.multiline = multiline
        self.fontsize = fontsize
        self.name = name or ("f%03d_%s" % (FIELD_SEQ["n"], _slug(label)))

    def wrap(self, aw, ah):
        return (self.width, self.height + 11)

    def draw(self):
        c = self.canv
        c.setFont(SANS_B, 6.4)
        c.setFillColor(MUTED)
        c.drawString(1, self.height + 4, self.label.upper())
        c.acroForm.textfield(
            name=self.name,
            tooltip=self.label,
            value=self.value,
            x=0,
            y=0,
            width=self.width,
            height=self.height,
            borderWidth=0.7,
            borderColor=colors.HexColor("#C9D1DA"),
            fillColor=colors.HexColor("#FBFCFD"),
            textColor=INK,
            fontName="Helvetica",
            fontSize=self.fontsize,
            fieldFlags="multiline" if self.multiline else "",
            forceBorder=True,
            relative=True,
        )


class FieldGrid(Flowable):
    """Rad av fält sida vid sida. cols = [(label, viktandel), ...]"""

    def __init__(self, cols, width=CONTENT_W, height=15, gap=7, prefix=""):
        Flowable.__init__(self)
        self.cols, self.width, self.height, self.gap, self.prefix = cols, width, height, gap, prefix
        total = sum(w for _, w in cols)
        avail = width - gap * (len(cols) - 1)
        self.fields = []
        x = 0
        for label, w in cols:
            fw = avail * w / total
            self.fields.append((label, x, fw))
            x += fw + gap

    def wrap(self, aw, ah):
        return (self.width, self.height + 11)

    def draw(self):
        c = self.canv
        for label, x, fw in self.fields:
            c.setFont(SANS_B, 6.4)
            c.setFillColor(MUTED)
            c.drawString(x + 1, self.height + 4, label.upper())
            FIELD_SEQ["n"] += 1
            c.acroForm.textfield(
                name="f%03d_%s%s" % (FIELD_SEQ["n"], self.prefix, _slug(label)),
                tooltip=label,
                value="",
                x=x,
                y=0,
                width=fw,
                height=self.height,
                borderWidth=0.7,
                borderColor=colors.HexColor("#C9D1DA"),
                fillColor=colors.HexColor("#FBFCFD"),
                textColor=INK,
                fontName="Helvetica",
                fontSize=9,
                forceBorder=True,
                relative=True,
            )


class PartyCard(Flowable):
    """Ram runt partsuppgifter."""

    def __init__(self, title, rows, width=CONTENT_W, prefix=""):
        Flowable.__init__(self)
        self.title, self.rows, self.width, self.prefix = title, rows, width, prefix
        self.pad = 10
        self.rowh = 26
        self.h = 24 + len(rows) * self.rowh + self.pad

    def wrap(self, aw, ah):
        return (self.width, self.h)

    def draw(self):
        c = self.canv
        h = self.h
        c.setFillColor(CREAM)
        c.setStrokeColor(colors.HexColor("#F3DDD0"))
        c.setLineWidth(0.7)
        c.roundRect(0, 0, self.width, h, 5, stroke=1, fill=1)
        c.setFillColor(ORANGE)
        c.setFont(SANS_B, 7.4)
        c.drawString(self.pad, h - 15, self.title.upper())

        inner = self.width - 2 * self.pad
        y = h - 24
        for row in self.rows:
            y -= self.rowh
            total = sum(w for _, w, _ in row)
            gap = 7
            avail = inner - gap * (len(row) - 1)
            x = self.pad
            for label, w, val in row:
                fw = avail * w / total
                c.setFont(SANS_B, 6.4)
                c.setFillColor(MUTED)
                c.drawString(x + 1, y + 17, label.upper())
                FIELD_SEQ["n"] += 1
                c.acroForm.textfield(
                    name="f%03d_%s%s" % (FIELD_SEQ["n"], self.prefix, _slug(label)),
                    tooltip="%s – %s" % (self.title, label),
                    value=val,
                    x=x,
                    y=y,
                    width=fw,
                    height=15,
                    borderWidth=0.7,
                    borderColor=colors.HexColor("#E4C9B8"),
                    fillColor=colors.white,
                    textColor=INK,
                    fontName="Helvetica",
                    fontSize=9,
                    forceBorder=True,
                    relative=True,
                )
                x += fw + gap


class SignBlock(Flowable):
    """Underskriftsruta: ort/datum-fält + signaturlinje + namnförtydligande."""

    def __init__(self, title, width, prefix):
        Flowable.__init__(self)
        self.title, self.width, self.prefix = title, width, prefix
        self.h = 138

    def wrap(self, aw, ah):
        return (self.width, self.h)

    def draw(self):
        c = self.canv
        w, h = self.width, self.h
        c.setStrokeColor(RULE)
        c.setLineWidth(0.7)
        c.roundRect(0, 0, w, h, 5, stroke=1, fill=0)
        c.setFillColor(ORANGE)
        c.setFont(SANS_B, 7.4)
        c.drawString(10, h - 15, self.title.upper())

        inner = w - 20
        # Ort + datum
        y = h - 44
        half = (inner - 7) / 2
        for i, label in enumerate(("Ort", "Datum")):
            x = 10 + i * (half + 7)
            c.setFont(SANS_B, 6.4)
            c.setFillColor(MUTED)
            c.drawString(x + 1, y + 17, label.upper())
            FIELD_SEQ["n"] += 1
            c.acroForm.textfield(
                name="f%03d_%s%s" % (FIELD_SEQ["n"], self.prefix, _slug(label)),
                tooltip="%s – %s" % (self.title, label),
                x=x, y=y, width=half, height=15,
                borderWidth=0.7, borderColor=colors.HexColor("#C9D1DA"),
                fillColor=colors.HexColor("#FBFCFD"), textColor=INK,
                fontName="Helvetica", fontSize=9, forceBorder=True, relative=True,
            )

        # Signaturlinje (skrivs för hand eller e-signeras)
        c.setStrokeColor(colors.HexColor("#9AA6B2"))
        c.setLineWidth(0.8)
        c.line(10, y - 34, 10 + inner, y - 34)
        c.setFont(SANS, 6.6)
        c.setFillColor(MUTED)
        c.drawString(10, y - 43, "NAMNTECKNING")

        # Namnförtydligande + titel
        y2 = y - 76
        for i, label in enumerate(("Namnförtydligande", "Befattning")):
            x = 10 + i * (half + 7)
            c.setFont(SANS_B, 6.4)
            c.setFillColor(MUTED)
            c.drawString(x + 1, y2 + 17, label.upper())
            FIELD_SEQ["n"] += 1
            c.acroForm.textfield(
                name="f%03d_%s%s" % (FIELD_SEQ["n"], self.prefix, _slug(label)),
                tooltip="%s – %s" % (self.title, label),
                x=x, y=y2, width=half, height=15,
                borderWidth=0.7, borderColor=colors.HexColor("#C9D1DA"),
                fillColor=colors.HexColor("#FBFCFD"), textColor=INK,
                fontName="Helvetica", fontSize=9, forceBorder=True, relative=True,
            )


class Callout(Flowable):
    """Ljus infoyta med punktlista – används på försättssidan."""

    def __init__(self, items, width=CONTENT_W):
        Flowable.__init__(self)
        self.items = items
        self.width = width
        self.rowh = 15.5
        self.h = 20 + len(items) * self.rowh

    def wrap(self, aw, ah):
        return (self.width, self.h)

    def draw(self):
        c = self.canv
        c.setFillColor(ORANGE_SOFT)
        c.roundRect(0, 0, self.width, self.h, 5, stroke=0, fill=1)
        y = self.h - 20
        for it in self.items:
            c.setFillColor(ORANGE)
            c.circle(16, y + 3.2, 2.1, stroke=0, fill=1)
            c.setFillColor(INK)
            c.setFont(SANS, 9)
            c.drawString(26, y, it)
            y -= self.rowh


def _slug(text):
    """ASCII-säkert fältnamn – vissa PDF-läsare hanterar inte å/ä/ö i fältnamn."""
    trans = {"å": "a", "ä": "a", "ö": "o", "é": "e", "ü": "u"}
    keep = []
    for ch in text.lower():
        ch = trans.get(ch, ch)
        if ch.isalnum() and ord(ch) < 128:
            keep.append(ch)
        elif ch in " -/":
            keep.append("_")
    return "".join(keep)[:28]


# ---------------------------------------------------------------- hjälpare
def P(text, style="body"):
    return Paragraph(text, S[style])


def UL(items, style="bullet"):
    return [Paragraph(t, S[style], bulletText="•") for t in items]


def H2(text):
    return Paragraph(text, S["h2"])


# ---------------------------------------------------------------- dokument
class AgreementDoc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, SectionHead):
            self.notify("TOCEntry", (0, flowable.toc_label, self.page))


class NumberedCanvas(pdfcanvas.Canvas):
    def __init__(self, *args, **kw):
        pdfcanvas.Canvas.__init__(self, *args, **kw)
        self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            if self._pageNumber > 1:
                self._footer(total)
            pdfcanvas.Canvas.showPage(self)
        pdfcanvas.Canvas.save(self)

    def _footer(self, total):
        self.saveState()
        self.setStrokeColor(RULE)
        self.setLineWidth(0.6)
        self.line(ML, MB - 6, PAGE_W - MR, MB - 6)
        self.setFont(SANS, 7.2)
        self.setFillColor(MUTED)
        self.drawString(ML, MB - 15, "ViaEats AB – Partneravtal")
        self.drawRightString(PAGE_W - MR, MB - 15, "Sida %d av %d" % (self._pageNumber, total))
        self.restoreState()


def header(canvas, doc):
    """Sidhuvud på alla sidor utom försättsbladet."""
    if doc.page == 1:
        return
    canvas.saveState()
    y = PAGE_H - MT + 12
    try:
        canvas.drawImage(LOGO_MARK, ML, y - 2, width=11, height=11,
                         mask="auto", preserveAspectRatio=True)
    except Exception:
        pass
    canvas.setFont(SANS_B, 7.4)
    canvas.setFillColor(INK)
    canvas.drawString(ML + 16, y + 1.5, "VIAEATS")
    canvas.setFont(SANS, 7.4)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(PAGE_W - MR, y + 1.5, "Partneravtal – samarbetsvillkor")
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.6)
    canvas.line(ML, y - 5, PAGE_W - MR, y - 5)
    canvas.restoreState()


COVER_BAND = 128 * mm


def cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, PAGE_H - COVER_BAND, PAGE_W, COVER_BAND, stroke=0, fill=1)
    canvas.setFillColor(ORANGE)
    canvas.rect(0, PAGE_H - COVER_BAND, PAGE_W, 3.5, stroke=0, fill=1)
    canvas.rect(0, 0, PAGE_W, 10 * mm, stroke=0, fill=1)
    canvas.setFont(SANS_B, 7.4)
    canvas.setFillColor(colors.white)
    canvas.drawCentredString(PAGE_W / 2, 4.1 * mm, "VIAEATS.SE")
    canvas.restoreState()


# ---------------------------------------------------------------- innehåll
def build_story():
    st = []

    # ---------------- Försättsblad ----------------
    st.append(Spacer(1, 14 * mm))
    st.append(Image(LOGO_FULL, width=36 * mm, height=37 * mm, hAlign="CENTER"))
    st.append(Spacer(1, 13 * mm))
    st.append(P("SAMARBETSAVTAL FÖR RESTAURANGPARTNER", "kicker"))
    st.append(Spacer(1, 5))
    st.append(P("Partneravtal", "cover_title"))
    st.append(Spacer(1, 6))
    st.append(
        P(
            "Avtal om anslutning till och användning av ViaEats digitala<br/>"
            "beställnings- och leveransplattform",
            "cover_sub",
        )
    )
    st.append(Spacer(1, 30 * mm))
    st.append(
        Callout(
            [
                "Ingen startavgift och ingen anslutningsavgift",
                "Ingen månadsavgift – om inget annat skriftligen avtalas",
                "Ingen bindningstid och ingen uppsägningstid",
                "Provision enligt Bilaga A – inga dolda kostnader",
            ]
        )
    )
    st.append(Spacer(1, 11 * mm))
    st.append(
        FieldGrid(
            [("Restaurang / företagsnamn", 2), ("Avtalsnummer", 1), ("Avtalsdatum", 1)],
            prefix="cover_",
        )
    )
    st.append(Spacer(1, 6))
    st.append(
        P(
            "Detta dokument är ifyllbart. Fälten kan fyllas i digitalt i valfri PDF-läsare "
            "och sparas innan avtalet skrivs ut eller e-signeras.",
            "note",
        )
    )
    st.append(Spacer(1, 30 * mm))
    st.append(HRule(space=12))
    st.append(
        P(
            "ViaEats AB &nbsp;·&nbsp; partner@viaeats.se &nbsp;·&nbsp; viaeats.se "
            "&nbsp;&nbsp;|&nbsp;&nbsp; Partneravtal version 1.0 &nbsp;·&nbsp; "
            "Avtalet omfattar 28 punkter jämte bilagorna A–E",
            "note",
        )
    )
    st.append(PageBreak())

    # ---------------- Innehållsförteckning ----------------
    st.append(Paragraph("Innehåll", S["h1"]))
    st.append(HRule(space=10))
    st.append(Spacer(1, 6))
    toc = TableOfContents()
    toc.levelStyles = [S["toc0"]]
    toc.dotsMinLevel = 0
    st.append(toc)
    st.append(Spacer(1, 8))
    st.append(HRule(space=8))
    st.append(
        P(
            "Bilaga A – Provisionsmodell &nbsp;·&nbsp; Bilaga B – Utbetalningsrutiner "
            "&nbsp;·&nbsp; Bilaga C – Tekniska krav för terminalen &nbsp;·&nbsp; "
            "Bilaga D – Kampanj- och marknadsföringsregler &nbsp;·&nbsp; "
            "Bilaga E – Personuppgiftsbiträdesavtal (GDPR)",
            "note",
        )
    )
    st.append(PageBreak())

    for block in sections():
        st.extend(block)

    return st


def sec(number, title, *flows):
    """Kapitel: rubriken hålls ihop med första innehållsblocket."""
    head = [SectionHead(number, title)]
    rest = list(flows)
    if rest:
        head.append(rest.pop(0))
    return [KeepTogether(head)] + rest + [Spacer(1, 7)]


def sections():
    out = []

    # 1 --------------------------------------------------------------
    out.append(
        sec(
            1,
            "Avtalets parter",
            P(
                "Detta partneravtal (”Avtalet”) har ingåtts mellan nedan angivna parter. "
                "Var och en benämns nedan ”Part” och gemensamt ”Parterna”.",
            ),
            Spacer(1, 4),
            PartyCard(
                "Leverantör av plattformen",
                [
                    [("Företagsnamn", 2, "ViaEats AB"), ("Organisationsnummer", 1, "")],
                    [("Adress", 2, ""), ("Postnummer och ort", 1, "")],
                    [("Kontaktperson", 1, ""), ("Telefon", 1, ""), ("E-post", 1, "")],
                ],
                prefix="ve_",
            ),
            Spacer(1, 8),
            PartyCard(
                "Restaurangpartner",
                [
                    [("Företagsnamn", 2, ""), ("Organisationsnummer", 1, "")],
                    [("Adress", 2, ""), ("Postnummer och ort", 1, "")],
                    [("Kontaktperson", 1, ""), ("Telefon", 1, ""), ("E-post", 1, "")],
                    [("Serveringsställe / enhetens namn", 2, ""), ("Livsmedelsanläggningsnr", 1, "")],
                ],
                prefix="rest_",
            ),
            Spacer(1, 6),
            P(
                "Parterna är självständiga näringsidkare. Avtalet innebär inte att anställnings-, "
                "franchise-, handelsbolags- eller agenturförhållande uppkommer mellan Parterna, och "
                "ingen Part äger rätt att företräda den andra Parten utöver vad som uttryckligen "
                "framgår av Avtalet.",
            ),
        )
    )

    # 2 --------------------------------------------------------------
    defs = [
        ("ViaEats", "ViaEats AB, som tillhandahåller Plattformen och därtill hörande tjänster."),
        ("Partner / Restaurang", "Den restaurang eller det företag som anges i punkt 1 och som ansluter sig till Plattformen."),
        ("Kund", "Den konsument eller det företag som lägger en Beställning via Plattformen."),
        ("Beställning", "En order som Kunden lägger via Plattformen avseende Restaurangens produkter."),
        ("Ordervärde", "Det sammanlagda beloppet för de av Restaurangens produkter som ingår i en Beställning, inklusive mervärdesskatt och exklusive leveransavgift, serviceavgift, dricks och andra avgifter som tillkommer ViaEats."),
        ("Provision", "Den ersättning som ViaEats erhåller för förmedlade Beställningar, beräknad enligt Bilaga A."),
        ("Leverans", "Transport av en Beställning från Restaurangen till Kunden, utförd av ViaEats, av ViaEats anlitad budpartner eller av Restaurangen själv."),
        ("Terminal", "Den enhet, applikation eller programvara genom vilken Restaurangen tar emot, hanterar och kvitterar Beställningar."),
        ("Plattform", "ViaEats app, webbplats, terminalprogramvara, gränssnitt (API) och tillhörande system."),
        ("Bilaga", "Bilaga till Avtalet enligt punkt 28, vilken utgör en integrerad del av Avtalet."),
    ]
    flows = [P("I Avtalet ska nedan angivna begrepp ha följande innebörd.")]
    for term, desc in defs:
        flows.append(
            Paragraph("<b>%s.</b> %s" % (term, desc), S["bullet"], bulletText="•")
        )
    out.append(sec(2, "Definitioner", *flows))

    # 3 --------------------------------------------------------------
    out.append(
        sec(
            3,
            "Avtalets syfte",
            P(
                "ViaEats tillhandahåller en digital marknadsplats där Restaurangen kan presentera "
                "sitt sortiment, marknadsföra sina produkter och ta emot Beställningar från Kunder. "
                "ViaEats roll är att förmedla kontakt och Beställningar mellan Restaurangen och "
                "Kunden samt att tillhandahålla de tekniska funktioner som krävs för detta.",
            ),
            P(
                "Avtalet reglerar villkoren för Restaurangens anslutning till och användning av "
                "Plattformen samt Parternas inbördes rättigheter och skyldigheter. Köpeavtalet "
                "avseende maten ingås mellan Restaurangen och Kunden. ViaEats är inte part i detta "
                "köpeavtal, om inte annat uttryckligen anges.",
            ),
            P(
                "Samarbetet bygger på ömsesidigt förtroende, öppen kommunikation och en gemensam "
                "ambition att ge Kunden en god upplevelse.",
            ),
        )
    )

    # 4 --------------------------------------------------------------
    out.append(
        sec(
            4,
            "Avtalstid och upphörande",
            P(
                "Avtalet träder i kraft den dag det undertecknas av båda Parter och gäller därefter "
                "tills vidare.",
            ),
            H2("4.1 Ingen bindningstid"),
            P(
                "Avtalet innehåller ingen bindningstid. Restaurangen är aldrig bunden till "
                "Plattformen under en viss minsta avtalsperiod.",
            ),
            H2("4.2 Uppsägning"),
            *UL(
                [
                    "Vardera Part får säga upp Avtalet när som helst, utan uppsägningstid och utan att ange skäl. Uppsägning ska ske skriftligen, varvid e-post till den kontaktadress som anges i punkt 1 anses uppfylla skriftlighetskravet.",
                    "ViaEats ska dock, när uppsägning sker på ViaEats initiativ och inte grundas på avtalsbrott, bedrägeri eller annan omständighet enligt punkt 24, i möjligaste mån underrätta Restaurangen i skälig tid i förväg.",
                    "Uppsägning får inte ske på ett sätt som är otillbörligt eller som strider mot tvingande lag.",
                ]
            ),
            H2("4.3 Avveckling"),
            *UL(
                [
                    "Beställningar som redan har accepterats av Restaurangen ska alltid slutföras, även om Avtalet dessförinnan har sagts upp.",
                    "Utestående betalningar och Provision ska regleras mellan Parterna innan samarbetet slutligt avslutas, dock senast i samband med nästkommande ordinarie utbetalningstillfälle.",
                    "Restaurangens uppgifter döljs på Plattformen i samband med att Avtalet upphör.",
                    "Bestämmelserna i punkterna 17–22 och 27 samt bestämmelser som till sin natur är avsedda att gälla även därefter fortsätter att gälla efter det att Avtalet har upphört.",
                ]
            ),
        )
    )

    # 5 --------------------------------------------------------------
    out.append(
        sec(
            5,
            "Avgifter",
            P("Anslutningen till Plattformen är kostnadsfri. Följande gäller mellan Parterna."),
            *UL(
                [
                    "<b>Ingen startavgift.</b> ViaEats tar inte ut någon avgift för att inleda samarbetet.",
                    "<b>Ingen anslutningsavgift.</b> Restaurangen betalar inte för att anslutas till Plattformen.",
                    "<b>Ingen installationsavgift.</b> Uppsättning av konto, meny och Terminal sker utan kostnad.",
                    "<b>Ingen månadsavgift.</b> Löpande abonnemangsavgift utgår inte, om inte annat uttryckligen och skriftligen har avtalats mellan Parterna.",
                    "<b>Provision.</b> ViaEats ersättning utgörs av Provision på förmedlade Beställningar enligt Bilaga A.",
                ]
            ),
            P(
                "Utrustning som ViaEats tillhandahåller utan kostnad förblir ViaEats egendom och ska "
                "återlämnas i väsentligen oförändrat skick när Avtalet upphör, om inte annat "
                "överenskommits. Restaurangen svarar för egna kostnader för internetuppkoppling, "
                "el och egen utrustning.",
            ),
        )
    )

    # 6 --------------------------------------------------------------
    out.append(
        sec(
            6,
            "Provision",
            H2("6.1 Beräkning"),
            P(
                "Provision beräknas som en procentuell andel av Ordervärdet för varje genomförd "
                "Beställning, i enlighet med den provisionssats som anges i Bilaga A. Om inte annat "
                "anges i Bilaga A beräknas Provisionen på Ordervärdet exklusive leveransavgift, "
                "serviceavgift, dricks och emballageavgift.",
            ),
            H2("6.2 Avdrag"),
            P(
                "Provisionen dras av automatiskt vid avräkning innan utbetalning sker till "
                "Restaurangen. Provision utgår inte på Beställningar som annullerats innan "
                "Restaurangen påbörjat tillagningen, eller på belopp som återbetalats till Kunden i "
                "de fall Restaurangen inte ansvarar för orsaken till återbetalningen.",
            ),
            H2("6.3 Utbetalning och redovisning"),
            P(
                "Utbetalning sker enligt det intervall som anges i Bilaga B. Restaurangen får "
                "löpande tillgång till en specifikation i ViaEats partnergränssnitt som visar "
                "Beställningar, Ordervärde, Provision, eventuella avdrag och utbetalt belopp. "
                "Underlaget är tillgängligt digitalt och kan laddas ned av Restaurangen.",
            ),
            H2("6.4 Ändring av provisionssats"),
            P(
                "Ändring av provisionssatsen sker enligt punkt 26. Restaurangen har alltid rätt att "
                "avsluta samarbetet om en aviserad ändring inte accepteras.",
            ),
        )
    )

    # 7 --------------------------------------------------------------
    out.append(
        sec(
            7,
            "Restaurangens skyldigheter",
            P("Restaurangen ansvarar gentemot ViaEats och Kunden för följande."),
            *UL(
                [
                    "Att menyn på Plattformen är korrekt, aktuell och överensstämmer med det sortiment som faktiskt tillhandahålls.",
                    "Att angivna priser är korrekta och inkluderar mervärdesskatt i enlighet med gällande rätt.",
                    "Att all information om Restaurangen och dess produkter är riktig och hålls uppdaterad.",
                    "Att livsmedelshantering, hygien, förvaring och tillagning sker i enlighet med livsmedelslagen (2006:804), tillämpliga EU-förordningar och Livsmedelsverkets föreskrifter.",
                    "Att Restaurangen innehar och vidmakthåller samtliga erforderliga tillstånd, registreringar och godkännanden för sin verksamhet.",
                    "Att korrekt och fullständig allergen- och innehållsinformation lämnas för samtliga produkter i enlighet med tillämplig livsmedelsinformationslagstiftning.",
                    "Att öppettider på Plattformen motsvarar de tider då Restaurangen faktiskt kan ta emot Beställningar.",
                    "Att Restaurangen har tillräcklig bemanning för att hantera inkommande Beställningar under angivna öppettider.",
                    "Att maten håller god och jämn kvalitet samt att emballering sker på ett sätt som är lämpligt för transport.",
                    "Att Restaurangen följer tillämplig arbetsrättslig, skatterättslig och konsumentskyddande lagstiftning.",
                ]
            ),
        )
    )

    # 8 --------------------------------------------------------------
    out.append(
        sec(
            8,
            "ViaEats skyldigheter",
            P("ViaEats ansvarar för följande."),
            *UL(
                [
                    "Att tillhandahålla Plattformen och hålla den tillgänglig i enlighet med god branschsed.",
                    "Att förmedla Beställningar från Kunder till Restaurangen på ett korrekt sätt.",
                    "Att tillhandahålla en betalningslösning för Kundens betalning samt hantera avräkning och utbetalning enligt punkt 17 och Bilaga B.",
                    "Att ansvara för teknisk drift, underhåll, säkerhetsuppdateringar och vidareutveckling av Plattformen.",
                    "Att tillhandahålla kundsupport avseende Plattformen, betalningar och tekniska frågor.",
                    "Att marknadsföra Plattformen och, enligt vad Parterna kommer överens om, Restaurangens sortiment.",
                    "Att i skälig tid informera Restaurangen om planerade driftstopp och väsentliga förändringar i Plattformen.",
                ]
            ),
            P(
                "Planerat underhåll ska så långt möjligt förläggas till tider med låg orderintensitet.",
            ),
        )
    )

    # 9 --------------------------------------------------------------
    out.append(
        sec(
            9,
            "Aktivt partnerskap",
            P(
                "Plattformens värde för Kunden bygger på att anslutna restauranger faktiskt är "
                "tillgängliga. Restaurangen ska därför vara en aktiv partner på ViaEats, vilket "
                "innebär att Restaurangen ska",
            ),
            *UL(
                [
                    "hålla Terminalen aktiv och uppkopplad under sina angivna öppettider,",
                    "ta emot och hantera inkommande Beställningar under dessa tider,",
                    "hålla öppettider och tillgänglighet uppdaterade på Plattformen,",
                    "i rimlig tid meddela ViaEats om planerade stängningar, semester eller andra avbrott, och",
                    "besvara ViaEats kommunikation i avtals-, order- och kvalitetsfrågor inom skälig tid, normalt inom två (2) arbetsdagar.",
                ]
            ),
            P(
                "Skyldigheterna i denna punkt ska tillämpas med hänsyn till vad som är rimligt i det "
                "enskilda fallet. Tillfälliga avvikelser som beror på omständigheter utanför "
                "Restaurangens kontroll utgör inte avtalsbrott.",
            ),
        )
    )

    # 10 -------------------------------------------------------------
    out.append(
        sec(
            10,
            "Terminal",
            P(
                "Terminalen ska vara påslagen, uppkopplad och bemannad under Restaurangens angivna "
                "öppettider. Restaurangen ansvarar för att personalen kan hantera Terminalen.",
            ),
            H2("10.1 Terminalen får inte"),
            *UL(
                [
                    "stängas av under angivna öppettider utan giltigt skäl,",
                    "kopplas bort från internet under längre perioder under angivna öppettider, eller",
                    "lämnas obevakad eller oanvänd under ordinarie öppettider.",
                ]
            ),
            H2("10.2 Giltiga skäl"),
            P(
                "Som giltigt skäl räknas bland annat strömavbrott, avbrott i internetförbindelsen, "
                "tekniska fel i Terminalen eller Plattformen, renovering eller ombyggnation, "
                "semesterstängning, sjukdom, personalbrist av tillfällig karaktär samt annan skälig "
                "orsak. Restaurangen ska meddela ViaEats om skälet så snart det är praktiskt möjligt "
                "och, när det är fråga om planerade avbrott, i förväg.",
            ),
            P(
                "Tekniska krav avseende Terminalen framgår av Bilaga C.",
            ),
        )
    )

    # 11 -------------------------------------------------------------
    out.append(
        sec(
            11,
            "Inaktivitet",
            P(
                "Med inaktivitet avses att Terminalen är avstängd eller att Restaurangen underlåter "
                "att ta emot Beställningar under angivna öppettider, utan giltigt skäl enligt "
                "punkt 10.2.",
            ),
            P(
                "Om inaktivitet föreligger under fjorton (14) sammanhängande dagar får ViaEats vidta "
                "följande åtgärder i angiven ordning.",
            ),
            *UL(
                [
                    "<b>Kontakt.</b> ViaEats kontaktar Restaurangen för att klarlägga orsaken och erbjuda hjälp.",
                    "<b>Tillfälligt döljande.</b> Om kontakt inte uppnås eller inaktiviteten består, får ViaEats tillfälligt dölja Restaurangen på Plattformen.",
                    "<b>Avstängning.</b> Om inaktiviteten kvarstår efter det att Restaurangen underrättats och getts skälig tid, normalt sju (7) dagar, att vidta rättelse, får ViaEats stänga av Restaurangen.",
                    "<b>Uppsägning.</b> ViaEats får slutligen avsluta samarbetet enligt punkt 4.",
                ]
            ),
            P(
                "Restaurangen återaktiveras utan kostnad så snart Restaurangen meddelar att den åter "
                "kan ta emot Beställningar.",
            ),
        )
    )

    # 12 -------------------------------------------------------------
    out.append(
        sec(
            12,
            "Kampanjer och erbjudanden",
            P(
                "Plattformens attraktionskraft bygger till stor del på erbjudanden till Kunder. "
                "Restaurangen förbinder sig därför att medverka konstruktivt i ViaEats "
                "kampanjarbete, vilket innebär att Restaurangen ska",
            ),
            *UL(
                [
                    "regelbundet och i skälig omfattning delta i kampanjer på Plattformen,",
                    "sträva efter att erbjuda konkurrenskraftiga erbjudanden till Kunder,",
                    "medverka i ViaEats gemensamma kampanjer i den utsträckning som är affärsmässigt rimlig för Restaurangen, och",
                    "delta i gemensamma marknadsföringsaktiviteter enligt vad Parterna kommer överens om.",
                ]
            ),
            H2("12.1 ViaEats rekommendationer"),
            P(
                "ViaEats får föreslå och rekommendera bland annat veckans erbjudande, månadens "
                "erbjudande, studentkampanjer, lunchkampanjer, kvällskampanjer och "
                "säsongskampanjer. Rekommendationerna är förslag. Restaurangen beslutar "
                "självständigt om sina priser, rabattnivåer och om deltagande i en viss kampanj.",
            ),
            H2("12.2 Fri prissättning"),
            P(
                "Restaurangen sätter självständigt sina priser på Plattformen. ViaEats bestämmer "
                "inte, och får inte kräva, ett visst pris eller en viss lägsta rabatt. Restaurangen "
                "är inte förhindrad att tillämpa andra priser eller villkor i andra "
                "försäljningskanaler.",
            ),
            H2("12.3 Uteblivet deltagande"),
            P(
                "Om Restaurangen vid upprepade tillfällen och utan rimlig anledning väljer att inte "
                "delta i gemensamma kampanjer eller erbjudanden, får ViaEats – efter dialog med "
                "Restaurangen och sedan Restaurangen getts möjlighet att yttra sig – justera "
                "Restaurangens exponering i Plattformens rekommendations- och kampanjytor eller, som "
                "yttersta åtgärd, avsluta samarbetet enligt punkt 4. Restaurangens ordinarie "
                "sökbarhet på Plattformen påverkas inte av att Restaurangen avstår från en enskild "
                "kampanj.",
            ),
            P("Närmare regler framgår av Bilaga D.", "note"),
        )
    )

    # 13 -------------------------------------------------------------
    out.append(
        sec(
            13,
            "Beställningar",
            P("Vid hantering av Beställningar ska Restaurangen"),
            *UL(
                [
                    "acceptera eller neka en Beställning inom den tid som anges i Terminalen,",
                    "ange en realistisk tillagningstid och tillaga maten i enlighet med Beställningen,",
                    "inte markera en Beställning som klar innan maten faktiskt är färdig och redo för avhämtning eller Leverans,",
                    "omgående meddela via Terminalen om en produkt är slut eller inte kan tillagas, och",
                    "kontakta ViaEats support vid avvikelser som inte kan hanteras i Terminalen.",
                ]
            ),
            P(
                "Upprepade nekade Beställningar utan giltigt skäl, eller systematiskt felaktig "
                "statusrapportering, hanteras enligt punkt 11 och 12.3.",
            ),
        )
    )

    # 14 -------------------------------------------------------------
    out.append(
        sec(
            14,
            "Leveranser",
            H2("14.1 Leverans genom ViaEats"),
            P(
                "När Leverans utförs av ViaEats eller av ViaEats anlitad budpartner ansvarar ViaEats "
                "för transporten från det att maten hämtats hos Restaurangen till dess att den "
                "överlämnats till Kunden, samt för leveranstider och kommunikation med Kunden om "
                "leveransstatus. Restaurangen ansvarar för att maten är färdig i tid, korrekt "
                "packad och korrekt märkt.",
            ),
            H2("14.2 Leverans genom Restaurangen"),
            P(
                "När Restaurangen själv utför Leverans ansvarar Restaurangen fullt ut för "
                "transporten, för att gällande trafik-, arbetsmiljö- och livsmedelsregler följs, för "
                "leveranstiden och för matens skick vid överlämnandet till Kunden.",
            ),
            H2("14.3 Avhämtning"),
            P(
                "Vid avhämtning ansvarar Restaurangen för att Beställningen finns tillgänglig vid "
                "angiven tidpunkt och är korrekt märkt.",
            ),
        )
    )

    # 15 -------------------------------------------------------------
    out.append(
        sec(
            15,
            "Meny och produktinformation",
            P(
                "Restaurangen ansvarar för innehållet i sin meny på Plattformen, inbegripet",
            ),
            *UL(
                [
                    "priser och prisändringar,",
                    "bilder och att Restaurangen innehar erforderliga rättigheter till dessa,",
                    "produktnamn och benämningar,",
                    "beskrivningar och ingrediensförteckningar,",
                    "allergener och annan obligatorisk livsmedelsinformation, och",
                    "produkternas tillgänglighet vid varje tidpunkt.",
                ]
            ),
            P(
                "Restaurangen ska utan dröjsmål rätta felaktig information. ViaEats får efter "
                "underrättelse till Restaurangen tillfälligt dölja en produkt vars information är "
                "uppenbart felaktig eller strider mot lag.",
            ),
        )
    )

    # 16 -------------------------------------------------------------
    out.append(
        sec(
            16,
            "Kundservice",
            H2("16.1 ViaEats ansvarsområde"),
            P(
                "ViaEats ansvarar för kundservice avseende Plattformen, kontohantering, betalningar "
                "och tekniska problem samt, vid Leverans utförd av ViaEats, för frågor om leveransen.",
            ),
            H2("16.2 Restaurangens ansvarsområde"),
            P(
                "Restaurangen ansvarar för frågor som rör maten, dess kvalitet och sammansättning, "
                "specialbeställningar samt allergier och särskilda kostbehov.",
            ),
            P(
                "Parterna ska samarbeta och utan onödigt dröjsmål vidarebefordra kundärenden som rör "
                "den andra Partens ansvarsområde.",
            ),
        )
    )

    # 17 -------------------------------------------------------------
    out.append(
        sec(
            17,
            "Betalningar",
            P(
                "ViaEats tar emot Kundens betalning för Restaurangens räkning genom Plattformens "
                "betalningslösning. Betalning från Kunden till ViaEats har befriande verkan för "
                "Kunden gentemot Restaurangen.",
            ),
            *UL(
                [
                    "<b>Utbetalningsintervall.</b> Utbetalning till Restaurangens angivna bankkonto sker enligt det intervall som anges i Bilaga B.",
                    "<b>Specifikation.</b> Varje utbetalning åtföljs av en specifikation med Beställningar, Ordervärde, Provision, avdrag och nettobelopp.",
                    "<b>Avdrag.</b> ViaEats får från utbetalningen dra av Provision, återbetalningar till Kund som Restaurangen ansvarar för, felaktigt utbetalda belopp samt andra på Avtalet grundade och specificerade fordringar.",
                    "<b>Mervärdesskatt.</b> Vardera Part svarar för att redovisa och betala mervärdesskatt för sin del av transaktionen enligt gällande rätt.",
                    "<b>Invändningar.</b> Invändning mot en avräkning ska framställas inom trettio (30) dagar från det att specifikationen gjordes tillgänglig. Uppenbara fel rättas dock oavsett tidsfristen.",
                ]
            ),
        )
    )

    # 18 -------------------------------------------------------------
    out.append(
        sec(
            18,
            "Återbetalningar och reklamationer",
            P(
                "Kunden kan ha rätt till hel eller delvis återbetalning bland annat när Beställningen "
                "inte levererats, när fel produkter levererats, när maten är väsentligt felaktig "
                "eller undermålig eller när Beställningen annullerats i enlighet med Plattformens "
                "villkor och tillämplig konsumentskyddslagstiftning.",
            ),
            *UL(
                [
                    "Restaurangen bär kostnaden för återbetalning när orsaken ligger inom Restaurangens ansvarsområde, exempelvis felaktigt tillagad, saknad eller felpackad mat.",
                    "ViaEats bär kostnaden när orsaken ligger inom ViaEats ansvarsområde, exempelvis fel i Plattformen eller brist i Leverans som ViaEats utfört.",
                    "ViaEats handlägger ärendet gentemot Kunden och dokumenterar grunden för beslutet.",
                    "Restaurangen har rätt att ta del av underlaget och att invända mot en återbetalning som belastar Restaurangen. Invändning framställs enligt punkt 17.",
                    "ViaEats ska inte utan sakligt underlag belasta Restaurangen för återbetalningar.",
                ]
            ),
        )
    )

    # 19 -------------------------------------------------------------
    out.append(
        sec(
            19,
            "Marknadsföring",
            P(
                "Restaurangen upplåter till ViaEats en icke-exklusiv, royaltyfri och geografiskt "
                "obegränsad rätt att under avtalstiden använda Restaurangens logotyp, bilder, "
                "produktbilder, företagsnamn, kännetecken och meny för marknadsföring av "
                "Plattformen och av Restaurangens sortiment, i digitala och tryckta kanaler.",
            ),
            *UL(
                [
                    "Materialet får inte användas på ett sätt som är vilseledande eller nedsättande för Restaurangen.",
                    "Restaurangen ansvarar för att det material som Restaurangen tillhandahåller inte gör intrång i tredje parts rättigheter.",
                    "Rätten upphör när Avtalet upphör. ViaEats ska då inom skälig tid upphöra med aktiv användning av materialet. Material i redan publicerat historiskt material, arkiv eller cachade kopior behöver dock inte återkallas.",
                    "Restaurangen får marknadsföra sin närvaro på Plattformen och använda ViaEats kännetecken i detta syfte, i enlighet med Bilaga D.",
                ]
            ),
        )
    )

    # 20 -------------------------------------------------------------
    out.append(
        sec(
            20,
            "Immateriella rättigheter",
            P(
                "Avtalet innebär ingen överlåtelse av immateriella rättigheter mellan Parterna.",
            ),
            *UL(
                [
                    "<b>ViaEats innehar</b> samtliga rättigheter till appen, webbplatsen, terminalprogramvaran, källkod, databaser, design, gränssnitt, varumärket ViaEats och övriga kännetecken samt till data som genereras i Plattformen.",
                    "<b>Restaurangen innehar</b> samtliga rättigheter till sin logotyp, sitt firmanamn, sina kännetecken, sitt bildmaterial och sitt övriga innehåll.",
                    "Vardera Part upplåter till den andra Parten endast den nyttjanderätt som uttryckligen framgår av Avtalet, och endast under avtalstiden.",
                    "Restaurangen får inte kopiera, dekompilera, modifiera eller på annat sätt utnyttja Plattformen utöver vad som följer av normal användning enligt Avtalet.",
                ]
            ),
        )
    )

    # 21 -------------------------------------------------------------
    out.append(
        sec(
            21,
            "Sekretess",
            P(
                "Vardera Part förbinder sig att inte utan den andra Partens skriftliga samtycke "
                "röja konfidentiell information till tredje man. Med konfidentiell information avses "
                "bland annat",
            ),
            *UL(
                [
                    "provisionssatser och övriga ekonomiska villkor,",
                    "försäljningssiffror, volymer och statistik,",
                    "affärshemligheter, affärsplaner och prissättningsmodeller,",
                    "kundinformation och kunddata, samt",
                    "tekniska lösningar, systemuppbyggnad och integrationer.",
                ]
            ),
            P(
                "Sekretesskyldigheten gäller inte information som är allmänt känd, som en Part "
                "självständigt tagit fram, som mottagits från tredje man utan sekretessförpliktelse "
                "eller som måste lämnas ut enligt lag, myndighetsbeslut eller domstolsavgörande. "
                "Part får dela information med rådgivare, revisorer och underleverantörer som är "
                "bundna av motsvarande sekretess. Sekretesskyldigheten gäller under avtalstiden och "
                "under tre (3) år därefter. För affärshemligheter enligt lagen (2018:558) om "
                "företagshemligheter gäller sekretessen så länge informationen utgör en "
                "företagshemlighet.",
            ),
        )
    )

    # 22 -------------------------------------------------------------
    out.append(
        sec(
            22,
            "Behandling av personuppgifter (GDPR)",
            P(
                "Parterna ska behandla personuppgifter i enlighet med Europaparlamentets och rådets "
                "förordning (EU) 2016/679 (dataskyddsförordningen, ”GDPR”) och kompletterande "
                "svensk dataskyddslagstiftning.",
            ),
            H2("22.1 Roller"),
            P(
                "ViaEats är personuppgiftsansvarig för behandlingen av Kunders personuppgifter i "
                "Plattformen samt för uppgifter om Restaurangens kontaktpersoner. Restaurangen är "
                "personuppgiftsansvarig för de personuppgifter som Restaurangen behandlar i sin egen "
                "verksamhet. I den mån en Part behandlar personuppgifter för den andra Partens "
                "räkning gäller personuppgiftsbiträdesavtalet i Bilaga E.",
            ),
            H2("22.2 Ändamål och begränsning"),
            P(
                "Personuppgifter som Restaurangen får del av genom Plattformen, såsom Kundens namn, "
                "adress, telefonnummer och orderuppgifter, får endast behandlas för att fullgöra den "
                "aktuella Beställningen och därmed sammanhängande reklamationer. Uppgifterna får "
                "inte användas för egen marknadsföring, inte lagras längre än nödvändigt och inte "
                "överlåtas till tredje man.",
            ),
            H2("22.3 Säkerhet och incidenter"),
            P(
                "Vardera Part ska vidta lämpliga tekniska och organisatoriska säkerhetsåtgärder. "
                "Part ska utan onödigt dröjsmål underrätta den andra Parten om en "
                "personuppgiftsincident som berör den andra Partens uppgifter, samt bistå med den "
                "information som krävs för anmälan till Integritetsskyddsmyndigheten.",
            ),
            H2("22.4 Registrerades rättigheter"),
            P(
                "Parterna ska bistå varandra i skälig omfattning när en registrerad utövar sina "
                "rättigheter enligt GDPR, såsom rätt till information, tillgång, rättelse, radering "
                "och invändning.",
            ),
        )
    )

    # 23 -------------------------------------------------------------
    out.append(
        sec(
            23,
            "Ansvarsbegränsning",
            P("ViaEats ansvarar inte för"),
            *UL(
                [
                    "matens kvalitet, sammansättning, temperatur eller smak,",
                    "livsmedelssäkerhet, hygien och efterlevnad av livsmedelslagstiftning i Restaurangens verksamhet,",
                    "Restaurangens personal, arbetsledning eller arbetsmiljö, eller",
                    "att Restaurangen innehar erforderliga myndighetstillstånd.",
                ]
            ),
            P(
                "Restaurangen ansvarar inte för tekniska fel, driftstörningar eller brister i "
                "Plattformen som ligger utanför Restaurangens kontroll, och inte heller för brister "
                "i Leverans som utförts av ViaEats eller av ViaEats anlitad budpartner.",
            ),
            P(
                "Ingen Part ansvarar gentemot den andra Parten för indirekt skada, såsom utebliven "
                "vinst, förlorad omsättning, förlorad goodwill eller förlust av data. Vardera Parts "
                "sammanlagda skadeståndsansvar enligt Avtalet är, för varje avtalsår, begränsat till "
                "ett belopp motsvarande den Provision som ViaEats fakturerat eller dragit av "
                "avseende Restaurangen under de tolv (12) månader som föregick den skadegörande "
                "handlingen.",
            ),
            P(
                "Ansvarsbegränsningarna gäller inte vid uppsåt eller grov vårdslöshet, vid brott mot "
                "punkt 21 eller 22, vid intrång i den andra Partens immateriella rättigheter eller i "
                "övrigt i den utsträckning tvingande lag föreskriver annat. Begränsningarna påverkar "
                "inte Kundens rättigheter enligt konsumentskyddande lagstiftning.",
            ),
        )
    )

    # 24 -------------------------------------------------------------
    out.append(
        sec(
            24,
            "Bedrägeri och missbruk",
            P(
                "ViaEats får med omedelbar verkan stänga av Restaurangen från Plattformen och hålla "
                "inne utbetalningar avseende berörda Beställningar vid välgrundad misstanke om",
            ),
            *UL(
                [
                    "bedrägeri eller annan brottslig handling riktad mot ViaEats, Kund eller tredje man,",
                    "falska, fingerade eller manipulerade Beställningar,",
                    "manipulerade eller köpta recensioner och omdömen,",
                    "väsentligt vilseledande information om Restaurangen, dess produkter eller innehåll, eller",
                    "brott mot svensk lag i verksamheten.",
                ]
            ),
            P(
                "ViaEats ska underrätta Restaurangen om åtgärden och om grunden för den, samt ge "
                "Restaurangen möjlighet att yttra sig, om detta inte skulle motverka en pågående "
                "utredning eller strida mot lag. Om misstanken visar sig obefogad ska avstängningen "
                "hävas och innehållna belopp betalas ut utan dröjsmål.",
            ),
        )
    )

    # 25 -------------------------------------------------------------
    out.append(
        sec(
            25,
            "Force majeure",
            P(
                "Part är befriad från påföljd för underlåtenhet att fullgöra viss förpliktelse enligt "
                "Avtalet om underlåtenheten har sin grund i en omständighet utanför Partens kontroll "
                "som Parten inte skäligen kunde ha förutsett vid Avtalets ingående och vars följder "
                "Parten inte skäligen kunde ha undvikit eller övervunnit. Som sådan omständighet ska "
                "anses bland annat krig, terrorhandling, upplopp, naturkatastrof, brand, "
                "omfattande epidemi eller pandemi, myndighetsbeslut, allmän arbetskonflikt, "
                "avbrott i allmänna kommunikationer, el- eller internetförsörjning samt omfattande "
                "störningar hos underleverantörer.",
            ),
            P(
                "Part som önskar åberopa force majeure ska utan dröjsmål underrätta den andra Parten "
                "om detta och om när fullgörande beräknas kunna ske. Om hindret varar längre än "
                "sextio (60) dagar får vardera Part frånträda Avtalet med omedelbar verkan.",
            ),
        )
    )

    # 26 -------------------------------------------------------------
    out.append(
        sec(
            26,
            "Ändring av avtalet",
            P(
                "ViaEats får ändra villkoren i Avtalet och dess bilagor. Ändring ska aviseras "
                "skriftligen, till exempel via e-post eller i partnergränssnittet, minst trettio (30) "
                "dagar innan ändringen träder i kraft.",
            ),
            *UL(
                [
                    "Om Restaurangen inte accepterar ändringen får Restaurangen säga upp Avtalet enligt punkt 4 innan ändringen träder i kraft, utan kostnad och utan uppsägningstid.",
                    "Om Restaurangen fortsätter att använda Plattformen efter ikraftträdandet anses ändringen accepterad.",
                    "Ändringar som är nödvändiga till följd av lag, myndighetsbeslut eller akuta säkerhetsskäl får genomföras med kortare varsel. Restaurangen ska då underrättas så snart det är möjligt.",
                    "Ändringar som är till Restaurangens fördel, eller som är av rent redaktionell karaktär, får genomföras omedelbart.",
                    "Övriga ändringar och tillägg till Avtalet ska för att vara gällande upprättas skriftligen och undertecknas av båda Parter.",
                ]
            ),
        )
    )

    # 27 -------------------------------------------------------------
    out.append(
        sec(
            27,
            "Tillämplig lag och tvistelösning",
            P(
                "På Avtalet ska svensk lag tillämpas, med undantag för dess lagvalsregler.",
            ),
            P(
                "Tvist eller meningsskiljaktighet som uppstår med anledning av Avtalet ska i första "
                "hand lösas genom dialog och förhandling mellan Parterna. Parterna ska verka för en "
                "praktisk och affärsmässig lösning.",
            ),
            P(
                "Om Parterna inte når en lösning ska tvisten slutligt avgöras av svensk allmän "
                "domstol, med Stockholms tingsrätt som första instans om inte annat följer av "
                "tvingande forumregler.",
            ),
            P(
                "Att en tvist hänskjuts till domstol befriar inte Parterna från skyldigheten att "
                "fullgöra sina förpliktelser i övrigt enligt Avtalet.",
            ),
        )
    )

    # 28 -------------------------------------------------------------
    out.append(
        sec(
            28,
            "Bilagor",
            P(
                "Följande bilagor utgör en integrerad del av Avtalet. Vid motstridighet mellan "
                "Avtalets huvuddokument och en bilaga har huvuddokumentet företräde, om inte annat "
                "uttryckligen anges i bilagan.",
            ),
            *UL(
                [
                    "<b>Bilaga A – Provisionsmodell.</b> Provisionssatser, beräkningsunderlag och eventuella volymtrappor.",
                    "<b>Bilaga B – Utbetalningsrutiner.</b> Utbetalningsintervall, betalningsvillkor, bankuppgifter och avräkningsunderlag.",
                    "<b>Bilaga C – Tekniska krav för terminalen.</b> Hårdvara, programvara, nätverk och support.",
                    "<b>Bilaga D – Kampanj- och marknadsföringsregler.</b> Kampanjformat, bildkrav, användning av kännetecken och riktlinjer för gemensam marknadsföring.",
                    "<b>Bilaga E – Personuppgiftsbiträdesavtal (GDPR).</b> Instruktioner för behandling, säkerhetsåtgärder, underbiträden och tredjelandsöverföringar.",
                ]
            ),
        )
    )

    # Underskrifter -------------------------------------------------
    sign = [PageBreak(), SectionHead(None, "Underskrifter")]
    sign.append(
        P(
            "Detta avtal har upprättats i två (2) likalydande exemplar, av vilka Parterna tagit var "
            "sitt. Undertecknande får även ske elektroniskt med en av Parterna godtagen "
            "e-signeringstjänst, varvid avtalet upprättas i ett (1) exemplar.",
        )
    )
    sign.append(
        P(
            "Genom sin underskrift bekräftar undertecknande att denne är behörig att ingå avtalet "
            "för respektive Parts räkning och att denne har tagit del av och accepterar avtalets "
            "samtliga villkor jämte bilagor.",
        )
    )
    sign.append(Spacer(1, 6))
    sign.append(H2("Gällande bilagor"))
    sign.append(
        P(
            "Ange version eller datum för de bilagor som gäller mellan Parterna. Bilaga som "
            "lämnas tom gäller inte mellan Parterna.",
            "note",
        )
    )
    sign.append(
        FieldGrid(
            [
                ("Bilaga A – datum", 1),
                ("Bilaga B – datum", 1),
                ("Bilaga C – datum", 1),
                ("Bilaga D – datum", 1),
                ("Bilaga E – datum", 1),
            ],
            height=14,
            prefix="bil_",
        )
    )
    sign.append(Spacer(1, 16))
    half = (CONTENT_W - 10) / 2
    sign.append(_two_col(SignBlock("För ViaEats AB", half, "sig_ve_"),
                         SignBlock("För Restaurangen", half, "sig_rest_")))
    sign.append(Spacer(1, 12))
    sign.append(HRule(space=10))
    sign.append(
        P(
            "Eventuella särskilda överenskommelser mellan Parterna antecknas nedan. Anteckningar "
            "som saknar båda Parters godkännande saknar verkan.",
            "note",
        )
    )
    sign.append(Field("Särskilda villkor / anteckningar", CONTENT_W, height=62,
                      multiline=True, name="sarskilda_villkor"))
    sign.append(Spacer(1, 14))
    sign.append(
        P(
            "ViaEats AB · Partneravtal · Version 1.0 · Detta dokument innehåller ifyllbara "
            "fält och kan sparas digitalt.",
            "note",
        )
    )
    out.append(sign)

    return out


class _TwoCol(Flowable):
    def __init__(self, left, right, gap=10):
        Flowable.__init__(self)
        self.left, self.right, self.gap = left, right, gap
        lw, lh = left.wrap(0, 0)
        rw, rh = right.wrap(0, 0)
        self.width = lw + gap + rw
        self.height = max(lh, rh)

    def wrap(self, aw, ah):
        return (self.width, self.height)

    def draw(self):
        lw, lh = self.left.wrap(0, 0)
        self.left.canv = self.canv
        self.canv.saveState()
        self.canv.translate(0, self.height - lh)
        self.left.draw()
        self.canv.restoreState()

        rw, rh = self.right.wrap(0, 0)
        self.right.canv = self.canv
        self.canv.saveState()
        self.canv.translate(lw + self.gap, self.height - rh)
        self.right.draw()
        self.canv.restoreState()


def _two_col(left, right):
    return _TwoCol(left, right)


def main():
    doc = AgreementDoc(
        OUT,
        pagesize=A4,
        leftMargin=ML,
        rightMargin=MR,
        topMargin=MT,
        bottomMargin=MB,
        title="ViaEats Partneravtal",
        author="ViaEats AB",
        subject="Partneravtal mellan ViaEats AB och restaurangpartner",
        creator="ViaEats",
    )
    frame = Frame(ML, MB, CONTENT_W, PAGE_H - MT - MB, id="main",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates(
        [
            PageTemplate(id="cover", frames=[frame], onPage=cover),
            PageTemplate(id="body", frames=[frame], onPage=header),
        ]
    )

    story = build_story()
    # Byt mall efter försättsbladet
    story.insert(0, _NextTemplate("cover"))
    doc.multiBuild(story, canvasmaker=NumberedCanvas)
    print("Skrev %s" % OUT)


from reportlab.platypus.doctemplate import NextPageTemplate as _NPT


class _NextTemplate(_NPT):
    def __init__(self, _unused):
        _NPT.__init__(self, "body")


if __name__ == "__main__":
    main()
