// EPT · Etiquetas Zebra de los artículos del almacén.
// Mismo diseño aprobado en el módulo del almacén (26 nov, opción B): nombre en franja negra arriba,
// REFERENCIA, MARCA, recuadro CÓDIGO y barras pequeñas con el número debajo. Etiqueta de 76.2 × 50.8 mm.
// Si el artículo no tiene código de barras, el programa le crea uno (746 + 9 cifras, como el módulo anterior).
(() => {
  const { esc } = EPT;
  EPT.ICONOS.etiqueta = '<path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7.1 7.1a1.4 1.4 0 0 1-2 0z"/><circle cx="8" cy="8" r="1.6"/>';

  // ---------- Estilo de la etiqueta (vista previa y hoja de impresión usan el mismo) ----------
  const CSS_ETQ = `
.etq{width:76.2mm;height:50.8mm;box-sizing:border-box;overflow:hidden;background:#fff;color:#000;font-family:Arial,sans-serif;text-align:left;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.etq+.etq{break-before:page;page-break-before:always}
.etq .etqin{width:100%;height:100%;display:flex;flex-direction:column}
.etq .top{background:#000;color:#fff;padding:1.5mm 2.5mm;font-size:12pt;font-weight:800;line-height:1.1;overflow:hidden;text-transform:uppercase;flex:0 0 auto}
.etq .mid{display:flex;gap:2mm;padding:1.2mm 2.5mm 0;flex:1 1 auto;min-height:0;overflow:hidden}
.etq .dat{flex:1;min-width:0;font-size:10pt;line-height:1.25}
.etq .dat b{display:block;font-size:6.5pt;font-weight:700;letter-spacing:.2mm;margin-top:.3mm}
.etq .dat .ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.etq .cod{border:.5mm solid #000;border-radius:1mm;padding:.8mm 1.5mm;text-align:center;align-self:flex-start;white-space:nowrap}
.etq .cod small{display:block;font-size:6pt;font-weight:700}
.etq .cod span{font-size:14pt;font-weight:800}
.etq .der{display:flex;flex-direction:column;gap:1.2mm;align-items:stretch;flex:0 0 auto}
.etq .bc{flex:0 0 auto;padding:.5mm 2.5mm 1.5mm;text-align:center}
.etq .bc svg{display:block;margin:0 auto;height:7mm;max-width:100%}
.etq .num{font-size:7pt;font-weight:700;letter-spacing:.4mm;line-height:1;margin-top:.4mm}`;
  const estilo = document.createElement('style');
  estilo.textContent = CSS_ETQ + `
.etq-vista{display:flex;justify-content:center;padding:14px;background:var(--panel2);border-radius:8px}
.etq-vista .etq{border:1px solid #9aa0a6;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.15)}
.etq-ajustes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.btn-etq{flex:0 0 auto}
@media (max-width:560px){.etq-ajustes{grid-template-columns:1fr 1fr}.btn-etq{padding:0 8px}.btn-etq .txt{display:none}.etq-vista{padding:8px;overflow:hidden}.etq-vista .etq{zoom:.9}}`;
  document.head.append(estilo);

  // ---------- Código de barras ----------
  // Cada raya mide 3 puntos de la Zebra (0.375 mm a 203 ppp); si el código es muy largo, 2 puntos
  function dibujarBarras(svg, codigo) {
    if (typeof JsBarcode === 'undefined') return false;
    const c = String(codigo);
    const formatos = /^\d{12}$/.test(c) ? ['UPC', 'CODE128'] : /^\d{13}$/.test(c) ? ['EAN13', 'CODE128'] : ['CODE128'];
    for (const fm of formatos) {
      let ok = true;
      try { JsBarcode(svg, c, { format: fm, width: 2, height: 40, displayValue: false, margin: 0, valid: v => { if (!v) ok = false; } }); } catch (e) { ok = false; }
      if (!ok) continue;
      const w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height')), mods = w / 2;
      const mm = mods * 0.375 <= 70 ? 0.375 : 0.25;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('preserveAspectRatio', 'none');
      svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.width = (mods * mm) + 'mm';
      return true;
    }
    return false;
  }

  // Código nuevo, igual que el módulo anterior: 746 + número de 8 cifras + dígito de control (12 cifras, tipo UPC),
  // el siguiente al mayor que ya exista. El servidor no deja que dos artículos tengan el mismo.
  const digitoControl = b => { let o = 0, e = 0; for (let i = 0; i < 11; i++) { if (i % 2 === 0) o += +b[i]; else e += +b[i]; } return (10 - ((o * 3 + e) % 10)) % 10; };
  EPT.codigoBarrasNuevo = async () => {
    const usados = await EPT.leer(EPT.sb.from('productos').select('codigo_barras').like('codigo_barras', '746%'));
    let max = 0;
    for (const { codigo_barras: c } of usados) if (/^746\d{9}$/.test(c)) max = Math.max(max, parseInt(c.slice(3, 11), 10));
    const cuerpo = '746' + String(max + 1).padStart(8, '0');
    return cuerpo + digitoControl(cuerpo);
  };

  // ---------- La etiqueta ----------
  function htmlEtiqueta(p, mover) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const ok = dibujarBarras(svg, p.codigo_barras);
    const dato = (t, v, cls) => v ? `<b>${t}</b><div class="${cls}">${esc(v)}</div>` : '';
    const tr = mover ? ` style="transform:translate(${mover.derecha}mm,${mover.bajar}mm)"` : '';
    return { ok, html: `<div class="etq"><div class="etqin"${tr}><div class="top">${esc(p.descripcion)}</div><div class="mid"><div class="dat">`
      + dato('REFERENCIA', p.numero_parte, 'ell') + dato('MARCA', p.marca_pieza, 'v') + `</div>`
      + `<div class="der"><div class="cod"><small>CÓDIGO</small><span>${esc(p.codigo)}</span></div></div></div>`
      + `<div class="bc">${ok ? svg.outerHTML : ''}<div class="num">${esc(p.codigo_barras)}</div></div></div></div>` };
  }
  // Si el texto no cabe, la letra se achica sola lo justo, sin bajar de lo legible
  const mmPx = mm => mm * 96 / 25.4;
  function ajustar(etq) {
    const top = etq.querySelector('.top'), mid = etq.querySelector('.mid'), dat = etq.querySelector('.dat');
    for (let f = 12; top.offsetHeight > mmPx(13) && f > 8.5;) { f -= .5; top.style.fontSize = f + 'pt'; }
    for (let f = 10; mid.scrollHeight > mid.clientHeight + 1 && f > 7;) { f -= .5; dat.style.fontSize = f + 'pt'; }
  }
  function etiquetaAjustada(p, mover) {
    const e = htmlEtiqueta(p, mover), caja = document.createElement('div');
    caja.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;zoom:1';
    caja.innerHTML = e.html; document.body.append(caja);
    ajustar(caja.firstElementChild);
    e.html = caja.innerHTML; caja.remove();
    return e;
  }

  // Se imprime en una hoja aparte (marco invisible) del tamaño exacto de la etiqueta, sin tocar la pantalla del programa
  function imprimir(html) {
    const marco = document.createElement('iframe');
    marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.append(marco);
    const doc = marco.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta</title><style>${CSS_ETQ}
@page{size:76.2mm 50.8mm;margin:0}html,body{margin:0;padding:0;background:#fff}</style></head><body>${html}</body></html>`);
    doc.close();
    setTimeout(() => {
      marco.contentWindow.focus(); marco.contentWindow.print();
      setTimeout(() => marco.remove(), 1000);
    }, 200);
  }

  // Desplazamiento guardado en este aparato para centrar la impresión en la etiqueta física (mm)
  const CLAVE = 'ept-etiqueta-mover';
  const leerMover = () => { try { const m = JSON.parse(localStorage.getItem(CLAVE) || '{}'); return { bajar: Number(m.bajar) || 0, derecha: Number(m.derecha) || 0 }; } catch (e) { return { bajar: 0, derecha: 0 }; } };
  const mmValido = v => Math.max(-25, Math.min(25, parseFloat(v) || 0));

  // Abre la ventana de la etiqueta. Si el artículo no tiene código de barras, primero le crea uno y lo guarda.
  // guardarBarras(codigo): guarda el código nuevo en el artículo (lo pone quien llama).
  EPT.abrirEtiqueta = async (p, guardarBarras) => {
    let nuevo = false;
    if (!p.codigo_barras) {
      if (!guardarBarras) return EPT.aviso('Este artículo no tiene código de barras. Pídale a quien maneja el almacén que le cree uno.', true);
      const codigo = await EPT.codigoBarrasNuevo();
      await guardarBarras(codigo);
      p = { ...p, codigo_barras: codigo }; nuevo = true;
    }
    const mover = leerMover();
    const e = etiquetaAjustada(p);
    EPT.ventana({
      titulo: 'Etiqueta · ' + p.codigo, boton: 'Imprimir',
      cuerpo: `
        ${nuevo ? `<p class="guia" style="margin:0">El artículo no tenía código de barras. El programa le creó el <b>${esc(p.codigo_barras)}</b> y ya quedó guardado.</p>` : ''}
        <div class="etq-vista">${e.html}</div>
        ${e.ok ? '' : `<p class="error" style="margin:0">No se pudo dibujar el código de barras. Código: ${esc(p.codigo_barras)}</p>`}
        <div class="etq-ajustes">
          <label class="campo">Copias<input name="copias" type="number" min="1" max="100" step="1" inputmode="numeric" value="1"></label>
          <label class="campo">Bajar (mm)<input name="bajar" type="number" min="-25" max="25" step="0.5" inputmode="decimal" value="${mover.bajar}"></label>
          <label class="campo">A la derecha (mm)<input name="derecha" type="number" min="-25" max="25" step="0.5" inputmode="decimal" value="${mover.derecha}"></label>
        </div>
        <p class="mute" style="margin:0;font-size:13px">Si la impresión sale corrida, ajuste «Bajar» o «A la derecha» (con número negativo se mueve al revés). Se recuerda en este aparato.</p>`,
      alGuardar(f) {
        const n = Math.min(100, Math.max(1, parseInt(f.copias.value, 10) || 1));
        const m = { bajar: mmValido(f.bajar.value), derecha: mmValido(f.derecha.value) };
        try { localStorage.setItem(CLAVE, JSON.stringify(m)); } catch (err) {}
        imprimir(etiquetaAjustada(p, m).html.repeat(n));
      },
    });
  };
})();
