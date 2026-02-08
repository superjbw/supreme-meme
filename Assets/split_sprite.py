import sys
import os
from PIL import Image

def split_sprite(image_path, cols, rows):
    img = Image.open(image_path)
    w, h = img.size
    frame_w = w // cols
    frame_h = h // rows

    folder = os.path.dirname(image_path)
    name = os.path.splitext(os.path.basename(image_path))[0]
    # Remove _total suffix if present
    prefix = name.replace('_total', '').replace('_Total', '')

    print(f'Image: {w}x{h} -> {cols}x{rows} grid -> frame {frame_w}x{frame_h}')

    count = 0
    for row in range(rows):
        for col in range(cols):
            count += 1
            box = (col * frame_w, row * frame_h, (col + 1) * frame_w, (row + 1) * frame_h)
            frame = img.crop(box).convert('RGBA')
            # 흰색 배경을 투명하게 처리
            pixels = frame.load()
            fw, fh = frame.size
            for py in range(fh):
                for px in range(fw):
                    r, g, b, a = pixels[px, py]
                    if r > 240 and g > 240 and b > 240:
                        pixels[px, py] = (r, g, b, 0)
            out_path = os.path.join(folder, f'{prefix}_{count}.png')
            frame.save(out_path)
            print(f'  Saved: {prefix}_{count}.png (transparent)')

    print(f'Done! {count} frames saved.')

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print('Usage: py split_sprite.py <image_path> <cols> <rows>')
        print('Example: py split_sprite.py Idle/Idle_total.png 3 2')
        sys.exit(1)

    image_path = sys.argv[1]
    cols = int(sys.argv[2])
    rows = int(sys.argv[3])
    split_sprite(image_path, cols, rows)
