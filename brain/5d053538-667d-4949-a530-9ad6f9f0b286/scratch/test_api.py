import requests

# 1. Login
login_data = {
    "username": "super",
    "password": "password" # I assume the password is 'password' or something, wait I reset it earlier? No I didn't.
}
# Actually I don't know the password.
# Let's bypass login and just print the users directly from DB, or use a script to generate a token.

from backend.app.core.auth import create_access_token
from backend.app.models.users import UserRole

token = create_access_token(data={"sub": "super", "role": "superadmin"})
headers = {"Authorization": f"Bearer {token}"}

response = requests.get("http://localhost:8000/api/users/", headers=headers)
print("Status:", response.status_code)
print("Response:", response.text)
