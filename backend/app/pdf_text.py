"""Subproceso acotado en tiempo por el llamante. Lee bytes, nunca instrucciones."""
import json
import sys
import pypdfium2 as pdfium


def main():
    pages = []
    remaining = 20000
    with pdfium.PdfDocument(sys.stdin.buffer.read()) as document:
        total = len(document)
        for number in range(min(total, 10)):
            # PdfPage/PdfTextPage are not context managers in the pinned pypdfium2: close explicitly.
            page = document[number]
            try:
                textpage = page.get_textpage()
                try:
                    text = textpage.get_text_range(count=min(textpage.count_chars(), remaining)).strip()
                finally:
                    textpage.close()
            finally:
                page.close()
            remaining -= len(text)
            if text:
                pages.append({"page": number + 1, "text": text})
            if remaining <= 0:
                break
    print(json.dumps({"pages": pages, "limited": total > 10 or remaining <= 0}))


if __name__ == "__main__":
    main()
