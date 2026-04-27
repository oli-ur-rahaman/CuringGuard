from fastapi.testclient import TestClient
import sys
import os
from datetime import datetime

# Add the project root to sys.path to import backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.app.main import app

client = TestClient(app)

def test_integration():
    print("--- Starting Integration Test ---")
    
    timestamp = datetime.now().strftime("%H%M%S")
    tenant_name = f"Tenant_{timestamp}"
    username = f"user_{timestamp}"
    mobile = f"01700{timestamp}" # Ensures 11 digits if timestamp is 6 digits
    if len(mobile) < 11:
        mobile = mobile.ljust(11, "0")
    elif len(mobile) > 11:
        mobile = mobile[:11]

    # 1. Create Tenant
    print(f"Creating Tenant: {tenant_name}")
    resp = client.post("/api/hierarchy/tenants", json={"name": tenant_name, "subdomain": f"sub_{timestamp}"})
    assert resp.status_code == 200
    tenant_id = resp.json()["id"]
    print(f"Tenant Created: ID {tenant_id}")

    # 2. Create User
    print(f"Creating User: {username}")
    resp = client.post("/api/users/", json={
        "username": username,
        "password": "password123",
        "role": "contractor",
        "mobile_number": mobile,
        "tenant_id": tenant_id
    })
    assert resp.status_code == 200
    user_id = resp.json()["id"]
    print(f"User Created: ID {user_id}")

    # 3. Create Project
    print("Creating Project")
    resp = client.post("/api/hierarchy/projects", json={"name": "Project Alpha", "tenant_id": tenant_id})
    assert resp.status_code == 200
    project_id = resp.json()["id"]

    # 4. Create Package
    print("Creating Package")
    resp = client.post("/api/hierarchy/packages", json={"name": "Package 01", "project_id": project_id})
    assert resp.status_code == 200
    package_id = resp.json()["id"]

    # 5. Create Structure
    print("Creating Structure")
    resp = client.post("/api/hierarchy/structures", json={"name": "Slab A", "package_id": package_id})
    assert resp.status_code == 200
    structure_id = resp.json()["id"]

    # 6. Create Drawing
    print("Creating Drawing")
    resp = client.post("/api/hierarchy/drawings", json={
        "name": "Main Floor Plan", 
        "structure_id": structure_id,
        "file_path": "/drawings/main_floor.dxf"
    })
    assert resp.status_code == 200
    drawing_id = resp.json()["id"]

    # 7. Verification: Get Projects for Tenant
    print("Verifying Hierarchy...")
    resp = client.get(f"/api/hierarchy/tenants/{tenant_id}/projects")
    assert resp.status_code == 200
    projects = resp.json()
    assert len(projects) > 0
    assert projects[0]["name"] == "Project Alpha"

    # 8. Verification: Get Users
    resp = client.get(f"/api/users/?tenant_id={tenant_id}")
    assert resp.status_code == 200
    users = resp.json()
    assert any(u["username"] == username for u in users)

    print("--- Integration Test PASSED ---")

if __name__ == "__main__":
    try:
        test_integration()
    except Exception as e:
        print(f"Integration Test FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
