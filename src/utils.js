import cwise from 'cwise';

export const rgb2gray = cwise({
    args: ["array", "array", "array", "array"],
    body: function (a, r, g, b) {
        a = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
});

export const rgb2grayCIE = cwise({
    args: ["array", "array", "array", "array"],
    body: function (a, r, g, b) {
        let _r = r / 255,
            _g = g / 255,
            _b = b / 255,
            y;

        _r = (_r > 0.04045) ? Math.pow((_r + 0.055) / 1.055, 2.4) : _r / 12.92;
        _g = (_g > 0.04045) ? Math.pow((_g + 0.055) / 1.055, 2.4) : _g / 12.92;
        _b = (_b > 0.04045) ? Math.pow((_b + 0.055) / 1.055, 2.4) : _b / 12.92;

        y = (_r * 0.2126 + _g * 0.7152 + _b * 0.0722) / 1.00000;

        y = (y > 0.008856) ? Math.pow(y, 1 / 3) : (7.787 * y) + 16 / 116;

        a = Math.round(((116 * y) - 16) / 100 * 255);
    }
});

export const normalize = cwise({
    args: ["array", "array"],
    body: function (a, b) {
        a /= b;
    }
});

export const over = cwise({
    args: ["array", "array", "array"],
    body: function (a, b, mask) {
        a += b * mask;
    }
});

export const clamp = cwise({
    args: ["array", "scalar", "scalar"],
    body: function (a, min, max) {
        a = Math.min(Math.max(a, min), max);
    }
});

export const round = cwise({
    args: ["array"],
    body: function (a) {
        a = Math.round(a);
    }
});

export const contrastStretch = cwise({
    args: ["array", "scalar", "scalar"],
    body: function (a, lower, upper) {
        a = (Math.min(Math.max(a, lower), upper) - lower) * 255 / (upper - lower);
    }
});