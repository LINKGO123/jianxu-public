"""Generate one fictional header and graphic portrait for local crop tests."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
output = canvas.Canvas(str(Path(__file__).with_name('fictional-header-photo.pdf')),
                       pagesize=(595, 842), invariant=1)
output.setFont('STSong-Light', 12)
lines = ['林安然', '本科（全日制）-毕业于2020.6', '13800000000',
         'fictional@example.com', '个人优势：', '具有课程开发经验。',
         '关键项目成果：', '完成12次虚构项目。', '资格证书：', '虚构证书',
         '工作经历：', '虚构公司 2021—2025 培训主管']
for index, line in enumerate(lines):
    output.drawString(40, 790-index*35, line)
output.setFillColorRGB(.65, .8, .95)
output.rect(420, 670, 120, 140, fill=1, stroke=0)
output.setFillColorRGB(.9, .65, .5)
output.circle(480, 750, 30, fill=1, stroke=0)
output.save()
