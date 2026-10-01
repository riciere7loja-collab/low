import os
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors

def draw_header_footer(c, title, page_num):
    width, height = A4
    # Border
    c.setLineWidth(2)
    c.setStrokeColor(colors.HexColor('#6C5CE7'))
    c.roundRect(30, 30, width - 60, height - 60, 10, stroke=1, fill=0)
    
    # Header dashed fields
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor('#2D3436'))
    c.drawString(45, height - 52, "NOME: _____________________________________________")
    c.drawString(width - 160, height - 52, "DATA: _____/_____/_________")
    
    # Divider
    c.setLineWidth(1)
    c.setStrokeColor(colors.HexColor('#E2E8F0'))
    c.line(45, height - 62, width - 45, height - 62)
    
    # Footer
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor('#718096'))
    c.drawString(45, 42, f"Super Kit de Atividades Infantis • Especial Dia das Crianças")
    c.drawRightString(width - 45, 42, f"Página {page_num}")

def create_sample_pdf(filename="amostra_super_kit_infantil.pdf"):
    c = canvas.Canvas(filename, pagesize=A4)
    width, height = A4

    # ---------------- PAGE 1: CAPA ----------------
    # Background decorative border
    c.setLineWidth(4)
    c.setStrokeColor(colors.HexColor('#6C5CE7'))
    c.roundRect(25, 25, width - 50, height - 50, 15, stroke=1, fill=0)
    
    c.setLineWidth(1.5)
    c.setStrokeColor(colors.HexColor('#FD79A8'))
    c.roundRect(32, 32, width - 64, height - 64, 10, stroke=1, fill=0)

    # Title & Badge
    c.setFillColor(colors.HexColor('#FF5E97'))
    c.roundRect(width/2 - 130, height - 120, 260, 30, 15, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(width/2, height - 100, "★ AMOSTRA GRATUITA PARA IMPRIMIR ★")

    c.setFillColor(colors.HexColor('#2D3436'))
    c.setFont("Helvetica-Bold", 26)
    c.drawCentredString(width/2, height - 170, "SUPER KIT DIGITAL")
    
    c.setFillColor(colors.HexColor('#6C5CE7'))
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(width/2, height - 200, "DE ATIVIDADES INFANTIS")

    c.setFillColor(colors.HexColor('#718096'))
    c.setFont("Helvetica", 13)
    c.drawCentredString(width/2, height - 230, "Edição Comemorativa do Dia das Crianças")

    # Center Illustration (Decorative Shapes)
    center_y = height / 2 + 10
    c.setStrokeColor(colors.HexColor('#00B894'))
    c.setLineWidth(3)
    c.circle(width/2, center_y, 90, stroke=1, fill=0)

    c.setFont("Helvetica-Bold", 45)
    c.drawCentredString(width/2, center_y - 15, "🎨 ✏️ 🧩")

    # Features list
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(colors.HexColor('#2D3436'))
    c.drawString(100, height/2 - 120, "✓ Desenhos Exclusivos para Colorir")
    c.drawString(100, height/2 - 145, "✓ Labirintos e Desafios de Raciocínio Lógico")
    c.drawString(100, height/2 - 170, "✓ Treino de Alfabetização & Coordenação Motora")
    c.drawString(100, height/2 - 195, "✓ Certificado Oficial de Pequeno(a) Artista")

    # Child's ownership box
    box_y = 70
    c.setFillColor(colors.HexColor('#F8FAFC'))
    c.setStrokeColor(colors.HexColor('#CBD5E1'))
    c.roundRect(80, box_y, width - 160, 75, 10, fill=1, stroke=1)
    
    c.setFillColor(colors.HexColor('#2D3436'))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(95, box_y + 50, "ESTE CADERNO DE ATIVIDADES PERTENCE A:")
    c.setFont("Helvetica", 10)
    c.drawString(95, box_y + 25, "Nome: _____________________________________________________")
    c.drawString(95, box_y + 8, "Idade: ________ anos      Cidade: _____________________________")

    c.showPage()

    # ---------------- PAGE 2: DESENHO PARA COLORIR ----------------
    draw_header_footer(c, "Desenho para Colorir", 2)
    
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(colors.HexColor('#2D3436'))
    c.drawCentredString(width/2, height - 90, "O Foguete Mágico das Galáxias")
    
    c.setFont("Helvetica", 11)
    c.setFillColor(colors.HexColor('#718096'))
    c.drawCentredString(width/2, height - 110, "Pinte bem bonito com suas cores favoritas! Não esqueça de colorir as estrelas.")

    # Drawing Rocket (Line Art with ReportLab paths)
    c.setLineWidth(3)
    c.setStrokeColor(colors.HexColor('#1E293B'))
    
    # Rocket body
    p = c.beginPath()
    p.moveTo(width/2, height - 160)
    p.curveTo(width/2 - 60, height - 240, width/2 - 60, height - 380, width/2 - 60, height - 420)
    p.lineTo(width/2 + 60, height - 420)
    p.curveTo(width/2 + 60, height - 380, width/2 + 60, height - 240, width/2, height - 160)
    c.drawPath(p, stroke=1, fill=0)

    # Rocket window
    c.circle(width/2, height - 270, 32, stroke=1, fill=0)
    c.circle(width/2, height - 270, 26, stroke=1, fill=0)

    # Fins (Asas)
    fin_l = c.beginPath()
    fin_l.moveTo(width/2 - 60, height - 340)
    fin_l.lineTo(width/2 - 110, height - 430)
    fin_l.lineTo(width/2 - 60, height - 410)
    fin_l.close()
    c.drawPath(fin_l, stroke=1, fill=0)

    fin_r = c.beginPath()
    fin_r.moveTo(width/2 + 60, height - 340)
    fin_r.lineTo(width/2 + 110, height - 430)
    fin_r.lineTo(width/2 + 60, height - 410)
    fin_r.close()
    c.drawPath(fin_r, stroke=1, fill=0)

    # Rocket fire / propulsion
    fire = c.beginPath()
    fire.moveTo(width/2 - 40, height - 420)
    fire.lineTo(width/2 - 25, height - 480)
    fire.lineTo(width/2, height - 440)
    fire.lineTo(width/2 + 25, height - 480)
    fire.lineTo(width/2 + 40, height - 420)
    c.drawPath(fire, stroke=1, fill=0)

    # Planet
    c.circle(120, height - 220, 35, stroke=1, fill=0)
    c.ellipse(80, height - 225, 160, height - 215, stroke=1, fill=0) # Ring

    # Stars (Drawn polygon stars)
    def draw_star(cx, cy, r):
        import math
        sp = c.beginPath()
        for i in range(10):
            rad = r if i % 2 == 0 else r / 2.2
            angle = i * math.pi / 5 - math.pi / 2
            x = cx + rad * math.cos(angle)
            y = cy + rad * math.sin(angle)
            if i == 0:
                sp.moveTo(x, y)
            else:
                sp.lineTo(x, y)
        sp.close()
        c.drawPath(sp, stroke=1, fill=0)

    draw_star(width - 120, height - 200, 22)
    draw_star(width - 100, height - 360, 18)
    draw_star(110, height - 380, 20)
    draw_star(width/2 + 130, height - 270, 14)
    draw_star(width/2 - 130, height - 290, 16)

    # Motivational text at bottom
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(colors.HexColor('#00B894'))
    c.drawCentredString(width/2, 90, "★ Sua imaginação não tem limites! ★")

    c.showPage()

    # ---------------- PAGE 3: LABIRINTO DE RACIOCÍNIO ----------------
    draw_header_footer(c, "Desafio Ninja de Raciocínio", 3)

    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(colors.HexColor('#2D3436'))
    c.drawCentredString(width/2, height - 90, "Ajude o Coelhinho a Chegar na Cenoura! 🐰🥕")
    
    c.setFont("Helvetica", 11)
    c.setFillColor(colors.HexColor('#718096'))
    c.drawCentredString(width/2, height - 110, "Trace o caminho correto com o lápis sem encostar nas paredes do labirinto.")

    # Maze Grid Drawing
    ox, oy = 110, height - 520
    msize = 370
    c.setLineWidth(3)
    c.setStrokeColor(colors.HexColor('#1E293B'))

    # Outer wall with start and end gaps
    # Start gap at top left, end gap at bottom right
    c.line(ox + 50, oy + msize, ox + msize, oy + msize) # Top
    c.line(ox, oy, ox, oy + msize - 50) # Left
    c.line(ox, oy, ox + msize - 50, oy) # Bottom
    c.line(ox + msize, oy + 50, ox + msize, oy + msize) # Right

    # Internal walls
    c.setLineWidth(2.5)
    step = msize / 6
    # Inner paths
    c.line(ox + step, oy + step, ox + step * 3, oy + step)
    c.line(ox + step * 4, oy + step, ox + step * 5, oy + step)
    
    c.line(ox + step * 2, oy + step * 2, ox + step * 2, oy + step * 4)
    c.line(ox + step * 3, oy + step * 2, ox + step * 5, oy + step * 2)
    
    c.line(ox + step, oy + step * 3, ox + step * 4, oy + step * 3)
    c.line(ox + step * 4, oy + step * 3, ox + step * 4, oy + step * 5)
    
    c.line(ox + step * 2, oy + step * 4, ox + step * 5, oy + step * 4)
    c.line(ox + step * 5, oy + step * 2, ox + step * 5, oy + step * 5)

    c.line(ox + step, oy + step * 5, ox + step * 3, oy + step * 5)

    # Start icon
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(colors.HexColor('#FF5E97'))
    c.drawString(ox - 65, oy + msize - 30, "INÍCIO")
    c.setFont("Helvetica", 28)
    c.drawString(ox - 50, oy + msize - 65, "🐰")

    # End icon
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(colors.HexColor('#00B894'))
    c.drawString(ox + msize + 15, oy + 35, "CHEGADA!")
    c.setFont("Helvetica", 28)
    c.drawString(ox + msize + 20, oy - 5, "🥕")

    # Mini challenge below maze
    c.setFillColor(colors.HexColor('#F8FAFC'))
    c.setStrokeColor(colors.HexColor('#CBD5E1'))
    c.roundRect(80, 75, width - 160, 75, 8, fill=1, stroke=1)
    
    c.setFillColor(colors.HexColor('#2D3436'))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(95, 130, "DESAFIO EXTRA:")
    c.setFont("Helvetica", 10)
    c.drawString(95, 110, "1. Quantas orelhas o coelho tem? [   ]")
    c.drawString(95, 90, "2. A cenoura é de qual cor? ____________________")

    c.showPage()

    # ---------------- PAGE 4: COORDENAÇÃO MOTORA & ALFABETIZAÇÃO ----------------
    draw_header_footer(c, "Alfabetização e Coordenação Motora", 4)

    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(colors.HexColor('#2D3436'))
    c.drawCentredString(width/2, height - 90, "Treino Mágico das Letrinhas & Traçados")

    c.setFont("Helvetica", 11)
    c.setFillColor(colors.HexColor('#718096'))
    c.drawCentredString(width/2, height - 110, "Cubra o pontilhado com firmeza e depois tente escrever sozinho na linha abaixo:")

    vowels = [
        ("A", "Abelhinha 🐝", "Amor • Avião • Amarelo"),
        ("E", "Elefante 🐘", "Estrela • Escola • Escova"),
        ("I", "Igrejinha ⛪", "Iglu • Ilha • Ioiô"),
        ("O", "Ovelhinha 🐑", "Olho • Orelha • Ouro"),
        ("U", "Ursinho 🐻", "Uva • Unicórnio • Um"),
    ]

    start_y = height - 165
    row_height = 110

    for i, (letter, keyword, examples) in enumerate(vowels):
        curr_y = start_y - (i * row_height)
        
        # Letter Box
        c.setFillColor(colors.HexColor('#F1F5F9'))
        c.roundRect(50, curr_y - 75, 60, 75, 8, fill=1, stroke=0)
        
        c.setFont("Helvetica-Bold", 40)
        c.setFillColor(colors.HexColor('#6C5CE7'))
        c.drawCentredString(80, curr_y - 60, letter)

        # Keyword and icon
        c.setFont("Helvetica-Bold", 13)
        c.setFillColor(colors.HexColor('#2D3436'))
        c.drawString(125, curr_y - 20, f"Letra {letter} - de {keyword}")

        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor('#718096'))
        c.drawString(125, curr_y - 35, f"Exemplos: {examples}")

        # Tracing line (Dotted)
        c.setLineWidth(1)
        c.setStrokeColor(colors.HexColor('#A0AEC0'))
        c.setDash(3, 3)
        
        # Guide line top & bottom
        c.line(125, curr_y - 50, width - 60, curr_y - 50)
        c.line(125, curr_y - 75, width - 60, curr_y - 75)
        c.setDash() # Reset dash

        # Trace letters in light grey
        c.setFont("Helvetica", 22)
        c.setFillColor(colors.HexColor('#CBD5E1'))
        step_x = (width - 200) / 6
        for k in range(5):
            c.drawString(135 + (k * step_x), curr_y - 70, f"{letter}   {letter.lower()}")

    c.showPage()

    # ---------------- PAGE 5: CERTIFICADO DE PEQUENO ARTISTA ----------------
    # Fancy Certificate Border
    c.setLineWidth(5)
    c.setStrokeColor(colors.HexColor('#FDCB6E'))
    c.roundRect(30, 30, width - 60, height - 60, 12, stroke=1, fill=0)

    c.setLineWidth(2)
    c.setStrokeColor(colors.HexColor('#6C5CE7'))
    c.roundRect(40, 40, width - 80, height - 80, 8, stroke=1, fill=0)

    # Medal icon
    c.setFont("Helvetica", 50)
    c.drawCentredString(width/2, height - 130, "🏅")

    c.setFont("Helvetica-Bold", 26)
    c.setFillColor(colors.HexColor('#2D3436'))
    c.drawCentredString(width/2, height - 180, "CERTIFICADO OFICIAL")

    c.setFont("Helvetica-Bold", 18)
    c.setFillColor(colors.HexColor('#FF5E97'))
    c.drawCentredString(width/2, height - 215, "★ DE PEQUENO(A) GRANDE ARTISTA ★")

    c.setFont("Helvetica", 13)
    c.setFillColor(colors.HexColor('#4A5568'))
    c.drawCentredString(width/2, height - 270, "Certificamos com muito orgulho e carinho que:")

    # Child's Name Line
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(colors.HexColor('#6C5CE7'))
    c.drawCentredString(width/2, height - 330, "________________________________________________________")
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor('#A0AEC0'))
    c.drawCentredString(width/2, height - 350, "(Nome da Criança)")

    # Congratulations text
    c.setFont("Helvetica", 12)
    c.setFillColor(colors.HexColor('#2D3436'))
    c.drawCentredString(width/2, height - 400, "Concluiu com dedicação, criatividade e alegria todas as atividades")
    c.drawCentredString(width/2, height - 420, "deste caderno especial, provando ser uma criança super inteligente e focada!")

    # Stars
    c.setFont("Helvetica", 18)
    c.setFillColor(colors.HexColor('#FDCB6E'))
    c.drawCentredString(width/2, height - 470, "⭐  ⭐  ⭐  ⭐  ⭐")

    # Signature lines
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor('#718096'))
    
    c.line(80, 160, 240, 160)
    c.drawCentredString(160, 145, "Assinatura do Papai / Mamãe")

    c.line(width - 240, 160, width - 80, 160)
    c.drawCentredString(width - 160, 145, "Data de Conclusão")

    # Motivational Seal
    c.setFillColor(colors.HexColor('#00B894'))
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(width/2, 85, "Parabéns! Continue brilhando, aprendendo e se divertindo longe das telas!")

    c.save()
    print(f"PDF criado com sucesso: {filename}")

if __name__ == "__main__":
    create_sample_pdf()
