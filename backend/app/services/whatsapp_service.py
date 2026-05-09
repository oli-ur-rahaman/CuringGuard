import requests


def normalize_whatsapp_recipient(number: str) -> str:
    digits = "".join(char for char in (number or "") if char.isdigit())
    if not digits:
        return ""
    if digits.startswith("880") and len(digits) >= 12:
      return f"+{digits}"
    if digits.startswith("0") and len(digits) == 11:
      return f"+88{digits}"
    if digits.startswith("1") and len(digits) == 10:
      return f"+880{digits}"
    if number.strip().startswith("+"):
      return number.strip()
    return f"+{digits}"


class WhatsAppService:
    BASE_URL = "https://www.wasenderapi.com/api/send-message"

    @classmethod
    def send_text_message(cls, *, api_key: str, to_number: str, message: str):
        recipient = normalize_whatsapp_recipient(to_number)
        if not api_key.strip():
            return {"success": False, "message": "Missing WhatsApp API key"}
        if not recipient:
            return {"success": False, "message": "Missing or invalid WhatsApp recipient number"}
        try:
            response = requests.post(
                cls.BASE_URL,
                headers={
                    "Authorization": f"Bearer {api_key.strip()}",
                    "Content-Type": "application/json",
                },
                json={
                    "to": recipient,
                    "text": message,
                },
                timeout=30,
            )
            try:
                parsed = response.json()
            except ValueError:
                parsed = {"success": response.ok, "message": response.text}
            if not response.ok and "success" not in parsed:
                parsed["success"] = False
            return parsed
        except requests.RequestException as exc:
            return {"success": False, "message": str(exc)}
