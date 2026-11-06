from PIL import Image, ImageDraw

def create_icon(size):
    # Create image with RGBA
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw rounded rectangle background (gradient simulation)
    # Background color: vibrant indigo / violet (#6366F1 to #4F46E5)
    corner_radius = int(size * 0.22)
    bg_color = (99, 102, 241, 255) # Indigo
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=corner_radius, fill=bg_color)

    # Add a top-left highlight ring/border
    border_color = (129, 140, 248, 200)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=corner_radius, outline=border_color, width=max(1, int(size * 0.04)))

    # Draw modern "V" with upload arrow in white
    # Points for stylized 'V' with right wing transforming into upward send arrow
    scale = size / 128.0
    
    # Stylized "V" path
    # Left wing down to bottom center, then up to right
    w = max(2, int(10 * scale))
    
    # Left stroke of V: (32, 42) -> (64, 94)
    p1 = (int(34 * scale), int(42 * scale))
    p2 = (int(64 * scale), int(94 * scale))
    # Right stroke of V going up-right: (64, 94) -> (96 * scale, 42 * scale)
    p3 = (int(94 * scale), int(42 * scale))

    draw.line([p1, p2], fill=(255, 255, 255, 255), width=w)
    draw.line([p2, p3], fill=(255, 255, 255, 255), width=w)
    
    # Upward upload arrow in the center
    # Arrow stem
    draw.line([(int(64 * scale), int(80 * scale)), (int(64 * scale), int(34 * scale))], fill=(255, 255, 255, 255), width=max(2, int(8 * scale)))
    # Arrow heads
    draw.line([(int(48 * scale), int(50 * scale)), (int(64 * scale), int(34 * scale))], fill=(255, 255, 255, 255), width=max(2, int(8 * scale)))
    draw.line([(int(80 * scale), int(50 * scale)), (int(64 * scale), int(34 * scale))], fill=(255, 255, 255, 255), width=max(2, int(8 * scale)))

    return img

for s in [16, 32, 48, 128]:
    im = create_icon(s)
    im.save(f'/Volumes/Extended/workspace/vsubmitter/icons/icon-{s}.png')
    print(f'Generated icon-{s}.png')
