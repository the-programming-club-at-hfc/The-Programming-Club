"""Pack STLs from stl/ into a Bambu Studio project for the P1S.

  python3 trophy/make_3mf.py base      # stl/base.stl -> base-p1s.3mf (sliced; likewise switch, keycap)
  python3 trophy/make_3mf.py parts     # every part   -> trophy-parts.3mf (one object each, not sliced)

Black PLA (white for the plaque text) with Bambu's own P1S presets. Needs a Bambu Studio whose
CLI works (2.8+): set BAMBU_APP to its .app, or it uses ~/.local/share/bambu-cli/BambuStudio.app.
"""

import json
import os
import struct
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.environ.get("BAMBU_APP", os.path.expanduser("~/.local/share/bambu-cli/BambuStudio.app"))
PROFILES = os.path.join(APP, "Contents/Resources/profiles/BBL")
PART = sys.argv[1] if len(sys.argv) > 1 else "parts"
OUT = os.path.join(HERE, "trophy-parts.3mf" if PART == "parts" else f"{PART}-p1s.3mf")
# Objects in the project: (name, [(stl, filament)]). An object's volumes keep their shared STL coordinates.
OBJECTS = {
    "parts": [
        ("Base", [("base", 1)]),
        ("Switch", [("switch", 1)]),
        ("Keycap", [("keycap", 1)]),
        ("Plaque", [("plaque_plate", 1), ("plaque_text", 2)]),
    ],
}.get(PART, [(PART.title(), [(PART, 1)])])
SLICE = PART != "parts"  # the parts file is for laying out your own plates

MACHINE = "Bambu Lab P1S 0.4 nozzle"
PROCESS = "0.20mm Standard @BBL X1C"
FILAMENT = "Bambu PLA Basic @BBL X1C"
COLOURS = ["#000000", "#FFFFFF"]
CENTRE = 128  # centre of the 256 mm bed
CLEAR_Y = 30  # nearest the front edge a big part may come, clear of the bed's 18 x 28 mm front-left exclusion zone


def presets():
    index = {}
    for kind in ("machine", "process", "filament"):
        folder = os.path.join(PROFILES, kind)
        for f in os.listdir(folder):
            if f.endswith(".json"):
                name = json.load(open(os.path.join(folder, f))).get("name")
                index.setdefault(name, os.path.join(folder, f))
    return index


def flatten(index, name):
    """A system preset with its inherits chain resolved, so the CLI can load it on its own."""
    data = json.load(open(index[name]))
    parent = data.pop("inherits", "")
    base = flatten(index, parent) if parent else {}
    base.update(data)
    base["inherits"] = ""
    return base


def read_stl(path):
    data = open(path, "rb").read()
    verts, index, tris = [], {}, []
    for i in range(struct.unpack("<I", data[80:84])[0]):
        tri = []
        for k in range(3):
            v = struct.unpack("<3f", data[84 + i * 50 + 12 + k * 12 : 84 + i * 50 + 24 + k * 12])
            if v not in index:
                index[v] = len(verts)
                verts.append(v)
            tri.append(index[v])
        tris.append(tri)
    return verts, tris


def mesh_xml(obj_id, verts, tris, cx, cy):
    vs = "".join(f'<vertex x="{x - cx:.5f}" y="{y - cy:.5f}" z="{z:.5f}"/>' for x, y, z in verts)
    ts = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in tris)
    return f'<object id="{obj_id}" type="model"><mesh><vertices>{vs}</vertices><triangles>{ts}</triangles></mesh></object>'


def write_unsliced(path):
    ns = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"'
    rel = 'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"'
    identity = "1 0 0 0 1 0 0 0 1 0 0 0"
    resources, items, configs, rels, instances, files = [], [], [], [], [], {}
    next_id = 1
    for n, (name, stls) in enumerate(OBJECTS, 1):
        volumes = [(stl, extruder, read_stl(os.path.join(HERE, "stl", f"{stl}.stl"))) for stl, extruder in stls]
        verts = [v for _, _, (vs, _) in volumes for v in vs]
        lo, hi = ([f(v[i] for v in verts) for i in (0, 1)] for f in (min, max))
        cx, cy = ((lo[i] + hi[i]) / 2 for i in (0, 1))  # centre the object, not each volume
        y = max(CENTRE, CLEAR_Y + (hi[1] - lo[1]) / 2)
        model = f"/3D/Objects/object_{n}.model"
        ids = list(range(next_id, next_id + len(volumes)))
        meshes = "".join(mesh_xml(i, *mesh, cx, cy) for i, (_, _, mesh) in zip(ids, volumes))
        files[model] = f'<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" {ns} requiredextensions="p"><resources>{meshes}</resources></model>'
        rels.append(f'<Relationship Target="{model}" Id="rel-{n}" {rel}/>')
        obj = ids[-1] + 1
        next_id = obj + 1
        components = "".join(f'<component p:path="{model}" objectid="{i}" transform="{identity}"/>' for i in ids)
        resources.append(f'<object id="{obj}" type="model"><components>{components}</components></object>')
        items.append(f'<item objectid="{obj}" transform="1 0 0 0 1 0 0 0 1 {CENTRE} {y:.3f} 0" printable="1"/>')
        parts = "".join(
            f'<part id="{i}" subtype="normal_part"><metadata key="name" value="{stl}"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/><metadata key="extruder" value="{extruder}"/></part>'
            for i, (stl, extruder, _) in zip(ids, volumes)
        )
        configs.append(f'<object id="{obj}"><metadata key="name" value="{name}"/><metadata key="extruder" value="1"/>{parts}</object>')
        instances.append(f'<model_instance><metadata key="object_id" value="{obj}"/><metadata key="instance_id" value="0"/></model_instance>')
    main = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" {ns} xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" requiredextensions="p">'
        '<metadata name="BambuStudio:3mfVersion">1</metadata>'
        f'<resources>{"".join(resources)}</resources><build>{"".join(items)}</build></model>'
    )
    settings = f'<?xml version="1.0" encoding="UTF-8"?>\n<config>{"".join(configs)}<plate><metadata key="plater_id" value="1"/>{"".join(instances)}</plate></config>'
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
        )
        z.writestr("_rels/.rels", f'<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" {rel}/></Relationships>')
        z.writestr("3D/_rels/3dmodel.model.rels", f'<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{"".join(rels)}</Relationships>')
        z.writestr("3D/3dmodel.model", main)
        for model, xml in files.items():
            z.writestr(model.lstrip("/"), xml)
        z.writestr("Metadata/model_settings.config", settings)


def main():
    index = presets()
    with tempfile.TemporaryDirectory() as tmp:
        files = {}
        for key, name in (("machine", MACHINE), ("process", PROCESS)):
            files[key] = os.path.join(tmp, f"{key}.json")
            preset = flatten(index, name)
            if key == "machine":
                preset["curr_bed_type"] = "Textured PEI Plate"
            if key == "process":
                preset.update({"enable_prime_tower": "0", "enable_support": "0", "sparse_infill_density": "15%"})
            json.dump(preset, open(files[key], "w"))
        used = max(e for _, stls in OBJECTS for _, e in stls)
        filaments = [os.path.join(tmp, f"filament{i + 1}.json") for i in range(used)]
        for f, colour in zip(filaments, COLOURS):
            filament = flatten(index, FILAMENT)
            filament["filament_colour"] = [colour]
            json.dump(filament, open(f, "w"))
        unsliced = os.path.join(tmp, "trophy.3mf")
        write_unsliced(unsliced)
        cmd = [
            os.path.join(APP, "Contents/MacOS/BambuStudio"),
            "--load-settings", f"{files['machine']};{files['process']}",
            "--load-filaments", ";".join(filaments),
            "--arrange", "0" if SLICE else "1",
            *(["--slice", "0"] if SLICE else []),
            "--export-3mf", OUT,
            unsliced,
        ]  # fmt: skip
        result = subprocess.run(cmd, cwd=tmp, capture_output=True, text=True)
        if result.returncode != 0 or not os.path.exists(OUT):
            sys.exit(f"Bambu Studio CLI failed ({result.returncode}):\n{result.stdout[-3000:]}\n{result.stderr[-3000:]}")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
