// Gerenciador de Sons da Urna Eletrônica (TSE)

class UrnaAudioManager {
  private audioContext: AudioContext | null = null;
  private audioEl: HTMLAudioElement | null = null;

  constructor() {
    // Tenta carregar o áudio real MP3
    if (typeof window !== 'undefined') {
      try {
        this.audioEl = new Audio('/urna-confirma.mp3');
        this.audioEl.preload = 'auto';
      } catch (e) {
        console.warn('Não foi possível pré-carregar o arquivo de áudio da urna:', e);
      }
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
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

  // Som Oficial do TSE de Confirmação ("Pirilili-li")
  public playTseConfirma(): void {
    // Tenta primeiro o MP3 autêntico
    if (this.audioEl) {
      this.audioEl.currentTime = 0;
      const playPromise = this.audioEl.play();
      if (playPromise) {
        playPromise.catch((err) => {
          console.warn('Autoplay do MP3 bloqueado ou com falha, usando sintetizador Web Audio API:', err);
          this.synthesizeTseSound();
        });
        return;
      }
    }

    // Se o elemento de áudio não existir ou falhar, sintetiza via Web Audio API
    this.synthesizeTseSound();
  }

  // Síntese por hardware do clássico som da Urna Eletrônica do TSE
  public synthesizeTseSound(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Sequência harmônica clássica do TSE (Pirilili):
      // Tom 1: 1046 Hz (C6) por ~90ms
      // Tom 2: 1318 Hz (E6) por ~90ms
      // Tom 3: 1567 Hz (G6) por ~100ms
      // Tom 4 (Agudo longo): 2093 Hz (C7) por ~450ms
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

        // Curva de envelope para evitar estalos (clicks)
        gain.gain.setValueAtTime(0, now + note.start);
        gain.gain.linearRampToValueAtTime(0.35, now + note.start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur + 0.02);
      });
    } catch (e) {
      console.warn('Erro ao sintetizar som da urna:', e);
    }
  }
}

export const urnaAudio = new UrnaAudioManager();
