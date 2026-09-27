/* Pick black or white for each navbar label from the backdrop it actually covers. */
(() => {
  'use strict';

  if (window.__adaptiveNavbarContrast) {
    window.__adaptiveNavbarContrast();
    return;
  }

  const targets = '.navbar-content .left .logo-title, .navbar-content .right .desktop .navbar-list > .navbar-item > a';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 4;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let timer = 0;

  function color(value) {
    const match = typeof value === 'string' && value.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(',').map(Number);
    return parts.length >= 3 ? [parts[0], parts[1], parts[2], parts[3] ?? 1] : null;
  }

  function over(bottom, top) {
    if (!top) return bottom;
    const alpha = Math.min(1, Math.max(0, top[3]));
    return bottom.map((channel, index) => channel * (1 - alpha) + top[index] * alpha);
  }

  function blurPixels(value) {
    const match = String(value).match(/blur\(([\d.]+)px\)/);
    return match ? Number(match[1]) : 0;
  }

  function imagePixel(img, x, y, navBlur) {
    if (!context || !img.complete || !img.naturalWidth) return null;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const style = getComputedStyle(img);
    const scale = style.objectFit === 'cover'
      ? Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
      : Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
    const drawnWidth = img.naturalWidth * scale;
    const drawnHeight = img.naturalHeight * scale;
    const sourceX = (x - rect.left - (rect.width - drawnWidth) / 2) / scale;
    const sourceY = (y - rect.top - (rect.height - drawnHeight) / 2) / scale;
    const banner = img.closest('.home-banner-background');
    const radius = Math.max(2, (navBlur + blurPixels(banner && getComputedStyle(banner).filter)) / scale);
    const left = Math.max(0, sourceX - radius);
    const top = Math.max(0, sourceY - radius);
    const right = Math.min(img.naturalWidth, sourceX + radius);
    const bottom = Math.min(img.naturalHeight, sourceY + radius);
    if (left >= right || top >= bottom) return null;

    try {
      context.clearRect(0, 0, 4, 4);
      context.drawImage(img, left, top, right - left, bottom - top, 0, 0, 4, 4);
      const pixels = context.getImageData(0, 0, 4, 4).data;
      const sum = [0, 0, 0];
      for (let index = pixels.length - 4; index >= 0; index -= 4) {
        for (const channel of [0, 1, 2]) sum[channel] += pixels[index + channel];
      }
      return sum.map(value => value / 16).concat(Number(style.opacity) || 1);
    } catch (_) {
      return banner ? [45, 55, 85, 1] : null;
    }
  }

  function gradientAt(image, x, y, rect) {
    const stops = [...image.matchAll(/rgba?\([^)]+\)/g)].map(match => color(match[0]));
    if (2 > stops.length) return null;
    const angle = Number((image.match(/linear-gradient\(\s*([\d.]+)deg/) || [])[1] || 90) * Math.PI / 180;
    const dx = Math.sin(angle);
    const dy = -Math.cos(angle);
    const corners = [0, rect.width * dx, rect.height * dy, rect.width * dx + rect.height * dy];
    const min = Math.min(...corners);
    const max = Math.max(...corners);
    const projection = (x - rect.left) * dx + (y - rect.top) * dy;
    const t = Math.max(0, Math.min(1, (projection - min) / (max - min || 1)));
    return stops[0].map((channel, index) => channel * (1 - t) + stops[1][index] * t);
  }

  function sample(x, y, nav, navStyle) {
    let result = [255, 255, 255];
    const navBlur = blurPixels(navStyle.backdropFilter || navStyle.webkitBackdropFilter);
    for (const element of document.elementsFromPoint(x, y).reverse()) {
      if (element.closest('.main-content-header')) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      result = over(result, color(style.backgroundColor));
      if (element instanceof HTMLImageElement) {
        result = over(result, imagePixel(element, x, y, navBlur));
      }
    }
    result = over(result, color(navStyle.backgroundColor));
    const image = navStyle.backgroundImage;
    if (image && image !== 'none') {
      result = over(result, gradientAt(image, x, y, nav.getBoundingClientRect()));
    }
    return result;
  }

  function luminance(rgb) {
    const linear = rgb.map(value => {
      const unit = value / 255;
      return 0.04045 >= unit ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function refresh() {
    const nav = document.querySelector('.navbar-container');
    if (!nav || 768 >= window.innerWidth) return;
    const navStyle = getComputedStyle(nav);
    document.querySelectorAll(targets).forEach(element => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || 0 > rect.bottom) return;
      const y = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
      const values = [0.2, 0.5, 0.8].map(fraction =>
        luminance(sample(rect.left + rect.width * fraction, y, nav, navStyle)));
      const whiteContrast = Math.min(...values.map(value => 1.05 / (value + 0.05)));
      const blackContrast = Math.min(...values.map(value => (value + 0.05) / 0.05));
      element.dataset.navContrast = whiteContrast >= blackContrast ? 'light' : 'dark';
    });
  }

  function schedule() {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      refresh();
    }, 60);
  }

  function afterNavigation() {
    schedule();
    document.querySelectorAll('.home-banner-background img').forEach(img => {
      if (!img.complete) img.addEventListener('load', schedule, { once: true });
    });
  }

  function connectSwup(swup) {
    if (!swup?.hooks || swup.__adaptiveNavbarHooked) return;
    swup.__adaptiveNavbarHooked = true;
    swup.hooks.on('content:replace', afterNavigation);
  }

  window.__adaptiveNavbarContrast = schedule;
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);
  window.addEventListener('redefine:swup:ready', event => connectSwup(event.detail.swup));
  if (window.swup) connectSwup(window.swup);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', afterNavigation, { once: true });
  } else {
    afterNavigation();
  }
})();
