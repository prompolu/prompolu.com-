"""Package only derived profile contours, never the private source catalogues."""
import json, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import extract_profiles
from extract_profiles import extract
from shapely.geometry import Polygon
if len(sys.argv)!=2:
    raise SystemExit('Usage: python tools/build_source_data.py SOURCE_PDF_DIRECTORY')
ROOT=Path(sys.argv[1]).resolve()
DEST=Path(__file__).resolve().parents[1]
extract_profiles.ROOT=ROOT

# Files remain in the source directory; only their contours and provenance ship.
SECTIONS=[
 ('s70p-side','fabrication-s70p.pdf',36,[104,388,403,594]),
 ('s70p-bottom','fabrication-s70p.pdf',51,[200,310,410,620]),
 ('s70r-side','s70r.pdf',1,[793,500,1023,720]),
 ('s86rp-side','s86rp-rolltec.pdf',2,[180,536,475,754]),
 ('s88r-side','fabrication-s88r.pdf',55,[100,175,420,623]),
 ('s88r-bottom','fabrication-s88r.pdf',91,[150,330,474,650]),
 ('s88rp-side','s88rp.pdf',1,[900,537,1115,720]),
 ('s90p-side','fabrication-s90r.pdf',42,[180,370,508,635]),
 ('s90p-bottom','fabrication-s90r.pdf',44,[255,350,518,680]),
 ('s90r-side','fabrication-s90r.pdf',38,[195,350,495,610]),
 ('s90r-bottom','fabrication-s90r.pdf',40,[245,390,505,669]),
 ('s110p-side','fabrication-s110p.pdf',48,[50,297,458,630]),
 ('s110p-bottom','fabrication-s110p.pdf',51,[145,295,480,710]),
 ('s125rp-side','fabrication-s125rp.pdf',52,[75,285,487,662]),
 ('s125rp-bottom','fabrication-s125rp.pdf',61,[94,270,468,691]),
 ('s140rp-side','fabrication-s140rp.pdf',62,[108,245,430,645]),
 ('s140rp-bottom','fabrication-s140rp.pdf',70,[80,441,465,628]),
]
import hashlib
manifest=[]
for name,file,page,roi in SECTIONS:
    shapes=extract(file,page,roi)
    rows=[{'bounds':list(p.bounds),'area':p.area,'outer':list(p.exterior.coords)[:-1],'holes':[list(h.coords)[:-1] for h in p.interiors]} for p in shapes]
    (ROOT/(name+'-extracted.json')).write_text(json.dumps(rows))
    manifest.append({'section':name,'file':file,'sha256':hashlib.sha256((ROOT/file).read_bytes()).hexdigest(),'page':page,'pdfPointCrop':roi,'components':len(shapes)})
(DEST/'profile-source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

def section(name,frame,sash,bead,origin,scale,mirror=False,vertical=False):
    rows=json.loads((ROOT/(name+'-extracted.json')).read_text())
    ox,oy=origin
    def xy(p):
        x,y=p
        return [round(((oy-y) if vertical else ((ox-x) if mirror else (x-ox)))/scale,3),round(((x-ox) if vertical else (y-oy))/scale,3)]
    def item(i):
        p=rows[i]
        # CAD-to-PDF stroke tessellation produces sub-0.01 mm pinholes that are
        # printing seams, not extrusion chambers. Keep all physical chambers.
        physical=[h for h in p['holes'] if Polygon(h).area/(scale*scale)>.0001]
        solid=Polygon(p['outer'],physical).representative_point()
        holes=[Polygon(h).representative_point() for h in physical]
        return {'outer':[xy(p) for p in rows[i]['outer']], 'holes':[[xy(p) for p in h] for h in physical], 'solidProbe':xy([solid.x,solid.y]), 'holeProbes':[xy([h.x,h.y]) for h in holes]}
    return {key:[item(i) for i in ids] for key,ids in [('frame',frame),('sash',sash),('bead',bead)]}

# Datums and scales are calibrated to printed dimensions, not to a rendered image.
# Different depth/height contours are kept separate; no squeeze-to-fit operation.
data={
 'S70P':dict(side=section('s70p-side',[0],[1],[],[107.73,490.645],198.43/70),bottom=section('s70p-bottom',[0],[1],[],[306.905,614.835],198.43/70,vertical=True),reference='S70P · catalogue Mar. 2023 · p.36, 51',completeCorner=True,glass=20,bite=12,joint='mitre',profiles=['70027','70091']),
 'S70R':dict(side=section('s70r-side',[1],[0],[],[1020.568,584.195],161.52/57,mirror=True),reference='S70R · fiche technique · section à l’échelle 1:1',completeCorner=False,glass=6,bite=10,joint='straight'),
 'S86RP':dict(side=section('s86rp-side',[2,3],[0,1],[],[473.11,646.215],213.35/85,mirror=True),reference='S86RP · fiche technique · p.2 · dormant 85 mm',completeCorner=False,glass=26,bite=10,joint='straight'),
 'S88R':dict(side=section('s88r-side',[0],[1],[],[109.049,486.55],266.52/94),bottom=section('s88r-bottom',[1],[0],[],[337.53,646.21],266.4/94,vertical=True),reference='S88R · MA.23.00 · p.55, 91',completeCorner=True,glass=32,bite=13.5,joint='straight',profiles=['70247','7490','7489','7322']),
 'S88RP':dict(side=section('s88rp-side',[0,1],[2,3],[],[904.53,640.74],140.52/74),reference='S88RP · fiche STRUGAL · dormant 74 mm',completeCorner=False,glass=32,bite=13.5,joint='straight'),
 'S90P':dict(side=section('s90p-side',[0],[1],[],[186.86,503.65],254.82/90),bottom=section('s90p-bottom',[0],[1],[],[386.61,674.79],254.14/90,vertical=True),reference='S90P/S90R · E.2018 · p.42, 44',completeCorner=True,glass=26,bite=12,joint='mitre',profiles=['4412','70110']),
 'S90R':dict(side=section('s90r-side',[0],[1],[],[197.85,481.93],254.88/90),bottom=section('s90r-bottom',[0,2,3],[1],[],[373.45,666.8],254.82/90,vertical=True),reference='S90P/S90R · E.2018 · p.38, 40 · réf.4916–4918',completeCorner=True,glass=23,bite=12,joint='straight',profiles=['4916','4917','4918','4921']),
 'S110P':dict(side=section('s110p-side',[0],[1],[2],[54.29,456.175],72/25.4),bottom=section('s110p-bottom',[0,2,4],[1],[3],[308.475,708.07],72/25.4,vertical=True),reference='S110P · catalogue Mar. 2023 · p.48, 51',completeCorner=True,glass=28,bite=12,joint='mitre',profiles=['4536','4535','4933','4960','4537']),
 'S125RP':dict(side=section('s125rp-side',[0,1],[2,3],[],[77.26,466.405],72/25.4),bottom=section('s125rp-bottom',[0,3],[1,2],[],[274.075,685.83],72/25.4,vertical=True),reference='S125RP · catalogue Mar. 2023 · p.52, 61',completeCorner=True,glass=32,bite=12,joint='mitre',profiles=['R6960','R6961','7029','4805']),
 'S140RP':dict(side=section('s140rp-side',[0,1],[2,3],[],[114.203,445.819],72/25.4),bottom=section('s140rp-bottom',[0,2],[],[],[271.73,623.85],72/25.4,vertical=True),reference='S140RP Infinity · E.25.08 · p.62, 70',completeCorner=True,glass=32,bite=9.5,joint='straight',profiles=['9121','9124','7466']),
}
for s in data.values():
    for name in ['side','bottom']:
        if name not in s:continue
        for role,parts in s[name].items():
            for p in parts:
                assert len(p['outer'])>=3
                assert all(abs(x)<300 and abs(y)<300 for x,y in p['outer'])
    s['status']='Contours aluminium extraits du PDF. Quincaillerie et assemblages 3D non certifiés.'
(DEST/'source-profiles.json').write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False)+'\n')
print('Packaged',len(data),'systems;',sum(len(p['outer'])+sum(len(h) for h in p['holes']) for s in data.values() for sec in ['side','bottom'] if sec in s for ps in s[sec].values() for p in ps),'source vertices')
