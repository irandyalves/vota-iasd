/**
 * Utilitário para processamento inteligente de imagens e remoção automática de fundo ("Fundo Fácil").
 * 
 * Detecta se a imagem enviada possui um fundo uniforme (branco, cinza, preto ou cor sólida uniforme nas bordas)
 * e aplica Flood-Fill com suavização (antialiasing/feathering) via HTML5 Canvas.
 */

export interface RemoveBgResult {
  resultUrl: string;
  removed: boolean;
  bgColor?: string;
  originalUrl?: string;
}

export async function removeEasyBackground(
  imageSrc: string,
  options: {
    tolerance?: number;
    feather?: number;
    maxDimension?: number;
  } = {}
): Promise<RemoveBgResult> {
  if (!imageSrc) {
    return { resultUrl: imageSrc, removed: false };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        let origW = img.naturalWidth || img.width;
        let origH = img.naturalHeight || img.height;

        if (origW === 0 || origH === 0) {
          return resolve({ resultUrl: imageSrc, removed: false });
        }

        // Redimensiona inteligentemente se for muito grande (otimização para Firestore e performance)
        const maxDim = options.maxDimension ?? 512;
        let w = origW;
        let h = origH;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          return resolve({ resultUrl: imageSrc, removed: false });
        }

        // Desenha a imagem no canvas
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // 1. Amostragem das bordas para verificar se já é transparente ou tem fundo fácil
        let transparentEdges = 0;
        let totalEdgesSampled = 0;
        const edgePixels: { r: number; g: number; b: number }[] = [];

        const sampleStep = Math.max(1, Math.floor(Math.min(w, h) / 50));

        const samplePixel = (x: number, y: number) => {
          if (x < 0 || x >= w || y < 0 || y >= h) return;
          totalEdgesSampled++;
          const idx = (y * w + x) * 4;
          const a = data[idx + 3];
          if (a < 25) {
            transparentEdges++;
          } else {
            edgePixels.push({
              r: data[idx],
              g: data[idx + 1],
              b: data[idx + 2],
            });
          }
        };

        // Amostra bordas externas e 2px para dentro (evita bordas de 1px decorativas)
        for (let x = 0; x < w; x += sampleStep) {
          samplePixel(x, 0);
          samplePixel(x, h - 1);
          if (h > 6) {
            samplePixel(x, 2);
            samplePixel(x, h - 3);
          }
        }
        for (let y = 0; y < h; y += sampleStep) {
          samplePixel(0, y);
          samplePixel(w - 1, y);
          if (w > 6) {
            samplePixel(2, y);
            samplePixel(w - 3, y);
          }
        }

        // Se mais de 35% das bordas já forem transparentes, a imagem já é um PNG transparente!
        if (totalEdgesSampled > 0 && transparentEdges / totalEdgesSampled > 0.35) {
          return resolve({ resultUrl: imageSrc, removed: false });
        }

        if (edgePixels.length === 0) {
          return resolve({ resultUrl: imageSrc, removed: false });
        }

        // 2. Agrupa cores das bordas por proximidade (Clustering)
        const clusters: { r: number; g: number; b: number; count: number }[] = [];
        const clusterThreshold = 28; // Tolerância para considerar a mesma cor de fundo

        for (const p of edgePixels) {
          let matched = false;
          for (const c of clusters) {
            const dist = Math.sqrt(
              (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2
            );
            if (dist <= clusterThreshold) {
              c.r = (c.r * c.count + p.r) / (c.count + 1);
              c.g = (c.g * c.count + p.g) / (c.count + 1);
              c.b = (c.b * c.count + p.b) / (c.count + 1);
              c.count++;
              matched = true;
              break;
            }
          }
          if (!matched) {
            clusters.push({ r: p.r, g: p.g, b: p.b, count: 1 });
          }
        }

        // Ordena clusters por frequência decrescente
        clusters.sort((a, b) => b.count - a.count);
        const dominant = clusters[0];
        const coverage = dominant.count / edgePixels.length;

        // É um "fundo fácil"?
        // - Se mais de 40% das bordas tiverem a mesma cor sólida OU
        // - Se for branco/quase branco (R,G,B > 230) com pelo menos 25% de presença nas bordas
        const isWhite = dominant.r > 230 && dominant.g > 230 && dominant.b > 230;
        const isEasy = coverage >= 0.40 || (isWhite && coverage >= 0.25);

        if (!isEasy) {
          // Imagem com fundo complexo / fotografia com cenário variado
          return resolve({ resultUrl: imageSrc, removed: false });
        }

        const bgR = Math.round(dominant.r);
        const bgG = Math.round(dominant.g);
        const bgB = Math.round(dominant.b);

        // 3. Flood Fill a partir de TODAS as bordas (BFS)
        const tolerance = options.tolerance ?? (isWhite ? 40 : 48);
        const feather = options.feather ?? 12;

        const visited = new Uint8Array(w * h);
        const queue: number[] = [];

        const isBgColor = (r: number, g: number, b: number, tol: number) => {
          const d = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
          return d <= tol;
        };

        const enqueue = (x: number, y: number) => {
          if (x < 0 || x >= w || y < 0 || y >= h) return;
          const idx = y * w + x;
          if (visited[idx]) return;
          const pIdx = idx * 4;
          if (isBgColor(data[pIdx], data[pIdx + 1], data[pIdx + 2], tolerance)) {
            visited[idx] = 1;
            queue.push(idx);
          }
        };

        // Enfileira todo o perímetro externo
        for (let x = 0; x < w; x++) {
          enqueue(x, 0);
          enqueue(x, h - 1);
        }
        for (let y = 0; y < h; y++) {
          enqueue(0, y);
          enqueue(w - 1, y);
        }

        // Propaga o Flood Fill para dentro
        let qHead = 0;
        while (qHead < queue.length) {
          const curr = queue[qHead++];
          const cx = curr % w;
          const cy = Math.floor(curr / w);

          const neighbors = [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1],
          ];

          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nIdx = ny * w + nx;
              if (!visited[nIdx]) {
                const npIdx = nIdx * 4;
                if (isBgColor(data[npIdx], data[npIdx + 1], data[npIdx + 2], tolerance)) {
                  visited[nIdx] = 1;
                  queue.push(nIdx);
                }
              }
            }
          }
        }

        // Também limpa bolsões internos fechados que tenham a cor EXATA do fundo (tolerância estrita)
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (!visited[idx]) {
              const pIdx = idx * 4;
              if (isBgColor(data[pIdx], data[pIdx + 1], data[pIdx + 2], 20)) {
                visited[idx] = 1;
              }
            }
          }
        }

        // 4. Aplica transparência e suavização (Feathering) nas bordas
        for (let idx = 0; idx < w * h; idx++) {
          if (visited[idx]) {
            const pIdx = idx * 4;
            const r = data[pIdx];
            const g = data[pIdx + 1];
            const b = data[pIdx + 2];
            const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);

            if (dist <= tolerance - feather) {
              // Fundo sólido total -> 100% transparente
              data[pIdx + 3] = 0;
            } else {
              // Borda de transição -> suavização proporcional de alfa
              const factor = Math.max(0, Math.min(1, (dist - (tolerance - feather)) / feather));
              data[pIdx + 3] = Math.round(data[pIdx + 3] * factor);
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        const resultUrl = canvas.toDataURL('image/png');

        resolve({
          resultUrl,
          removed: true,
          bgColor: `rgb(${bgR}, ${bgG}, ${bgB})`,
          originalUrl: imageSrc,
        });
      } catch (err) {
        console.error('Falha ao processar remoção automática de fundo:', err);
        resolve({ resultUrl: imageSrc, removed: false });
      }
    };

    img.onerror = () => {
      resolve({ resultUrl: imageSrc, removed: false });
    };

    img.src = imageSrc;
  });
}
