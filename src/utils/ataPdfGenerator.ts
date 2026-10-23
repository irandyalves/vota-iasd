import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { VotingHistoryRecord } from '../types';

/**
 * Gera e faz o download de um arquivo .PDF oficial da Ata da Eleição
 * obedecendo as normas ABNT:
 * - Papel A4 em orientação Retrato (Portrait)
 * - Margens ABNT: Superior 30mm (3cm), Esquerda 30mm (3cm), Direita 20mm (2cm), Inferior 20mm (2cm)
 * - Tabelas coloridas para Eleitos, Suplentes e Demais Candidatos
 * - Cabeçalho, metadados (Data, Hora, Assunto) e campos para assinaturas
 */
export function generateAtaPdf(record: VotingHistoryRecord): void {
  // Inicializa o documento A4 (210 x 297 mm) em modo retrato
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 30; // Margem Esquerda ABNT: 3cm
  const marginRight = 20; // Margem Direita ABNT: 2cm
  const marginTop = 30; // Margem Superior ABNT: 3cm
  const marginBottom = 20; // Margem Inferior ABNT: 2cm
  const contentWidth = pageWidth - marginLeft - marginRight; // 160mm de área útil

  let currentY = marginTop;

  // 1. CABEÇALHO INSTITUCIONAL OFICIAL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 38, 87); // Azul Marinho IASD
  doc.text('IGREJA ADVENTISTA DO SÉTIMO DIA', marginLeft, currentY);

  currentY += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(180, 83, 9); // Dourado escuro / Âmbar
  doc.text('SISTEMA ELEITORAL INFORMATIZADO — VOTA IASD', marginLeft, currentY);

  currentY += 3;
  // Linha dupla decorativa (Azul e Dourada)
  doc.setDrawColor(0, 38, 87);
  doc.setLineWidth(0.6);
  doc.line(marginLeft, currentY, marginLeft + contentWidth, currentY);

  currentY += 1;
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, currentY, marginLeft + contentWidth, currentY);

  currentY += 7;

  // 2. TÍTULO DO DOCUMENTO (ATA OFICIAL)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // Slate escuro
  const titleText = 'ATA OFICIAL DE ELEIÇÃO E APURAÇÃO DE VOTOS';
  doc.text(titleText, pageWidth / 2, currentY, { align: 'center' });

  currentY += 6;

  // 3. QUADRO DE METADADOS / DETALHES DA ELEIÇÃO
  const detailsY = currentY;
  const detailsHeight = 24;

  // Fundo e borda sutil do quadro de detalhes
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginLeft, detailsY, contentWidth, detailsHeight, 2, 2, 'FD');

  const col1X = marginLeft + 4;
  const col2X = marginLeft + (contentWidth / 2) + 2;

  // Linha 1 de detalhes: Assunto
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('ASSUNTO / CARGO:', col1X, detailsY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  const subject = (record.sessionTitle || record.headerTitle || 'Eleição Geral').toUpperCase();
  doc.text(doc.splitTextToSize(subject, (contentWidth / 2) - 30)[0], col1X + 32, detailsY + 5.5);

  // Linha 1 direita: Data
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('DATA DA ELEIÇÃO:', col2X, detailsY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  const electionDate = record.dateFormatted ? record.dateFormatted.replace(/^dia\s+/i, '') : new Date(record.timestamp).toLocaleDateString('pt-BR');
  doc.text(electionDate, col2X + 32, detailsY + 5.5);

  // Linha 2 de detalhes: Total Votantes
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('TOTAL DE VOTANTES:', col1X, detailsY + 11.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`${record.totalVoters} presentes`, col1X + 35, detailsY + 11.5);

  // Linha 2 direita: Horário
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('HORÁRIO APURAÇÃO:', col2X, detailsY + 11.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`${record.timeFormatted}h`, col2X + 35, detailsY + 11.5);

  // Linha 3 de detalhes: Total Votos
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('TOTAL DE VOTOS:', col1X, detailsY + 17.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`${record.totalVotes} votos computados`, col1X + 31, detailsY + 17.5);

  // Linha 3 direita: Situação
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('SITUAÇÃO GERAL:', col2X, detailsY + 17.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(5, 150, 105); // Verde
  doc.text('HOMOLOGADA E ENCERRADA', col2X + 31, detailsY + 17.5);

  currentY = detailsY + detailsHeight + 6;

  // 4. TABELA COLORIDA 1: CANDIDATOS ELEITOS (TITULARES)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(4, 120, 87); // Verde Esmeralda escuro
  doc.text(`1. CANDIDATOS ELEITOS — TITULARES (${record.eleitos?.length || 0} ${record.eleitos?.length === 1 ? 'VAGA' : 'VAGAS'})`, marginLeft, currentY);
  currentY += 2;

  const eleitosRows = (record.eleitos && record.eleitos.length > 0)
    ? record.eleitos.map((c, i) => [
        String(i + 1),
        c.tieBreakDisputeWith ? `${c.name} (em desempate com ${c.tieBreakDisputeWith})` : c.name,
        String(c.votesCount),
        `${c.percentage}%`,
        'ELEITO - TITULAR',
      ])
    : [['-', 'Nenhum candidato classificado como titular', '0', '0%', 'SEM ELEITO']];

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginLeft, right: marginRight },
    theme: 'grid',
    head: [['#', 'NOME DO CANDIDATO', 'VOTOS', '% VOTOS', 'CLASSIFICAÇÃO']],
    body: eleitosRows,
    headStyles: {
      fillColor: [5, 150, 105], // Verde Esmeralda
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [240, 253, 244], // Fundo verde clarinho suave
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left' },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'center', cellWidth: 38, fontStyle: 'bold', textColor: [4, 120, 87] },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // 5. TABELA COLORIDA 2: SUPLENTES (1º E 2º SUPLENTES)
  const suplentesTotal = [
    ...(record.suplentes || []).map((c) => ({ ...c, tipo: '1º SUPLENTE' })),
    ...(record.segundoSuplentes || []).map((c) => ({ ...c, tipo: '2º SUPLENTE' })),
  ];

  if (suplentesTotal.length > 0) {
    // Se estiver muito perto do fim da página, cria nova página respeitando margens
    if (currentY > pageHeight - marginBottom - 45) {
      doc.addPage();
      currentY = marginTop;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(29, 78, 216); // Azul Safira escuro
    doc.text(`2. SUPLENTES REGISTRADOS (${suplentesTotal.length} ${suplentesTotal.length === 1 ? 'VAGA' : 'VAGAS'})`, marginLeft, currentY);
    currentY += 2;

    const suplentesRows = suplentesTotal.map((c, i) => [
      String(i + 1),
      c.tieBreakDisputeWith ? `${c.name} (em desempate com ${c.tieBreakDisputeWith})` : c.name,
      String(c.votesCount),
      `${c.percentage}%`,
      c.tipo,
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginLeft, right: marginRight },
      theme: 'grid',
      head: [['#', 'NOME DO CANDIDATO', 'VOTOS', '% VOTOS', 'CLASSIFICAÇÃO']],
      body: suplentesRows,
      headStyles: {
        fillColor: [37, 99, 235], // Azul Safira
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59],
        cellPadding: 2,
      },
      alternateRowStyles: {
        fillColor: [239, 246, 255], // Azul clarinho
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left' },
        2: { halign: 'center', cellWidth: 18 },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'center', cellWidth: 38, fontStyle: 'bold', textColor: [29, 78, 216] },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // 6. TABELA COLORIDA 3: DEMAIS CANDIDATOS (NÃO CLASSIFICADOS)
  if (record.naoClassificados && record.naoClassificados.length > 0) {
    if (currentY > pageHeight - marginBottom - 40) {
      doc.addPage();
      currentY = marginTop;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105); // Cinza Slate
    doc.text(`3. DEMAIS CANDIDATOS VOTADOS (${record.naoClassificados.length})`, marginLeft, currentY);
    currentY += 2;

    const naoClassificadosRows = record.naoClassificados.map((c, i) => {
      const isDeclined = c.acceptStatus === 'Declinou';
      const nameText = isDeclined
        ? `${c.name} (DECLINOU DO CONVITE${c.declinedOriginalRank ? ` - ${c.declinedOriginalRank}º lugar original` : ''})`
        : c.tieBreakDisputeWith
        ? `${c.name} (em desempate com ${c.tieBreakDisputeWith})`
        : c.name;
      const classifText = isDeclined ? 'DECLINOU CONVITE' : 'NÃO CLASSIFICADO';
      return [
        String(i + 1),
        nameText,
        String(c.votesCount),
        `${c.percentage}%`,
        classifText,
      ];
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginLeft, right: marginRight },
      theme: 'grid',
      head: [['#', 'NOME DO CANDIDATO', 'VOTOS', '% VOTOS', 'CLASSIFICAÇÃO']],
      body: naoClassificadosRows,
      headStyles: {
        fillColor: [71, 85, 105], // Cinza Ardósia
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 65, 85],
        cellPadding: 1.8,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left' },
        2: { halign: 'center', cellWidth: 18 },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'center', cellWidth: 38, textColor: [100, 116, 139] },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // 7. TERMO DE HOMOLOGAÇÃO E CAMPOS PARA ASSINATURA (ABNT)
  if (currentY > pageHeight - marginBottom - 42) {
    doc.addPage();
    currentY = marginTop;
  }

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const closingText =
    'Os votos foram apurados e conferidos eletronicamente através da plataforma VOTA IASD em sessão regular. Nada mais havendo a constar, lavrou-se a presente ata oficial que é assinada pelos membros da comissão eleitoral e pelos coordenadores responsáveis.';
  const splitClosing = doc.splitTextToSize(closingText, contentWidth);
  doc.text(splitClosing, marginLeft, currentY);

  currentY += splitClosing.length * 4 + 14;

  // Linhas para assinaturas
  const sigWidth = (contentWidth - 20) / 2;
  const sig1X = marginLeft;
  const sig2X = marginLeft + sigWidth + 20;

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  doc.line(sig1X, currentY, sig1X + sigWidth, currentY);
  doc.line(sig2X, currentY, sig2X + sigWidth, currentY);

  currentY += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('COORDENADOR(A) DA ELEIÇÃO', sig1X + sigWidth / 2, currentY, { align: 'center' });
  doc.text('SECRETÁRIO(A) DA COMISSÃO', sig2X + sigWidth / 2, currentY, { align: 'center' });

  currentY += 3.5;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Igreja Adventista do Sétimo Dia', sig1X + sigWidth / 2, currentY, { align: 'center' });
  doc.text('Comissão Eleitoral Oficial', sig2X + sigWidth / 2, currentY, { align: 'center' });

  // 8. RODAPÉ EM TODAS AS PÁGINAS (ABNT)
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = pageHeight - marginBottom + 8;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, footerY - 4, marginLeft + contentWidth, footerY - 4);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('VOTA IASD — Sistema Eleitoral Informatizado', marginLeft, footerY);
    doc.text(`Página ${i} de ${pageCount}`, marginLeft + contentWidth, footerY, { align: 'right' });
  }

  // Nome do arquivo sanitizado
  const sanitizedTitle = (record.sessionTitle || record.headerTitle || 'Eleicao')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Ata_Eleicao_${sanitizedTitle}_${electionDate.replace(/\//g, '-')}.pdf`;

  // Download do arquivo PDF gerado
  doc.save(fileName);
}
