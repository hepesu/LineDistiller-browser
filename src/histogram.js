import ndarray from 'ndarray';
import {
    clamp
} from './utils';

function buildHist(src, x1, y1, x2, y2) {
    const bins = 256;
    let hist = [];

    for (let i = 0; i < bins; i++)
        hist[i] = 0;

    for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
            hist[src.get(y, x, 0)]++;
        }
    }

    return hist;
}

function buildCDF(hist, normalized, scale) {
    const bins = 256;

    let cumuHist = [];
    cumuHist[0] = hist[0];

    for (let i = 1; i < bins; i++)
        cumuHist[i] = cumuHist[i - 1] + hist[i];

    if (normalized) {
        const total = cumuHist[bins - 1];
        scale = scale || 1;

        for (let i = 0; i < bins; i++)
            cumuHist[i] *= scale / total;
    }

    return cumuHist;
}

function clipHist(hist, clipThreshold) {
    const bins = 256;
    let totalExcess = 0;

    for (let i = 0; i < bins; i++) {
        const binExcess = hist[i] - clipThreshold;
        if (binExcess > 0)
            totalExcess += binExcess;
    }

    const avgBinIncr = totalExcess / bins;
    const upperLimit = clipThreshold - avgBinIncr;

    for (let i = 0; i < bins; i++) {
        if (hist[i] > clipThreshold) {
            hist[i] = clipThreshold;
        } else {
            if (hist[i] > upperLimit) {
                totalExcess -= (clipThreshold - hist[i]);
                hist[i] = clipThreshold;
            } else {
                totalExcess -= avgBinIncr;
                hist[i] += avgBinIncr;
            }
        }
    }

    return hist;
}

export function equalizeHist(src) {
    const hist = buildHist(src, 0, 0, src.shape[1], src.shape[0]);
    const cumuHist = buildCDF(hist, true, 255);

    for (let i = 0; i < src.shape[0]; i++) {
        for (let j = 0; j < src.shape[1]; j++) {
            src.set(i, j, 0, cumuHist[src.get(i, j, 0)]);
        }
    }

    clamp(src, 0, 255);
}

export function equalizeHistAdaptive(src, clipLimit) {
    const h = src.shape[0],
        w = src.shape[1],
        bins = 256;

    const binWidth = 256 / bins;

    // 16,16,2.0 is good value
    const tileSize = [64, 64];
    const xTiles = Math.ceil(w / tileSize[0]);
    const yTiles = Math.ceil(h / tileSize[1]);
    const invTileSize = [1 / tileSize[0], 1 / tileSize[1]];

    let cumuHists = new Array(yTiles);
    for (let i = 0; i < yTiles; i++)
        cumuHists[i] = new Array(xTiles);

    for (let i = 0; i < yTiles; i++) {
        const y1 = i * tileSize[1];
        const y2 = Math.min(y1 + tileSize[1], h);
        for (let j = 0; j < xTiles; j++) {
            const x1 = j * tileSize[0];
            const x2 = Math.min(x1 + tileSize[0], w);

            let hist = buildHist(src, x1, y1, x2, y2);
            if (clipLimit) {
                hist = clipHist(hist, Math.max(1, clipLimit * tileSize[0] * tileSize[1] / bins));
            }

            cumuHists[i][j] = buildCDF(hist, true, 255);
        }
    }

    for (let y = 0; y < src.shape[0]; y++) {
        for (let x = 0; x < src.shape[1]; x++) {
            const imgVal = src.get(y, x, 0);

            const bin = Math.floor(imgVal / binWidth);

            const tx = x * invTileSize[0] - 0.5;
            const ty = y * invTileSize[1] - 0.5;

            const xl = Math.max(Math.floor(tx), 0);
            const xr = Math.min(xl + 1, xTiles - 1);

            const yt = Math.max(Math.floor(ty), 0);
            const yd = Math.min(yt + 1, yTiles - 1);

            const fx = tx - xl;
            const fy = ty - yt;

            const cdf11 = cumuHists[yt][xl][bin];
            const cdf12 = cumuHists[yd][xl][bin];
            const cdf21 = cumuHists[yt][xr][bin];
            const cdf22 = cumuHists[yd][xr][bin];

            const imgValOut =
                (1 - fx) * (1 - fy) * cdf11 +
                (1 - fx) * fy * cdf12 +
                fx * (1 - fy) * cdf21 +
                fx * fy * cdf22;

            src.set(y, x, 0, imgValOut);
        }
    }

    clamp(src, 0, 255);
}