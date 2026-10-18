"""Lily design revision: editable, unrigged, additive Blender construction.

Run through Blender MCP with exec(compile(open(__file__).read(), __file__, 'exec')).
The previous scene and all approved assets are preserved. Only this revision's
named scene is replaced on an explicit rebuild.
"""
from pathlib import Path
import math
import json
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
RENDERS = ROOT / 'renders'
RENDERS.mkdir(parents=True, exist_ok=True)
PREFIX = 'L2_'
SCENE_NAME = 'Lily_Design_02'


def enum(owner, prop, wanted):
    values = [v.identifier for v in owner.bl_rna.properties[prop].enum_items]
    if wanted not in values:
        raise ValueError(f'{prop}: {wanted} not in {values}')
    return wanted


def mod(obj, name, kind):
    return obj.modifiers.new(name, enum(bpy.types.Modifier, 'type', kind))


def srgb(rgb):
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb)


def color(h):
    return srgb(tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)))


def material(name, hexcolor, rough=.72, spec=.22, emission=.0):
    m = bpy.data.materials.new(PREFIX + name)
    m.diffuse_color = (*color(hexcolor), 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = m.diffuse_color
    p.inputs['Roughness'].default_value = rough
    p.inputs['Specular IOR Level'].default_value = spec
    p.inputs['Emission Color'].default_value = m.diffuse_color
    p.inputs['Emission Strength'].default_value = emission
    return m


def mesh(name, verts, faces, mat, sub=0, edges=()):
    data = bpy.data.meshes.new(PREFIX + name)
    data.from_pydata(verts, edges, faces)
    data.update()
    obj = bpy.data.objects.new(PREFIX + name, data)
    character.objects.link(obj)
    if mat:
        data.materials.append(mat)
    if faces:
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
        bm.free()
        for f in data.polygons:
            f.use_smooth = True
    if sub:
        m = mod(obj, 'Surface refinement', 'SUBSURF')
        m.levels = sub
        m.render_levels = sub
    return obj


def solid(obj, thickness=.004):
    m = mod(obj, 'Fabric thickness', 'SOLIDIFY')
    m.thickness = thickness
    m.offset = 0
    return m


def loft(name, rings, mat, n=32, sub=1, caps=True, power=1, pleats=0):
    # z, x radius, y radius, x centre, y centre
    vs, fs = [], []
    for j, (z, rx, ry, cx, cy) in enumerate(rings):
        for i in range(n):
            a = i * 2 * math.pi / n
            sx, sy = math.sin(a), -math.cos(a)
            sx = math.copysign(abs(sx) ** power, sx)
            sy = math.copysign(abs(sy) ** power, sy)
            wave = pleats * (j / max(1, len(rings) - 1)) * math.cos(a * 10)
            vs.append((cx + (rx + wave) * sx, cy + (ry + wave) * sy, z))
            if j:
                p = (j - 1) * n + i
                q = (j - 1) * n + (i + 1) % n
                fs.append((p, q, q + n, p + n))
    if caps:
        fs += [tuple(reversed(range(n))), tuple((len(rings) - 1) * n + i for i in range(n))]
    return mesh(name, vs, fs, mat, sub)


def catmull(points, steps=4):
    pp = [Vector(p) for p in points]
    out = []
    for j in range(len(pp) - 1):
        a, b, c, d = pp[max(0, j - 1)], pp[j], pp[j + 1], pp[min(len(pp) - 1, j + 2)]
        for k in range(steps):
            t = k / steps
            out.append(.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3))
    out.append(pp[-1])
    return out


def tube(name, points, radius, mat, steps=3, sides=6):
    pts = catmull(points, steps)
    vs, fs = [], []
    for j, p in enumerate(pts):
        t = (pts[min(j + 1, len(pts) - 1)] - pts[max(0, j - 1)]).normalized()
        ref = Vector((0, 1, 0)) if abs(t.y) < .9 else Vector((1, 0, 0))
        u, v = t.cross(ref).normalized(), None
        v = t.cross(u).normalized()
        r = radius(j / (len(pts) - 1)) if callable(radius) else radius
        for k in range(sides):
            a = 2 * math.pi * k / sides
            vs.append(p + r * (u * math.cos(a) + v * math.sin(a)))
            if j:
                i = (j - 1) * sides + k
                q = (j - 1) * sides + (k + 1) % sides
                fs.append((i, q, q + sides, i + sides))
    fs += [tuple(reversed(range(sides))), tuple((len(pts) - 1) * sides + i for i in range(sides))]
    return mesh(name, vs, fs, mat)


def strap(name, points, width, mat, normal=(0, -1, 0)):
    pts = catmull(points, 4)
    vs, fs = [], []
    for j, p in enumerate(pts):
        for i in range(3):
            vs.append(p + Vector((width * (i / 2 - .5), 0, -.002 * (1 - abs(i - 1)))))
            if j and i:
                a = (j - 1) * 3 + i - 1
                fs.append((a, a + 1, a + 4, a + 3))
    o = mesh(name, vs, fs, mat, 1)
    solid(o, .006)
    return o


def hair_lock(name, points, widths, depths):
    path = catmull(points, 4)
    vs, fs = [], []
    for j, p in enumerate(path):
        t = j / (len(path) - 1)
        f = t * (len(widths) - 1)
        k = min(int(f), len(widths) - 2)
        w = widths[k] * (1 - (f - k)) + widths[k + 1] * (f - k)
        dep = depths[k] * (1 - (f - k)) + depths[k + 1] * (f - k)
        tangent = (path[min(j + 1, len(path) - 1)] - path[max(0, j - 1)]).normalized()
        cross = tangent.cross(Vector((0, -1, 0))).normalized()
        outward = cross.cross(tangent).normalized()
        for i in range(8):
            a = i * math.pi / 4
            vs.append(p + cross * (math.cos(a) * w) + outward * (math.sin(a) * dep))
            if j:
                n = (j - 1) * 8 + i
                q = (j - 1) * 8 + (i + 1) % 8
                fs.append((n, q, q + 8, n + 8))
    fs += [tuple(reversed(range(8))), tuple((len(path) - 1) * 8 + i for i in range(8))]
    return mesh(name, vs, fs, hair, 1)


# Rebuild only objects owned by this revision; never touch the user's other scene.
old = bpy.data.scenes.get(SCENE_NAME)
if old:
    for o in list(old.objects):
        if o.name.startswith(PREFIX):
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(old)
scene = bpy.data.scenes.new(SCENE_NAME)
if bpy.context.window:
    bpy.context.window.scene = scene
character = bpy.data.collections.new(PREFIX + 'Character')
stage = bpy.data.collections.new(PREFIX + 'Studio')
scene.collection.children.link(character)
scene.collection.children.link(stage)

skin = material('Skin warm peach', 'F2C39C', .8, .18, .04)
shirtmat = material('Shirt sunflower', 'F4C518', .82, .16, .035)
trim = material('Shirt ribbing', 'DDAE21', .86, .12)
skirtmat = material('Skirt cornflower', '3972B7', .87, .16, .035)
skirttrim = material('Skirt seam', '28558B', .87, .12)
hair = material('Hair deep walnut', '241A12', .69, .22, .025)
hairline = material('Hair warm glint', '453226', .82, .12, .035)
lash = material('Features espresso', '2C1D21', .86, .1, .08)
white = material('Eyes warm white', 'FFF7E8', .78, .1, .13)
iris = material('Iris amber', '8D5936', .8, .1, .10)
irislight = material('Iris golden lower', 'C38C4B', .8, .1, .12)
pupil = material('Pupil', '241B20', .8, .1, .08)
glint = material('Eye catchlight', 'FFFDFC', .7, .1, .3)
lip = material('Smile warm', '713A37', .85, .1, .06)
tongue = material('Smile rose', 'D58075', .85, .1, .08)
green = material('Backpack leaf green', '3EAF72', .85, .15, .03)
greentrim = material('Backpack moss piping', '28764E', .85, .15)
hardware = material('Hardware cream', 'EFDFB9', .63, .27)
red = material('Ribbon poppy red', 'E74451', .8, .18, .025)
rededge = material('Ribbon folded edge', 'AA2F3F', .8, .15)
shoe = material('Shoes chestnut', '684137', .72, .23)
sole = material('Soles ivory', 'E8DFCB', .9, .12)
sock = material('Socks warm ivory', 'FAF0D9', .92, .1)

# Connected skin graph: neck, torso, shoulder, elbow, palm, thumb, hip and knee.
vs, es, radii = [], [], []
def joint(p, radius, parent=None):
    i = len(vs)
    vs.append(p)
    radii.append(radius)
    if parent is not None:
        es.append((parent, i))
    return i

hips = joint((0, 0, 1.015), (.145, .102))
waist = joint((0, 0, 1.16), (.145, .095), hips)
chest = joint((0, 0, 1.36), (.174, .105), waist)
neckbase = joint((0, 0, 1.47), (.082, .071), chest)
neckmid = joint((0, 0, 1.54), (.062, .062), neckbase)
joint((0, 0, 1.64), (.065, .065), neckmid)
for s in (-1, 1):
    p = joint((s * .215, 0, 1.435), (.083, .085), chest)
    for pos, rad in [((s * .267, 0, 1.355), (.066, .070)),
                     ((s * .320, -.006, 1.215), (.052, .055)),
                     ((s * .341, -.012, 1.165), (.050, .052)),
                     ((s * .371, -.018, 1.045), (.048, .050)),
                     ((s * .392, -.020, .956), (.033, .035)),
                     ((s * .398, -.024, .925), (.033, .029))]:
        p = joint(pos, rad, p)
    palm = joint((s * .407, -.025, .885), (.036, .028), p)
    joint((s * .415, -.025, .835), (.025, .023), palm)
    t = joint((s * .368, -.038, .893), (.019, .019), palm)
    joint((s * .357, -.043, .867), (.014, .015), t)
    p = joint((s * .105, .006, .975), (.084, .093), hips)
    for z, x, y, rad in [(.82, .113, 0, (.085, .086)),
                         (.62, .117, -.010, (.061, .067)),
                         (.555, .119, -.014, (.059, .065)),
                         (.48, .12, -.005, (.063, .070)),
                         (.36, .122, .008, (.058, .066)),
                         (.19, .122, .007, (.040, .045)),
                         (.10, .122, .004, (.039, .044))]:
        p = joint((s * x, y, z), rad, p)
body = mesh('Body continuous topology', vs, [], skin, edges=es)
sm = mod(body, 'Continuous skin cage', 'SKIN')
sm.use_smooth_shade = True
for v, radius in zip(body.data.skin_vertices[0].data, radii):
    v.radius = radius
body.data.skin_vertices[0].data[0].use_root = True
sub = mod(body, 'Body subdivision', 'SUBSURF')
sub.levels = 2
sub.render_levels = 2
bpy.context.view_layer.update()

# Shirt is an actual contiguous shell cut from the connected body surface.
dg = bpy.context.evaluated_depsgraph_get()
clothdata = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
bm = bmesh.new()
bm.from_mesh(clothdata)
cuts = [((0, 0, 1.085), (0, 0, 1), True, False),
        ((0, 0, 1.505), (0, 0, 1), False, True)]
for s in (-1, 1):
    cuts.append(((s * .274, 0, 1.329), (s * .96, 0, -.28), False, True))
for p, n, inner, outer in cuts:
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), dist=.00001,
                          plane_co=p, plane_no=n, clear_inner=inner, clear_outer=outer)
for v in bm.verts:
    v.co.x *= 1.038
    v.co.y *= 1.065
    v.co.z += .002
bm.to_mesh(clothdata)
bm.free()
shirt = bpy.data.objects.new(PREFIX + 'Shirt continuous sleeves', clothdata)
character.objects.link(shirt)
clothdata.materials.clear()
clothdata.materials.append(shirtmat)
for f in clothdata.polygons:
    f.use_smooth = True
solid(shirt, .006)

# Neat ribbing follows the actual shirt boundary loops.
bm = bmesh.new()
bm.from_mesh(clothdata)
remaining = set(e for e in bm.edges if e.is_boundary)
loops = []
while remaining:
    start = next(iter(remaining))
    remaining.remove(start)
    first, cur = start.verts
    points = [first.co.copy(), cur.co.copy()]
    while cur != first:
        nxt = next((e for e in cur.link_edges if e in remaining), None)
        if nxt is None:
            break
        remaining.remove(nxt)
        cur = nxt.other_vert(cur)
        points.append(cur.co.copy())
    loops.append(points)
for i, pts in enumerate(loops):
    tube(f'Shirt finished hem {i}', pts, .003, trim, steps=1)
bm.free()

# A-line skirt with broad shallow pleats and a soft, doubled hem.
skirt = loft('Skirt tailored pleats', [
    (1.108, .166, .119, 0, 0), (1.092, .174, .126, 0, 0),
    (1.05, .185, .14, 0, 0), (.96, .215, .161, 0, .003),
    (.83, .253, .19, 0, .008), (.725, .283, .212, 0, .012),
    (.712, .286, .214, 0, .012), (.704, .284, .213, 0, .012)],
    skirtmat, n=40, caps=False, pleats=.009)
solid(skirt, .006)
loft('Skirt waistband', [(1.075, .175, .128, 0, 0), (1.08, .176, .129, 0, 0),
                        (1.109, .166, .120, 0, 0), (1.113, .165, .119, 0, 0)],
     skirttrim, n=32, caps=False)

for s, side in [(-1, 'Left'), (1, 'Right')]:
    x = s * .122
    loft(side + ' sock', [(.105, .044, .05, x, .005), (.12, .045, .051, x, .005),
        (.225, .053, .061, x, .005), (.239, .054, .062, x, .005), (.245, .053, .061, x, .005)], sock, n=20, caps=False)
    loft(side + ' shoe sole', [(.002, .060, .107, x, -.027), (.012, .073, .127, x, -.030),
         (.039, .075, .128, x, -.030), (.045, .073, .125, x, -.030)], sole, n=24, power=.8)
    loft(side + ' shaped shoe upper', [(.042, .072, .123, x, -.030), (.051, .073, .122, x, -.031),
         (.082, .070, .114, x, -.035), (.11, .060, .095, x, -.029),
         (.137, .051, .061, x, .001), (.147, .052, .060, x, .006)], shoe, n=24, caps=False)
    pts = [(x + .052 * math.sin(i * 2 * math.pi / 24), .006 - .060 * math.cos(i * 2 * math.pi / 24), .143) for i in range(25)]
    tube(side + ' shoe opening welt', pts, .003, shoe, steps=1)
    tube(side + ' vamp seam', [(x - .058, -.072, .094), (x - .033, -.088, .115), (x, -.09, .122),
                             (x + .033, -.088, .115), (x + .058, -.072, .094)], .002, trim)

# Head profile: rounded temples, soft cheeks, tapered jaw and a small chin.
HEAD = [(1.603,.020,.031,.0),(1.615,.056,.056,-.010),(1.64,.105,.085,-.004),
        (1.672,.145,.117,.004),(1.71,.183,.139,.008),(1.75,.207,.154,.012),
        (1.79,.217,.166,.016),(1.83,.217,.175,.020),(1.87,.215,.183,.023),
        (1.91,.209,.190,.026),(1.95,.198,.189,.029),(1.99,.174,.170,.033),
        (2.025,.135,.138,.036),(2.05,.081,.09,.037),(2.061,.025,.03,.038)]


def profile(z):
    for j in range(len(HEAD)-1):
        if HEAD[j][0] <= z <= HEAD[j+1][0]:
            f=(z-HEAD[j][0])/(HEAD[j+1][0]-HEAD[j][0])
            return tuple(HEAD[j][k]*(1-f)+HEAD[j+1][k]*f for k in (1,2,3))
    return HEAD[0][1:] if z<HEAD[0][0] else HEAD[-1][1:]


def front_y(x,z):
    rx, ry, cy = profile(z)
    c=math.sqrt(max(0,1-(x/rx)**2))
    # Broad front plane plus a soft, genuinely modelled nose and muzzle.
    y=cy-ry*c**.72
    y-=.022*math.exp(-((x/.028)**2+((z-1.766)/.035)**2))
    y-=.006*math.exp(-((x/.065)**2+((z-1.696)/.03)**2))
    return y

vs,fs=[],[]
for j,(z,rx,ry,cy) in enumerate(HEAD):
    for i in range(40):
        a=2*math.pi*i/40
        x=rx*math.sin(a)
        y=front_y(x,z) if math.cos(a)>=0 else cy+ry*(-math.cos(a))
        vs.append((x,y,z))
        if j:
            q=(j-1)*40+i; r=(j-1)*40+(i+1)%40
            fs.append((q,r,r+40,q+40))
fs += [tuple(reversed(range(40))), tuple((len(HEAD)-1)*40+i for i in range(40))]
head=mesh('Head sculpted cheek jaw nose',vs,fs,skin,1)
# Vertex paint carries soft blush instead of raised cheek discs.
headmat=skin.copy(); headmat.name=PREFIX+'Face warm skin and blush'
head.data.materials[0]=headmat
attr=head.data.color_attributes.new(name='Complexion',type='FLOAT_COLOR',domain='POINT')
base=color('F2C39C'); blush=color('E49C87')
for v,item in zip(head.data.vertices,attr.data):
    x,y,z=v.co
    f=.7*math.exp(-((abs(x)-.135)/.065)**2-((z-1.745)/.034)**2)*max(0,min(1,-y*12))
    item.color=(*(a*(1-f)+b*f for a,b in zip(base,blush)),1)
node=headmat.node_tree.nodes.new('ShaderNodeVertexColor'); node.layer_name='Complexion'
p=next(n for n in headmat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
headmat.node_tree.links.new(node.outputs['Color'],p.inputs['Base Color'])
bpy.context.view_layer.update()
head_eval=head.evaluated_get(bpy.context.evaluated_depsgraph_get())
def fitted_face_y(x,z):
    hit, point, normal, index=head_eval.ray_cast(Vector((x,-1,z)),Vector((0,1,0)))
    return point.y if hit else front_y(x,z)


def patch(name, outline, mat, depth=.0028, center=None):
    # Low-profile face geometry hugs the head; no spherical eyeballs.
    if center is None:
        center=(sum(p[0] for p in outline)/len(outline),sum(p[1] for p in outline)/len(outline))
    verts=[(center[0],fitted_face_y(*center)-depth,center[1])]
    for scale in (.25,.5,.75,1):
        for x,z in outline:
            xx=center[0]+(x-center[0])*scale; zz=center[1]+(z-center[1])*scale
            verts.append((xx,fitted_face_y(xx,zz)-depth,zz))
    n=len(outline); faces=[]
    for i in range(n):
        faces.append((0,1+i,1+(i+1)%n))
        for j in range(3):
            a=1+j*n+i; b=1+j*n+(i+1)%n
            faces.append((a,a+n,b+n,b))
    return mesh(name,verts,faces,mat)


def oval(name,x,z,rx,rz,mat,depth=.004,n=32):
    return patch(name,[(x+rx*math.cos(2*math.pi*i/n),z+rz*math.sin(2*math.pi*i/n)) for i in range(n)],mat,depth,(x,z))


for s, side in [(-1,'Left'),(1,'Right')]:
    cx=s*.096; cz=1.822
    outline=[]
    for i in range(48):
        a=2*math.pi*i/48
        x=cx+.064*math.cos(a)
        h=.043 if math.sin(a)>=0 else .030
        z=cz+h*math.copysign(abs(math.sin(a))**.83,math.sin(a))+s*(x-cx)*.10
        outline.append((x,z))
    patch(side+' almond eye',outline,white,.0045)
    oval(side+' iris rim',cx-s*.004,cz+.001,.030,.035,lash,.0054)
    oval(side+' amber iris',cx-s*.004,cz,.026,.031,iris,.0062)
    oval(side+' iris lower glow',cx-s*.004,cz-.014,.021,.013,irislight,.007)
    oval(side+' pupil',cx-s*.004,cz+.005,.0135,.022,pupil,.0078)
    oval(side+' catchlight',cx-.009,cz+.018,.008,.010,glint,.0088,20)
    oval(side+' small catchlight',cx+.011,cz-.015,.003,.0037,glint,.0088,12)
    upper=[]
    for i in range(17):
        a=math.pi*i/16
        x=cx+.064*math.cos(a); z=cz+.043*math.sin(a)**.83+s*(x-cx)*.10
        upper.append((x,fitted_face_y(x,z)-.006,z))
    tube(side+' upper lash',upper,lambda t:.0014+.0026*math.sin(math.pi*t)**.6,lash,1,6)
    # Tiny upward outer lash, attached to the line.
    x=cx+s*.059; z=cz+.018
    patch(side+' outer lash tip',[(x,z),(x+s*.020,z+.012),(x+s*.006,z-.008)],lash,.0065)
    brow=[]
    for i in range(13):
        t=i/12; x=cx-.050+.100*t
        z=1.887+.009*math.sin(math.pi*t)+s*(x-cx)*.08
        brow.append((x,fitted_face_y(x,z)-.003,z))
    tube(side+' tapered eyebrow',brow,lambda t:.0006+.003*math.sin(math.pi*t)**.5,lash,1,6)
    # Small anatomically shaped ears tucked into the hairline.
    ear=loft(side+' ear',[(1.733,.010,.019,s*.218,-.049),(1.742,.022,.028,s*.220,-.050),
        (1.778,.025,.031,s*.222,-.049),(1.815,.020,.027,s*.218,-.045),(1.827,.009,.016,s*.214,-.042)],skin,n=16)

mouth=[]
for i in range(48):
    a=2*math.pi*i/48; x=.044*math.cos(a)
    z=1.703+(.007 if math.sin(a)>0 else .027)*math.sin(a)+.006*(x/.044)**2
    mouth.append((x,z))
patch('Gentle open smile',mouth,lip,.004)
patch('Smile upper teeth',[(-.035,1.708),(-.016,1.706),(.017,1.706),(.035,1.708),
    (.027,1.701),(0,1.699),(-.027,1.701)],white,.005)
oval('Smile lower warmth',0,1.685,.022,.007,tongue,.0055,24)
oval('Nose soft highlight',-.005,1.77,.005,.0035,material('Nose soft light','F7D3AF',.85,.1),.0015,16)

# One crown/back hair sheet: front hairline remains open, rear hem is rounded.
vs,fs=[],[]; n=48; rows=17
def smoothstep(a,b,v):
    t=max(0,min(1,(v-a)/(b-a))); return t*t*(3-2*t)
for j in range(rows):
    t=j/(rows-1)
    for i in range(n):
        a=2*math.pi*i/n; theta=min(a,2*math.pi-a)
        away=smoothstep(1.12,1.72,theta)
        phi_end=.90+.68*away
        if t<=.53:
            ph=.018+(phi_end-.018)*(t/.53)
            x=.232*math.sin(ph)*math.sin(a)
            y=.027-.211*math.sin(ph)*math.cos(a)
            z=1.842+.252*math.cos(ph)
        else:
            u=(t-.53)/.47
            wave=.003*math.cos(a*8+u*.8)*away*math.sin(math.pi*u)
            rx=.232*math.sin(phi_end)+.015*math.sin(math.pi*u)+wave
            ry=.211*math.sin(phi_end)+.015*math.sin(math.pi*u)+wave
            x=rx*math.sin(a)
            y=.027-ry*math.cos(a)
            top=1.842+.252*math.cos(phi_end)
            signed=a if a<=math.pi else a-2*math.pi
            fringe=1.948-.108*math.exp(-((signed+.88)/.50)**2)+.020*math.exp(-((signed-.45)/.60)**2)
            end=fringe*(1-away)+(1.265+.040*(-math.cos(a))+.014*math.cos(6*a))*away
            z=top*(1-u)+end*u
            if theta<1.25 and z<2.04:
                y=(1-u)*y+u*(front_y(x,z)-.013)
        shoulder=1-smoothstep(1.40,1.70,z)
        sideband=math.exp(-((theta-1.40)/.53)**2)
        x+=math.copysign(.025*sideband*shoulder,x)
        y+=.105*sideband*shoulder
        vs.append((x,y,z))
        if j:
            q=(j-1)*n+i; r=(j-1)*n+(i+1)%n
            fs.append((q,r,r+n,q+n))
fs.append(tuple(reversed(range(n))))
hairmass=mesh('Hair unified crown and back',vs,fs,hair,1)
scalp=hairmass.vertex_groups.new(name='Crown and fringe fit')
for v in hairmass.data.vertices:
    weight=smoothstep(1.74,1.86,v.co.z)
    if weight:
        scalp.add([v.index],weight,'REPLACE')
fit=mod(hairmass,'Fit crown and fringe to head','SHRINKWRAP')
fit.target=head
fit.wrap_mode=enum(fit,'wrap_mode','ABOVE_SURFACE')
fit.offset=.021
fit.vertex_group=scalp.name
solid(hairmass,.008)

hair_lock('Hair swept inner fringe',[(.063,-.005,2.070),(.053,-.126,2.022),(.019,-.177,1.963),(-.023,-.178,1.916)],
          [.012,.032,.028,.003],[.009,.012,.012,.003])
hair_lock('Hair left face frame',[(-.151,-.041,2.015),(-.223,-.095,1.806),(-.235,-.100,1.60),(-.249,-.120,1.417),(-.224,-.137,1.264)],
          [.040,.044,.051,.039,.004],[.024,.027,.027,.024,.004])
hair_lock('Hair right tucked frame',[(.217,.007,1.926),(.244,.019,1.767),(.258,.043,1.576),(.280,.100,1.431),(.257,.12,1.30)],
          [.024,.032,.042,.034,.004],[.018,.026,.024,.021,.004])

# A few fine, deliberately placed flow lines rather than dozens of loose locks.
bpy.context.view_layer.update()
hair_eval=hairmass.evaluated_get(bpy.context.evaluated_depsgraph_get())
for index,a in enumerate((2.18,2.65,3.14,3.64,4.10)):
    pts=[]
    for z,rad in [(2.056,.115),(1.984,.193),(1.84,.237),(1.65,.247),(1.47,.246),(1.34,.23)]:
        x=rad*math.sin(a)
        hit,point,normal,face=hair_eval.ray_cast(Vector((x,1,z)),Vector((0,-1,0)))
        if hit:
            pts.append((x,point.y+.001,z))
    tube(f'Hair rear flow line {index}',pts,lambda t:.0008*math.sin(math.pi*t)+.00015,hairline,steps=3,sides=5)

# Folded fabric bow: two loops with a crease, two tails and a compact knot.
bow_origin=Vector((.225,-.022,1.922))
for s in (-1,1):
    verts,faces=[],[]
    for j in range(13):
        t=j/12
        p=bow_origin+Vector((s*.076*math.sin(math.pi*t),-.009-.018*math.sin(math.pi*t),
                             .030*math.sin(math.pi*t)+.021*math.sin(2*math.pi*t)))
        w=.010+.018*math.sin(math.pi*t)
        for k in range(3):
            verts.append(p+Vector((0,-.006*(1-abs(k-1)),(k-1)*w)))
            if j and k:
                q=(j-1)*3+k-1; faces.append((q,q+1,q+4,q+3))
    o=mesh(f'Ribbon folded loop {s}',verts,faces,red,1); solid(o,.003)
    pts=[bow_origin+Vector((s*.008,-.008,-.009)),bow_origin+Vector((s*.022,-.015,-.055)),
         bow_origin+Vector((s*.038,-.010,-.112))]
    strap(f'Ribbon tail {s}',pts,.027,red)
loft('Ribbon knot',[(1.901,.015,.012,.225,-.047),(1.907,.022,.016,.225,-.048),
    (1.932,.022,.016,.225,-.048),(1.939,.014,.012,.225,-.047)],red,n=16)

# Backpack has a shaped sewn silhouette and straps fitted to the shirt surface.
loft('Backpack soft main bag',[(.991,.09,.050,0,.217),(1.002,.137,.070,0,.224),
    (1.025,.153,.079,0,.228),(1.20,.157,.083,0,.228),(1.295,.144,.075,0,.224),
    (1.323,.112,.060,0,.218),(1.329,.078,.046,0,.211)],green,n=24,power=.55)
loft('Backpack folded lid',[(1.251,.142,.017,0,.302),(1.262,.153,.028,0,.304),
    (1.307,.147,.026,0,.297),(1.323,.114,.015,0,.290)],greentrim,n=24,power=.5)
loft('Backpack front pocket',[(1.032,.083,.012,0,.310),(1.04,.106,.022,0,.312),
    (1.132,.106,.024,0,.314),(1.15,.091,.017,0,.310)],green,n=20,power=.45)
loft('Backpack cream clasp',[(1.233,.012,.009,0,.335),(1.237,.016,.011,0,.335),
    (1.272,.016,.011,0,.335),(1.276,.011,.008,0,.335)],hardware,n=12,power=.5)
for s in (-1,1):
    strap_obj=strap(f'Backpack fitted shoulder strap {s}',[(s*.105,.20,1.267),(s*.130,.105,1.448),
        (s*.133,.003,1.477),(s*.127,-.106,1.39),(s*.119,-.122,1.255),
        (s*.133,-.111,1.137),(s*.153,.057,1.078),(s*.112,.16,1.09)],.030,greentrim)
    bpy.context.view_layer.update()
    shirt_eval=shirt.evaluated_get(bpy.context.evaluated_depsgraph_get())
    for vert in strap_obj.data.vertices:
        x,y,z=vert.co
        if y<-.025 and z>1.12:
            hit,point,normal,index=shirt_eval.ray_cast(Vector((x,-1,z)),Vector((0,1,0)))
            if hit:
                vert.co.y=point.y-.006
tube('Backpack top handle',[(-.045,.222,1.321),(-.037,.223,1.365),(0,.223,1.376),(.037,.223,1.365),(.045,.222,1.321)],.006,greentrim)

# Seat the bag against the shirt rather than leaving a gap in profile.
for obj in character.objects:
    if obj.name.startswith(PREFIX+'Backpack'):
        for v in obj.data.vertices:
            if 'strap' in obj.name:
                v.co.y-=.030*smoothstep(.03,.15,v.co.y)
            else:
                v.co.y-=.030

# A narrow stitched hem reinforces the skirt's thickness without heavy folds.
hem=[]
for i in range(81):
    a=2*math.pi*i/80
    r=.009*math.cos(a*10)
    hem.append(((.284+r)*math.sin(a),.012-(.213+r)*math.cos(a),.712))
tube('Skirt hem stitching',hem,.0013,skirttrim,steps=1,sides=5)

# Reversible economy modifiers keep the approval model within a real-time mesh
# budget. The editable cages, subdivision and cloth shells remain underneath.
def triangle_budget(o):
    name=o.name
    if 'Hair unified' in name: return 1700
    if 'Body continuous' in name: return 1400
    if 'Head sculpted' in name: return 1600
    if 'Skirt tailored' in name: return 600
    if 'Shirt continuous' in name: return 600
    if 'Hair rear flow' in name: return 30
    if 'Hair ' in name: return 180
    if 'almond eye' in name: return 160
    if any(s in name for s in ['iris','pupil','catchlight','Smile','smile']): return 65
    if 'shoe sole' in name: return 100
    if 'shoe upper' in name: return 180
    if ' sock' in name: return 140
    if 'Backpack soft' in name: return 300
    if 'Backpack' in name: return 120
    if 'Ribbon' in name: return 90
    if ' ear' in name: return 100
    return 100

bpy.context.view_layer.update()
dg=bpy.context.evaluated_depsgraph_get()
for obj in list(character.objects):
    ev=obj.evaluated_get(dg);data=ev.to_mesh();data.calc_loop_triangles()
    count=len(data.loop_triangles);ev.to_mesh_clear()
    budget=triangle_budget(obj)
    if count>budget:
        economy=mod(obj,'Economy - editable silhouette budget','DECIMATE')
        economy.ratio=budget/count
        economy.use_collapse_triangulate=True
        obj['triangle_budget']=budget

# Studio is kept separate from the exportable character.
floor_mat=material('Studio warm porcelain','DCDDD1',.93,.1,.35)
floor=mesh('Studio ground',[(-200,-200,0),(200,-200,0),(200,200,0),(-200,200,0)],[(0,1,2,3)],floor_mat)
character.objects.unlink(floor); stage.objects.link(floor)
world=bpy.data.worlds.new(PREFIX+'Studio ambient')
world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.72,.80,.90,1)
bg.inputs['Strength'].default_value=.55
scene.world=world
light_pivot=bpy.data.objects.new(PREFIX+'Light pivot',None);stage.objects.link(light_pivot)
for name,position,power,size,col in [
    ('Key',(-3,-4,5),230,4.5,(1,.89,.77)),
    ('Fill',(3,-2,3),100,4.0,(.80,.88,1)),
    ('Rim',(1,3,4),170,3,(1,.95,.84))]:
    data=bpy.data.lights.new(PREFIX+name,enum(bpy.types.Light,'type','AREA'))
    data.energy=power;data.shape=enum(data,'shape','DISK');data.size=size;data.color=col
    obj=bpy.data.objects.new(PREFIX+name,data);stage.objects.link(obj);obj.parent=light_pivot
    obj.location=position;obj.rotation_euler=(Vector((0,0,1.1))-obj.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new(PREFIX+'Camera');camdata.type=enum(camdata,'type','ORTHO')
cam=bpy.data.objects.new(PREFIX+'Camera',camdata);stage.objects.link(cam);scene.camera=cam
scene.render.engine='BLENDER_EEVEE'  # Read from the connected Blender before authoring.
try:
    scene.view_settings.view_transform='Standard'
except TypeError:
    pass
scene.render.image_settings.file_format=enum(scene.render.image_settings,'file_format','PNG')
scene.render.image_settings.color_mode=enum(scene.render.image_settings,'color_mode','RGBA')
scene.render.resolution_percentage=100
scene.render.film_transparent=False
scene.view_settings.exposure=-.25


VIEWS={
    'front':((0,-6,1.60),(0,0,1.06),2.34),
    'left':((-6,0,1.60),(0,0,1.06),2.34),
    'rear':((0,6,1.60),(0,0,1.06),2.34),
    'three_quarter':((3.8,-6,1.75),(0,0,1.07),2.36),
    'face':((.28,-4,1.86),(0,-.025,1.815),.66),
}


def set_view(which, preview=False):
    pos,target,scale=VIEWS[which]
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    camdata.ortho_scale=scale
    light_pivot.rotation_euler.z=math.atan2(pos[0],-pos[1])
    scene.render.resolution_x=1080 if which=='face' else 1120
    scene.render.resolution_y=1080 if which=='face' else 1440
    scene.render.resolution_percentage=65 if preview else 100
    scene.render.filepath=str(RENDERS / (('preview_' if preview else 'lily_')+which+'.png'))
    bpy.context.view_layer.update()


set_view('three_quarter')
scene['design_notes']='Lily revision 02. Original anime-inspired design. Unrigged visual approval asset. -Y forward / +Z up.'
scene['identity_reference']='//../../public/assets/lily.png'
scene['future_animation']='Walk; sit; phone; talk; smell/buy flowers; water; push/ride bicycle. No skeleton or animation in this phase.'
text=bpy.data.texts.get('Lily_Design_02_build.py') or bpy.data.texts.new('Lily_Design_02_build.py')
text.clear()
text.from_string(Path(__file__).read_text(encoding='utf-8'))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'lily_redesign_v2.blend'),check_existing=False)
print(json.dumps({'scene':scene.name,'character_meshes':len(character.objects),'blend':str(ROOT/'lily_redesign_v2.blend')}))
