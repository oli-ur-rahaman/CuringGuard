from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.core.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    authenticate_user,
    create_access_token,
    get_password_hash,
    verify_password,
)
from backend.app.models.system import SystemSetting
from backend.app.models.users import PasswordResetOtpSession, User
from backend.app.schemas.auth import (
    ForgotPasswordResetRequest,
    ForgotPasswordStartRequest,
    ForgotPasswordStartResponse,
    ForgotPasswordVerifyRequest,
    ForgotPasswordVerifyResponse,
    Token,
)
from backend.app.services.sms_service import SMSService

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 5


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_session_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _send_reset_otp_sms(db: Session, mobile_number: str, otp: str) -> None:
    sender_setting = db.query(SystemSetting).filter(SystemSetting.setting_key == "sms_sender_id").first()
    api_key_setting = db.query(SystemSetting).filter(SystemSetting.setting_key == "sms_api_key").first()
    sender_id = sender_setting.setting_value if sender_setting and sender_setting.setting_value else "8809617612022"
    api_key = api_key_setting.setting_value if api_key_setting and api_key_setting.setting_value else None
    message = f"Your CuringGuard password reset OTP is {otp}. It will expire in {OTP_EXPIRY_MINUTES} minutes."
    result = SMSService.send_sms(recipients=[mobile_number], sender_id=sender_id, message=message, api_key=api_key)
    status_value = str(result.get("status", "")).strip().lower() if isinstance(result, dict) else ""
    if status_value == "failed":
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to send OTP SMS."))

@router.post("/login", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role.value, "user_id": user.id},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/forgot-password/request", response_model=ForgotPasswordStartResponse)
def request_password_reset_otp(payload: ForgotPasswordStartRequest, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()
    mobile_number = payload.mobile_number.strip()
    user = db.query(User).filter(
        User.username == username,
        User.mobile_number == mobile_number,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this login ID and mobile number.")

    otp = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = _utc_now() + timedelta(minutes=OTP_EXPIRY_MINUTES)
    request_id: int | None = None

    try:
        db.query(PasswordResetOtpSession).filter(
            PasswordResetOtpSession.user_id == user.id,
            PasswordResetOtpSession.consumed_at.is_(None),
        ).update({"consumed_at": _utc_now()}, synchronize_session=False)

        session = PasswordResetOtpSession(
            user_id=user.id,
            mobile_number=mobile_number,
            otp_hash=get_password_hash(otp),
            reset_token_hash=None,
            expires_at=expires_at,
            verified_at=None,
            consumed_at=None,
            attempts=0,
        )
        db.add(session)
        db.flush()
        _send_reset_otp_sms(db, mobile_number, otp)
        request_id = session.id
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to start password reset: {exc}")

    return {
        "request_id": request_id,
        "message": "OTP sent to the registered mobile number.",
    }


@router.post("/forgot-password/verify", response_model=ForgotPasswordVerifyResponse)
def verify_password_reset_otp(payload: ForgotPasswordVerifyRequest, db: Session = Depends(get_db)):
    mobile_number = payload.mobile_number.strip()
    reset_token: str | None = None
    try:
        session = db.query(PasswordResetOtpSession).filter(
            PasswordResetOtpSession.id == payload.request_id,
            PasswordResetOtpSession.mobile_number == mobile_number,
            PasswordResetOtpSession.consumed_at.is_(None),
        ).with_for_update().first()

        if not session:
            raise HTTPException(status_code=404, detail="Password reset request not found.")
        if session.verified_at is not None:
            raise HTTPException(status_code=400, detail="OTP already verified. Continue with password reset.")
        session_expires_at = _normalize_session_datetime(session.expires_at)
        if session_expires_at and session_expires_at < _utc_now():
            session.consumed_at = _utc_now()
            db.commit()
            raise HTTPException(status_code=400, detail="OTP has expired. Request a new one.")
        if session.attempts >= OTP_MAX_ATTEMPTS:
            session.consumed_at = _utc_now()
            db.commit()
            raise HTTPException(status_code=400, detail="Too many invalid OTP attempts. Request a new OTP.")
        if not verify_password(payload.otp, session.otp_hash):
            session.attempts += 1
            if session.attempts >= OTP_MAX_ATTEMPTS:
                session.consumed_at = _utc_now()
            db.commit()
            raise HTTPException(status_code=400, detail="Incorrect OTP.")

        reset_token = secrets.token_urlsafe(32)
        session.verified_at = _utc_now()
        session.reset_token_hash = _hash_reset_token(reset_token)
        db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to verify OTP: {exc}")

    return {
        "reset_token": reset_token,
        "message": "OTP verified. You can now reset the password.",
    }


@router.post("/forgot-password/reset")
def reset_password_with_otp(payload: ForgotPasswordResetRequest, db: Session = Depends(get_db)):
    mobile_number = payload.mobile_number.strip()
    if len(payload.new_password.strip()) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    try:
        session = db.query(PasswordResetOtpSession).filter(
            PasswordResetOtpSession.id == payload.request_id,
            PasswordResetOtpSession.mobile_number == mobile_number,
            PasswordResetOtpSession.consumed_at.is_(None),
        ).with_for_update().first()

        if not session:
            raise HTTPException(status_code=404, detail="Password reset request not found.")
        if session.verified_at is None:
            raise HTTPException(status_code=400, detail="OTP is not verified yet.")
        session_expires_at = _normalize_session_datetime(session.expires_at)
        if session_expires_at and session_expires_at < _utc_now():
            session.consumed_at = _utc_now()
            db.commit()
            raise HTTPException(status_code=400, detail="Password reset session has expired. Request a new OTP.")
        if session.reset_token_hash != _hash_reset_token(payload.reset_token):
            raise HTTPException(status_code=400, detail="Invalid password reset token.")

        user = db.query(User).filter(
            User.id == session.user_id,
            User.mobile_number == mobile_number,
        ).with_for_update().first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        user.hashed_password = get_password_hash(payload.new_password.strip())
        session.consumed_at = _utc_now()
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to reset password: {exc}")

    return {"status": "success", "message": "Password reset successfully."}
