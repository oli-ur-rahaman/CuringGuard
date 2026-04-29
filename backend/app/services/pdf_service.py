import json
import os
import uuid
from pypdf import PdfReader


class PdfService:
    @staticmethod
    def _page_store_path(pdf_path: str) -> str:
        return f"{pdf_path}.pages.json"

    @classmethod
    def _load_blank_pages(cls, pdf_path: str) -> list[dict]:
        store_path = cls._page_store_path(pdf_path)
        if not os.path.exists(store_path):
            return []
        try:
            with open(store_path, "r", encoding="utf-8") as store_file:
                payload = json.load(store_file)
            pages = payload.get("blank_pages", [])
            return pages if isinstance(pages, list) else []
        except (OSError, json.JSONDecodeError):
            return []

    @classmethod
    def _save_blank_pages(cls, pdf_path: str, blank_pages: list[dict]) -> None:
        store_path = cls._page_store_path(pdf_path)
        with open(store_path, "w", encoding="utf-8") as store_file:
            json.dump({"blank_pages": blank_pages}, store_file)

    @classmethod
    def get_pdf_page_count(cls, pdf_path: str) -> int:
        reader = PdfReader(pdf_path)
        return len(reader.pages)

    @classmethod
    def list_pages(cls, pdf_path: str) -> list[dict]:
        page_count = cls.get_pdf_page_count(pdf_path)
        pages = [
            {
                "id": f"pdf:{page_number}",
                "name": f"Page {page_number}",
                "kind": "pdf",
                "page_number": page_number,
            }
            for page_number in range(1, page_count + 1)
        ]
        for blank_page in cls._load_blank_pages(pdf_path):
            pages.append(
                {
                    "id": blank_page["id"],
                    "name": blank_page["name"],
                    "kind": "blank",
                }
            )
        return pages

    @classmethod
    def create_blank_page(cls, pdf_path: str, name: str | None = None) -> dict:
        blank_pages = cls._load_blank_pages(pdf_path)
        page_number = len(blank_pages) + 1
        page_name = (name or f"Blank Page {page_number}").strip() or f"Blank Page {page_number}"
        page = {
            "id": f"blank:{uuid.uuid4().hex[:10]}",
            "name": page_name,
        }
        blank_pages.append(page)
        cls._save_blank_pages(pdf_path, blank_pages)
        return {
            "id": page["id"],
            "name": page["name"],
            "kind": "blank",
        }
