import json
import mimetypes
import os
import uuid
from pypdf import PdfReader


class PdfService:
    IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}

    @classmethod
    def is_pdf(cls, file_path: str) -> bool:
        return file_path.lower().endswith(".pdf")

    @classmethod
    def is_image(cls, file_path: str) -> bool:
        return os.path.splitext(file_path)[1].lower() in cls.IMAGE_EXTENSIONS

    @classmethod
    def is_supported_plan_file(cls, file_path: str) -> bool:
        return cls.is_pdf(file_path) or cls.is_image(file_path)

    @staticmethod
    def _page_store_path(file_path: str) -> str:
        return f"{file_path}.pages.json"

    @classmethod
    def _load_store(cls, file_path: str) -> dict:
        store_path = cls._page_store_path(file_path)
        if not os.path.exists(store_path):
            return {"blank_pages": [], "annotations": {}}
        try:
            with open(store_path, "r", encoding="utf-8") as store_file:
                payload = json.load(store_file)
            blank_pages = payload.get("blank_pages", [])
            annotations = payload.get("annotations", {})
            return {
                "blank_pages": blank_pages if isinstance(blank_pages, list) else [],
                "annotations": annotations if isinstance(annotations, dict) else {},
            }
        except (OSError, json.JSONDecodeError):
            return {"blank_pages": [], "annotations": {}}

    @classmethod
    def _load_blank_pages(cls, file_path: str) -> list[dict]:
        return cls._load_store(file_path)["blank_pages"]

    @classmethod
    def _save_store(cls, file_path: str, payload: dict) -> None:
        store_path = cls._page_store_path(file_path)
        with open(store_path, "w", encoding="utf-8") as store_file:
            json.dump(payload, store_file)

    @classmethod
    def _save_blank_pages(cls, file_path: str, blank_pages: list[dict]) -> None:
        store = cls._load_store(file_path)
        store["blank_pages"] = blank_pages
        cls._save_store(file_path, store)

    @classmethod
    def get_pdf_page_count(cls, pdf_path: str) -> int:
        reader = PdfReader(pdf_path)
        return len(reader.pages)

    @classmethod
    def get_media_type(cls, file_path: str) -> str:
        guessed_type, _ = mimetypes.guess_type(file_path)
        return guessed_type or "application/octet-stream"

    @classmethod
    def get_page_count(cls, file_path: str) -> int:
        if cls.is_pdf(file_path):
            return cls.get_pdf_page_count(file_path)
        if cls.is_image(file_path):
            return 1
        raise ValueError("Unsupported plan file type.")

    @classmethod
    def list_pages(cls, file_path: str) -> list[dict]:
        if cls.is_pdf(file_path):
            page_count = cls.get_pdf_page_count(file_path)
            pages = [
                {
                    "id": f"pdf:{page_number}",
                    "name": f"Page {page_number}",
                    "kind": "pdf",
                    "page_number": page_number,
                }
                for page_number in range(1, page_count + 1)
            ]
        elif cls.is_image(file_path):
            pages = [
                {
                    "id": "image:1",
                    "name": "Image 1",
                    "kind": "image",
                    "page_number": 1,
                }
            ]
        else:
            raise ValueError("Unsupported plan file type.")

        for blank_page in cls._load_blank_pages(file_path):
            pages.append(
                {
                    "id": blank_page["id"],
                    "name": blank_page["name"],
                    "kind": "blank",
                }
            )
        return pages

    @classmethod
    def create_blank_page(cls, file_path: str, name: str | None = None) -> dict:
        blank_pages = cls._load_blank_pages(file_path)
        page_number = len(blank_pages) + 1
        page_name = (name or f"Blank Page {page_number}").strip() or f"Blank Page {page_number}"
        page = {
            "id": f"blank:{uuid.uuid4().hex[:10]}",
            "name": page_name,
        }
        blank_pages.append(page)
        cls._save_blank_pages(file_path, blank_pages)
        return {
            "id": page["id"],
            "name": page["name"],
            "kind": "blank",
        }

    @classmethod
    def get_annotations(cls, file_path: str, page_id: str) -> list[dict]:
        store = cls._load_store(file_path)
        annotations = store["annotations"].get(page_id, [])
        return annotations if isinstance(annotations, list) else []

    @classmethod
    def save_annotations(cls, file_path: str, page_id: str, annotations: list[dict]) -> None:
        store = cls._load_store(file_path)
        store["annotations"][page_id] = annotations
        cls._save_store(file_path, store)
