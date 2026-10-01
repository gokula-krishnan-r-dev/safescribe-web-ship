const PRINT_FRAME_ID = 'ss-print-frame';

/**
 * Native print for a complete HTML document.
 * Uses a same-origin hidden iframe so it is not blocked by pop-up filters
 * and does not depend on window.open() after an async save.
 */
export function printHtmlDocument(html: string): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Print is only available in the browser'));
  }
  const source = String(html ?? '').trim();
  if (!source) return Promise.reject(new Error('Nothing to print'));

  document.getElementById(PRINT_FRAME_ID)?.remove();

  const iframe = document.createElement('iframe');
  iframe.id = PRINT_FRAME_ID;
  iframe.setAttribute('title', 'Print');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  Object.assign(iframe.style, {
    position: 'fixed',
    top: '0',
    left: '-10000px',
    width: '8.5in',
    height: '11in',
    border: '0',
    margin: '0',
    padding: '0',
    background: '#fff',
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let cleaned = false;
    let readyTimer = 0;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.clearTimeout(readyTimer);
      iframe.removeEventListener('load', onReady);
      if (iframe.parentNode) iframe.remove();
    };

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(readyTimer);
      if (err) {
        cleanup();
        reject(err);
        return;
      }
      resolve();
    };

    const triggerPrint = async () => {
      const win = iframe.contentWindow;
      const frameDoc = iframe.contentDocument;
      if (!win || !frameDoc?.body) {
        finish(new Error('Print frame unavailable'));
        return;
      }
      try {
        if (frameDoc.fonts?.ready) {
          // Wait up to 3.5 seconds for fonts to finish loading
          await Promise.race([
            frameDoc.fonts.ready,
            new Promise((resolve) => window.setTimeout(resolve, 3500)),
          ]);
        }
        win.focus();
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            win.print();
            finish();
            win.addEventListener('afterprint', cleanup, { once: true });
            window.setTimeout(cleanup, 60_000);
          });
        });
      } catch (err) {
        finish(err instanceof Error ? err : new Error('Print failed'));
      }
    };

    let printing = false;

    const onReady = () => {
      if (printing) return;
      printing = true;
      window.clearTimeout(readyTimer);
      void triggerPrint();
    };

    iframe.addEventListener('load', onReady, { once: true });
    iframe.srcdoc = source;
    document.body.appendChild(iframe);

    readyTimer = window.setTimeout(() => {
      if (iframe.contentDocument?.body?.childNodes.length) {
        onReady();
        return;
      }
      finish(new Error('Print timed out'));
    }, 8000);
  });
}
