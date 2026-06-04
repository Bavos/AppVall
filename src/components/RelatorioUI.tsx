import React, { useState } from 'react';
import { FileText, Download, Calendar, Filter, CheckCircle } from 'lucide-react';
import { Task, TaskCategory } from '../types';
import { jsPDF } from 'jspdf';

interface RelatorioUIProps {
  tasks: Task[];
  userName: string;
  onTriggerToast?: (msg: string) => void;
  defaultOpen?: boolean;
}

export default function RelatorioUI({ tasks, userName, onTriggerToast, defaultOpen }: RelatorioUIProps) {
  // Configurar períodos iniciais amigáveis (padrão de hoje a 30 dias na frente)
  const getTodayDateStr = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getFutureDateStr = (days: number) => {
    const dObj = new Date();
    dObj.setDate(dObj.getDate() + days);
    const y = dObj.getFullYear();
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const d = String(dObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Estados dos filtros
  const [dataInicio, setDataInicio] = useState<string>(getFutureDateStr(-30));
  const [dataFim, setDataFim] = useState<string>(getFutureDateStr(30));
  const [selectedCategories, setSelectedCategories] = useState<TaskCategory[]>([
    'Agendamento',
    'Curinga',
    'Disponível',
    'Notas',
  ]);

  // Expandido por padrão ou colapsável de forma estilizada
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);

  // Estados auxiliadores para geração e download de PDF robusto (evitando bloqueios de iframe/mobile)
  const [isGenerating, setIsGenerating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');

  // Toggle de categoria individual
  const handleToggleCategory = (cat: TaskCategory) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  // Selecionar / Deselecionar todos os tipos
  const handleToggleSelectAll = () => {
    if (selectedCategories.length === 4) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(['Agendamento', 'Curinga', 'Disponível', 'Notas']);
    }
  };

  // Lógica de geração do PDF
  const handleExportPDF = () => {
    // 1. Filtrar as tarefas baseadas no filtro do usuário
    const filteredTasks = tasks.filter((t) => {
      const matchCategory = selectedCategories.includes(t.category);
      const matchDate = t.date >= dataInicio && t.date <= dataFim;
      return matchCategory && matchDate;
    });

    // Ordenar tarefas por data (crescente), e depois por hora
    filteredTasks.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      const timeA = a.time || '23:59';
      const timeB = b.time || '23:59';
      return timeA.localeCompare(timeB);
    });

    if (filteredTasks.length === 0) {
      if (onTriggerToast) {
        onTriggerToast('Nenhum compromisso encontrado para o período/filtros.');
      } else {
        alert('Nenhum compromisso encontrado para os filtros selecionados.');
      }
      return;
    }

    if (onTriggerToast) {
      onTriggerToast('Gerando relatório...');
    }

    setIsGenerating(true);

    // setTimeout garante que o spinner de carregamento renderiza na tela antes do trabalho síncrono do jsPDF
    setTimeout(() => {
      try {
        // 2. Instanciar jsPDF (formato A4 vertical)
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });

        // Dimensões úteis do A4: Largura = 210mm, Altura = 297mm
        // Margens: Esquerda = 15mm, Direita = 15mm, Topo = 20mm, Base = 15mm
        // Largura útil = 180mm
        const marginL = 15;
        const marginR = 15;
        const widthUtil = 180;
        
        let pageNum = 1;

        // Helper para desenhar a marca d'água de background ou elementos visuais estruturais
        const drawGridDecorations = (docObj: jsPDF) => {
          // Pequeno rodapé padrão nas páginas
          docObj.setFont('helvetica', 'normal');
          docObj.setFontSize(8);
          docObj.setTextColor(156, 163, 175); // gray-400
          docObj.text('Vall - Sistema de Gestão de Compromissos', marginL, 285);
          
          // Marca decorativa lateral de Vall
          docObj.setFillColor(45, 212, 191); // Teal
          docObj.rect(5, 5, 1, 287, 'F');
        };

        // Imprimir o cabeçalho completo e sumário (somente na página 1)
        const drawDocumentHeader = () => {
          // Retângulo com o fundo preto/escuro para o cabeçalho (idêntico à imagem)
          doc.setFillColor(11, 21, 40); // Dark Slate / Preto
          doc.rect(marginL, 15, widthUtil, 28, 'F');

          // Faixa divisória inferior em verde neon/Teal
          doc.setFillColor(45, 212, 191);
          doc.rect(marginL, 43, widthUtil, 1.2, 'F');

          // Título "SISTEMA DE GESTÃO" em ciano
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(45, 212, 191); // Teal / Ciano
          doc.text('SISTEMA DE GESTÃO', marginL + 6, 23.5);

          // Título Principal "VALL — Relatório" em branco
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(21);
          doc.setTextColor(255, 255, 255); // Branco
          doc.text('VALL — Relatório', marginL + 6, 35.5);

          // Formatação de data
          const formatDateLabel = (dateStr: string) => {
            const p = dateStr.split('-');
            if (p.length !== 3) return dateStr;
            return `${p[2]}/${p[1]}/${p[0]}`;
          };

          // Informações do lado direito do cabeçalho
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(226, 232, 240); // Texto cinza claro/branco sutil

          // Período
          doc.text(`Período: ${formatDateLabel(dataInicio)} a ${formatDateLabel(dataFim)}`, marginL + 110, 24);

          // Data de emissão local
          const now = new Date();
          const optionsTime: Intl.DateTimeFormatOptions = { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
          };
          const emissionDate = now.toLocaleDateString('pt-BR');
          const emissionTime = now.toLocaleTimeString('pt-BR', optionsTime);
          const todayStr = `${emissionDate}, ${emissionTime}`;
          doc.text(`Gerado em: ${todayStr}`, marginL + 110, 31.5);

          // Caixa de Estatísticas e Metadados sutil abaixo da linha divisor
          doc.setFillColor(248, 250, 252); // slate-50
          doc.rect(marginL, 47, widthUtil, 7, 'F');
          
          doc.setDrawColor(241, 245, 249); // slate-100 border
          doc.setLineWidth(0.2);
          doc.line(marginL, 47, marginL + widthUtil, 47);
          doc.line(marginL, 54, marginL + widthUtil, 54);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139); // slate-500
          doc.text(`Gestor: ${userName}`, marginL + 4, 51.5);

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 23, 42); // slate-900
          doc.text(`Total de compromissos: ${filteredTasks.length}`, marginL + 65, 51.5);

          const totalConcluidas = filteredTasks.filter(t => t.status === 'Concluída').length;
          doc.setTextColor(13, 148, 136); // teal-600
          doc.text(`Concluídos: ${totalConcluidas}  |  Pendentes: ${filteredTasks.length - totalConcluidas}`, marginL + 120, 51.5);
        };

        // Helper para desenhar os cabeçalhos de tabela
        const drawTableHeader = (startY: number) => {
          doc.setFillColor(3, 7, 18); // Dark Slate Header
          doc.rect(marginL, startY, widthUtil, 8, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(255, 255, 255); // White Text

          // Nomes de coluna e posições relativas
          // Total = 20(Data) + 14(Hora) + 75(Compromisso) + 26(Tipo) + 25(Prioridade) + 20(Status) = 180mm
          doc.text('DATA', marginL + 2, startY + 5.5);
          doc.text('HORA', marginL + 22, startY + 5.5);
          doc.text('COMPROMISSO / DETALHES', marginL + 36, startY + 5.5);
          doc.text('TIPO', marginL + 111, startY + 5.5);
          doc.text('PRIORIDADE', marginL + 137, startY + 5.5);
          doc.text('STATUS', marginL + 162, startY + 5.5);
        };

        // Inicializar página 1
        drawGridDecorations(doc);
        drawDocumentHeader();

        let currentY = 58;
        drawTableHeader(currentY);
        currentY += 8;

        // 3. Iterar e produzir as linhas do relatório
        filteredTasks.forEach((task, index) => {
          // Se houver estouro de página, avança de forma limpa e adiciona o header na nova página
          if (currentY > 265) {
            doc.addPage();
            pageNum++;
            drawGridDecorations(doc);
            
            // reimprimir cabeçalho de tabela básico
            currentY = 20;
            drawTableHeader(currentY);
            currentY += 8;
          }

          // Cor de fundo alternada (Zebra lines)
          const isEven = index % 2 === 0;
          if (isEven) {
            doc.setFillColor(248, 250, 252); // slate-50
          } else {
            doc.setFillColor(255, 255, 255); // white
          }
          doc.rect(marginL, currentY, widthUtil, 8.5, 'F');

          // Desenhar linha separadora fútil mas elegante
          doc.setDrawColor(241, 245, 249); // slate-100
          doc.setLineWidth(0.2);
          doc.line(marginL, currentY + 8.5, marginL + widthUtil, currentY + 8.5);

          // Formatar cor e fonte das informações da linha
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(15, 23, 42); // slate-900

          // Formatar data da tarefa para DD/MM/AAAA
          const formatDateStr = (dStr: string) => {
            const parts = dStr.split('-');
            if (parts.length !== 3) return dStr;
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
          };

          // Desenhar Dados das Colunas
          doc.setFont('helvetica', 'bold');
          doc.text(formatDateStr(task.date), marginL + 2, currentY + 5.5);
          
          // Hora
          doc.setFont('helvetica', 'normal');
          doc.text(task.time || '--:--', marginL + 22, currentY + 5.5);

          // Título Formatado conforme as regras
          const formattedTitle =
            task.category === 'Curinga'
              ? `Paciente: ${task.title}`
              : task.category === 'Disponível'
              ? `Profissional: ${task.title}`
              : task.title;

          // Limitar tamanho de string do título para que caiba na coluna perfeitamente
          const trimmedTitle =
            formattedTitle.length > 40 ? formattedTitle.substring(0, 37) + '...' : formattedTitle;
          doc.text(trimmedTitle, marginL + 36, currentY + 5.5);

          // Tipo (Categoria)
          doc.text(task.category, marginL + 111, currentY + 5.5);

          // Prioridade com estilização de cor
          const priority = task.priority || 'Média';
          doc.setFont('helvetica', 'bold');
          if (priority === 'Alta') {
            doc.setTextColor(225, 29, 72); // rose-600
          } else if (priority === 'Média') {
            doc.setTextColor(217, 119, 6); // amber-600
          } else {
            doc.setTextColor(5, 150, 105); // emerald-600
          }
          doc.text(priority, marginL + 137, currentY + 5.5);

          // Status
          doc.setFont('helvetica', 'normal');
          if (task.status === 'Concluída') {
            doc.setTextColor(13, 148, 136); // teal-600
            doc.text('Concluída', marginL + 162, currentY + 5.5);
          } else if (task.status === 'Em Progresso') {
            doc.setTextColor(79, 70, 229); // indigo-600
            doc.text('Em Foco', marginL + 162, currentY + 5.5);
          } else {
            doc.setTextColor(100, 116, 139); // slate-500
            doc.text('Pendente', marginL + 162, currentY + 5.5);
          }

          currentY += 8.5;
        });

        // 4. Rodapé dinâmico com números de página ("Página X de Y") em todas as páginas geradas
        const totalPages = doc.getNumberOfPages();
        for (let j = 1; j <= totalPages; j++) {
          doc.setPage(j);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(156, 163, 175); // gray-400
          doc.text(`Página ${j} de ${totalPages}`, marginL + widthUtil - 18, 285);
        }

        // 5. Salvar / Baixar o arquivo PDF de forma oficial
        const safeStartStr = dataInicio.replace(/-/g, '');
        const safeEndStr = dataFim.replace(/-/g, '');
        const filename = `vall-relatorio-${safeStartStr}-a-${safeEndStr}.pdf`;

        // Gerar Blob URL para fallback robusto de download/visualização
        const blob = doc.output('blob');
        const bUrl = URL.createObjectURL(blob);

        setPdfBlobUrl(bUrl);
        setPdfFileName(filename);
        setShowModal(true);

        try {
          doc.save(filename);
          if (onTriggerToast) {
            onTriggerToast('Download do PDF finalizado!');
          }
        } catch (saveError) {
          console.warn("Save PDF failed initially, fallback modal prepared.", saveError);
          if (onTriggerToast) {
            onTriggerToast('Relatório gerado! Use os botões abaixo.');
          }
        }
      } catch (err) {
        console.error("Erro ao gerar PDF:", err);
        if (onTriggerToast) {
          onTriggerToast('Erro na renderização do PDF.');
        }
      } finally {
        setIsGenerating(false);
      }
    }, 120);
  };

  return (
    <div className="space-y-4 relative z-10 text-left" id="component_relatorio_ui">
      {/* Seção 1: Seletores de Data para Período */}
      <div>
        <label className="text-[10px] text-gray-300 uppercase tracking-widest font-bold mb-2 block font-mono">
          Período do Relatório *
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-2 px-3.5 focus-within:border-[#2DD4BF]/50">
            <span className="text-[8px] text-gray-400 block font-mono uppercase">De (Data Inicial)</span>
            <input
              type="date"
              required
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bg-transparent text-xs w-full text-white border-0 outline-none focus:outline-none focus:ring-0 cursor-pointer pt-0.5"
            />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-2 px-3.5 focus-within:border-[#2DD4BF]/50">
            <span className="text-[8px] text-gray-400 block font-mono uppercase">Até (Data Final)</span>
            <input
              type="date"
              required
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="bg-transparent text-xs w-full text-white border-0 outline-none focus:outline-none focus:ring-0 cursor-pointer pt-0.5"
            />
          </div>
        </div>
      </div>

      {/* Seção 2: Seletores de Categoria / Tipos */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-gray-300 uppercase tracking-widest font-bold font-mono">
            Tipos de Compromissos
          </label>
          <button
            type="button"
            onClick={handleToggleSelectAll}
            className="text-[9px] font-bold text-[#2DD4BF] hover:underline bg-transparent border-0 cursor-pointer p-1"
          >
            {selectedCategories.length === 4 ? 'Deselecionar Todos' : 'Selecionar Todos'}
          </button>
        </div>

        {/* Grid dos Pills Selecionáveis */}
        <div className="grid grid-cols-2 gap-2">
          {(['Curinga', 'Agendamento', 'Notas', 'Disponível'] as TaskCategory[]).map((cat) => {
            const isSelected = selectedCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleToggleCategory(cat)}
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider text-center transition cursor-pointer select-none border active:scale-95 ${
                  isSelected
                    ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/40 text-[#2DD4BF] font-extrabold shadow-[0_0_12px_rgba(45,212,191,0.06)]'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Botão de Geração/Download Integrado */}
      <div className="pt-2">
        <button
          onClick={handleExportPDF}
          disabled={isGenerating}
          className="w-full text-xs font-bold bg-[#2DD4BF] hover:bg-[#5eead4] disabled:bg-[#2dd4bf]/50 disabled:cursor-not-allowed text-black py-3 px-5 rounded-2xl transition cursor-pointer active:scale-95 min-h-[48px] flex items-center justify-center gap-2 font-mono shadow-[0_0_20px_rgba(45,212,191,0.25)]"
          title="Clique para pesquisar, filtrar e carregar o PDF"
        >
          {isGenerating ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-black/40 border-t-black rounded-full animate-spin" />
              <span>GERANDO RELATÓRIO...</span>
            </>
          ) : (
            <>
              <Download size={14} />
              <span>EXPORTAR FILTRADO (PDF)</span>
            </>
          )}
        </button>
      </div>

      {/* MODAL DE SUCESSO DO PDF / DOWNLOAD (Robusto para iframes/dispositivos móveis) */}
      {showModal && pdfBlobUrl && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="glass max-w-sm w-full rounded-3xl p-6 border border-[#2DD4BF]/20 text-center space-y-5 bg-slate-950/90 shadow-2xl relative overflow-hidden" id="modal-pdf-success">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-500 via-cyan-400 to-teal-500"></div>
            
            <div className="w-14 h-14 rounded-full bg-[#2DD4BF]/10 border border-[#2DD4BF]/20 flex items-center justify-center text-[#2DD4BF] mx-auto animate-bounce">
              <CheckCircle size={28} />
            </div>

            <div>
              <h3 className="font-extrabold text-sm text-white uppercase tracking-wider font-mono">Relatório Gerado!</h3>
              <p className="text-[10px] text-gray-400 mt-1 font-mono break-all">{pdfFileName}</p>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Caso seu navegador ou aparelho bloqueie o download automático (comum em celulares ou aplicativos incorporados), você pode escolher uma das opções abaixo:
            </p>

            <div className="space-y-2.5 pt-1">
              {/* Botão Baixar via link em nova aba / download real */}
              <a
                href={pdfBlobUrl}
                download={pdfFileName}
                className="w-full text-xs font-bold bg-[#2DD4BF] hover:bg-[#5eead4] text-black py-3 px-5 rounded-xl transition flex items-center justify-center gap-2 font-mono shadow-[0_0_12px_rgba(45,212,191,0.2)] active:scale-95 cursor-pointer"
                onClick={() => {
                  if (onTriggerToast) {
                    onTriggerToast("Iniciando download...");
                  }
                }}
              >
                <Download size={14} />
                <span>BAIXAR ARQUIVO (PDF)</span>
              </a>

              {/* Botão Visualizar na tela (Abrir em nova aba) */}
              <a
                href={pdfBlobUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10 text-white py-3 px-5 rounded-xl transition flex items-center justify-center gap-2 font-mono active:scale-95 cursor-pointer"
              >
                <FileText size={14} />
                <span>ABRIR/VISUALIZAR NA TELA</span>
              </a>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  if (pdfBlobUrl) {
                    URL.revokeObjectURL(pdfBlobUrl);
                  }
                  setPdfBlobUrl(null);
                }}
                className="text-xs font-medium text-gray-400 hover:text-white transition underline cursor-pointer"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
