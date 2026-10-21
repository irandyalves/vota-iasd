// Gerenciador de Exibição em Múltiplos Monitores Extras (Monitor 2, Monitor 3, Projetores / TVs)

interface MonitorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const secondaryWindows: Map<number, Window> = new Map();
const listeners = new Set<(isOpen: boolean) => void>();
let cachedExtraMonitors: MonitorRect[] | null = null;

// Monitores extras padrão (caso o navegador ainda não tenha liberado getScreenDetails de forma síncrona)
const FALLBACK_EXTRA_MONITORS: MonitorRect[] = [
  { left: 1920, top: 0, width: 2560, height: 1440 },
  { left: 776, top: -1080, width: 1280, height: 720 },
];

// Pré-carrega em background os detalhes de todos os monitores conectados sem travar chamadas síncronas
function refreshScreenDetailsInBackground(): Promise<MonitorRect[] | null> {
  if (typeof window === 'undefined' || !('getScreenDetails' in window)) {
    return Promise.resolve(null);
  }
  try {
    // @ts-ignore
    return Promise.race([
      // @ts-ignore
      window.getScreenDetails().then((details: any) => {
        if (details && Array.isArray(details.screens) && details.screens.length > 1) {
          const extras: MonitorRect[] = details.screens
            .filter((s: any) => s !== details.currentScreen)
            .map((s: any) => ({
              left: s.availLeft ?? s.left ?? 1920,
              top: s.availTop ?? s.top ?? 0,
              width: s.availWidth ?? s.width ?? 1920,
              height: s.availHeight ?? s.height ?? 1080,
            }));
          if (extras.length > 0) {
            cachedExtraMonitors = extras;
            return extras;
          }
        }
        return null;
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 600)),
    ]).catch(() => null);
  } catch (_) {
    return Promise.resolve(null);
  }
}

if (typeof window !== 'undefined') {
  refreshScreenDetailsInBackground();
}

function cleanClosedWindows() {
  for (const [idx, win] of secondaryWindows.entries()) {
    if (!win || win.closed) {
      secondaryWindows.delete(idx);
    }
  }
}

function notifyListeners() {
  cleanClosedWindows();
  const isOpen = isSecondaryScreenOpen();
  listeners.forEach((fn) => {
    try {
      fn(isOpen);
    } catch (_) {}
  });
}

export function isSecondaryScreenOpen(): boolean {
  cleanClosedWindows();
  if (secondaryWindows.size > 0) return true;
  if (typeof window !== 'undefined') {
    const ping = Number(localStorage.getItem('vota_iasd_telao_ping') || 0);
    if (Date.now() - ping < 4500) {
      return true;
    }
  }
  return false;
}

export function subscribeSecondaryScreen(callback: (isOpen: boolean) => void): () => void {
  listeners.add(callback);
  callback(isSecondaryScreenOpen());
  return () => {
    listeners.delete(callback);
  };
}

export function closeSecondaryScreen(): void {
  for (const [, win] of secondaryWindows.entries()) {
    if (win && !win.closed) {
      try {
        win.close();
      } catch (_) {}
    }
  }
  secondaryWindows.clear();
  notifyListeners();
}

function openWindowOnMonitor(url: string, monitor: MonitorRect, index: number): Window | null {
  const existing = secondaryWindows.get(index);
  if (existing && !existing.closed) {
    try {
      existing.moveTo(monitor.left, monitor.top);
      existing.resizeTo(monitor.width, monitor.height);
      existing.focus();
      return existing;
    } catch (_) {
      return existing;
    }
  }

  const windowFeatures = [
    `left=${monitor.left}`,
    `top=${monitor.top}`,
    `width=${monitor.width}`,
    `height=${monitor.height}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=no',
  ].join(',');

  try {
    const popup = window.open(url, `VotaIASD_TelaoProjetor_${index}`, windowFeatures);
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      return null;
    }
    try {
      popup.moveTo(monitor.left, monitor.top);
      popup.resizeTo(monitor.width, monitor.height);
    } catch (_) {}

    secondaryWindows.set(index, popup);
    return popup;
  } catch (e) {
    console.error(`Falha ao abrir Telão no monitor extra ${index + 1}:`, e);
    return null;
  }
}

let checkTimer: ReturnType<typeof setInterval> | null = null;

function ensureWindowWatcher() {
  if (checkTimer) return;
  checkTimer = setInterval(() => {
    const before = secondaryWindows.size;
    cleanClosedWindows();
    if (secondaryWindows.size !== before) {
      notifyListeners();
    }
    if (secondaryWindows.size === 0 && checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
  }, 800);
}

/**
 * Abre o Telão IMEDIATAMENTE (de forma síncrona para nunca perder o gesto do clique e nunca travar)
 * em TODOS os monitores extras disponíveis!
 */
export async function openTelaoOnSecondMonitor(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // Se já existe uma janela ou aba de telão aberta, NUNCA abra outra!
  if (isSecondaryScreenOpen()) {
    cleanClosedWindows();
    for (const [, win] of secondaryWindows.entries()) {
      if (win && !win.closed) {
        try { win.focus(); } catch (_) {}
      }
    }
    return true;
  }

  const url = `${window.location.origin}${window.location.pathname}?view=telao&fullscreen=true`;
  const monitorsToOpen =
    cachedExtraMonitors && cachedExtraMonitors.length > 0
      ? cachedExtraMonitors
      : FALLBACK_EXTRA_MONITORS;

  let anyOpened = false;

  // 1. Disparo SÍNCRONO imediato em todos os monitores extras (evita bloqueio de popup e travamento)
  monitorsToOpen.forEach((mon, idx) => {
    const win = openWindowOnMonitor(url, mon, idx);
    if (win) {
      anyOpened = true;
    }
  });

  if (anyOpened) {
    notifyListeners();
    ensureWindowWatcher();
  }

  // 2. Atualiza em background via Window Management API caso existam outros monitores detectados pelo navegador
  refreshScreenDetailsInBackground().then((detectedExtras) => {
    if (detectedExtras && detectedExtras.length > 0) {
      detectedExtras.forEach((mon, idx) => {
        const win = openWindowOnMonitor(url, mon, idx);
        if (win) {
          anyOpened = true;
        }
      });
      if (anyOpened) {
        notifyListeners();
        ensureWindowWatcher();
      }
    }
  });

  return anyOpened;
}

export async function toggleSecondaryScreen(): Promise<boolean> {
  if (isSecondaryScreenOpen()) {
    closeSecondaryScreen();
    return false;
  } else {
    return await openTelaoOnSecondMonitor();
  }
}
