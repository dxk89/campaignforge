/**
 * A social card as a PNG, for anything that cannot take an SVG: Nuelink,
 * and every platform behind it.
 *
 * The browser does this with a canvas for the download button. The server
 * needs its own renderer for the push, and resvg is the smallest one that
 * draws embedded data-URL images, which is how the logo travels. Fonts come
 * from the system; the card's stack ends in Helvetica and Arial, and resvg
 * substitutes a sans-serif when neither exists.
 */
import { Resvg } from '@resvg/resvg-js';

const { renderGraphic } = require('@core/graphics');

export function renderCardPng(graphic: any, brandKit: any, variant: number, logoDataUrl: string | null): Buffer {
  const kit = { ...(brandKit || {}), assets: { ...(brandKit?.assets || {}), logo: logoDataUrl || undefined } };
  const svg: string = renderGraphic(graphic, kit, variant);
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 }, font: { loadSystemFonts: true } });
  return Buffer.from(r.render().asPng());
}
