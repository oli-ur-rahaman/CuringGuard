import ezdxf
import os
import json

def inspect_dwg(file_path):
    try:
        doc = ezdxf.readfile(file_path)
        msp = doc.modelspace()
        
        print(f"--- Inspecting: {os.path.basename(file_path)} ---")
        
        # 1. List Layers
        layers = [layer.dxf.name for layer in doc.layers]
        print(f"Layers found: {len(layers)}")
        print(f"First 10 layers: {layers[:10]}")
        
        # 2. Count entities per type
        entity_counts = {}
        for entity in msp:
            e_type = entity.dxftype()
            entity_counts[e_type] = entity_counts.get(e_type, 0) + 1
        
        print("\nEntity Counts:")
        for e_type, count in entity_counts.items():
            print(f" - {e_type}: {count}")
            
        # 3. Look for potential "Elements" (LWPOLYLINE, INSERT, TEXT)
        print("\nSampling first 5 LWPOLYLINES:")
        polylines = msp.query('LWPOLYLINE')
        for i, pl in enumerate(polylines[:5]):
            print(f" Polyline {i}: Layer={pl.dxf.layer}, Vertices={len(pl)}")
            
        print("\nSampling first 5 TEXT/MTEXT:")
        texts = msp.query('TEXT MTEXT')
        for i, txt in enumerate(texts[:5]):
            print(f" Text {i}: Layer={txt.dxf.layer}, Content={txt.dxf.text if hasattr(txt.dxf, 'text') else 'MTEXT'}")

    except Exception as e:
        print(f"Error inspecting DWG: {e}")

if __name__ == "__main__":
    sample_path = r"d:\CuringGuard\Sample\temp_dxf\(1-17) ARCHITECTURAL PLAN BOY'S HOSTEL MUGDA 26.01.25.dxf"
    inspect_dwg(sample_path)
