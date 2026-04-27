from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_system():
    print("--- TESTING LOGIN ---")
    response = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        token = response.json()["access_token"]
        print(f"Token: {token[:30]}...")
        
        print("\n--- TESTING USER LIST (WITH TOKEN) ---")
        headers = {"Authorization": f"Bearer {token}"}
        users_res = client.get("/api/users/", headers=headers)
        print(f"Users found: {len(users_res.json())}")
        for u in users_res.json():
            print(f"- {u['username']} ({u['role']})")
    else:
        print(f"Error: {response.text}")

if __name__ == "__main__":
    test_system()
