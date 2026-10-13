"""The Golden Keycap trophy, built headless in Blender.

  /Applications/Blender.app/Contents/MacOS/Blender -b -P trophy/build.py            # STLs
  /Applications/Blender.app/Contents/MacOS/Blender -b -P trophy/build.py -- render  # STLs + preview images

Units are millimetres. Every part is modelled in its print orientation (flat side on the bed, no supports).
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "stl")
PIXEL_FONT = os.path.join(HERE, "fonts", "Jersey15-Regular.ttf")
MONO_FONT = os.path.join(HERE, "fonts", "JetBrainsMono-Bold.ttf")

# Plaque copy. Edit and rerun to customise.
PLAQUE_LINES = [  # (text, font, cap height mm, centre y mm)
    ("THE GOLDEN KEYCAP", PIXEL_FONT, 9.0, 7.0),
    ("HELLO, WORLD CUP  -  SEASON 0", PIXEL_FONT, 5.0, -3.5),
    ("THE PROGRAMMING CLUB  -  HENRY FORD COLLEGE", PIXEL_FONT, 4.2, -11.0),
]
BACK_TEXT = "programmingclub.dev"

FIT = 0.25  # clearance per side on every joint

# Plinth
BASE_W, BASE_D, BASE_H = 150, 124, 8
BODY_W, BODY_D, BODY_H = 130, 104, 44
SLOPE = math.radians(20)  # front face leans back so the plaque faces the viewer
TOP = BASE_H + BODY_H
TOP_FRONT_Y = -BODY_D / 2 + BODY_H * math.tan(SLOPE)
SWITCH_Y = (TOP_FRONT_Y + BODY_D / 2) / 2
PEG_D, PEG_H = 20, 10
PEG_Y = 0  # the printed base has its peg at the centre of the footprint, SWITCH_Y in front of the switch's centre

# Plaque
PLAQUE_W, PLAQUE_H, PLAQUE_T, RELIEF = 118, 40, 2.4, 0.8
POCKET = 1.6

# Switch, a Cherry MX at roughly 5x
FLANGE, FLANGE_H = 78, 10
HOUSING_BOT, HOUSING_TOP, HOUSING_H = 70, 54, 26
SLIDER_W, SLIDER_D, SLIDER_H = 30, 24, 6
CROSS_L, CROSS_T, CROSS_H = 20.5, 6, 18
SWITCH_TOP = FLANGE_H + HOUSING_H + SLIDER_H  # where the keycap rests

# Keycap, a Cherry-profile 1u at 5x
CAP_BOT, CAP_TOP, CAP_H = 90, 64, 47
DISH_DEPTH = 4
DISH_R = ((CAP_TOP / 2) ** 2 + DISH_DEPTH**2) / (2 * DISH_DEPTH)
ENGRAVE = 1.2


# ---------- mesh helpers ----------


def link(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def hull(name, pts):
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.dissolve_limit(bm, angle_limit=0.001, verts=bm.verts, edges=bm.edges)
    return link(name, bm)


def rect(w, d, z, cx=0.0, cy=0.0):
    return [(cx + sx * w / 2, cy + sy * d / 2, z) for sx in (-1, 1) for sy in (-1, 1)]


def box(name, w, d, z0, z1, cx=0.0, cy=0.0):
    return hull(name, rect(w, d, z0, cx, cy) + rect(w, d, z1, cx, cy))


def cylinder(name, r, z0, z1, cx=0.0, cy=0.0, segs=96, r_top=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r if r_top is None else r_top, depth=z1 - z0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(cx, cy, (z0 + z1) / 2))
    return link(name, bm)


def bevel(ob, offset, segments, pick):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    edges = [e for e in bm.edges if pick(e)]
    bmesh.ops.bevel(bm, geom=edges, offset=offset, segments=segments, profile=0.5, affect="EDGES", clamp_overlap=True)
    bm.to_mesh(ob.data)
    bm.free()


def is_upright(e, min_z=0.5):
    return abs((e.verts[1].co - e.verts[0].co).normalized().z) > min_z


def at_z(z):
    return lambda e: all(abs(v.co.z - z) < 1e-4 for v in e.verts)


def apply(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old, ob.data = ob.data, me
    bpy.data.meshes.remove(old)


def boolean(a, b, op):
    m = a.modifiers.new("bool", "BOOLEAN")
    m.operation, m.object, m.solver = op, b, "EXACT"
    apply(a)
    bpy.data.objects.remove(b)
    return a


def transform(ob, mat):
    ob.data.transform(mat)
    ob.data.update()


def text(name, body, font, cap, height, max_w=1e9):
    """Text solid sitting on z=0, scaled to the given cap height (or narrower to fit max_w) and centred on the origin."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.font = bpy.data.fonts.load(font, check_existing=True)
    cu.size = 10
    cu.extrude = height / 2
    cu.resolution_u = 6
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    out = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(out)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me)
    bm.free()
    # Cap height from a capital without overshoot.
    ref = bpy.data.curves.new("ref", "FONT")
    ref.body, ref.font, ref.size = "H", cu.font, 10
    ref_ob = bpy.data.objects.new("ref", ref)
    bpy.context.scene.collection.objects.link(ref_ob)
    dg = bpy.context.evaluated_depsgraph_get()
    ref_me = bpy.data.meshes.new_from_object(ref_ob.evaluated_get(dg))
    h = max(v.co.y for v in ref_me.vertices) - min(v.co.y for v in ref_me.vertices)
    bpy.data.objects.remove(ref_ob)
    bpy.data.meshes.remove(ref_me)
    xs = [v.co.x for v in me.vertices]
    s = min(cap / h, max_w / (max(xs) - min(xs)))
    transform(out, Matrix.Translation((-(min(xs) + max(xs)) / 2 * s, -h * s / 2, height / 2)) @ Matrix.Diagonal((s, s, 1, 1)))
    return out


def rounded_stroke(name, start, end, radius, z0, z1):
    """Extruded capsule with round ends, matching the terminal-prompt logo."""
    points = [
        (x + radius * math.cos(i * math.tau / 64), y + radius * math.sin(i * math.tau / 64), z)
        for x, y in (start, end)
        for z in (z0, z1)
        for i in range(64)
    ]
    return hull(name, points)


# ---------- parts ----------


def plaque_frame():
    """Pocket centre on the plinth's sloped face, with axes (along, up the slope, outward)."""
    centre = Vector((0, -BODY_D / 2 + BODY_H / 2 * math.tan(SLOPE), BASE_H + BODY_H / 2))
    return Matrix.Translation(centre) @ Matrix.Rotation(math.radians(90) - SLOPE, 4, "X")


def make_base():
    tier = box("base", BASE_W, BASE_D, 0, BASE_H)
    bevel(tier, 1.5, 3, at_z(BASE_H))
    body = hull(
        "body",
        rect(BODY_W, BODY_D, BASE_H - 0.5)
        + [(sx * BODY_W / 2, y, TOP) for sx in (-1, 1) for y in (TOP_FRONT_Y, BODY_D / 2)],
    )
    bevel(body, 1.2, 3, lambda e: not at_z(BASE_H - 0.5)(e))
    base = boolean(tier, body, "UNION")
    peg = cylinder("peg", PEG_D / 2, TOP - 1, TOP + PEG_H - 1, cy=PEG_Y)
    peg_tip = cylinder("peg_tip", PEG_D / 2, TOP + PEG_H - 1, TOP + PEG_H, cy=PEG_Y, r_top=PEG_D / 2 - 1)
    boolean(base, boolean(peg, peg_tip, "UNION"), "UNION")
    # Plaque pocket on the sloped face.
    pocket = box("pocket", PLAQUE_W + 2 * FIT, PLAQUE_H + 2 * FIT, -POCKET, POCKET)
    transform(pocket, plaque_frame())
    boolean(base, pocket, "DIFFERENCE")
    # Engraved URL on the back.
    url = text("url", BACK_TEXT, MONO_FONT, 5, 2)
    transform(url, Matrix.Translation((0, BODY_D / 2 + 1.2, BASE_H + BODY_H / 2)) @ Matrix.Rotation(math.radians(-90), 4, "X") @ Matrix.Rotation(math.pi, 4, "Z"))
    boolean(base, url, "DIFFERENCE")
    return base


def make_switch():
    flange = box("switch", FLANGE, FLANGE, 0, FLANGE_H)
    bevel(flange, 1.5, 3, lambda e: is_upright(e) or at_z(FLANGE_H)(e))
    housing = hull("housing", rect(HOUSING_BOT, HOUSING_BOT, FLANGE_H - 0.5) + rect(HOUSING_TOP, HOUSING_TOP, FLANGE_H + HOUSING_H))
    bevel(housing, 3, 4, lambda e: is_upright(e, 0.8))
    bevel(housing, 1, 2, at_z(FLANGE_H + HOUSING_H))
    switch = boolean(flange, housing, "UNION")
    z = FLANGE_H + HOUSING_H
    slider = box("slider", SLIDER_W, SLIDER_D, z - 0.5, z + SLIDER_H)
    bevel(slider, 1, 2, is_upright)
    boolean(switch, slider, "UNION")
    z += SLIDER_H
    for w, d in ((CROSS_L, CROSS_T), (CROSS_T, CROSS_L)):
        arm = box("arm", w, d, z - 0.5, z + CROSS_H)
        bevel(arm, 0.6, 1, at_z(z + CROSS_H))
        boolean(switch, arm, "UNION")
    # Socket for the plinth peg, with a 45° roof so it prints without support. It's off-centre so the switch
    # sits centred on the plinth's top; the socket side faces the plaque.
    r, y = PEG_D / 2 + FIT, PEG_Y - SWITCH_Y
    hole = cylinder("hole", r, -1, PEG_H + 0.5, cy=y)
    roof = cylinder("roof", r, PEG_H + 0.5, PEG_H + 0.5 + r, cy=y, r_top=0.01)
    boolean(switch, boolean(hole, roof, "UNION"), "DIFFERENCE")
    return switch


def make_keycap():
    cap = hull("keycap", rect(CAP_BOT, CAP_BOT, 0) + rect(CAP_TOP, CAP_TOP, CAP_H))
    bevel(cap, 9, 8, is_upright)
    bevel(cap, 2, 4, at_z(CAP_H))
    axis_z = CAP_H - DISH_DEPTH + DISH_R
    to_axis = Matrix.Translation((0, 0, axis_z)) @ Matrix.Rotation(math.radians(90), 4, "X")
    dish = cylinder("dish", DISH_R, -100, 100, segs=512)
    transform(dish, to_axis)
    boolean(cap, dish, "DIFFERENCE")
    # The rounded >_ mark is engraved into the dish. The keycap itself supplies
    # the logo's rounded-square silhouette; its colour comes from gold paint.
    chevron = rounded_stroke("chevron", (-17, 11), (-5, 0), 2.8, CAP_H - 20, CAP_H + 5)
    boolean(chevron, rounded_stroke("chevron_lower", (-5, 0), (-17, -11), 2.8, CAP_H - 20, CAP_H + 5), "UNION")
    underline = rounded_stroke("underline", (5, -11), (17, -11), 2.8, CAP_H - 20, CAP_H + 5)
    for mark in (chevron, underline):
        depth = cylinder("depth", DISH_R + ENGRAVE, -100, 100, segs=512)
        transform(depth, to_axis)
        boolean(cap, boolean(mark, depth, "INTERSECT"), "DIFFERENCE")
    # Cross socket for the switch stem, with 45° peaked roofs so nothing bridges.
    w, d, z = CROSS_L + 2 * FIT, CROSS_T + 2 * FIT, CROSS_H + 0.5
    for a, b in ((w, d), (d, w)):
        ridge = [(sx * (a - b) / 2, 0, z + b / 2) if a > b else (0, sx * (b - a) / 2, z + a / 2) for sx in (-1, 1)]
        boolean(cap, hull("socket", rect(a, b, -1) + rect(a, b, z) + ridge), "DIFFERENCE")
    return cap


def make_plaque():
    plate = box("plaque_plate", PLAQUE_W, PLAQUE_H, 0, PLAQUE_T)
    bevel(plate, 3, 4, is_upright)
    bevel(plate, 0.4, 1, at_z(PLAQUE_T))
    relief = box("frame", PLAQUE_W - 4, PLAQUE_H - 4, PLAQUE_T, PLAQUE_T + RELIEF)
    bevel(relief, 2, 4, is_upright)
    inner = box("inner", PLAQUE_W - 6.4, PLAQUE_H - 6.4, PLAQUE_T - 1, PLAQUE_T + RELIEF + 1)
    bevel(inner, 1, 3, is_upright)
    boolean(relief, inner, "DIFFERENCE")
    relief.name = "plaque_text"
    for body, font, cap, y in PLAQUE_LINES:
        t = text("line", body, font, cap, RELIEF, PLAQUE_W - 14)
        transform(t, Matrix.Translation((0, y, PLAQUE_T)))
        boolean(relief, t, "UNION")
    return plate, relief


# ---------- output ----------


def check(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bad = sum(not e.is_manifold for e in bm.edges)
    vol = bm.calc_volume() / 1000
    lo = [min(v.co[i] for v in bm.verts) for i in range(3)]
    hi = [max(v.co[i] for v in bm.verts) for i in range(3)]
    bm.free()
    size = " x ".join(f"{h - l:.1f}" for l, h in zip(lo, hi))
    print(f"  {ob.name:14} {size:24} mm  {vol:7.1f} cm3  non-manifold edges: {bad}")
    assert bad == 0, f"{ob.name} is not watertight"
    assert ob.name == "plaque_text" or abs(lo[2]) < 1e-3, f"{ob.name} is not on the bed"


def export(obs, name):
    for o in bpy.context.scene.objects:
        o.select_set(o in obs)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.wm.stl_export(filepath=os.path.join(OUT, f"{name}.stl"), export_selected_objects=True, ascii_format=False)


# The base, switch and keycap on one 256 x 256 P1S plate: (bed x, bed y, turn) for each part's centre.
# The layout is clear of the P1S's 18 x 28 mm exclusion zone. The plaque prints separately.
PLATE = {
    "base": (78, 154, 90),
    "keycap": (195, 200, 0),
    "switch": (195, 55, 0),
}


def export_plate(parts):
    """plate.stl: the black parts laid out together on the bed."""
    copies = []
    for name, (x, y, turn) in PLATE.items():
        c = parts[name].copy()
        c.matrix_world = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(turn), 4, "Z")
        bpy.context.scene.collection.objects.link(c)
        copies.append(c)
    export(copies, "plate")
    for c in copies:
        bpy.data.objects.remove(c)


def material(name, rgb, metallic=0.0, rough=0.5):
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    return m


def render(parts):
    gold = material("gold", (1.0, 0.72, 0.22), 1.0, 0.28)  # spray paint
    black = material("black", (0.015, 0.015, 0.017), 0.0, 0.45)
    white = material("white", (0.85, 0.85, 0.85), 0.0, 0.45)
    placed = {
        "base": (Matrix(), black),
        "switch": (Matrix.Translation((0, SWITCH_Y, TOP)), black),
        "keycap": (Matrix.Translation((0, SWITCH_Y, TOP + SWITCH_TOP)), gold),
        "plaque_plate": (plaque_frame() @ Matrix.Translation((0, 0, -POCKET)), black),
        "plaque_text": (plaque_frame() @ Matrix.Translation((0, 0, -POCKET)), white),
    }
    for name, ob in parts.items():
        mat, m = placed[name]
        ob.matrix_world = mat
        ob.data.materials.clear()  # booleans leave empty slots behind
        ob.data.materials.append(m)
        for p in ob.data.polygons:
            p.material_index = 0

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1200, 1500
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 88
    world = bpy.data.worlds.new("world")
    world.color = (0.02, 0.02, 0.025)
    scene.world = world
    floor = box("floor", 3000, 3000, -1, 0)
    floor.data.materials.append(material("floor", (0.05, 0.05, 0.06), 0, 0.6))
    for loc, energy, size in (((-250, -300, 400), 4e6, 300), ((300, -150, 250), 1.5e6, 200), ((0, 350, 300), 2.5e6, 300)):
        light = bpy.data.lights.new("light", "AREA")
        light.energy, light.size = energy, size
        lo = bpy.data.objects.new("light", light)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 70)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(lo)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    shots = {
        "preview": ((260, -420, 260), (0, 0, 72), 50),
        "preview-plaque": ((0, -330, 150), (0, -44, 30), 85),
        "preview-keycap": ((0, -170, 330), (0, SWITCH_Y, 140), 70),
    }
    for name, (loc, target, lens) in shots.items():
        cam.location = loc
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = lens
        cam.data.clip_end = 5000
        scene.render.filepath = os.path.join(HERE, f"{name}.jpg")
        bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUT, exist_ok=True)
    plate, relief = make_plaque()
    parts = {"base": make_base(), "switch": make_switch(), "keycap": make_keycap(), "plaque_plate": plate, "plaque_text": relief}
    print("Golden Keycap trophy:")
    for name, ob in parts.items():
        ob.name = name
        check(ob)
        export([ob], name)
    export_plate(parts)
    if "render" in sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []:
        render(parts)


main()
