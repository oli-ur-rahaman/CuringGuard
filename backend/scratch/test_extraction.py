import json
import os
from backend.app.services.geometry_service import GeometryService

def test_extraction():
    dxf_path = r"d:\CuringGuard\Sample\temp_dxf\(1-17) ARCHITECTURAL PLAN BOY'S HOSTEL MUGDA 26.01.25.dxf"
    elements = GeometryService.extract_elements(dxf_path)
    
    print(f"Extracted {len(elements)} elements.")
    if elements:
        print("\nSample Element:")
        print(json.dumps(elements[0], indent=2))
        
        # Save to a JSON file for inspection
        with open("extracted_elements.json", "w") as f:
            json.dump(elements, f, indent=2)
        print("\nAll elements saved to extracted_elements.json")

if __name__ == "__main__":
    test_extraction()
