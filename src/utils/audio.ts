// Gerenciador de Sons da Urna Eletrônica (TSE)
// Utiliza o áudio autêntico enviado pelo usuário com buffer de baixa latência

class UrnaAudioManager {
  private audioContext: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private audioEl: HTMLAudioElement | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.audioEl = new Audio('/urna-confirma.mp3');
        this.audioEl.preload = 'auto';

        // Pré-carrega o áudio no AudioContext para execução instantânea (latência zero)
        this.preloadAudioBuffer();
      } catch (e) {
        console.warn('Não foi possível pré-carregar o áudio da urna:', e);
      }
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioContext) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  private async preloadAudioBuffer(): Promise<void> {
    try {
      const res = await fetch('/urna-confirma.mp3');
      const arrayBuf = await res.arrayBuffer();
      const ctx = this.getAudioContext();
      if (ctx) {
        this.audioBuffer = await ctx.decodeAudioData(arrayBuf);
      }
    } catch (e) {
      console.warn('Buffer de áudio da urna não pré-carregado (usará HTML5 Audio):', e);
    }
  }

  // Toca o clássico "Bip" ao tocar nas opções (clique de tecla da urna)
  public playKeyBeep(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1050, ctx.currentTime);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.07);
    } catch (e) {
      console.warn('Erro ao reproduzir key beep:', e);
    }
  }

  // Som Oficial da Urna (Tocado com latência zero)
  public playTseConfirma(): void {
    const ctx = this.getAudioContext();

    // 1. Prioridade Máxima: Reprodução via AudioBuffer (instantânea e sem lag)
    if (ctx && this.audioBuffer) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = this.audioBuffer;
        source.connect(ctx.destination);
        source.start(0);
        return;
      } catch (e) {
        console.warn('Erro ao tocar buffer da urna, tentando elemento HTML5 Audio:', e);
      }
    }

    // 2. Segunda opção: HTML5 Audio
    try {
      const audio = new Audio('/urna-confirma.mp3');
      const promise = audio.play();
      if (promise) {
        promise.catch(() => {
          if (this.audioEl) {
            this.audioEl.currentTime = 0;
            this.audioEl.play().catch(() => this.synthesizeTseSound());
          } else {
            this.synthesizeTseSound();
          }
        });
        return;
      }
    } catch (_) {
      this.synthesizeTseSound();
    }
  }

  // Fallback de contingência por hardware
  public synthesizeTseSound(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 1046.5, start: 0.00, dur: 0.08 },
        { freq: 1318.5, start: 0.09, dur: 0.08 },
        { freq: 1567.9, start: 0.18, dur: 0.09 },
        { freq: 2093.0, start: 0.28, dur: 0.45 },
      ];

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.start);
        gain.gain.setValueAtTime(0, now + note.start);
        gain.gain.linearRampToValueAtTime(0.35, now + note.start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur + 0.02);
      });
    } catch (e) {
      console.warn('Erro ao sintetizar som:', e);
    }
  }
}

export const urnaAudio = new UrnaAudioManager();
