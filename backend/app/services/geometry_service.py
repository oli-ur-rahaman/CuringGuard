import ezdxf
import os
import subprocess
import shutil
import glob

class GeometryService:
    """
    Handles all math and parsing related to AutoCAD files.
    Implements Step 0 DWG Conversion and a robust 3-Tier Fallback algorithm.
    """
    
    # Standard installation path base for Windows. We glob to handle version numbers (e.g. 27.1.0)
    _oda_matches = glob.glob(r"C:\Program Files\ODA\ODAFileConverter*\ODAFileConverter.exe")
    ODA_CONVERTER_PATH = _oda_matches[0] if _oda_matches else None
    
    @classmethod
    def convert_dwg_to_dxf(cls, dwg_file_path: str) -> str:
        """
        Silently converts a .dwg file to .dxf using the ODA File Converter.
        """
        if not cls.ODA_CONVERTER_PATH or not os.path.exists(cls.ODA_CONVERTER_PATH):
            raise FileNotFoundError("ODAFileConverter not installed. Please install it to natively support DWG uploads.")
            
        input_dir = os.path.dirname(dwg_file_path)
        output_dir = os.path.join(input_dir, "temp_dxf")
        
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        # ODA Converter requires (InputFolder, OutputFolder, OutputVersion, OutputFormat, Recursive, Audit)
        cmd = [
            cls.ODA_CONVERTER_PATH, 
            input_dir, 
            output_dir, 
            "ACAD2018", 
            "DXF", 
            "0", 
            "1"
        ]
        
        # Execute the hidden background process
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Locate the converted script in the temp folder
        base_name = os.path.basename(dwg_file_path)
        dxf_name = os.path.splitext(base_name)[0] + ".dxf"
        dxf_path = os.path.join(output_dir, dxf_name)
        
        if os.path.exists(dxf_path):
            return dxf_path
        else:
            raise RuntimeError("Failed to generate DXF file. Ensure the DWG is not corrupted.")

    @classmethod
    def parse_file(cls, file_path: str):
        """
        Gateway method. If DWG, converts to DXF behind the scenes.
        Then initiates the 3-Tier parsing logic.
        """
        extension = os.path.splitext(file_path)[1].lower()
        active_path = file_path
        
        if extension == ".dwg":
            try:
                active_path = cls.convert_dwg_to_dxf(file_path)
            except Exception as e:
                return {"status": "error", "message": f"DWG Conversion Failed: {str(e)}"}
                
        return cls._run_3_tier_engine(active_path)
    
    @staticmethod
    def _run_3_tier_engine(dxf_path: str):
        """
        Loads a DXF file and programmatically isolates drawing pages
        using a 3-tier algorithm.
        """
        try:
            doc = ezdxf.readfile(dxf_path)
        except IOError:
            return {"status": "error", "message": f"IOError: Unable to read file at {dxf_path}"}
        except ezdxf.DXFStructureError:
            return {"status": "error", "message": "Invalid or corrupted DXF/DWG structure."}
        
        # TIER 1: Layouts (Native AutoCAD Pages)
        layouts = doc.layouts.names()
        valid_layouts = [name for name in layouts if name.upper() != "MODEL"]
        
        if valid_layouts:
            pages = []
            for ln in valid_layouts:
                layout = doc.layouts.get(ln)
                entities = len(list(layout))
                if entities > 0:
                    pages.append({"name": ln, "entity_count": entities, "method": "Tier 1: Layout"})
            
            if len(pages) > 0:
                return {
                    "status": "success",
                    "trigger": "Tier 1",
                    "message": "Successfully extracted discrete pages via AutoCAD Layouts.",
                    "pages": pages
                }
                
        # TIER 2: Isolated Blocks
        msp = doc.modelspace()
        inserts = msp.query('INSERT')
        heavy_blocks = []
        for insert in inserts:
            block_name = insert.dxf.name
            try:
                block_def = doc.blocks.get(block_name)
                if len(list(block_def)) > 50: 
                    heavy_blocks.append({"name": block_name, "entity_count": len(list(block_def)), "method": "Tier 2: Block"})
            except ezdxf.lldxf.const.DXFTableEntryError:
                continue

        if heavy_blocks:
            return {
                "status": "success",
                "trigger": "Tier 2",
                "message": "Successfully extracted discrete pages via saturated Block definitions.",
                "pages": heavy_blocks
            }
            
        # TIER 3: Unstructured Raw Canvas (Needs Monitor Crop)
        total_entities = len(list(msp))
        return {
            "status": "requires_manual_crop",
            "trigger": "Tier 3",
            "message": "The canvas contains raw unstructured data. Triggering Frontend manual crop tool.",
            "pages": [{"name": "Raw Modelspace", "entity_count": total_entities, "method": "Tier 3: Infinite Canvas"}]
        }
    @classmethod
    def extract_elements(cls, dxf_path: str, target_layers: list = ["WALL", "Column", "STAIR"]):
        """
        Parses a DXF and returns normalized structural elements.
        """
        try:
            doc = ezdxf.readfile(dxf_path)
            msp = doc.modelspace()
            
            # 1. Get Global Bounding Box for Normalization
            from ezdxf import bbox
            cache = bbox.Cache()
            overall_bbox = bbox.extents(msp, cache=cache)
            min_x, min_y, _ = overall_bbox.extmin
            max_x, max_y, _ = overall_bbox.extmax
            
            width = max_x - min_x if max_x > min_x else 1
            height = max_y - min_y if max_y > min_y else 1
            
            elements = []
            
            # 2. Extract Text Labels for Proximity Search
            labels = []
            for text in msp.query('TEXT MTEXT'):
                content = text.dxf.text if hasattr(text.dxf, 'text') else "LABEL"
                # Strip RTF/MTEXT formatting if present
                if hasattr(text, 'plain_text'):
                    content = text.plain_text()
                
                labels.append({
                    "content": content,
                    "point": text.dxf.insert
                })
            
            # 3. Extract Polylines from Target Layers
            for layer in target_layers:
                polylines = msp.query(f'LWPOLYLINE[layer=="{layer}"]')
                for pl in polylines:
                    # Normalize vertices to 0-1000 scale
                    vertices = []
                    sum_x = 0
                    sum_y = 0
                    for v in pl.get_points():
                        nx = (v[0] - min_x) / width * 1000
                        ny = (v[1] - min_y) / height * 1000
                        vertices.append([nx, ny])
                        sum_x += v[0]
                        sum_y += v[1]
                    
                    centroid = (sum_x / len(vertices), sum_y / len(vertices))
                    
                    # 4. Find nearest label
                    nearest_label = "UNNAMED"
                    min_dist = float('inf')
                    for label in labels:
                        dist = ((centroid[0] - label["point"][0])**2 + (centroid[1] - label["point"][1])**2)**0.5
                        if dist < min_dist:
                            min_dist = dist
                            nearest_label = label["content"]
                    
                    # Only keep label if it's reasonably close (heuristic)
                    if min_dist > 500: # drawing units
                        nearest_label = f"{layer}-{len(elements)}"

                    elements.append({
                        "element_id": nearest_label,
                        "element_type": layer,
                        "vertices": vertices
                    })
            
            return elements

        except Exception as e:
            print(f"Extraction Error: {e}")
            return []
