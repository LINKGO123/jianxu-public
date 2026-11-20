"""Create fictional Chinese PDF fixtures with the bundled reportlab runtime."""
from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
root = Path(__file__).parent
expected = []
for profile, label in [('graduate', '应届'), ('experienced', '社招')]:
    for layout in ['two-column', 'multi-page']:
        filename = f'fictional-{profile}-{layout}.pdf'
        name = f'虚构{label}{"双栏" if layout == "two-column" else "多页"}'
        left = [f'姓名：{name}', '求职方向：测试岗位', '教育背景' if profile == 'graduate' else '工作经历', '虚构学校 2022—2026' if profile == 'graduate' else '虚构公司 2021—2025']
        right = ['项目经历', '虚构项目：核对 12 项测试记录。', '自定义原文', '仅为测试，不代表真人经历。']
        output = canvas.Canvas(str(root / filename), pagesize=(595, 842), invariant=1)
        def draw(lines, x):
            output.setFont('STSong-Light', 12)
            for index, line in enumerate(lines):
                output.drawString(x, 790-index*32, line)
        draw(left, 40)
        if layout == 'multi-page':
            output.showPage()
        draw(right, 315 if layout == 'two-column' else 40)
        output.save()
        expected.append(dict(file=filename, name=name, lines=left+right, profile=profile, layout=layout, pages=2 if layout == 'multi-page' else 1))
(root/'expected-pdfs.json').write_text(json.dumps(expected, ensure_ascii=False, indent=2)+'\n')
print('Generated 4 fictional Chinese PDFs: graduate/social, two-column/multi-page.')
