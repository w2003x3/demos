/**
 * sign-raster.js
 * SVG 字串 → canvas(下載 PNG、駕駛模式月台貼圖共用)。
 * 注意:SVG 以 <img> 載入時無法使用網頁字型,中文會以系統字型(微軟正黑體等)繪製。
 */

export function svgToCanvas(svg, scale = 1) {
    return new Promise((resolve, reject) => {
        const m = svg.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
        const w = m ? +m[1] : 512, h = m ? +m[2] : 512;
        const img = new Image();
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = Math.round(w * scale);
            c.height = Math.round(h * scale);
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            resolve(c);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG 轉點陣失敗')); };
        img.src = url;
    });
}

export function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(/[\\/:*?"<>|]/g, '_');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function downloadSvgAsPng(svg, filename, scale = 2) {
    const c = await svgToCanvas(svg, scale);
    await new Promise(res => c.toBlob(b => { downloadBlob(b, filename); res(); }, 'image/png'));
}
