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
    def send_sms(cls, recipients: list, sender_id: str, message: str, transaction_type: str = "T"):
        """
        Sends SMS to multiple recipients using Green Heritage IT JSON batch POST API.
        """
        api_key = os.getenv("SMS_API_KEY", "MISSING_KEY")
        
        sms_data = []
        for number in recipients:
            sms_data.append({
                "recipient": number,
                "sender_id": sender_id,
                "message": message
            })
            
        payload = {
            "api_key": api_key,
            "transaction_type": transaction_type,
            "sms_data": sms_data
        }
        
        headers = {'Content-Type': 'application/json'}
        
        try:
            response = requests.post(cls.BASE_URL, data=json.dumps(payload), headers=headers)
            return response.json()
        except requests.RequestException as e:
            return {"status": "failed", "message": str(e)}
