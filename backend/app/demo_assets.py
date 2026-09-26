"""Synthetic demo evidence generated at seed time, so no binary fixtures live in the repository."""
from io import BytesIO
import unicodedata
from PIL import Image, ImageDraw, ImageFont

RELATO = ("A mediados de septiembre tuve una reunión con mi supervisor. Me hizo un comentario que me incomodó. "
          "El martes 15 por la noche recibí mensajes suyos fuera del horario laboral y luego un correo sobre mi evaluación.")
NOTA = "Recordar preguntar a Lucía si vio algo en la reunión."
CAPTURA_01 = ("CAPTURA SINTÉTICA · Mensajería. Miércoles 16/09/2026.\n"
              "22:43 — Juan X.: «¿Sigues despierta? Quería conversar sobre lo de hoy.»\n"
              "22:47 — Juan X.: «Mañana lo vemos en la oficina.»")
CAPTURA_02 = ("CAPTURA SINTÉTICA · Grupo del área. Jueves 18/09/2026.\n"
              "Conversación grupal sobre turnos. No menciona directamente los hechos registrados.")
CORREO_LINES = [
    "CORREO SINTÉTICO",
    "De: Juan X.",
    "Para: María X.",
    "Fecha: 17/09/2026 09:12",
    "Asunto: Seguimiento de evaluación",
    "Como conversamos esta semana, revisaremos algunos puntos de tu evaluación de desempeño.",
    "Te escribo para coordinar.",
]

FONTS = ("DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "Arial.ttf", "arial.ttf")


def _font(size):
    for name in FONTS:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return None


def _text(draw, xy, text, fill, size):
    font = _font(size)
    if font is None:
        # Bitmap fallback has no accents: draw a plain-ASCII version instead of broken glyphs.
        text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
        font = ImageFont.load_default()
    draw.text(xy, text, fill=fill, font=font)


def chat_png() -> bytes:
    image = Image.new("RGB", (540, 380), "#ECE5DD")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 540, 56), fill="#075E54")
    _text(draw, (20, 16), "Juan X. (ficticio)", "white", 20)
    draw.rounded_rectangle((20, 90, 470, 200), radius=12, fill="white")
    _text(draw, (36, 104), "¿Sigues despierta? Quería conversar", "#111", 18)
    _text(draw, (36, 134), "sobre lo de hoy.", "#111", 18)
    _text(draw, (380, 172), "16/09 22:43", "#667", 14)
    _text(draw, (20, 340), "Captura sintética para demostración", "#667", 14)
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def room_png() -> bytes:
    image = Image.new("RGB", (540, 360), "#D9DEE4")
    draw = ImageDraw.Draw(image)
    draw.rectangle((60, 180, 480, 230), fill="#8A6F4E")
    draw.rectangle((40, 60, 200, 150), outline="#445", width=4)
    _text(draw, (150, 290), "Grupo del área · captura sintética", "#334", 18)
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def text_pdf(lines: list[str]) -> bytes:
    """Minimal one-page PDF with a real text layer (Helvetica, WinAnsiEncoding)."""
    content = ["BT", "/F1 11 Tf", "16 TL", "56 780 Td"]
    for line in lines:
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        content.append(f"({escaped}) Tj T*")
    content.append("ET")
    stream = "\n".join(content).encode("cp1252")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, 1):
        offsets.append(len(output))
        output += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    xref = len(output)
    output += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        output += b"%010d 00000 n \n" % offset
    output += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(output)


def placeholder_file(label: str) -> bytes:
    """Tiny synthetic attachment for historical demo cases."""
    return text_pdf([f"ARCHIVO SINTÉTICO · {label}", "Contenido de demostración sin datos reales."])
