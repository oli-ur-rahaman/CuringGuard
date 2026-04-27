from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime
from backend.app.core.database import SessionLocal
from backend.app.models.curing import GeometryElement
from backend.app.models.users import User
from backend.app.services.sms_service import SMSService
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_curing_status_and_notify():
    """
    Scans the database for curing elements that have completed their curing duration
    and have not yet had an SMS notification sent to the assigned contractor.
    """
    logger.info("Executing Morning Cron Job: Scanning for completed curing elements...")
    
    db = SessionLocal()
    try:
        now = datetime.now()
        
        # Find elements where curing_end_date has passed but SMS hasn't been sent yet
        completed_elements = db.query(GeometryElement).filter(
            GeometryElement.curing_end_date != None,
            GeometryElement.curing_end_date <= now,
            GeometryElement.sms_sent == False,
            GeometryElement.contractor_id != None
        ).all()
        
        if not completed_elements:
            logger.info("No newly completed curing elements found for notification.")
            return

        logger.info(f"Found {len(completed_elements)} elements that require SMS notifications.")
        
        for element in completed_elements:
            contractor = db.query(User).filter(User.id == element.contractor_id).first()
            if contractor and contractor.mobile_number:
                message = f"Hello {contractor.username}, the curing period for {element.element_type.value} (ID: {element.element_id}) is now complete. Please verify on site."
                
                # We use the Green Heritage IT service integrated earlier
                response = SMSService.send_sms(
                    recipients=[contractor.mobile_number],
                    sender_id="8809617002008", # Assuming default or from ENV
                    message=message
                )
                
                logger.info(f"SMS Response for {contractor.username}: {response}")
                
                # Mark as sent so we don't spam them tomorrow
                element.sms_sent = True
        
        db.commit()
        logger.info("Morning Cron Job completed successfully. Database updated.")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error during cron job execution: {e}")
    finally:
        db.close()

def start_scheduler():
    scheduler = BackgroundScheduler()
    # Schedule the task to run every morning at 8:00 AM
    trigger = CronTrigger(hour=8, minute=0)
    scheduler.add_job(check_curing_status_and_notify, trigger)
    scheduler.start()
    logger.info("Background Cron Scheduler started. Tasks scheduled for 8:00 AM daily.")
