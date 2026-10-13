# Rebuild public/trophy/golden-keycap.glb after changing the trophy in trophy/build.py (repo root):
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P apps/web/scripts/export-trophy-glb.py -- /tmp/golden-keycap.glb
#   bunx @gltf-transform/cli optimize /tmp/golden-keycap.glb apps/web/public/trophy/golden-keycap.glb --compress quantize --texture-compress false --simplify false
import math, os, sys
import bpy
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../trophy/build.py")
OUT = sys.argv[sys.argv.index("--") + 1]
code = open(SRC).read()
code = code[: code.rindex("main()")]  # define everything, run nothing
g = {"__file__": SRC, "__name__": "trophy"}
exec(compile(code, SRC, "exec"), g)
bpy.ops.wm.read_factory_settings(use_empty=True)
plate, relief = g["make_plaque"]()
parts = {"base": g["make_base"](), "switch": g["make_switch"](), "keycap": g["make_keycap"](), "plaque_plate": plate, "plaque_text": relief}
M, T = g["Matrix"], g["Matrix"].Translation
mat = g["material"]
gold = mat("gold", (1.0, 0.71, 0.29), 1.0, 0.22)
black = mat("black", (0.018, 0.018, 0.022), 0.0, 0.42)
white = mat("white", (0.9, 0.9, 0.9), 0.0, 0.5)
frame = g["plaque_frame"]() @ T((0, 0, -g["POCKET"]))
placed = {
    "base": (M(), black),
    "switch": (T((0, g["SWITCH_Y"], g["TOP"])), black),
    "keycap": (T((0, g["SWITCH_Y"], g["TOP"] + g["SWITCH_TOP"])), gold),
    "plaque_plate": (frame, black),
    "plaque_text": (frame, white),
}
for name, ob in parts.items():
    ob.name = name
    m, material = placed[name]
    ob.matrix_world = m
    ob.data.materials.clear()
    ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.material_index = 0
    for o in bpy.context.scene.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    # Big flat faces keep flat normals; only the bevels between them are rounded.
    wn = ob.modifiers.new("weighted", "WEIGHTED_NORMAL")
    wn.mode = "FACE_AREA"
    wn.keep_sharp = True
for o in bpy.context.scene.objects:
    o.select_set(o.name in parts)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
print("wrote", OUT)
