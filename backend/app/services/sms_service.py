import requests
import json
import os

class SMSService:
    """
    Handles external SMS communication to Green Heritage IT API.
    The @Backend-DB-Specialist AI will use and expand this class for cron jobs.
    """
    
    BASE_URL = "http://sms.greenheritageit.com/smsapi"
    
    @classmethod
    def send_sms(cls, recipients: list, sender_id: str, message: str, transaction_type: str = "T", api_key: str | None = None, campaign_id: str = ""):
        """
        Sends SMS to recipients using the Green Heritage IT GET API format.
        """
        api_key = api_key if api_key is not None else os.getenv("SMS_API_KEY", "MISSING_KEY")

        results = []
        try:
            for number in recipients:
                response = requests.get(
                    cls.BASE_URL,
                    params={
                        "apiKey": api_key,
                        "senderId": sender_id,
                        "transactionType": transaction_type,
                        "campaignId": campaign_id,
                        "mobileNo": number,
                        "message": message,
                    },
                    timeout=30,
                )
                try:
                    parsed = response.json()
                except json.JSONDecodeError:
                    parsed = {"status": "failed", "message": response.text}
                results.append({
                    "recipient": number,
                    "response": parsed,
                })
            if len(results) == 1:
                return results[0]["response"]
            return {"status": "success", "results": results}
        except requests.RequestException as e:
            return {"status": "failed", "message": str(e)}
