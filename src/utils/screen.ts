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
  { left: 1920, top: 0, width: 1920, height: 1080 },
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
    if (ping > 0 && Date.now() - ping < 4500) {
      return true;
    }
  }
  return false;
}

let globalWatcherTimer: ReturnType<typeof setInterval> | null = null;
let lastKnownOpenState = false;

function ensureGlobalWatcher() {
  if (globalWatcherTimer) return;
  lastKnownOpenState = isSecondaryScreenOpen();
  globalWatcherTimer = setInterval(() => {
    const current = isSecondaryScreenOpen();
    if (current !== lastKnownOpenState) {
      lastKnownOpenState = current;
      notifyListeners();
    }
  }, 800);

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === 'vota_iasd_telao_ping' || e.key === 'vota_iasd_close_telao') {
        const current = isSecondaryScreenOpen();
        if (current !== lastKnownOpenState) {
          lastKnownOpenState = current;
          notifyListeners();
        }
      }
    });
  }
}

export function subscribeSecondaryScreen(callback: (isOpen: boolean) => void): () => void {
  ensureGlobalWatcher();
  listeners.add(callback);
  callback(isSecondaryScreenOpen());
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && globalWatcherTimer) {
      clearInterval(globalWatcherTimer);
      globalWatcherTimer = null;
    }
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

  if (typeof window !== 'undefined') {
    localStorage.removeItem('vota_iasd_telao_ping');
    localStorage.setItem('vota_iasd_close_telao', Date.now().toString());
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('vota_iasd_telao_channel');
        channel.postMessage('CLOSE_TELAO');
        channel.close();
      }
    } catch (_) {}
  }

  notifyListeners();
}

function openWindowOnMonitor(url: string, monitor: MonitorRect, index: number = 0): Window | null {
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
    'fullscreen=yes',
  ].join(',');

  try {
    const popup = window.open(url, 'VotaIASD_TelaoProjetor', windowFeatures);
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      return null;
    }
    try {
      popup.moveTo(monitor.left, monitor.top);
      popup.resizeTo(monitor.width, monitor.height);
      popup.focus();
    } catch (_) {}

    secondaryWindows.set(index, popup);
    return popup;
  } catch (e) {
    console.error(`Falha ao abrir Telão no monitor:`, e);
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
 * Abre o Telão no monitor secundário (se já estiver aberto, foca na janela e nunca duplica)
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
  const primaryExtra =
    cachedExtraMonitors && cachedExtraMonitors.length > 0
      ? cachedExtraMonitors[0]
      : FALLBACK_EXTRA_MONITORS[0];

  const win = openWindowOnMonitor(url, primaryExtra, 0);
  if (win) {
    notifyListeners();
    ensureWindowWatcher();
    return true;
  }

  return false;
}

export async function toggleSecondaryScreen(): Promise<boolean> {
  if (isSecondaryScreenOpen()) {
    closeSecondaryScreen();
    return false;
  } else {
    return await openTelaoOnSecondMonitor();
  }
}
