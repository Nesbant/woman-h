from io import BytesIO
from pathlib import PurePosixPath
import threading
import unicodedata
import warnings
from fastapi import HTTPException
from PIL import Image, ImageOps
from pypdf import PdfReader
import pypdfium2 as pdfium
from .config import settings

TYPES = {"PNG": ("image/png", {".png"}), "JPEG": ("image/jpeg", {".jpg", ".jpeg"}),
         "WEBP": ("image/webp", {".webp"}), "PDF": ("application/pdf", {".pdf"})}
_pdf_lock = threading.Lock()  # PDFium no es seguro entre hilos.


def safe_filename(name: str) -> str:
    name = name.replace("\\", "/").split("/")[-1]
    name = "".join(c for c in name if not unicodedata.category(c).startswith("C") and c not in ':<>"|?*')
    name = name.strip().strip('.')
    if not name or len(name) > 255:
        raise HTTPException(422, "El nombre del archivo debe tener entre 1 y 255 caracteres")
    return name


def pdf_preview(data: bytes, config) -> Image.Image:
    """Validates a PDF structurally and renders page 1, without running JavaScript or forms."""
    if not data.rstrip().endswith(b"%%EOF"):
        raise ValueError("PDF incompleto")
    pdf = PdfReader(BytesIO(data), strict=True)
    if pdf.is_encrypted:
        raise HTTPException(415, "No se admiten PDF protegidos con contraseña")
    if not 1 <= len(pdf.pages) <= config.max_pdf_pages:
        raise HTTPException(413, f"El PDF debe tener entre 1 y {config.max_pdf_pages} páginas")
    with _pdf_lock:
        document = pdfium.PdfDocument(data)
        try:
            page = document[0]
            try:
                width, height = page.get_size()
                if min(width, height) <= 0:
                    raise ValueError("Página inválida")
                bitmap = page.render(scale=min(1.5, 1200 / max(width, height)), may_draw_forms=False)
                try:
                    return bitmap.to_pil().copy()
                finally:
                    bitmap.close()
            finally:
                page.close()
        finally:
            document.close()


def image_preview(data: bytes, config) -> tuple[str, Image.Image]:
    """Verifies the image (decompression bombs included) and returns its format and an oriented thumbnail."""
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(BytesIO(data)) as image:
            kind = image.format
            if kind not in TYPES or kind == "PDF":
                raise ValueError("Formato no admitido")
            if image.width * image.height > config.max_image_pixels:
                raise HTTPException(413, f"La imagen supera el límite de {config.max_image_pixels} píxeles")
            image.verify()
        with Image.open(BytesIO(data)) as image:
            image.load()
            preview = ImageOps.exif_transpose(image).convert("RGB")
            preview.thumbnail((1200, 1200))
            return kind, preview


def clean_png(preview: Image.Image) -> bytes:
    """Re-encodes pixels only: no EXIF, text chunks or colour profiles reach the derived PNG."""
    output = BytesIO()
    clean = Image.new("RGB", preview.size)
    try:
        clean.paste(preview)
        clean.save(output, format="PNG")
    finally:
        clean.close()
    return output.getvalue()


def inspect_file(data: bytes, name: str) -> tuple[str, bytes]:
    """Validates structure and extension; returns the real media type and a separate clean PNG preview."""
    config = settings()
    try:
        if data.startswith(b"%PDF-"):
            kind, preview = "PDF", pdf_preview(data, config)
        else:
            kind, preview = image_preview(data, config)
        try:
            mime, extensions = TYPES[kind]
            if PurePosixPath(name).suffix.lower() not in extensions:
                raise HTTPException(415, "La extensión no coincide con el contenido real del archivo")
            return mime, clean_png(preview)
        finally:
            preview.close()
    except HTTPException:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(413, "La imagen supera el límite de píxeles permitido")
    except Exception:
        raise HTTPException(415, "Archivo inválido o dañado. Usa PNG, JPEG, WebP o PDF válido")
