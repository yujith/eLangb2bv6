export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

export function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export function darkenColor(hex, percent = 0.1) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const darker = {
        r: Math.max(0, Math.floor(rgb.r * (1 - percent))),
        g: Math.max(0, Math.floor(rgb.g * (1 - percent))),
        b: Math.max(0, Math.floor(rgb.b * (1 - percent)))
    };
    return rgbToHex(darker.r, darker.g, darker.b);
}

export function lightenColor(hex, percent = 0.1) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const lighter = {
        r: Math.min(255, Math.floor(rgb.r + (255 - rgb.r) * percent)),
        g: Math.min(255, Math.floor(rgb.g + (255 - rgb.g) * percent)),
        b: Math.min(255, Math.floor(rgb.b + (255 - rgb.b) * percent))
    };
    return rgbToHex(lighter.r, lighter.g, lighter.b);
}
