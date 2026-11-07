"""Render the approved book-and-code vector as Android launcher resources."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / 'android/app/src/main/res'
ART = ROOT / 'artifacts'
BOOK = 'M108 69 Q76 49 40 61 V154 Q77 142 108 162 Q139 142 176 154 V61 Q140 49 108 69 Z'
CODE = 'M75 95 L60 110 L75 125 M141 95 L156 110 L141 125'
SVG = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 216 216" width="512" height="512"><defs><linearGradient id="blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#315de5"/><stop offset="1" stop-color="#18359e"/></linearGradient></defs><rect width="216" height="216" rx="48" fill="url(#blue)"/><g transform="translate(108 108) scale(.84) translate(-108 -108)" fill="none" stroke-linejoin="round"><path d="{BOOK}" stroke="white" stroke-width="10"/><path d="M108 69 V162" stroke="white" stroke-width="8"/><path d="{CODE}" stroke="#a7e9d1" stroke-width="8" stroke-linecap="round"/></g></svg>'''
(ROOT / 'public/favicon.svg').write_text(SVG, encoding='utf-8')
(ART / 'kodshag-icon.svg').write_text(SVG, encoding='utf-8')
vector = f'''<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt" android:width="108dp" android:height="108dp" android:viewportWidth="216" android:viewportHeight="216">
  <path android:pathData="M0,0h216v216h-216z"><aapt:attr name="android:fillColor"><gradient android:startX="0" android:startY="0" android:endX="216" android:endY="216" android:startColor="#315de5" android:endColor="#18359e" android:type="linear"/></aapt:attr></path>
  <group android:pivotX="108" android:pivotY="108" android:scaleX="0.84" android:scaleY="0.84">
    <path android:pathData="{BOOK}" android:fillColor="#00000000" android:strokeColor="#ffffff" android:strokeWidth="10" android:strokeLineJoin="round"/>
    <path android:pathData="M108 69 V162" android:strokeColor="#ffffff" android:strokeWidth="8"/>
    <path android:pathData="{CODE}" android:fillColor="#00000000" android:strokeColor="#a7e9d1" android:strokeWidth="8" android:strokeLineCap="round" android:strokeLineJoin="round"/>
  </group>
</vector>'''
for name in ['drawable/answerbook_icon.xml', 'drawable-v24/ic_launcher_foreground.xml']:
    (RES / name).write_text(vector, encoding='utf-8')
(RES / 'values/ic_launcher_background.xml').write_text('<resources><color name="ic_launcher_background">#315de5</color></resources>\n', encoding='utf-8')
(RES / 'drawable/ic_launcher_background.xml').write_text('<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><gradient android:startColor="#315de5" android:endColor="#18359e" android:angle="315"/></shape>\n', encoding='utf-8')

def quadratic(a, b, c):
    return [((1-t)**2*a[0]+2*(1-t)*t*b[0]+t*t*c[0], (1-t)**2*a[1]+2*(1-t)*t*b[1]+t*t*c[1]) for t in [i/40 for i in range(41)]]

outline = quadratic((108,69),(76,49),(40,61)) + [(40,154)] + quadratic((40,154),(77,142),(108,162)) + quadratic((108,162),(139,142),(176,154)) + [(176,61)] + quadratic((176,61),(140,49),(108,69))

def render(size, shape='square', foreground=False):
    n = size*4
    image = Image.new('RGBA',(n,n))
    if not foreground:
        pixels = image.load()
        for y in range(n):
            for x in range(n):
                t=(x+y)/(2*(n-1))
                pixels[x,y]=tuple(round(a+(b-a)*t) for a,b in zip((49,93,229),(24,53,158)))+(255,)
    draw=ImageDraw.Draw(image)
    def line(points, color, width, closed=False):
        coords=[((108+(x-108)*.84)*n/216,(108+(y-108)*.84)*n/216) for x,y in points]
        w=round(width*.84*n/216)
        draw.line(coords,fill=color,width=w,joint='curve')
        for x,y in coords:
            r=w/2
            draw.ellipse((x-r,y-r,x+r,y+r),fill=color)
    line(outline,'white',10,True)
    line([(108,69),(108,162)],'white',8)
    line([(75,95),(60,110),(75,125)],'#a7e9d1',8)
    line([(141,95),(156,110),(141,125)],'#a7e9d1',8)
    if not foreground:
        mask=Image.new('L',(n,n));d=ImageDraw.Draw(mask)
        if shape=='round':d.ellipse((0,0,n-1,n-1),fill=255)
        else:d.rounded_rectangle((0,0,n-1,n-1),radius=n*48/216,fill=255)
        image.putalpha(mask)
    return image.resize((size,size),Image.Resampling.LANCZOS)

for density,size,fg in [('mdpi',48,108),('hdpi',72,162),('xhdpi',96,216),('xxhdpi',144,324),('xxxhdpi',192,432)]:
    folder=RES/f'mipmap-{density}'
    render(size).save(folder/'ic_launcher.png')
    render(size,'round').save(folder/'ic_launcher_round.png')
    render(fg,foreground=True).save(folder/'ic_launcher_foreground.png')
render(512).save(ART/'kodshag-icon-512.png')
print('Updated adaptive vectors, 15 launcher PNGs, favicon and 512px preview.')
