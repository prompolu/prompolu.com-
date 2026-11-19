"""Read the manufacturer's vector silhouettes. Never redraw an extrusion by eye.

Working/source utility; original private fabrication PDFs stay outside the website.
Units remain PDF points here, before a documented dimension calibrates each section.
"""
import sys, math, json
from pathlib import Path
import fitz
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.ops import unary_union
from shapely import make_valid

ROOT = Path(__file__).parent

def point(p): return (round(p.x, 4), round(p.y, 4))
def near(a,b): return math.dist(a,b) < .003

def bezier(p0,p1,p2,p3,out):
    # Flatness < 0.01 PDF point (< 0.004 mm at 1:1).
    dx,dy=p3[0]-p0[0],p3[1]-p0[1]
    norm=math.hypot(dx,dy)
    err=max(abs(dx*(p[1]-p0[1])-dy*(p[0]-p0[0]))/(norm or 1) for p in [p1,p2])
    if err < .01:
        out.append(p3); return
    mid=lambda a,b: ((a[0]+b[0])/2,(a[1]+b[1])/2)
    a,b,c=mid(p0,p1),mid(p1,p2),mid(p2,p3)
    d,e=mid(a,b),mid(b,c);f=mid(d,e)
    bezier(p0,a,d,f,out);bezier(f,e,c,p3,out)

def rings(d):
    parts=[];cur=[]
    def flush():
        nonlocal cur
        if len(cur)>2: parts.append(cur)
        cur=[]
    for item in d['items']:
        kind=item[0]
        if kind=='re':
            flush();r=item[1];parts.append([(r.x0,r.y0),(r.x1,r.y0),(r.x1,r.y1),(r.x0,r.y1)])
        elif kind=='qu':
            flush();q=item[1];parts.append([point(q.ul),point(q.ur),point(q.lr),point(q.ll)])
        elif kind in ['l','c']:
            a=point(item[1]);end=point(item[-1])
            if cur and not near(cur[-1],a):flush()
            if not cur:cur=[a]
            if kind=='l':cur.append(end)
            else:bezier(a,point(item[2]),point(item[3]),end,cur)
            if len(cur)>2 and near(cur[0],cur[-1]):flush()
    flush()
    return parts

def signed(r):return sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(r,r[1:]+r[:1]))/2
def polygons(g):
    if g.is_empty:return []
    if g.geom_type=='Polygon':return [g]
    if hasattr(g,'geoms'):return [p for sub in g.geoms for p in polygons(sub)]
    return []

def filled(d):
    rs=[r for r in rings(d) if abs(signed(r))>.00001]
    if not rs:return Polygon()
    shapes=[(r,make_valid(Polygon(r))) for r in rs]
    if d.get('even_odd'):
        result=Polygon()
        for _,p in shapes:result=result.symmetric_difference(p)
        return result
    # Some CAD exports contain touching triangles with opposite winding.
    # Winding marks a void only when the entire ring is nested in another.
    outside=[];inside=[]
    for r,p in shapes:
        parents=[(q,s) for q,s in shapes if s.area>p.area*1.001 and p.within(s.buffer(.0001))]
        parent=min(parents,key=lambda v:v[1].area) if parents else None
        (inside if parent and signed(r)*signed(parent[0])<0 else outside).append(p)
    outer=unary_union(outside)
    holes=unary_union(inside)
    return outer.difference(holes)

def extract(file,page,roi):
    p=fitz.open(ROOT/file)[page-1];rect=fitz.Rect(roi);shapes=[]
    for i,d in enumerate(p.get_drawings()):
        fill=d.get('fill')
        if not fill or max(fill)>.26 or not rect.contains(d['rect']):continue
        g=filled(d)
        if not g.is_empty:shapes.append(g)
    # PDF strip triangles sometimes have 1e-4 pt seams. Close only those seams.
    result=unary_union(shapes).buffer(.008,join_style=2).buffer(-.008,join_style=2)
    ps=sorted((p.simplify(.008,preserve_topology=True) for p in polygons(result) if p.area>.08),key=lambda p:p.bounds)
    return ps

def save_review(name,file,page,roi):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    ps=extract(file,page,roi)
    fig,ax=plt.subplots(figsize=(8,8))
    for i,p in enumerate(ps):
        x,y=p.exterior.xy;ax.fill(x,y,fc='#252626',ec='#252626',lw=.2)
        for h in p.interiors:
            x,y=h.xy;ax.fill(x,y,fc='white',ec='#252626',lw=.2)
        c=p.representative_point();ax.annotate(str(i),(c.x,c.y),color='#d63a11',fontsize=9,bbox={'facecolor':'white','alpha':.8,'pad':1,'edgecolor':'none'})
    ax.set_aspect('equal');ax.invert_yaxis();ax.set_title(f'{name} · catalogue p.{page} · PDF vector outlines')
    fig.savefig(ROOT/(name+'-extracted.png'),dpi=140);plt.close(fig)
    (ROOT/(name+'-extracted.json')).write_text(json.dumps([{'bounds':list(p.bounds),'area':p.area,'outer':list(p.exterior.coords)[:-1],'holes':[list(h.coords)[:-1] for h in p.interiors]} for p in ps]))
    print(name,[(i,[round(v,2) for v in p.bounds],round(p.area,2),len(p.interiors)) for i,p in enumerate(ps)])
    return ps

if __name__=='__main__':
    save_review(sys.argv[1],sys.argv[2],int(sys.argv[3]),list(map(float,sys.argv[4:8])))
