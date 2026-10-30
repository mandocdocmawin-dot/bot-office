"""Build editable vector props using the project's .86 / .60 projection."""
import json
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).parent
WOOD, DARK, PURPLE, CYAN = '#92765f', '#292737', '#8c62bd', '#7de5dc'

class Drawing:
    def __init__(self): self.parts = []; self.points = []
    def point(self, x, y, z=0): return ((x-y)*.86, (x+y)*.60-z)
    def face(self, points, color):
        self.points.extend(points)
        self.parts.append('<polygon fill="%s" points="%s"/>' % (color, ' '.join(f'{x:.2f},{y:.2f}' for x,y in points)))
    def box(self, x,y,w,h,z,t,color):
        top = [self.point(x,y,z), self.point(x+w,y,z), self.point(x+w,y+h,z), self.point(x,y+h,z)]
        bot = [self.point(x,y,z-t), self.point(x+w,y,z-t), self.point(x+w,y+h,z-t), self.point(x,y+h,z-t)]
        rgb = [int(color[i:i+2],16) for i in (1,3,5)]
        shade = lambda f: '#' + ''.join(f'{int(c*f):02x}' for c in rgb)
        self.face([top[1],top[2],bot[2],bot[1]],shade(.65))
        self.face([top[2],top[3],bot[3],bot[2]],shade(.82))
        self.face(top,color)
    def panel(self,x,y,w,z,h,color):
        self.face([self.point(x,y,z),self.point(x+w,y,z),self.point(x+w,y,z-h),self.point(x,y,z-h)],color)
    def circle(self,x,y,z,r,color):
        px,py=self.point(x,y,z)
        self.points.extend([(px-r,py-r),(px+r,py+r)])
        self.parts.append(f'<circle cx="{px}" cy="{py}" r="{r}" fill="{color}"/>')
    def save(self,name,label,footprint,action):
        xs,ys=zip(*self.points); left,top=min(xs)-4,min(ys)-4
        width,height=max(xs)-left+4,max(ys)-top+4
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.2f}" height="{height:.2f}" viewBox="{left:.2f} {top:.2f} {width:.2f} {height:.2f}" role="img" aria-label="{escape(label)}"><title>{escape(label)}</title>'+''.join(self.parts)+'</svg>'
        (ROOT/'assets'/f'{name}.svg').write_text(svg,encoding='utf-8')
        return dict(id=name,label=label,file=f'assets/{name}.svg',width=round(width,2),height=round(height,2),origin=[round(-left/width,6),round(-top/height,6)],footprint=footprint,action=action)

def build():
    entries=[]
    d=Drawing()
    d.box(0,0,108,30,36,6,WOOD)
    for x in (5,95): d.box(x,5,7,20,30,30,DARK)
    d.box(8,4,27,20,69,33,DARK); d.panel(12,25,17,63,9,PURPLE)
    d.box(18,14,9,9,45,9,'#e0dbe8')
    d.box(73,3,23,23,63,27,DARK); d.box(76,6,17,17,86,23,CYAN)
    entries.append(d.save('coffee-station','Coffee and water station',[108,30],'coffee'))
    d=Drawing()
    for x in (0,112): d.box(x,0,8,25,8,8,WOOD); d.box(x,7,7,7,91,85,WOOD)
    d.box(0,6,120,8,100,70,WOOD); d.panel(6,15,108,94,57,DARK)
    for i in range(3):
        x=12+i*34; d.panel(x,15.1,27,85,38,'#e0dbe8')
        d.panel(x+4,15.2,19,75,3,PURPLE); d.panel(x+4,15.2,15,67,2,'#727089'); d.panel(x+4,15.2,18,60,2,'#727089')
    entries.append(d.save('notice-board','Announcements and events',[120,25],'announcements'))
    d=Drawing()
    d.box(0,0,140,28,24,20,WOOD); d.box(16,5,108,9,99,68,DARK)
    d.panel(21,15,98,94,57,PURPLE)
    d.face([d.point(21,15.1,37),d.point(69,15.1,79),d.point(119,15.1,37)],'#654b9a')
    d.circle(93,15.2,76,9,'#dcb1ce')
    for x in (0,128):
        d.box(x,6,12,15,64,40,DARK); d.circle(x+6,21,51,3,PURPLE); d.circle(x+6,21,37,3,PURPLE)
    entries.append(d.save('media-screen','Watch party screen',[140,28],'watch-party'))
    d=Drawing()
    d.box(0,0,32,32,8,8,DARK); d.box(5,5,22,22,48,40,DARK)
    d.box(4,4,24,24,50,3,CYAN); d.box(3,3,26,26,56,6,DARK)
    d.circle(16,16,72,13,CYAN); d.circle(12,16,77,4,'#d8fff7')
    entries.append(d.save('navigation-kiosk','Room navigation kiosk',[32,32],'room-directory'))
    d=Drawing()
    for x in (0,83): d.box(x,0,6,24,68,68,DARK)
    for z in (9,38,70): d.box(0,0,89,26,z,4,WOOD)
    for i in range(5): d.box(8+i*10,8,8,16,34,21,[PURPLE,CYAN,WOOD][i%3])
    d.box(8,7,30,17,19,6,PURPLE); d.box(44,6,24,18,22,9,CYAN)
    d.box(64,7,15,15,57,15,'#e0dbe8'); d.circle(71,22,51,2,DARK)
    entries.append(d.save('game-shelf','Board games and quick activities',[89,26],'games'))
    d=Drawing()
    d.box(0,0,30,28,22,7,PURPLE); d.box(0,0,30,6,49,27,PURPLE)
    for x in (3,23):
        for y in (4,22): d.box(x,y,4,4,15,15,DARK)
    entries.append(d.save('modular-chair','One modular lounge chair',[30,28],'seat'))
    (ROOT/'asset-manifest.json').write_text(json.dumps(entries,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__': build()
