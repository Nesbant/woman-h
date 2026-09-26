"""Synthetic demo evidence generated at seed time, so no binary fixtures live in the repository."""
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

RELATO = ("A mediados de septiembre de 2026 tuve una reunión presencial a solas con mi supervisor, Julio Ramírez, "
          "en la sala 3. Durante la reunión hizo comentarios sobre mi apariencia que me incomodaron y me pidió que "
          "lo acompañara a cenar. Le dije que no. El martes 15 me escribió por WhatsApp de noche insistiendo. "
          "Unos días después me cambiaron el turno sin explicación. Desde entonces me siento nerviosa al ir a la oficina.")
CAPTURA_01 = ("Captura de WhatsApp de Julio Ramírez. Mensaje recibido el 16/09/2026 a las 22:43: "
              "«¿Ya pensaste lo de la cena? No me gusta que me digan que no.»")
CAPTURA_02 = "Foto de la sala 3, donde ocurrió la reunión."
CORREO_LINES = [
    "Correo electrónico exportado a PDF · DATOS FICTICIOS",
    "De: Julio Ramírez <jramirez@aurora.example>",
    "Para: Ana Demo <ana@example.test>",
    "Fecha: 17/09/2026 09:12",
    "Asunto: Cambio de turno",
    "A partir de la próxima semana pasas al turno de noche.",
    "Como conversamos en la reunión de la semana pasada, espero que reconsideres tu actitud.",
    "Saludos, Julio",
]


def _font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def chat_png() -> bytes:
    image = Image.new("RGB", (540, 380), "#ECE5DD")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 540, 56), fill="#075E54")
    draw.text((20, 16), "Julio Ramírez (ficticio)", fill="white", font=_font(20))
    draw.rounded_rectangle((20, 90, 470, 200), radius=12, fill="white")
    draw.text((36, 104), "¿Ya pensaste lo de la cena?", fill="#111", font=_font(18))
    draw.text((36, 134), "No me gusta que me digan que no.", fill="#111", font=_font(18))
    draw.text((380, 172), "16/09 22:43", fill="#667", font=_font(14))
    draw.text((20, 340), "Captura sintética para demostración", fill="#667", font=_font(14))
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def room_png() -> bytes:
    image = Image.new("RGB", (540, 360), "#D9DEE4")
    draw = ImageDraw.Draw(image)
    draw.rectangle((60, 180, 480, 230), fill="#8A6F4E")
    draw.rectangle((40, 60, 200, 150), outline="#445", width=4)
    draw.text((200, 290), "Sala 3 · imagen sintética", fill="#334", font=_font(18))
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
