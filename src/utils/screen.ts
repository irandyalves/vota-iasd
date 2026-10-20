// Gerenciador de Exibição em Múltiplas Telas (Monitor 2 / Projetor / TV)

export async function openTelaoOnSecondMonitor(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const url = `${window.location.origin}/?view=telao&fullscreen=true`;
  
  // Coordenadas padrão para o 2º monitor no Windows (Extended Desktop)
  // No Windows, o monitor secundário à direita fica em x = availWidth da tela principal
  let targetLeft = window.screen.availWidth || 1920;
  let targetTop = 0;
  let targetWidth = window.screen.availWidth || 1920;
  let targetHeight = window.screen.availHeight || 1080;

  // Window Management API moderna (Chrome / Edge / Chromium)
  // Consegue identificar com precisão qual monitor é o projetor/TV
  if ('getScreenDetails' in window) {
    try {
      // @ts-ignore
      const screenDetails = await window.getScreenDetails();
      if (screenDetails && screenDetails.screens && screenDetails.screens.length > 1) {
        // Encontra o monitor secundário (que não seja a tela atual onde está o Admin)
        const secondaryScreen =
          screenDetails.screens.find((s: any) => s !== screenDetails.currentScreen) ||
          screenDetails.screens[1];

        if (secondaryScreen) {
          targetLeft = secondaryScreen.availLeft;
          targetTop = secondaryScreen.availTop;
          targetWidth = secondaryScreen.availWidth;
          targetHeight = secondaryScreen.availHeight;
          console.log('✅ 2º Monitor detectado com precisão:', secondaryScreen);
        }
      }
    } catch (err) {
      console.log('ℹ️ Permissão de detecção de telas não concedida ou dispensada, usando posicionamento estendido:', err);
    }
  }

  // Tenta abrir janela dedicada posicionada no Monitor 2
  const windowFeatures = [
    `left=${targetLeft}`,
    `top=${targetTop}`,
    `width=${targetWidth}`,
    `height=${targetHeight}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=no',
  ].join(',');

  try {
    const popup = window.open(url, 'VotaIASD_TelaoProjetor', windowFeatures);

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      return false; // Bloqueado pelo navegador
    }

    // Se o popup abriu, foca nele
    popup.focus();
    return true;
  } catch (e) {
    console.error('Falha ao abrir 2ª tela:', e);
    return false;
  }
}
