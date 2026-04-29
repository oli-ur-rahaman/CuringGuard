import ezdxf
import os
import subprocess
import shutil
import glob
import math
import json
import re
import uuid
import io
import contextlib
from xml.etree import ElementTree as ET
from ezdxf.addons.drawing import Frontend, RenderContext, svg as svg_backend, layout as drawing_layout, config as drawing_config
from ezdxf import disassemble

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

    @classmethod
    def extract_canvas_entities(cls, dxf_path: str):
        return cls.extract_canvas_page_entities(dxf_path, None)

    @staticmethod
    def _page_store_path(dxf_path: str) -> str:
        return f"{dxf_path}.pages.json"

    @classmethod
    def _load_blank_pages(cls, dxf_path: str) -> list[dict]:
        store_path = cls._page_store_path(dxf_path)
        if not os.path.exists(store_path):
            return []
        try:
            with open(store_path, "r", encoding="utf-8") as store_file:
                payload = json.load(store_file)
            pages = payload.get("blank_pages", [])
            return pages if isinstance(pages, list) else []
        except (OSError, json.JSONDecodeError):
            return []

    @classmethod
    def _save_blank_pages(cls, dxf_path: str, blank_pages: list[dict]) -> None:
        store_path = cls._page_store_path(dxf_path)
        with open(store_path, "w", encoding="utf-8") as store_file:
            json.dump({"blank_pages": blank_pages}, store_file)

    @staticmethod
    def _cache_page_token(page_id: str | None) -> str:
        raw = page_id or "modelspace"
        token = re.sub(r"[^a-zA-Z0-9_-]+", "_", raw)
        return token or "modelspace"

    @staticmethod
    def _get_layout_viewport_bounds(layout) -> tuple[float, float, float, float] | None:
        viewports = [vp for vp in layout.query("VIEWPORT") if float(getattr(vp.dxf, "height", 0) or 0) > 0]
        if not viewports:
            return None

        viewport = max(viewports, key=lambda vp: float(getattr(vp.dxf, "height", 0) or 0))
        center = getattr(viewport.dxf, "view_center_point", None)
        view_height = float(getattr(viewport.dxf, "view_height", 0) or 0)
        width = float(getattr(viewport.dxf, "width", 0) or 0)
        height = float(getattr(viewport.dxf, "height", 0) or 0)

        if center is None or view_height <= 0 or width <= 0 or height <= 0:
            return None

        aspect_ratio = width / height if height else 1
        view_width = view_height * aspect_ratio
        min_x = float(center[0]) - (view_width / 2)
        max_x = float(center[0]) + (view_width / 2)
        min_y = float(center[1]) - (view_height / 2)
        max_y = float(center[1]) + (view_height / 2)
        return (min_x, min_y, max_x, max_y)

    @classmethod
    def list_canvas_pages(cls, dxf_path: str) -> list[dict]:
        try:
            doc = ezdxf.readfile(dxf_path)
        except Exception as e:
            raise RuntimeError(f"Page discovery failed: {str(e)}")

        pages = []
        layouts = doc.layouts.names()
        valid_layouts = [name for name in layouts if name.upper() != "MODEL"]

        for layout_name in valid_layouts:
            layout = doc.layouts.get(layout_name)
            entity_count = len(list(layout))
            if entity_count > 0:
                viewports = [vp for vp in layout.query("VIEWPORT") if float(getattr(vp.dxf, "height", 0) or 0) > 0]
                detailed_viewports = []
                for raw_index, viewport in enumerate(viewports, start=1):
                    _, model_bounds, _ = cls._viewport_transform(viewport)
                    model_entities = [entity for entity in doc.modelspace() if cls._entity_intersects_bounds(entity, model_bounds)]
                    if len(model_entities) <= 10:
                        continue
                    detailed_viewports.append({
                        "id": f"viewport:{layout_name}:{raw_index}",
                        "name": f"{layout_name} {len(detailed_viewports) + 1}",
                        "kind": "viewport",
                        "entity_count": len(model_entities),
                        "layout_name": layout_name,
                        "viewport_index": raw_index,
                    })

                if detailed_viewports:
                    pages.extend(detailed_viewports)
                else:
                    pages.append({
                        "id": f"layout:{layout_name}",
                        "name": layout_name,
                        "kind": "layout",
                        "entity_count": entity_count,
                    })

        if not pages:
            msp = doc.modelspace()
            pages.append({
                "id": "model:MODEL",
                "name": "Modelspace",
                "kind": "modelspace",
                "entity_count": len(list(msp)),
            })

        for blank_page in cls._load_blank_pages(dxf_path):
            pages.append({
                "id": blank_page["id"],
                "name": blank_page["name"],
                "kind": "blank",
                "entity_count": 0,
            })

        return pages

    @classmethod
    def create_blank_page(cls, dxf_path: str, name: str | None = None) -> dict:
        blank_pages = cls._load_blank_pages(dxf_path)
        page_number = len(blank_pages) + 1
        page_name = (name or f"Blank Page {page_number}").strip() or f"Blank Page {page_number}"
        page = {
            "id": f"blank:{uuid.uuid4().hex[:10]}",
            "name": page_name,
        }
        blank_pages.append(page)
        cls._save_blank_pages(dxf_path, blank_pages)
        return {
            "id": page["id"],
            "name": page["name"],
            "kind": "blank",
            "entity_count": 0,
        }

    @staticmethod
    def _blank_svg() -> tuple[str, float, float]:
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">'
            '<rect x="0" y="0" width="1000" height="1000" fill="#0f172a" />'
            '</svg>'
        )
        return svg, 1000.0, 1000.0

    @staticmethod
    def _extract_svg_viewbox(svg_content: str) -> tuple[float, float]:
        try:
            root = ET.fromstring(svg_content)
            view_box = root.attrib.get("viewBox", "").split()
            if len(view_box) == 4:
                return float(view_box[2]), float(view_box[3])
        except ET.ParseError:
            pass
        return 1000.0, 1000.0

    @classmethod
    def _render_layout_to_svg(cls, doc, layout_obj):
        backend = svg_backend.SVGBackend()
        frontend = Frontend(RenderContext(doc), backend, drawing_config.Configuration())
        page = drawing_layout.Page.from_dxf_layout(layout_obj)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            frontend.draw_layout(layout_obj, finalize=True)
            svg_content = backend.get_string(
                page,
                settings=drawing_layout.Settings(output_layers=True),
                xml_declaration=False,
            )
        width, height = cls._extract_svg_viewbox(svg_content)
        return svg_content, width, height

    @classmethod
    def _render_modelspace_to_svg(cls, doc):
        backend = svg_backend.SVGBackend()
        frontend = Frontend(RenderContext(doc), backend, drawing_config.Configuration())
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            frontend.draw_layout(doc.modelspace(), finalize=True)
            svg_content = backend.get_string(
                drawing_layout.Page(297, 210, drawing_layout.Units.mm),
                settings=drawing_layout.Settings(output_layers=True),
                xml_declaration=False,
            )
        width, height = cls._extract_svg_viewbox(svg_content)
        return svg_content, width, height

    @staticmethod
    def _color_for_layer(layer_name: str) -> str:
        layer = (layer_name or "").lower()
        if "wall" in layer:
            return "#f8fafc"
        if "column" in layer:
            return "#38bdf8"
        if "stair" in layer:
            return "#f59e0b"
        if "text" in layer:
            return "#ddd6fe"
        if "door" in layer:
            return "#86efac"
        if "window" in layer:
            return "#bfdbfe"
        return "#cbd5e1"

    @staticmethod
    def _polyline_points(entity):
        try:
            return [(float(point[0]), float(point[1])) for point in entity.get_points()]
        except AttributeError:
            try:
                return [(float(vertex.dxf.location.x), float(vertex.dxf.location.y)) for vertex in entity.vertices]
            except Exception:
                return []

    @classmethod
    def _entity_intersects_bounds(cls, entity, bounds: tuple[float, float, float, float]) -> bool:
        min_x, min_y, max_x, max_y = bounds
        entity_type = entity.dxftype()

        def point_inside(x: float, y: float) -> bool:
            return min_x <= x <= max_x and min_y <= y <= max_y

        if entity_type == "LINE":
            return point_inside(float(entity.dxf.start.x), float(entity.dxf.start.y)) or point_inside(float(entity.dxf.end.x), float(entity.dxf.end.y))
        if entity_type in {"LWPOLYLINE", "POLYLINE"}:
            return any(point_inside(x, y) for x, y in cls._polyline_points(entity))
        if entity_type == "CIRCLE":
            center = entity.dxf.center
            radius = float(entity.dxf.radius)
            return not (center.x + radius < min_x or center.x - radius > max_x or center.y + radius < min_y or center.y - radius > max_y)
        if entity_type == "ARC":
            center = entity.dxf.center
            radius = float(entity.dxf.radius)
            return not (center.x + radius < min_x or center.x - radius > max_x or center.y + radius < min_y or center.y - radius > max_y)
        if entity_type in {"TEXT", "MTEXT", "INSERT"}:
            insert = getattr(entity.dxf, "insert", None)
            if insert is None:
                insert = getattr(entity.dxf, "location", None)
            if insert is None:
                return False
            return point_inside(float(insert.x), float(insert.y))
        try:
            from ezdxf import bbox
            extents = bbox.extents([entity])
            ext_min_x, ext_min_y, _ = extents.extmin
            ext_max_x, ext_max_y, _ = extents.extmax
            return not (ext_max_x < min_x or ext_min_x > max_x or ext_max_y < min_y or ext_min_y > max_y)
        except Exception:
            return True

    @staticmethod
    def _point_mapper(page_bounds: tuple[float, float, float, float]):
        min_x, min_y, max_x, max_y = page_bounds
        width = max(max_x - min_x, 1.0)
        height = max(max_y - min_y, 1.0)

        def map_point(point: tuple[float, float]) -> tuple[float, float]:
            x = float(point[0]) - min_x
            y = max_y - float(point[1])
            return x, y

        return map_point, width, height

    @staticmethod
    def _viewport_transform(viewport):
        paper_center = viewport.dxf.center
        paper_width = float(viewport.dxf.width)
        paper_height = float(viewport.dxf.height)
        view_center = viewport.dxf.view_center_point
        view_height = float(viewport.dxf.view_height or paper_height or 1)
        view_width = view_height * (paper_width / paper_height if paper_height else 1)
        paper_min_x = float(paper_center.x) - (paper_width / 2)
        paper_min_y = float(paper_center.y) - (paper_height / 2)
        model_min_x = float(view_center.x) - (view_width / 2)
        model_min_y = float(view_center.y) - (view_height / 2)
        model_bounds = (model_min_x, model_min_y, model_min_x + view_width, model_min_y + view_height)

        def transform(point: tuple[float, float]) -> tuple[float, float]:
            px = paper_min_x + ((float(point[0]) - model_min_x) / view_width) * paper_width
            py = paper_min_y + ((float(point[1]) - model_min_y) / view_height) * paper_height
            return px, py

        paper_bounds = (paper_min_x, paper_min_y, paper_min_x + paper_width, paper_min_y + paper_height)
        return transform, model_bounds, paper_bounds

    @staticmethod
    def _recursive_decompose_quiet(entities):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return list(disassemble.recursive_decompose(entities))

    @classmethod
    def _arc_points(cls, center_x: float, center_y: float, radius: float, start_angle: float, end_angle: float, segments: int = 32):
        start = math.radians(start_angle)
        end = math.radians(end_angle)
        if end <= start:
            end += math.tau
        step_count = max(segments, int(abs(end - start) / (math.pi / 24)))
        points = []
        for index in range(step_count + 1):
            angle = start + ((end - start) * index / step_count)
            points.append((center_x + radius * math.cos(angle), center_y + radius * math.sin(angle)))
        return points

    @classmethod
    def _entity_to_renderables(cls, entity, transform, clip_bounds=None):
        entity_type = entity.dxftype()
        layer = getattr(entity.dxf, "layer", "0")
        renderables = []

        def inside(point: tuple[float, float]) -> bool:
            if clip_bounds is None:
                return True
            min_x, min_y, max_x, max_y = clip_bounds
            return min_x <= point[0] <= max_x and min_y <= point[1] <= max_y

        if entity_type == "LINE":
            start = (float(entity.dxf.start.x), float(entity.dxf.start.y))
            end = (float(entity.dxf.end.x), float(entity.dxf.end.y))
            if clip_bounds and not (inside(start) or inside(end)):
                return renderables
            renderables.append({"kind": "line", "layer": layer, "start": transform(start), "end": transform(end)})
            return renderables

        if entity_type in {"LWPOLYLINE", "POLYLINE"}:
            raw_points = cls._polyline_points(entity)
            if clip_bounds and not any(inside(point) for point in raw_points):
                return renderables
            if len(raw_points) >= 2:
                renderables.append({"kind": "polyline", "layer": layer, "points": [transform(point) for point in raw_points]})
            return renderables

        if entity_type == "CIRCLE":
            center = entity.dxf.center
            radius = float(entity.dxf.radius)
            raw_points = cls._arc_points(float(center.x), float(center.y), radius, 0, 360, 48)
            if clip_bounds and not any(inside(point) for point in raw_points):
                return renderables
            renderables.append({"kind": "polyline", "layer": layer, "points": [transform(point) for point in raw_points]})
            return renderables

        if entity_type == "ARC":
            center = entity.dxf.center
            radius = float(entity.dxf.radius)
            raw_points = cls._arc_points(float(center.x), float(center.y), radius, float(entity.dxf.start_angle), float(entity.dxf.end_angle), 24)
            if clip_bounds and not any(inside(point) for point in raw_points):
                return renderables
            renderables.append({"kind": "polyline", "layer": layer, "points": [transform(point) for point in raw_points]})
            return renderables

        if entity_type in {"TEXT", "MTEXT"}:
            content = entity.dxf.text if hasattr(entity.dxf, "text") else ""
            if hasattr(entity, "plain_text"):
                content = entity.plain_text()
            insert = getattr(entity.dxf, "insert", None)
            if insert is None:
                insert = getattr(entity.dxf, "location", None)
            if insert is not None and content and inside((float(insert.x), float(insert.y))):
                renderables.append({"kind": "text", "layer": layer, "position": transform((float(insert.x), float(insert.y))), "text": content})
            return renderables

        if entity_type == "HATCH":
            try:
                for path in ezdxf.path.from_hatch(entity):
                    points = [(float(vertex.x), float(vertex.y)) for vertex in path.flattening(0.5)]
                    if clip_bounds and not any(inside(point) for point in points):
                        continue
                    if len(points) >= 2:
                        renderables.append({"kind": "polyline", "layer": layer, "points": [transform(point) for point in points]})
            except Exception:
                return renderables
            return renderables

        return renderables

    @classmethod
    def _renderables_to_svg(cls, renderables, page_bounds: tuple[float, float, float, float]):
        map_point, width, height = cls._point_mapper(page_bounds)
        body = []
        for item in renderables:
            color = cls._color_for_layer(item.get("layer", "0"))
            if item["kind"] == "line":
                x1, y1 = map_point(item["start"])
                x2, y2 = map_point(item["end"])
                body.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" stroke="{color}" stroke-width="1.2" vector-effect="non-scaling-stroke" />')
            elif item["kind"] == "polyline":
                points = " ".join(f"{map_point(point)[0]:.3f},{map_point(point)[1]:.3f}" for point in item["points"])
                body.append(f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="1.2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />')
            elif item["kind"] == "text":
                x, y = map_point(item["position"])
                escaped = (
                    str(item["text"])
                    .replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                )
                body.append(f'<text x="{x:.3f}" y="{y:.3f}" fill="{color}" font-size="12" font-weight="700">{escaped}</text>')

        svg_content = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.3f} {height:.3f}" width="{width:.3f}" height="{height:.3f}">'
            '<rect x="0" y="0" width="100%" height="100%" fill="#0f172a" />'
            + "".join(body)
            + "</svg>"
        )
        return svg_content, width, height

    @classmethod
    def extract_canvas_page_entities(cls, dxf_path: str, page_id: str | None):
        try:
            cache_path = f"{dxf_path}.canvas_cache.{cls._cache_page_token(page_id)}.v4.json"
            if os.path.exists(cache_path) and os.path.getmtime(cache_path) >= os.path.getmtime(dxf_path):
                with open(cache_path, "r", encoding="utf-8") as cache_file:
                    return json.load(cache_file)

            doc = ezdxf.readfile(dxf_path)
            pages = {page["id"]: page for page in cls.list_canvas_pages(dxf_path)}
            active_page = pages.get(page_id) if page_id else None
            if active_page is None and pages:
                active_page = next(iter(pages.values()))

            if not active_page:
                return {"width": 1000, "height": 1000, "entities": []}

            if active_page["kind"] == "blank":
                svg_content, width, height = cls._blank_svg()
                payload = {"width": width, "height": height, "entities": [], "svg_content": svg_content}
                with open(cache_path, "w", encoding="utf-8") as cache_file:
                    json.dump(payload, cache_file)
                return payload

            renderables = []
            if active_page["kind"] == "viewport":
                layout = doc.layouts.get(active_page["layout_name"])
                viewports = [vp for vp in layout.query("VIEWPORT") if float(getattr(vp.dxf, "height", 0) or 0) > 0]
                viewport = viewports[active_page["viewport_index"] - 1] if active_page["viewport_index"] - 1 < len(viewports) else None
                if viewport is None:
                    page_bounds = (0.0, 0.0, 1000.0, 1000.0)
                    svg_content, width, height = cls._renderables_to_svg([], page_bounds)
                else:
                    transform, model_bounds, paper_bounds = cls._viewport_transform(viewport)
                    model_entities = [entity for entity in doc.modelspace() if cls._entity_intersects_bounds(entity, model_bounds)]
                    for entity in cls._recursive_decompose_quiet(model_entities):
                        for item in cls._entity_to_renderables(entity, transform, model_bounds):
                            renderables.append(item)
                    svg_content, width, height = cls._renderables_to_svg(renderables, paper_bounds)
            elif active_page["kind"] == "layout":
                layout = doc.layouts.get(active_page["name"])
                viewport_candidates = [vp for vp in layout.query("VIEWPORT") if float(getattr(vp.dxf, "height", 0) or 0) > 0]
                viewport = max(viewport_candidates, key=lambda vp: float(getattr(vp.dxf, "height", 0) or 0)) if viewport_candidates else None

                page_min_x = float("inf")
                page_min_y = float("inf")
                page_max_x = float("-inf")
                page_max_y = float("-inf")

                def extend_bounds(point):
                    nonlocal page_min_x, page_min_y, page_max_x, page_max_y
                    page_min_x = min(page_min_x, point[0])
                    page_min_y = min(page_min_y, point[1])
                    page_max_x = max(page_max_x, point[0])
                    page_max_y = max(page_max_y, point[1])

                paper_entities = [entity for entity in layout if entity.dxftype() != "VIEWPORT"]
                for entity in cls._recursive_decompose_quiet(paper_entities):
                    for item in cls._entity_to_renderables(entity, lambda point: point):
                        renderables.append(item)
                        if item["kind"] == "line":
                            extend_bounds(item["start"])
                            extend_bounds(item["end"])
                        elif item["kind"] == "polyline":
                            for point in item["points"]:
                                extend_bounds(point)
                        elif item["kind"] == "text":
                            extend_bounds(item["position"])

                if viewport is not None:
                    transform, model_bounds, viewport_paper_bounds = cls._viewport_transform(viewport)
                    extend_bounds((viewport_paper_bounds[0], viewport_paper_bounds[1]))
                    extend_bounds((viewport_paper_bounds[2], viewport_paper_bounds[3]))
                    model_entities = [entity for entity in doc.modelspace() if cls._entity_intersects_bounds(entity, model_bounds)]
                    for entity in cls._recursive_decompose_quiet(model_entities):
                        for item in cls._entity_to_renderables(entity, transform, model_bounds):
                            renderables.append(item)

                if page_min_x == float("inf"):
                    page_bounds = (0.0, 0.0, 1000.0, 1000.0)
                else:
                    page_bounds = (page_min_x, page_min_y, page_max_x, page_max_y)
                svg_content, width, height = cls._renderables_to_svg(renderables, page_bounds)
            else:
                from ezdxf import bbox
                msp = doc.modelspace()
                overall_bbox = bbox.extents(msp)
                page_bounds = (
                    float(overall_bbox.extmin.x),
                    float(overall_bbox.extmin.y),
                    float(overall_bbox.extmax.x),
                    float(overall_bbox.extmax.y),
                )
                for entity in cls._recursive_decompose_quiet(msp):
                    renderables.extend(cls._entity_to_renderables(entity, lambda point: point))
                svg_content, width, height = cls._renderables_to_svg(renderables, page_bounds)

            payload = {"width": width, "height": height, "entities": [], "svg_content": svg_content}
            with open(cache_path, "w", encoding="utf-8") as cache_file:
                json.dump(payload, cache_file)
            return payload
        except Exception as e:
            raise RuntimeError(f"Canvas extraction failed: {str(e)}")
