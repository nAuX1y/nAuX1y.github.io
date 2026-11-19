from pathlib import Path
import sys

root = Path(__file__).resolve().parent
project = root.parent

# Optional output directory:
#   python bundle.py            -> ../dist
#   python bundle.py out_dir    -> out_dir
if len(sys.argv) > 1:
    out_dir = Path(sys.argv[1])
    if not out_dir.is_absolute():
        out_dir = (project / out_dir).resolve()
else:
    out_dir = project / 'dist'
out_dir.mkdir(parents=True, exist_ok=True)

html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'styles.css').read_text(encoding='utf-8')
js = (root / 'game.js').read_text(encoding='utf-8')

html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="game.js"></script>', '<script>\n' + js + '\n</script>')

outputs = [
    out_dir / '绿茵王朝.html',
    out_dir / 'grassroots-dynasty.html',
]
for out in outputs:
    out.write_text(html, encoding='utf-8')
    print(f'{out.name}: {out.stat().st_size} bytes')
print(f'output: {out_dir}')
