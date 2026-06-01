import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Color types and structures
interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

interface TestPair {
  name: string;
  fg: string; // hex color or description
  bg: string; // hex color or description
  type: 'normal-text' | 'large-text' | 'ui-element';
  component: string;
}

// Convert Hex to RGB
function hexToRgb(hex: string): ColorRGB | null {
  // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (_m, r, g, b) => r + r + g + g + b + b);

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Convert color names if necessary, or use fallback
function resolveColor(colorStr: string): string {
  const customPalette: Record<string, string> = {
    '#2dd4bf': '#2dd4bf', // Brand Cyan
    '#6366f1': '#6366f1', // Brand Indigo
    '#030712': '#030712', // Page Background
    '#f8fafc': '#f8fafc', // Main Body Text (slate-50 / whiteish)
    '#ffffff': '#ffffff', // Absolute White
    '#000000': '#000000', // Absolute Black
    '#d1d5db': '#d1d5db', // gray-300
    '#9ca3af': '#9ca3af', // gray-400
    '#e2e8f0': '#e2e8f0', // slate-200
    '#94a3b8': '#94a3b8', // slate-400
    '#7A7A7A': '#7A7A7A', // Cited grey under accessibility audit
    '#fb7185': '#fb7185', // rose-400
    '#f43f5e': '#f43f5e', // rose-500
    '#34d399': '#34d399', // emerald-400
    '#10b981': '#10b981', // emerald-500
    '#059669': '#059669', // emerald-600
  };

  return customPalette[colorStr] || colorStr;
}

// Calculate relative luminance according to WCAG 2.0 Web Accessibility standards
// L = 0.2126 * R + 0.7152 * G + 0.0722 * B
function calculateLuminance(rgb: ColorRGB): number {
  const a = [rgb.r, rgb.g, rgb.b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

// Calculate the contrast ratio between two relative luminances
// CR = (L1 + 0.05) / (L2 + 0.05)
function getContrastRatio(fgHex: string, bgHex: string): number {
  const fgRgb = hexToRgb(resolveColor(fgHex));
  const bgRgb = hexToRgb(resolveColor(bgHex));

  if (!fgRgb || !bgRgb) {
    throw new Error(`Invalid color evaluation: FG: ${fgHex}, BG: ${bgHex}`);
  }

  const l1 = calculateLuminance(fgRgb);
  const l2 = calculateLuminance(bgRgb);

  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);

  return (brightest + 0.05) / (darkest + 0.05);
}

// Define safety targets based on AA specification (WCAG)
const TARGETS = {
  'normal-text': { min: 4.5, description: 'Texto Normal / Pequeno (WCAG AA >= 4.5:1)' },
  'large-text': { min: 3.0, description: 'Texto Grande / Destacado (WCAG AA >= 3.0:1)' },
  'ui-element': { min: 3.0, description: 'Elementos Gráficos & Estado (WCAG AA >= 3.0:1)' },
};

// Key Design Token Pairings in the App UI
const TEST_SUITE: TestPair[] = [
  {
    name: 'Texto Base da Aplicação',
    fg: '#f8fafc',
    bg: '#030712',
    type: 'normal-text',
    component: 'Layout Geral (body)',
  },
  {
    name: 'Brand Cyan em Fundo Escuro',
    fg: '#2dd4bf',
    bg: '#030712',
    type: 'large-text',
    component: 'Cabeçalhos, Logos & Status',
  },
  {
    name: 'Botão de Ação Primário',
    fg: '#000000',
    bg: '#2dd4bf',
    type: 'normal-text',
    component: 'Submissão / Login / Redefinição',
  },
  {
    name: 'Subtítulos e Textos Secundários',
    fg: '#d1d5db',
    bg: '#030712',
    type: 'normal-text',
    component: 'Instruções de formulários',
  },
  {
    name: 'Dicas de Auxílio e Placeholders de Menor Contraste',
    fg: '#9ca3af',
    bg: '#030712',
    type: 'normal-text',
    component: 'Dicas de input / Placeholders',
  },
  {
    name: 'Cinza Crítico Observado no Relatório de Acessibilidade',
    fg: '#7A7A7A', // Gray cited in audit/prompt
    bg: '#030712',
    type: 'normal-text',
    component: 'Metadados e textos de apoio neutros',
  },
  {
    name: 'Erros e Alertas Impeditivos',
    fg: '#fb7185', // rose-400
    bg: '#030712',
    type: 'normal-text',
    component: 'Mensagens de validação inválidas',
  },
  {
    name: 'Feedback de Sucesso Green State',
    fg: '#34d399', // emerald-400
    bg: '#030712',
    type: 'normal-text',
    component: 'Notificação de sucesso / Countdown',
  }
];

function runContrastSuite() {
  console.log('====================================================');
  console.log('      MOTOR DE VERIFICAÇÃO AUTOMÁTICA DE CONTRASTE   ');
  console.log('                PADRÃO WCAG 2.1 AA                  ');
  console.log('====================================================\n');

  let passedAll = true;
  const failureList: string[] = [];

  TEST_SUITE.forEach((item, index) => {
    try {
      const cr = getContrastRatio(item.fg, item.bg);
      const target = TARGETS[item.type];
      const success = cr >= target.min;

      console.log(`${index + 1}. [${item.component}] - "${item.name}"`);
      console.log(`   🎨 Cores: Principal   ${item.fg}  |  Fundo  ${item.bg}`);
      console.log(`   📊 Alvo:  ${target.description}`);
      
      const formattedCR = cr.toFixed(2);
      if (success) {
        console.log(`   ✅ SUCESSO: Contraste calculado de ${formattedCR}:1 (Mínimo requerido: ${target.min}:1)`);
      } else {
        console.log(`   ❌ REJEITADO: Contraste de ${formattedCR}:1 inferior ao alvo de ${target.min}:1!`);
        passedAll = false;
        failureList.push(`${item.name} (${formattedCR}:1 vs ${target.min}:1)`);
      }
      console.log('----------------------------------------------------');
    } catch (err: any) {
      console.log(`   ⚠️ ERRO ao processar par de cores: ${err.message}`);
      passedAll = false;
    }
  });

  console.log('\n====================================================');
  console.log('                 RELATÓRIO FINAL                    ');
  console.log('====================================================');

  if (passedAll) {
    console.log('   🎉 EXCELENTE! Todas as especificações de cores');
    console.log('   estão em estrita conformidade com WCAG AA.');
    console.log('   Nenhuma regressão ou inadequação de contraste detectada.');
    console.log('====================================================');
    process.exit(0);
  } else {
    console.error('   ❌ FALHA: Regressão de contraste encontrada!');
    console.error('   Modificações recentes violam as diretrizes WCAG AA.');
    console.error('   Inadequações detectadas nos seguintes pontos:');
    failureList.forEach(f => console.error(`   - ${f}`));
    console.log('====================================================');
    process.exit(1);
  }
}

runContrastSuite();
