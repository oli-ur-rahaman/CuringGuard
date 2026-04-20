import os
import sys
import json

# Ensure the app module can be found
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.services.geometry_service import GeometryService

def test():
    file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Sample", "(1-17) ARCHITECTURAL PLAN BOY'S HOSTEL MUGDA 26.01.25.dwg"))
    
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return
            
    print(f"Testing Geometry Parsing on:\n{file_path}\n")
    
    result = GeometryService.parse_file(file_path)
    
    print("--- 3-TIER ENGINE RESULT ---")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    test()
