// EPT CONTROL OPERATIVO · Almacén, con la lógica de los albaranes de Libra (Edisa):
// cada movimiento es un DOCUMENTO con número propio por serie, cabecera y varias líneas.
//   IN  Ingreso: factura de compra del suplidor (alimenta el almacén y pone el costo al día) o ingreso interno
//   DP  Despacho a una persona          DS  Devolución al suplidor
//   D   Despacho a Repuestos (por requisición R-, va "en camino" hasta que Repuestos registra el ingreso)
//   TR  Traslado (cambiar de estante)   AJ  Ajuste por conteo
// Palabras de la casa: todo lo que SALE es un DESPACHO, todo lo que ENTRA es un INGRESO.
(function () {
  'use strict';
  const { sb, esc, icono } = EPT;
  Object.assign(EPT.ICONOS, {
    deposito: '<path d="M3 10l9-6 9 6v10H3z"/><path d="M7 20v-6h10v6M7 17h10"/>',
    camion: '<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8"/><circle cx="6" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
    imprimir: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2"/><path d="M6 14h12v7H6z"/>',
    anaquel: '<path d="M4 3v18M20 3v18M4 8h16M4 14h16M4 20h16"/><path d="M7 5h3v3H7zM12 11h4v3h-4zM8 17h3v3H8z"/>',
    ingreso: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
    despacho: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 17v3h16v-3"/>',
    traslado: '<path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4"/>',
    ojo: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    ajuste: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  });
  const num = n => Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
  const dinero = n => 'RD$ ' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ot = n => 'OT-' + String(n).padStart(5, '0');
  const fecha = f => f ? new Date(f).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const fechaCorta = f => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const REQ = { nueva: ['Nueva', 'aviso'], pendiente: ['Pendiente', 'aviso'], aprobada: ['Aprobada', 'info'], parcial: ['Aprobada en parte', 'info'],
    rechazada: ['Rechazada', 'malo'], sin_existencia: ['Sin existencia', 'malo'], cancelada: ['Cancelada', ''], recibida: ['Completada', 'ok'] };
  const DES = { en_preparacion: ['En preparación', 'aviso'], en_transito: ['En camino', 'info'], recibida: ['Ingresado', 'ok'],
    con_diferencia: ['Con diferencia', 'malo'], diferencia_resuelta: ['Diferencia resuelta', 'ok'] };
  const chip = (m, k) => { const [t, c] = m[k] || [k, '']; return `<span class="estado ${c}">${esc(t)}</span>`; };
  const dn = n => 'D-' + n, rn = n => 'R-' + n;
  const codDoc = d => d.serie + '-' + String(d.numero).padStart(4, '0');
  const puedeAlm = p => EPT.puede('almacen.' + p);
  const manejaAlmacen = () => ['articulos', 'ingreso', 'despacho', 'traslado', 'ajustar', 'resolver', 'transferir'].some(puedeAlm);
  const CLASE_ART = { pieza: 'Pieza', insumo: 'Insumo', miscelaneo: 'Misceláneo', producto: 'Producto' };
  // tipo de artículo que se propone según la familia (se puede cambiar)
  const CLASE_DE_FAMILIA = { 'Lubricantes, aceites y grasas': 'insumo', 'Tornillería': 'insumo', 'Misceláneos y gastables': 'miscelaneo',
    'Guantes, bombillos y limpieza': 'miscelaneo', 'Herramientas y equipos': 'miscelaneo', 'Materiales de mantenimiento': 'miscelaneo' };

  // Qué es cada documento: nombre, para qué sirve, quién puede hacerlo
  const DOC = {
    compra:   { tipo: 'ingreso',  nombre: 'Factura de compra',       corto: 'Compra',     permiso: 'ingreso' },
    interno:  { tipo: 'ingreso',  nombre: 'Ingreso interno',         corto: 'Interno',    permiso: 'ingreso' },
    persona:  { tipo: 'despacho', nombre: 'Despacho a una persona',  corto: 'A una persona', permiso: 'despacho' },
    suplidor: { tipo: 'despacho', nombre: 'Devolución al suplidor',  corto: 'Devolución al suplidor', permiso: 'despacho' },
    traslado: { tipo: 'traslado', nombre: 'Traslado',                corto: 'Traslado',   permiso: 'traslado' },
    conteo:   { tipo: 'ajuste',   nombre: 'Ajuste por conteo',       corto: 'Ajuste',     permiso: 'ajustar' },
  };
  const LISTA_DE = { ingreso: 'alm_ingresos', despacho: 'alm_despachos', traslado: 'alm_traslados', ajuste: 'alm_ajustes' };

  // =====================================================================
  // Existencia del almacén, por familias y subfamilias
  // El Almacén la maneja; Repuestos solo la consulta para hacer sus pedidos.
  // =====================================================================
  let claseInv = '', famInv = '', subInv = '', buscaInv = '', soloInv = ''; // soloInv: '' todo · 'bajo' bajo el mínimo · 'cero' agotados
  // Lo que el buscador también entiende de un artículo del almacén (además de código, nombre, referencia y barras),
  // y la segunda línea que se ve en cada resultado: cuánto hay, el tipo, la familia y el estante.
  const extraAlm = F => p => [F.nombre(p.subfamilia_id), CLASE_ART[p.clase_articulo], p.marca_pieza, p.estante ? 'estante ' + p.estante : ''].join(' ');
  const detalleAlm = F => p => `<span class="${p.hay <= 0 ? 'txt-malo' : bajo(p) ? 'txt-aviso' : ''}">${p.hay <= 0 ? 'No hay' : `Hay <b>${num(p.hay)}</b> ${esc(p.unidad)}`}</span>`
    + [CLASE_ART[p.clase_articulo], F.porSub.get(p.subfamilia_id)?.nombre, p.estante ? 'Estante ' + p.estante : ''].filter(Boolean).map(x => ' · ' + esc(x)).join('');
  // botones de tipo (Todo · Piezas · Insumos · Misceláneos), con cuántos hay de cada uno
  const CLASES_PLURAL = [['', 'Todo'], ['pieza', 'Piezas'], ['insumo', 'Insumos'], ['miscelaneo', 'Misceláneos'], ['producto', 'Productos']];
  const botonesClase = (arts, actual) => `<div class="seg seg-ancho botones-clase" role="group" aria-label="Tipo de artículo">${CLASES_PLURAL
    .map(([k, t]) => [k, t, k ? arts.filter(p => p.clase_articulo === k).length : arts.length]).filter(([k, , n]) => !k || n)
    .map(([k, t, n]) => `<button type="button" data-clase="${k}" aria-pressed="${k === actual}">${esc(t)} <small>${n}</small></button>`).join('')}</div>`;
  const cargarInventario = () => EPT.leer(sb.from('productos')
    .select('id,codigo,descripcion,unidad,marca_pieza,numero_parte,minimo,notas,subfamilia_id,cobrable,codigo_barras,estante,empaque_nombre,empaque_unidades,activo,precio,precios_extra,costo,ultimo_costo,clase_articulo,existencias(ubicacion,cantidad)')
    .eq('en_almacen', true).order('codigo'))
    .then(l => l.map(p => ({ ...p, hay: Number((p.existencias || []).find(e => e.ubicacion === 'almacen')?.cantidad || 0) })));
  const bajo = p => Number(p.minimo) > 0 && p.hay <= Number(p.minimo);
  // Lo que queda de cada artículo, resaltado a la derecha del renglón: verde si hay, ámbar si llegó al mínimo, rojo si se agotó
  const cuadroQueda = p => {
    const est = p.hay <= 0 ? 'agotado' : bajo(p) ? 'bajo' : 'hay';
    return `<div class="queda ${est}"><small>${est === 'agotado' ? 'Agotado' : est === 'bajo' ? 'Quedan pocos' : 'Quedan'}</small>
      <b>${num(p.hay)}</b><span>${esc(p.unidad)}</span>${enEmpaques(p) ? `<small class="cj">${esc(enEmpaques(p))}</small>` : ''}${Number(p.minimo) > 0 ? `<small class="cj">mín. ${num(p.minimo)}</small>` : ''}</div>`;
  };
  // La existencia dicha como se cuenta en el estante: "2 cajas de 10 y 3 sueltas" (solo si el artículo tiene empaque)
  const tieneEmpaque = p => Number(p.empaque_unidades) > 1 && !!p.empaque_nombre;
  const empaquePlural = (p, n) => { const e = String(p.empaque_nombre).toLowerCase(); return n === 1 ? e : /[aeiou]$/.test(e) ? e + 's' : e + 'es'; };
  const enEmpaques = (p, n = p.hay) => {
    if (!tieneEmpaque(p) || !(n > 0)) return '';
    const e = Number(p.empaque_unidades), c = Math.floor(n / e), r = Math.round((n - c * e) * 100) / 100;
    return [c ? `${num(c)} ${empaquePlural(p, c)} de ${num(e)}` : '', r ? `${num(r)} suelta${r === 1 ? '' : 's'}` : ''].filter(Boolean).join(' y ');
  };

  EPT.pantalla({
    id: 'inventario', titulo: 'Existencia del almacén', subtitulo: 'Por familia y subfamilia, con existencia y mínimo',
    pestana: 'Existencia', explica: 'Lo que hay en el almacén ahora mismo, por familia. Toque un artículo para ver su ficha y sus movimientos.',
    icono: 'anaquel', grupo: 'Almacén', atajo: 'Existencia', peso: 1,
    ver: () => manejaAlmacen() || ['repuestos.requisicion', 'repuestos.despachar', 'reportes.ver'].some(p => EPT.puede(p)),
    async mostrar(v) {
      if (puedeAlm('articulos')) {
        EPT.$('#barraBotones').innerHTML = `<button type="button" class="prin" id="btnNuevoArt">${icono('mas')}Crear artículo</button>`;
        EPT.$('#btnNuevoArt').addEventListener('click', () => editarArticulo(null));
      }
      const [arts, F] = await Promise.all([cargarInventario(), EPT.cargarFamilias()]);
      const activos = EPT.alfabetico(arts.filter(p => p.activo));
      const bp = EPT.buscadorPiezas(activos, { extra: extraAlm(F) });
      if (claseInv && !activos.some(p => p.clase_articulo === claseInv)) claseInv = '';
      const deClase = activos.filter(p => !claseInv || p.clase_articulo === claseInv);
      const deFam = fid => deClase.filter(p => F.porSub.get(p.subfamilia_id)?.familia_id === fid);
      const famsCon = F.fams.filter(f => deFam(f.id).length);
      if (famInv && !famsCon.some(f => f.id === famInv)) { famInv = ''; subInv = ''; }
      v.innerHTML = `
        ${manejaAlmacen() ? '' : `<p class="guia" style="margin-top:0">${icono('ojo')}Solo para consultar. Para pedir algo al almacén use la pestaña «Pedidos al almacén» de Repuestos.</p>`}
        <div class="buscador grande">${icono('buscar')}<input id="bInv" type="search" value="${esc(buscaInv)}" placeholder="Escriba lo que busca: aceite atf, guantes, filtro corolla… o escanee el código"></div>
        ${botonesClase(activos, claseInv)}
        <div class="filtros-inv">
          <label class="campo">Familia<select id="fFam"><option value="">Todas las familias (${deClase.length})</option>
            ${famsCon.map(f => `<option value="${f.id}" ${f.id === famInv ? 'selected' : ''}>${esc(f.nombre)} (${deFam(f.id).length})</option>`).join('')}</select></label>
          <label class="campo">Subfamilia<select id="fSub" ${famInv ? '' : 'disabled'}><option value="">Todas</option>
            ${famInv ? F.subsDe(famInv).filter(s => deClase.some(p => p.subfamilia_id === s.id)).map(s => `<option value="${s.id}" ${s.id === subInv ? 'selected' : ''}>${esc(s.nombre)} (${deClase.filter(p => p.subfamilia_id === s.id).length})</option>`).join('') : ''}</select></label>
        </div>
        <div class="contadores" style="margin:0 0 12px"><span id="cVan"></span>
          <button type="button" class="filtro-cont aviso" data-solo="bajo" aria-pressed="${soloInv === 'bajo'}"><b id="cBajo">0</b> bajo el mínimo: reponer</button>
          <button type="button" class="filtro-cont malo" data-solo="cero" aria-pressed="${soloInv === 'cero'}"><b id="cCero">0</b> agotados</button></div>
        <div class="panel" id="listaInv"></div>`;
      v.querySelectorAll('[data-clase]').forEach(b => b.addEventListener('click', () => { claseInv = b.dataset.clase; famInv = ''; subInv = ''; EPT.recargar(); }));
      v.querySelector('#fFam').addEventListener('change', e => { famInv = e.target.value; subInv = ''; EPT.recargar(); });
      v.querySelector('#fSub').addEventListener('change', e => { subInv = e.target.value; pintar(); });
      v.querySelectorAll('[data-solo]').forEach(b => b.addEventListener('click', () => {
        soloInv = soloInv === b.dataset.solo ? '' : b.dataset.solo;
        v.querySelectorAll('[data-solo]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.solo === soloInv))); pintar();
      }));
      const caja = v.querySelector('#listaInv');
      const pintar = () => {
        // con algo escrito, lo más parecido primero; sin nada, en orden alfabético
        const base = buscaInv.trim() ? bp.buscar(buscaInv, Infinity) : activos;
        const filtrada = base.filter(p => (!claseInv || p.clase_articulo === claseInv) && (!famInv || F.porSub.get(p.subfamilia_id)?.familia_id === famInv) && (!subInv || p.subfamilia_id === subInv));
        // «bajo el mínimo» incluye los agotados que tienen mínimo: es la lista de lo que hay que reponer
        const lista = soloInv === 'bajo' ? filtrada.filter(bajo) : soloInv === 'cero' ? filtrada.filter(p => p.hay <= 0) : filtrada;
        v.querySelector('#cVan').innerHTML = `<b>${lista.length}</b> artículo${lista.length === 1 ? '' : 's'}`;
        v.querySelector('#cBajo').textContent = filtrada.filter(bajo).length;
        v.querySelector('#cCero').textContent = filtrada.filter(p => p.hay <= 0).length;
        caja.innerHTML = lista.length ? `<ul class="lista">${lista.map(p => `<li class="toca" data-a="${p.id}"><span class="codigo">${esc(p.codigo)}</span>
            <div class="q"><b>${esc(p.descripcion)}</b><span>${[CLASE_ART[p.clase_articulo], F.nombre(p.subfamilia_id), p.marca_pieza, p.numero_parte, p.estante ? 'Estante ' + p.estante : '', p.cobrable ? '' : 'No se cobra'].filter(Boolean).map(esc).join(' · ')}</span></div>
            <button type="button" class="liso peque btn-etq" data-etq="${p.id}" title="Imprimir la etiqueta con código de barras">${icono('etiqueta')}<span class="txt">Etiqueta</span></button>
            ${cuadroQueda(p)}</li>`).join('')}</ul>`
          : `<div class="vacio">${!arts.length ? 'Todavía no hay artículos en el almacén.' : soloInv === 'bajo' ? 'Nada bajo el mínimo: no hay que reponer.' : soloInv === 'cero' ? 'No hay artículos agotados.' : 'No hay artículos con esa búsqueda.'}</div>`;
      };
      let t; const bi = v.querySelector('#bInv');
      bi.addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { buscaInv = e.target.value; pintar(); }, 150); });
      // el lector de código de barras escribe el código y da Enter: si es exacto, abre el artículo
      bi.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const c = bi.value.trim(); const p = activos.find(x => x.codigo_barras === c || x.codigo.toUpperCase() === c.toUpperCase());
        if (p) { e.preventDefault(); bi.select(); fichaArticulo(p, F); }
      });
      caja.addEventListener('click', e => {
        const be = e.target.closest('[data-etq]');
        if (be) return etiquetaDe(activos.find(p => p.id === be.dataset.etq)).catch(err => EPT.aviso(EPT.error(err), true));
        const li = e.target.closest('[data-a]'); if (li) fichaArticulo(activos.find(p => p.id === li.dataset.a), F);
      });
      pintar();
    },
  });

  // Lector de código de barras (ver comun.js): una pieza del almacén escaneada abre su ficha;
  // un código que no existe, quien crea artículos lo puede registrar de una vez.
  EPT.abridores.push(async prod => {
    if (!prod.en_almacen || !EPT.puedeVer('inventario')) return false;
    const [arts, F] = await Promise.all([cargarInventario(), EPT.cargarFamilias()]);
    const p = arts.find(x => x.id === prod.id); if (!p) return false;
    fichaArticulo(p, F); return true;
  });
  EPT.alDesconocido = codigo => {
    if (!puedeAlm('articulos')) return false;
    EPT.ventana({ titulo: 'Código no registrado', boton: 'Crear artículo nuevo',
      cuerpo: `<p style="margin:0">El código de barras <b>${esc(codigo)}</b> no está en el programa.</p>
        <p class="mute" style="margin:0">Si es mercancía nueva, créela aquí y después regístrela en una factura de compra.</p>`,
      alGuardar: () => { editarArticulo(null, { barras: codigo }); } });
    return true;
  };

  // ---------- Ficha de un artículo: datos, existencia, botones y su historial ----------
  async function fichaArticulo(p, F) {
    const [movs, regs, viejo] = await Promise.all([
      EPT.leer(sb.from('movimientos_inventario').select('fecha,cantidad,tipo,nota,usuario:usuarios(nombre)').eq('producto_id', p.id).eq('ubicacion', 'almacen').order('fecha', { ascending: false }).limit(30)),
      EPT.leer(sb.from('almacen_registros').select('fecha,tipo,antes,despues,nota,usuario:usuarios(nombre)').eq('producto_id', p.id).eq('tipo', 'traslado').order('fecha', { ascending: false }).limit(10)),
      EPT.leer(sb.from('historial_almacen_viejo').select('fecha,tipo,cantidad,presentacion,nota').eq('producto_id', p.id).order('fecha', { ascending: false }).limit(30)),
    ]);
    const TIPO = { ingreso_almacen: 'Ingreso', despacho_persona: 'Despacho a una persona', devolucion_suplidor: 'Devolución al suplidor', transferencia_salida: 'Despacho a Repuestos',
      transferencia_diferencia: 'Diferencia de despacho', ajuste: 'Ajuste', carga_inicial: 'Existencia inicial', importacion: 'Importación' };
    const hist = [
      ...movs.map(m => ({ f: m.fecha, t: `${TIPO[m.tipo] || m.tipo} ${Number(m.cantidad) > 0 ? '+' : ''}${num(m.cantidad)}`, n: m.nota, q: m.usuario?.nombre })),
      ...regs.map(r => ({ f: r.fecha, t: 'Traslado', n: `Estante ${r.antes || '—'} → ${r.despues || '—'}${r.nota ? ' · ' + r.nota : ''}`, q: r.usuario?.nombre })),
      ...viejo.map(h => ({ f: h.fecha, t: `${h.tipo} ${num(h.cantidad)}`, n: [h.presentacion, h.nota].filter(Boolean).join(' · '), q: 'programa anterior' })),
    ].sort((a, b) => String(b.f).localeCompare(String(a.f))).slice(0, 40);
    // cada botón abre el documento con este artículo ya puesto (se le pueden agregar más)
    const botones = [
      puedeAlm('ingreso') && ['compra', 'ingreso', 'Factura de compra', 'prin'],
      puedeAlm('despacho') && ['persona', 'despacho', 'Despacho a una persona', ''],
      puedeAlm('traslado') && ['traslado', 'traslado', 'Traslado', ''],
      puedeAlm('ajustar') && ['conteo', 'ajuste', 'Ajustar', 'liso'],
      puedeAlm('articulos') && ['editar', '', 'Editar', 'liso'],
    ].filter(Boolean);
    EPT.ventana({
      titulo: p.codigo + ' · ' + p.descripcion, boton: '',
      cuerpo: `
        <div class="existencia-grande"><b class="${bajo(p) ? 'txt-malo' : ''}">${num(p.hay)}</b> ${esc(p.unidad)} en el almacén${enEmpaques(p) ? ` <span class="en-cajas">(${esc(enEmpaques(p))})</span>` : ''}
          ${Number(p.minimo) > 0 ? `<span class="mute">· mínimo ${num(p.minimo)}</span>` : ''}${bajo(p) ? ' <span class="estado malo">Bajo el mínimo</span>' : ''}</div>
        <dl class="datos">
          <div><dt>Es</dt><dd>${esc(CLASE_ART[p.clase_articulo] || 'Pieza')}</dd></div>
          <div class="ancho"><dt>Familia · Subfamilia</dt><dd>${esc(F.nombre(p.subfamilia_id))}</dd></div>
          <div><dt>Estante</dt><dd>${esc(p.estante || '—')}</dd></div>
          <div><dt>Precio de venta</dt><dd>${Number(p.precio) > 0 ? dinero(p.precio) : '<span class="txt-aviso">Sin precio</span>'}</dd></div>
          ${(p.precios_extra || []).length ? `<div class="ancho"><dt>Otros precios (pieza suelta del kit)</dt><dd>${EPT.otrosPreciosTexto(p.precios_extra)}</dd></div>` : ''}
          ${puedeAlm('articulos') || puedeAlm('ingreso') ? `<div><dt>Último costo</dt><dd>${Number(p.ultimo_costo) > 0 ? dinero(p.ultimo_costo) : '—'}</dd></div>
            <div><dt>Costo promedio</dt><dd>${Number(p.costo) > 0 ? dinero(p.costo) : '—'}</dd></div>` : ''}
          ${puedeAlm('articulos') ? '' : `<div><dt>Al cliente</dt><dd>${p.cobrable ? 'Se cobra' : 'No se cobra'}</dd></div>`}
          ${p.marca_pieza ? `<div><dt>Marca</dt><dd>${esc(p.marca_pieza)}</dd></div>` : ''}
          ${p.numero_parte ? `<div><dt>Referencia</dt><dd>${esc(p.numero_parte)}</dd></div>` : ''}
          ${p.empaque_nombre ? `<div><dt>Empaque</dt><dd>${esc(p.empaque_nombre)} de ${num(p.empaque_unidades)}</dd></div>` : ''}
          ${p.codigo_barras ? `<div><dt>Código de barras</dt><dd>${esc(p.codigo_barras)}</dd></div>` : ''}
          ${p.notas ? `<div class="ancho"><dt>Notas</dt><dd>${esc(p.notas)}</dd></div>` : ''}
        </dl>
        ${puedeAlm('articulos') ? EPT.botonesCobro(p.cobrable, { etiqueta: 'Cuando se usa en una orden' }) : ''}
        ${botones.length ? `<div class="botones-ficha">${botones.map(([a, ic, t, c]) => `<button type="button" class="${c}" data-x="${a}">${ic ? icono(ic) : ''}${t}</button>`).join('')}</div>`
          : `<p class="mute" style="margin:0">Solo para consultar: el almacén lo despacha a Repuestos por requisición.</p>`}
        <div class="campo">Movimientos<ul class="lista corta">${hist.length ? hist.map(h => `<li><div class="q"><b>${esc(h.t)}</b><span>${fecha(h.f)}${h.q ? ' · ' + esc(h.q) : ''}${h.n ? ' · ' + esc(h.n) : ''}</span></div></li>`).join('')
          : '<li><div class="q"><span>Sin movimientos todavía.</span></div></li>'}</ul></div>`,
      alAbrir(f, d) {
        if (puedeAlm('articulos')) EPT.enlazarCobro(f, async val => {
          await EPT.rpc('ept_producto_clasificar', { p_producto: p.id, p_subfamilia: p.subfamilia_id, p_cobrable: val });
          p.cobrable = val; EPT.aviso(val ? 'Ahora se cobra al cliente' : 'Ahora no se cobra al cliente'); EPT.recargar();
        });
        f.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', async () => {
          d.close();
          if (b.dataset.x === 'editar') return editarArticulo(p);
          await EPT.ir(LISTA_DE[DOC[b.dataset.x].tipo]);
          nuevoDocumento(b.dataset.x, [p.id]);
        }));
      },
    });
  }

  // ---------- Etiqueta Zebra (etiquetas.js) ----------
  // Si el artículo no tiene código de barras, se le crea uno y se guarda sin cambiar ningún otro dato
  function etiquetaDe(p) {
    return EPT.abrirEtiqueta(p, puedeAlm('articulos') ? async codigo => {
      await EPT.rpc('ept_almacen_articulo_guardar', { p: {
        id: p.id, descripcion: p.descripcion, subfamilia_id: p.subfamilia_id, cobrable: p.cobrable, clase_articulo: p.clase_articulo || 'pieza',
        precio: p.precio, precios_extra: p.precios_extra || [], unidad: p.unidad, marca_pieza: p.marca_pieza, numero_parte: p.numero_parte, minimo: p.minimo,
        empaque_nombre: p.empaque_nombre, empaque_unidades: p.empaque_unidades, codigo_barras: codigo, notas: p.notas } });
      p.codigo_barras = codigo; EPT.olvidar('productos');
    } : null);
  }

  // ---------- Crear o editar un artículo (como la ficha de artículo de Libra) ----------
  // Al escribir el nombre de uno nuevo, el programa lo ubica solo en su familia (automática, CVT, mecánica, eléctrica…)
  // y propone qué es (pieza, insumo, misceláneo o producto). Se puede cambiar.
  // op: { barras, nombre, despues(r) } — despues recibe {id, codigo} del artículo guardado.
  async function editarArticulo(p, op = {}) {
    const F = await EPT.cargarFamilias();
    const nuevo = !p;
    const nombre0 = p ? p.descripcion : (op.nombre || '');
    const subIni = p ? p.subfamilia_id : (nombre0 ? EPT.clasificar(nombre0, F) : (subInv || (famInv ? F.subsDe(famInv)[0]?.id : '')));
    const claseDe = sid => CLASE_DE_FAMILIA[F.porSub.get(sid)?.familia.nombre] || 'pieza';
    const clase0 = p ? p.clase_articulo || 'pieza' : (subIni ? claseDe(subIni) : 'pieza');
    EPT.ventana({
      titulo: nuevo ? 'Crear artículo' : 'Editar ' + p.codigo, boton: 'Guardar',
      cuerpo: `
        <label class="campo">Nombre<input name="desc" maxlength="160" required value="${esc(nombre0)}" placeholder="Ej. Solenoide de cambio A, 4L60E"></label>
        <div class="campo">¿Qué es?
          <div class="seg clase-art" role="group" aria-label="Qué es">${Object.entries(CLASE_ART).map(([k, t]) => `<button type="button" data-cl="${k}" aria-pressed="${k === clase0}">${t}</button>`).join('')}</div>
          <input type="hidden" name="clase" value="${clase0}"></div>
        <div class="dos">${EPT.selectFamilias(F, subIni)}</div>
        <p class="pista" id="ubicado" ${nuevo && subIni ? '' : 'hidden'}>El programa lo ubicó en <b id="ubicadoEn">${esc(F.nombre(subIni))}</b>. Si no es ahí, cámbielo.</p>
        <p class="mute" style="margin:-6px 0 0"><button type="button" class="liso peque" id="btnNuevaSub">${icono('mas')}Agregar una familia o subfamilia</button></p>
        ${EPT.botonesCobro(p ? p.cobrable : null, { etiqueta: 'Cuando se usa en una orden' })}
        <div class="dos"><label class="campo">Precio de venta RD$<input name="precio" type="number" min="0" step="any" inputmode="decimal" value="${p && Number(p.precio) > 0 ? p.precio : ''}"></label>
          ${p ? `<div class="campo">Costo <small class="opc">(lo ponen las facturas de compra)</small><span class="valor-fijo">Último ${Number(p.ultimo_costo) > 0 ? dinero(p.ultimo_costo) : '—'} · Promedio ${Number(p.costo) > 0 ? dinero(p.costo) : '—'}</span></div>` : '<div></div>'}</div>
        ${EPT.otrosPreciosCampos(p ? p.precios_extra : [])}
        <div class="dos"><label class="campo">Marca <small class="opc">(opcional)</small><input name="marca" maxlength="60" value="${esc(p ? p.marca_pieza : '')}"></label>
          <label class="campo">Referencia <small class="opc">(opcional)</small><input name="ref" maxlength="60" value="${esc(p ? p.numero_parte : '')}"></label></div>
        <div class="dos"><label class="campo">Unidad<select name="unidad">${['UNID', 'GALÓN', 'LITRO', 'CUARTO', 'PAR', 'JUEGO', 'PIE', 'METRO', 'LIBRA', 'CAJAS'].map(u => `<option ${u === (p ? p.unidad : 'UNID') ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
          <label class="campo">Mínimo de reposición<input name="minimo" type="number" min="0" step="any" inputmode="decimal" value="${p ? Number(p.minimo) || '' : ''}"></label></div>
        <div class="dos"><label class="campo">Empaque <small class="opc">(opcional)</small><select name="emp"><option value="">Ninguno</option>${['Caja', 'Paquete', 'Docena'].map(e => `<option ${p && p.empaque_nombre === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
          <label class="campo">Unidades por empaque<input name="porEmp" type="number" min="1" step="1" inputmode="numeric" value="${p && p.empaque_nombre && Number(p.empaque_unidades) >= 1 ? p.empaque_unidades : ''}"></label></div>
        ${nuevo ? `<label class="campo">Estante <small class="opc">(opcional)</small><input name="estante" maxlength="40"></label>` : ''}
        <div class="dos"><label class="campo">Código <small class="opc">${nuevo ? '(vacío = se pone solo, ej. SOL-001)' : ''}</small><input name="codigo" maxlength="30" value="${esc(p ? p.codigo : '')}" ${nuevo ? '' : 'disabled'}></label>
          <label class="campo">Código de barras <small class="opc">(opcional)</small><input name="barras" maxlength="40" value="${esc(p ? p.codigo_barras : op.barras || '')}" placeholder="Escanéelo aquí"></label></div>
        <label class="campo">Notas <small class="opc">(opcional)</small><input name="notas" maxlength="300" value="${esc(p ? p.notas : '')}"></label>
        ${nuevo ? '<p class="mute" style="margin:0">La existencia entra con una factura de compra o un ingreso interno.</p>' : ''}`,
      alAbrir(f, d) {
        EPT.enlazarCobro(f);
        EPT.enlazarOtrosPrecios(f);
        const segClase = [...f.querySelectorAll('.clase-art [data-cl]')];
        const ponerClase = k => { f.clase.value = k; segClase.forEach(b => b.setAttribute('aria-pressed', b.dataset.cl === k)); };
        segClase.forEach(b => b.addEventListener('click', () => { ponerClase(b.dataset.cl); claseTocada = true; }));
        let familiaTocada = !nuevo, claseTocada = !nuevo;
        EPT.enlazarFamilias(F, f, (fam, sub) => { familiaTocada = true; f.querySelector('#ubicado').hidden = true; if (!claseTocada && sub) ponerClase(claseDe(sub)); });
        // mientras escribe el nombre de uno nuevo, el programa lo va ubicando (hasta que la persona elija a mano)
        if (nuevo) f.desc.addEventListener('input', () => {
          if (familiaTocada) return;
          const sid = EPT.clasificar(f.desc.value, F); if (!sid) return;
          const s = F.porSub.get(sid);
          f.familia.value = s.familia_id;
          f.subfamilia.innerHTML = F.subsDe(s.familia_id).map(x => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('');
          f.subfamilia.value = sid;
          f.querySelector('#ubicadoEn').textContent = F.nombre(sid); f.querySelector('#ubicado').hidden = false;
          if (!claseTocada) ponerClase(claseDe(sid));
        });
        f.querySelector('#btnNuevaSub').addEventListener('click', () => { d.close(); nuevaSubfamilia(F, () => editarArticulo(p, op)); });
      },
      async alGuardar(f) {
        if (!f.desc.value.trim()) { f.desc.classList.add('falta'); f.desc.focus(); throw new Error('Escriba el nombre'); }
        if (!f.subfamilia.value) { f.familia.classList.add('falta'); f.familia.focus(); throw new Error('Elija la familia y la subfamilia'); }
        const otros = EPT.leerOtrosPrecios(f);
        if (f.emp.value && !(Number.isInteger(Number(f.porEmp.value)) && Number(f.porEmp.value) >= 1)) { f.porEmp.classList.add('falta'); f.porEmp.focus(); throw new Error('Escriba cuántas unidades trae cada ' + f.emp.value.toLowerCase()); }
        const r = await EPT.rpc('ept_almacen_articulo_guardar', { p: {
          id: p ? p.id : null, codigo: nuevo ? f.codigo.value : undefined, descripcion: f.desc.value, subfamilia_id: f.subfamilia.value, cobrable: EPT.seCobra(f),
          clase_articulo: f.clase.value, precio: f.precio.value, precios_extra: otros, unidad: f.unidad.value, marca_pieza: f.marca.value, numero_parte: f.ref.value, minimo: f.minimo.value,
          empaque_nombre: f.emp.value, empaque_unidades: f.emp.value ? f.porEmp.value : 1, codigo_barras: f.barras.value, notas: f.notas.value,
          estante: nuevo ? f.estante.value : undefined } });
        EPT.olvidar('productos');
        EPT.aviso(nuevo ? `Artículo creado: ${r.codigo}` : 'Artículo guardado');
        if (op.despues) op.despues(r); else EPT.recargar();
      },
    });
  }

  // Agregar una familia nueva o una subfamilia a una familia que ya existe
  function nuevaSubfamilia(F, despues) {
    EPT.ventana({
      titulo: 'Agregar familia o subfamilia', boton: 'Agregar',
      cuerpo: `<label class="campo">Familia <small class="opc">(elija una o escriba una nueva)</small><input name="fam" list="lFams" maxlength="80" required>
          <datalist id="lFams">${F.fams.map(x => `<option value="${esc(x.nombre)}">`).join('')}</datalist></label>
        <label class="campo">Subfamilia nueva<input name="sub" maxlength="80" required></label>`,
      async alGuardar(f) {
        await EPT.rpc('ept_familia_agregar', { p_familia: f.fam.value, p_subfamilia: f.sub.value });
        EPT.olvidar('familias'); EPT.aviso('Agregada'); despues();
      },
    });
  }

  // =====================================================================
  // Documentos (albaranes): listas por tipo
  // =====================================================================
  // Período de las listas de albaranes (como en Libra): desde / hasta. Por defecto, este mes. Se recuerda mientras la
  // aplicación esté abierta y es el mismo para entradas, salidas, traslados y ajustes.
  const dosD = n => String(n).padStart(2, '0');
  const diaTxt = d => `${d.getFullYear()}-${dosD(d.getMonth() + 1)}-${dosD(d.getDate())}`;
  const RAPIDOS = [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['mes_pasado', 'Mes pasado'], ['anio', 'Este año'], ['inicio', 'Todo, desde el inicio']];
  const rangoRapido = k => {
    const h = new Date(), y = h.getFullYear(), m = h.getMonth();
    if (k === 'hoy') return [h, h];
    if (k === 'semana') { const l = new Date(h); l.setDate(h.getDate() - ((h.getDay() + 6) % 7)); return [l, h]; }
    if (k === 'mes_pasado') return [new Date(y, m - 1, 1), new Date(y, m, 0)];
    if (k === 'anio') return [new Date(y, 0, 1), h];
    return [new Date(y, m, 1), h];
  };
  const primerDia = async () => {
    const [d, t] = await Promise.all([EPT.leer(sb.from('almacen_documentos').select('fecha').order('fecha').limit(1)),
      EPT.leer(sb.from('transferencias').select('fecha_envio').order('fecha_envio').limit(1))]);
    const fs = [d[0]?.fecha, t[0]?.fecha_envio].filter(Boolean).map(f => new Date(f));
    return fs.length ? new Date(Math.min(...fs)) : new Date();
  };
  const periodo = { desde: diaTxt(rangoRapido('mes')[0]), hasta: diaTxt(new Date()) };
  // límites para el servidor: desde las 00:00 del primer día hasta antes de las 00:00 del día siguiente al último
  const limites = () => { const b = new Date(periodo.hasta + 'T00:00:00'); b.setDate(b.getDate() + 1);
    return [new Date(periodo.desde + 'T00:00:00').toISOString(), b.toISOString()]; };
  const fechaDia = f => new Date(f).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const cargarDocs = tipo => { const [a, b] = limites(); return EPT.leer(sb.from('almacen_documentos')
    .select('id,tipo,clase,serie,numero,fecha,suplidor,numero_factura,ncf,para,motivo,total,usuario:usuarios(nombre),lineas:almacen_documento_lineas(renglon,cantidad,presentacion,importe,diferencia,estante_despues,producto:productos(codigo,descripcion,unidad))')
    .eq('tipo', tipo).gte('fecha', a).lt('fecha', b).order('fecha', { ascending: false }).limit(3000)); };
  const textoDoc = d => EPT.llano([codDoc(d), d.suplidor, d.numero_factura, d.ncf, d.para, d.motivo, d.usuario?.nombre,
    ...(d.lineas || []).flatMap(l => [l.producto?.codigo, l.producto?.descripcion])].join(' '));
  const cuantos = n => `${n} artículo${n === 1 ? '' : 's'}`;
  const busquedas = {}, vistas = {};

  // Lista de albaranes con período, tipo, buscador y dos vistas:
  //   · Albaranes: un renglón por documento.
  //   · Detalle por artículo: un renglón por artículo (fecha, albarán, para quién, código, artículo, cantidad, importe), con total.
  // "cargar" trae los albaranes del período ya armados:
  //   {f, codigo, titulo, sub, chip, filtro, texto, quien, abrir, lineas: [{codigo, descripcion, cant, unidad, importe}]}
  async function pintarLista(v, clave, { titulo, cargar, vacio, filtros, conImporte = false }) {
    let filtro = (filtros && busquedas[clave + ':f']) || (filtros ? filtros[0][0] : '');
    let vista = vistas[clave] || 'docs', items = [];
    v.innerHTML = `<div class="filtros-alb no-imprimir">
        <div class="periodo"><label class="campo">Desde<input type="date" id="pDesde" value="${periodo.desde}"></label>
          <label class="campo">Hasta<input type="date" id="pHasta" value="${periodo.hasta}"></label>
          <label class="campo">Rápido<select id="pRapido"><option value="">Elegir…</option>${RAPIDOS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label></div>
        <div class="fila">${filtros ? `<div class="seg" role="group">${filtros.map(([k, t]) => `<button type="button" data-f="${k}" aria-pressed="${k === filtro}">${esc(t)}</button>`).join('')}</div>` : ''}
          <div class="buscador">${icono('buscar')}<input type="search" id="bDocs" value="${esc(busquedas[clave] || '')}" placeholder="Número, artículo, suplidor, factura o persona"></div></div>
        <div class="fila"><div class="seg" role="group" aria-label="Cómo ver">${[['docs', 'Albaranes'], ['detalle', 'Detalle por artículo']].map(([k, t]) => `<button type="button" data-vista="${k}" aria-pressed="${k === vista}">${t}</button>`).join('')}</div>
          <span class="mute" id="cuentaDocs"></span><button type="button" class="der" id="btnImprimirLista">${icono('imprimir')}Imprimir</button></div></div>
      <h2 class="solo-imprimir" id="tituloImp"></h2>
      <div class="panel" id="listaDocs"><div class="vacio">Cargando…</div></div>`;
    const caja = v.querySelector('#listaDocs');
    const visibles = () => {
      const pal = EPT.llano((busquedas[clave] || '').trim()).split(/\s+/).filter(Boolean);
      return items.filter(x => (!filtros || filtro === filtros[0][0] || x.filtro === filtro) && pal.every(w => x.texto.includes(w)));
    };
    const pintar = () => {
      const ls = visibles();
      const rango = `del ${fechaCorta(periodo.desde)} al ${fechaCorta(periodo.hasta)}`;
      v.querySelector('#tituloImp').textContent = `${titulo}${filtros && filtro !== filtros[0][0] ? ' · ' + filtros.find(f => f[0] === filtro)[1] : ''} · ${rango}`;
      const renglones = ls.reduce((a, x) => a + x.lineas.length, 0);
      v.querySelector('#cuentaDocs').textContent = `${ls.length} ${ls.length === 1 ? 'albarán' : 'albaranes'} · ${renglones} ${renglones === 1 ? 'renglón' : 'renglones'}`;
      if (!ls.length) { caja.innerHTML = `<div class="vacio">${items.length ? 'No se encontró nada con esa búsqueda.' : esc(vacio)}</div>`; return; }
      if (vista === 'docs') {
        caja.innerHTML = `<ul class="lista">${ls.map(x => `<li class="toca" data-i="${items.indexOf(x)}"><span class="serie">${esc(x.codigo)}</span>
          <div class="q"><b>${esc(x.titulo)}</b><span>${esc(x.sub)}</span></div>${x.chip || ''}</li>`).join('')}</ul>`;
        return;
      }
      const imp = conImporte && ls.some(x => x.lineas.some(l => Number(l.importe) > 0));
      const total = ls.reduce((a, x) => a + x.lineas.reduce((b, l) => b + Number(l.importe || 0), 0), 0);
      caja.innerHTML = `<div class="desliza"><table class="tabla detalle-alb"><thead><tr><th>Fecha</th><th>Albarán</th><th>Para / De</th><th>Código</th><th>Artículo</th>
          <th style="text-align:right">Cantidad</th>${imp ? '<th style="text-align:right">Importe</th>' : ''}</tr></thead>
        <tbody>${ls.map(x => x.lineas.map((l, j) => `<tr class="toca${j ? '' : ' primero'}" data-i="${items.indexOf(x)}">
          <td>${j ? '' : fechaDia(x.f)}</td><td>${j ? '' : `<b>${esc(x.codigo)}</b>`}</td><td>${j ? '' : esc(x.quien || '')}</td>
          <td><small>${esc(l.codigo)}</small></td><td>${esc(l.descripcion)}</td>
          <td style="text-align:right;white-space:nowrap">${esc(l.cant)} <small class="mute">${esc(l.unidad)}</small></td>
          ${imp ? `<td style="text-align:right">${Number(l.importe) ? dinero(l.importe) : ''}</td>` : ''}</tr>`).join('')).join('')}</tbody>
        ${imp ? `<tfoot><tr><td colspan="6" style="text-align:right"><b>Total del período</b></td><td style="text-align:right"><b>${dinero(total)}</b></td></tr></tfoot>` : ''}</table></div>`;
    };
    // si se cambia el período otra vez antes de que llegue la respuesta, solo cuenta la última
    let turno = 0;
    const recargar = async () => {
      const yo = ++turno;
      caja.innerHTML = '<div class="vacio">Cargando…</div>';
      try { const r = await cargar(); if (yo !== turno) return; items = r; pintar(); }
      catch (e) { if (yo === turno) caja.innerHTML = `<div class="vacio">${esc(EPT.error(e))}</div>`; }
    };
    const fijar = (d, h) => {
      if (d > h) [d, h] = [h, d];
      periodo.desde = d; periodo.hasta = h;
      v.querySelector('#pDesde').value = d; v.querySelector('#pHasta').value = h; recargar();
    };
    v.querySelector('#pDesde').addEventListener('change', e => { if (e.target.value) fijar(e.target.value, periodo.hasta); v.querySelector('#pRapido').value = ''; });
    v.querySelector('#pHasta').addEventListener('change', e => { if (e.target.value) fijar(periodo.desde, e.target.value); v.querySelector('#pRapido').value = ''; });
    v.querySelector('#pRapido').addEventListener('change', async e => {
      if (!e.target.value) return;
      // «Todo, desde el inicio»: desde el día del primer albarán que se registró en el programa
      if (e.target.value === 'inicio') { fijar(diaTxt(await primerDia()), diaTxt(new Date())); return; }
      const [d, h] = rangoRapido(e.target.value); fijar(diaTxt(d), diaTxt(h));
    });
    let t; v.querySelector('#bDocs').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { busquedas[clave] = e.target.value; pintar(); }, 150); });
    v.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
      filtro = busquedas[clave + ':f'] = b.dataset.f; v.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === b)); pintar();
    }));
    v.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => {
      vista = vistas[clave] = b.dataset.vista; v.querySelectorAll('[data-vista]').forEach(x => x.setAttribute('aria-pressed', x === b)); pintar();
    }));
    v.querySelector('#btnImprimirLista').addEventListener('click', () => window.print());
    caja.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) items[li.dataset.i].abrir(); });
    await recargar();
  }
  // un albarán del almacén (IN, DP, DS, TR, AJ) listo para la lista
  const itemDoc = (d, titulo, quien) => ({
    f: d.fecha, codigo: codDoc(d), titulo, quien, chip: '<span class="estado ok">Registrado</span>', filtro: d.clase,
    sub: `${DOC[d.clase].corto} · ${cuantos((d.lineas || []).length)}${Number(d.total) > 0 ? ' · ' + dinero(d.total) : ''} · ${fecha(d.fecha)}${d.usuario ? ' · ' + d.usuario.nombre : ''}`,
    texto: textoDoc(d), abrir: () => abrirDocumento(d.id),
    lineas: [...(d.lineas || [])].sort((a, b) => a.renglon - b.renglon).map(l => ({ codigo: l.producto?.codigo || '', descripcion: l.producto?.descripcion || '',
      unidad: d.tipo === 'traslado' ? '' : l.producto?.unidad || '', importe: l.importe,
      cant: d.tipo === 'traslado' ? 'a ' + (l.estante_despues || '') : d.tipo === 'ajuste' ? (Number(l.diferencia) > 0 ? '+' : '') + num(l.diferencia) : num(l.cantidad) + (/ de /.test(l.presentacion) ? ` (${l.presentacion})` : '') })),
  });
  const botonNuevo = (texto, clase) => {
    EPT.$('#barraBotones').innerHTML = `<button type="button" class="prin" id="btnNuevoDoc">${icono('mas')}${esc(texto)}</button>`;
    EPT.$('#btnNuevoDoc').addEventListener('click', () => nuevoDocumento(clase));
  };

  EPT.pantalla({
    id: 'alm_ingresos', titulo: 'Albaranes de entrada', pestana: 'Albaranes de entrada', grupo: 'Almacén', icono: 'ingreso', peso: 3,
    explica: 'Todo lo que ENTRA al almacén: facturas de compra de los suplidores (suman la existencia y ponen el costo al día) e ingresos internos.',
    ver: () => puedeAlm('ingreso') || EPT.puede('reportes.ver'),
    async mostrar(v) {
      if (puedeAlm('ingreso')) botonNuevo('Nuevo ingreso', 'compra');
      await pintarLista(v, 'in', { titulo: 'Albaranes de entrada', conImporte: true,
        cargar: async () => (await cargarDocs('ingreso')).map(d => d.clase === 'compra'
          ? itemDoc(d, `${d.suplidor} · ${d.numero_factura}${d.ncf ? ' · NCF ' + d.ncf : ''}`, d.suplidor)
          : itemDoc(d, d.motivo || 'Ingreso interno', 'Interno')),
        vacio: 'No hay ingresos en este período. Toque «Nuevo ingreso» para registrar una factura de compra.',
        filtros: [['todos', 'Todos'], ['compra', 'Facturas de compra'], ['interno', 'Internos']] });
    },
  });

  EPT.pantalla({
    id: 'alm_despachos', titulo: 'Albaranes de salida', pestana: 'Albaranes de salida', grupo: 'Almacén', icono: 'despacho', peso: 4,
    explica: 'Todo lo que SALE del almacén: a Repuestos (D), a un mecánico, ayudante u otra persona (DP) o devuelto al suplidor (DS).',
    ver: () => ['almacen.despacho', 'almacen.transferir', 'almacen.diferencia', 'reportes.ver'].some(p => EPT.puede(p)),
    async mostrar(v) {
      if (puedeAlm('despacho')) botonNuevo('Nuevo despacho', 'persona');
      await pintarLista(v, 'out', { titulo: 'Albaranes de salida', conImporte: true,
        cargar: async () => {
          const [ta, tb] = limites();
          const [docs, trans] = await Promise.all([cargarDocs('despacho'),
            EPT.leer(sb.from('transferencias').select('id,numero,estado,fecha_envio,fecha_recibo,comentario,requisicion:requisiciones(numero,orden:ordenes(numero,vehiculo:vehiculos(marca,modelo,placa))),lineas:transferencia_lineas(enviada,producto:productos(codigo,descripcion,unidad))')
              .gte('fecha_envio', ta).lt('fecha_envio', tb).order('numero', { ascending: false }).limit(3000))]);
          return [
            ...trans.map(t => ({ f: t.fecha_envio, codigo: dn(t.numero), filtro: 'repuestos', chip: chip(DES, t.estado), quien: 'Repuestos',
              titulo: `Para Repuestos${t.requisicion ? ' · ' + rn(t.requisicion.numero) : ''}${t.requisicion?.orden ? ' · ' + ot(t.requisicion.orden.numero) + ' ' + [t.requisicion.orden.vehiculo?.marca, t.requisicion.orden.vehiculo?.modelo].filter(Boolean).join(' ') : ' · ' + (t.comentario || 'reposición')}`,
              sub: `${cuantos(t.lineas.length)} · ${fecha(t.fecha_envio)}${t.fecha_recibo ? ' · ingresó ' + fecha(t.fecha_recibo) : ''}`,
              texto: EPT.llano([dn(t.numero), 'repuestos', t.comentario, t.requisicion && rn(t.requisicion.numero), t.requisicion?.orden && ot(t.requisicion.orden.numero), ...t.lineas.flatMap(l => [l.producto?.codigo, l.producto?.descripcion])].join(' ')),
              lineas: t.lineas.map(l => ({ codigo: l.producto?.codigo || '', descripcion: l.producto?.descripcion || '', unidad: l.producto?.unidad || '', cant: num(l.enviada), importe: 0 })),
              abrir: () => abrirDespacho(t.id) })),
            ...docs.map(d => d.clase === 'persona' ? itemDoc(d, `Para ${d.para} · ${d.motivo}`, d.para) : itemDoc(d, `Devolución a ${d.suplidor} · ${d.motivo}`, d.suplidor)),
          ].sort((x, y) => String(y.f).localeCompare(String(x.f)));
        },
        vacio: 'No hay despachos en este período.',
        filtros: [['todos', 'Todos'], ['repuestos', 'A Repuestos'], ['persona', 'A personas'], ['suplidor', 'Al suplidor']] });
    },
  });

  EPT.pantalla({
    id: 'alm_traslados', titulo: 'Traslados', pestana: 'Traslados', grupo: 'Almacén', icono: 'traslado', peso: 5,
    explica: 'Cambiar artículos de estante dentro del almacén. La cantidad no cambia.',
    ver: () => puedeAlm('traslado') || EPT.puede('reportes.ver'),
    async mostrar(v) {
      if (puedeAlm('traslado')) botonNuevo('Nuevo traslado', 'traslado');
      await pintarLista(v, 'tr', { titulo: 'Traslados', cargar: async () => (await cargarDocs('traslado')).map(d => itemDoc(d, d.motivo || 'Cambio de estante', d.motivo || 'Cambio de estante')),
        vacio: 'No hay traslados en este período.' });
    },
  });

  EPT.pantalla({
    id: 'alm_ajustes', titulo: 'Ajustes', pestana: 'Ajustes y conteo', grupo: 'Almacén', icono: 'ajuste', peso: 6,
    explica: 'Corregir la existencia después de contar (toma de inventario): se escribe lo contado y el programa ajusta la diferencia.',
    ver: () => puedeAlm('ajustar') || EPT.puede('reportes.ver'),
    async mostrar(v) {
      if (puedeAlm('ajustar')) botonNuevo('Nuevo ajuste', 'conteo');
      await pintarLista(v, 'aj', { titulo: 'Ajustes', cargar: async () => (await cargarDocs('ajuste')).map(d => itemDoc(d, d.motivo, d.motivo)),
        vacio: 'No hay ajustes en este período.' });
    },
  });

  // =====================================================================
  // Documento nuevo: 1) cabecera  2) artículos (escanear o buscar)  3) guardar
  // =====================================================================
  async function nuevoDocumento(clase, conArticulos = []) {
    const D = DOC[clase];
    if (!puedeAlm(D.permiso)) { EPT.aviso('No tiene permiso para esto', true); return; }
    const [arts, F, mecs, sups] = await Promise.all([cargarInventario(), EPT.cargarFamilias(), clase === 'persona' ? EPT.cargarMecanicos() : [],
      D.tipo === 'ingreso' || clase === 'suplidor' ? EPT.leer(sb.from('almacen_documentos').select('suplidor').neq('suplidor', '').order('fecha', { ascending: false }).limit(300)) : []]);
    let todos = arts.filter(p => p.activo);
    const lista = EPT.alfabetico(todos);
    const suplidores = [...new Set(sups.map(s => s.suplidor))].sort((a, b) => a.localeCompare(b, 'es'));
    const lineas = [];   // { p, cant, por (unidades por empaque), costo, estante, contado }
    const v = EPT.$('#vista');
    const hermanas = D.tipo === 'ingreso' ? ['compra', 'interno'] : [clase];
    // Despacho: a Repuestos, a un mecánico, a un ayudante o a otra persona. La devolución al suplidor va aparte (botón arriba).
    const despacho = clase === 'persona';
    const aRepuestos = despacho && puedeAlm('transferir');
    let destino = 'mecanico';
    EPT.$('#subtitulo').textContent = despacho ? 'Nuevo despacho' : 'Nuevo · ' + D.nombre;
    EPT.$('#barraBotones').innerHTML = `${D.tipo === 'despacho' ? `<button type="button" class="liso" id="btnOtroDesp">${clase === 'persona' ? 'Es una devolución al suplidor' : 'Volver al despacho'}</button>` : ''}<button type="button" id="btnCancelarDoc">Cancelar</button>`;
    EPT.$('#btnCancelarDoc').addEventListener('click', () => EPT.ir(LISTA_DE[D.tipo]));
    EPT.$('#btnOtroDesp')?.addEventListener('click', () => nuevoDocumento(clase === 'persona' ? 'suplidor' : 'persona', lineas.map(l => l.p.id)));
    const mecsDe = t => mecs.filter(m => (m.tipo || 'mecanico') === t);
    const cualQuien = () => ({
      repuestos: '<p class="mute" style="margin:0">Sale del almacén y queda en camino hasta que Repuestos registre el ingreso.</p>',
      mecanico: `<label class="campo">Mecánico<select name="quien" required><option value="">Elija el mecánico…</option>${mecsDe('mecanico').map(m => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('')}</select></label>`,
      ayudante: `<label class="campo">Ayudante<select name="quien" required><option value="">Elija el ayudante…</option>${mecsDe('ayudante').map(m => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('')}</select></label>`,
      otra: '<label class="campo">Nombre de la persona<input name="quien" required maxlength="120" placeholder="¿A quién se le entrega?"></label>',
    }[destino]);
    const hoy = new Date(); const hoyTxt = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const cabecera = {
      compra: `<div class="cab3"><label class="campo">Suplidor<input name="suplidor" list="lSups" maxlength="120" required placeholder="Nombre del suplidor"></label>
          <label class="campo">Documento<select name="doc_suplidor"><option>Factura</option><option>Conduce</option></select></label>
          <label class="campo">Número<input name="numero_factura" maxlength="40" required placeholder="Número de la factura"></label></div>
        <div class="cab3"><label class="campo">NCF <small class="opc">(si trae)</small><input name="ncf" maxlength="19" autocapitalize="characters" placeholder="B0100000000"></label>
          <label class="campo">Fecha de la factura<input name="fecha_factura" type="date" value="${hoyTxt}"></label><div></div></div>`,
      interno: `<label class="campo">¿Por qué entra?<input name="motivo" maxlength="200" required placeholder="Ej. sobrante encontrado, regalo del suplidor"></label>`,
      persona: `<div class="seg destinos" role="group" aria-label="¿A quién se despacha?">${[aRepuestos && ['repuestos', 'Repuestos'], ['mecanico', 'Mecánico'], ['ayudante', 'Ayudante'], ['otra', 'Otra persona']]
          .filter(Boolean).map(([k, t]) => `<button type="button" data-dest="${k}" aria-pressed="${k === destino}">${t}</button>`).join('')}</div>
        <div class="dos"><div id="cualQuien">${cualQuien()}</div>
          <label class="campo">Comentario<input name="motivo" maxlength="200" required placeholder="Ej. para el carro de Juan, uso en el taller"></label></div>`,
      suplidor: `<div class="dos"><label class="campo">Suplidor<input name="suplidor" list="lSups" maxlength="120" required></label>
          <label class="campo">Factura que se devuelve <small class="opc">(opcional)</small><input name="numero_factura" maxlength="40"></label></div>
        <label class="campo">¿Por qué se devuelve?<input name="motivo" maxlength="200" required placeholder="Ej. vino dañado, no era la pieza"></label>`,
      traslado: `<label class="campo">Nota <small class="opc">(opcional)</small><input name="motivo" maxlength="200" placeholder="Ej. reorganización del pasillo B"></label>`,
      conteo: `<label class="campo">Motivo<input name="motivo" maxlength="200" required value="Conteo físico"></label>`,
    }[clase];
    v.innerHTML = `<div class="panel"><div class="cuerpo doc-nuevo">
      ${hermanas.length > 1 ? `<div class="seg" role="group" style="margin-bottom:6px">${hermanas.map(k => `<button type="button" data-cl="${k}" aria-pressed="${k === clase}">${esc(DOC[k].nombre)}</button>`).join('')}</div>` : ''}
      <form id="fDoc" novalidate>
        <div class="paso-doc"><i>1</i>${{ compra: '¿De qué suplidor y qué factura?', interno: '¿Por qué entra?', persona: '¿A quién se despacha?', suplidor: '¿A qué suplidor y por qué?', traslado: 'Nota', conteo: '¿Por qué se cuenta?' }[clase]}</div>
        ${cabecera}
        <datalist id="lSups">${suplidores.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
        <div class="paso-doc"><i>2</i>${D.tipo === 'ingreso' ? '¿Qué llegó?' : D.tipo === 'despacho' ? '¿Qué sale?' : D.tipo === 'traslado' ? '¿Qué cambia de estante?' : '¿Qué contó?'} Escanee, escriba o elija de la lista</div>
        <div class="busca-doc">${EPT.campoPieza('id="bArt"', 'Escriba: aceite atf, guantes, filtro… o el código')}
          <button type="button" id="btnVerLista">${icono('anaquel')}Ver la lista</button></div>
        <div class="desliza"><table class="tabla doc-lineas" id="tLineas"></table></div>
        <div id="totales"></div>
        <div class="paso-doc"><i>3</i>${despacho ? 'Despache: se descuenta de la existencia' : 'Revise y guarde'}</div>
        <p class="error" role="alert" id="errDoc"></p>
        <button type="submit" class="prin grande-btn" id="btnGuardarDoc">Guardar</button>
      </form></div></div>`;
    v.querySelectorAll('[data-cl]').forEach(b => b.addEventListener('click', () => { if (b.dataset.cl !== clase) nuevoDocumento(b.dataset.cl, lineas.map(l => l.p.id)); }));
    const f = v.querySelector('#fDoc'), tabla = v.querySelector('#tLineas'), bArt = v.querySelector('#bArt');
    if (despacho) {
      v.querySelector('.destinos').addEventListener('click', e => {
        const b = e.target.closest('[data-dest]'); if (!b || b.dataset.dest === destino) return;
        destino = b.dataset.dest;
        v.querySelectorAll('[data-dest]').forEach(x => x.setAttribute('aria-pressed', x === b));
        v.querySelector('#cualQuien').innerHTML = cualQuien();
        v.querySelector('#cualQuien [name=quien]')?.focus();
      });
      f.addEventListener('input', e => e.target.classList.remove('falta'));
    }
    const conCosto = clase === 'compra';
    const emp = p => Number(p.empaque_unidades) > 1 && p.empaque_nombre;

    const agregar = (p, enfocar = true) => {
      if (!p) return;
      if (!todos.some(x => x.id === p.id)) { EPT.aviso(`${p.codigo} no es del almacén`, true); return; }
      let l = lineas.find(x => x.p.id === p.id);
      if (l) { if (D.tipo !== 'traslado' && D.tipo !== 'ajuste') l.cant = Number(l.cant || 0) + 1; }
      else { l = { p, cant: D.tipo === 'ajuste' ? '' : 1, por: 1, costo: Number(p.ultimo_costo) || Number(p.costo) || '', estante: '', contado: '' }; lineas.push(l); }
      pintar();
      const inp = enfocar && tabla.querySelector(`tr[data-pid="${p.id}"] input`); if (inp) { inp.focus(); inp.select(); }
    };
    // La tabla se dibuja al agregar o quitar un artículo (o cambiar el empaque). Mientras se escribe, solo se
    // actualizan los números calculados, así el cursor no se pierde al pasar de un campo a otro.
    const unidadCosto = l => (l.por > 1 ? l.p.empaque_nombre : l.p.unidad).toLowerCase();
    const pintar = () => {
      const cab = { ingreso: `<th>Artículo</th><th>Hay ahora</th><th>Cantidad</th><th>En</th>${conCosto ? '<th>Costo</th><th style="text-align:right">Importe</th>' : ''}`,
        despacho: '<th>Artículo</th><th>Hay ahora</th><th>Cantidad</th><th>En</th>',
        traslado: '<th>Artículo</th><th>Está en</th><th>Estante nuevo</th>',
        ajuste: '<th>Artículo</th><th>Dice el programa</th><th>Contado</th><th>Diferencia</th>' }[D.tipo];
      tabla.innerHTML = lineas.length ? `<thead><tr>${cab}<th></th></tr></thead><tbody>${lineas.map(l => {
        const p = l.p, art = `<td><b>${esc(p.descripcion)}</b> <small class="mute">${esc(p.codigo)}</small></td>`;
        const enSel = emp(p) ? `<select class="por"><option value="1" ${l.por == 1 ? 'selected' : ''}>${esc(p.unidad)}</option><option value="${p.empaque_unidades}" ${l.por != 1 ? 'selected' : ''}>${esc(p.empaque_nombre)} de ${num(p.empaque_unidades)}</option></select>` : esc(p.unidad);
        const cant = `<td><input class="cant c" type="number" min="0" step="any" inputmode="decimal" value="${l.cant}" aria-label="Cantidad"></td>`;
        const celdas = {
          ingreso: `${art}<td>${num(p.hay)}</td>${cant}<td>${enSel}<br><small class="mute eq"></small></td>
            ${conCosto ? `<td><input class="cant costo" type="number" min="0" step="any" inputmode="decimal" value="${l.costo}" aria-label="Costo"><br><small class="mute">por ${esc(unidadCosto(l))}</small></td>
            <td class="imp" style="text-align:right"></td>` : ''}`,
          despacho: `${art}<td class="hay">${num(p.hay)}</td>${cant}<td>${enSel}<br><small class="mute eq"></small></td>`,
          traslado: `${art}<td>${esc(p.estante || 'sin estante')}</td><td><input class="cant est" maxlength="40" value="${esc(l.estante)}" style="width:120px" aria-label="Estante nuevo"></td>`,
          // en el ajuste, si tiene empaque, se puede contar por cajas y sueltas: el programa suma las unidades
          ajuste: `${art}<td>${num(p.hay)}${enEmpaques(p) ? `<br><small class="mute">${esc(enEmpaques(p))}</small>` : ''}</td>${tieneEmpaque(p)
            ? `<td><div class="por-cajas"><label><input class="cant cj" type="number" min="0" step="1" inputmode="numeric" aria-label="${esc(empaquePlural(p, 2))}"> ${esc(empaquePlural(p, 2))} de ${num(p.empaque_unidades)}</label>
                <label><input class="cant su" type="number" min="0" step="any" inputmode="decimal" aria-label="Sueltas"> sueltas</label>
                <small class="mute">= <b class="tot-cajas">${l.cant === '' ? '—' : num(l.cant)}</b> ${esc(p.unidad)}</small></div></td>`
            : cant}<td class="dif"></td>`,
        }[D.tipo];
        return `<tr data-pid="${p.id}">${celdas}<td><button type="button" class="liso peque" data-quitar title="Saca el artículo de este documento. No cambia la existencia.">Sacar de la lista</button></td></tr>`; }).join('')}</tbody>`
        : '<tbody><tr><td class="vacio" style="padding:18px">Todavía no hay artículos. Escanee o escriba arriba.</td></tr></tbody>';
      v.querySelector('#btnGuardarDoc').textContent = `${despacho ? 'Despachar' : 'Guardar ' + D.nombre.toLowerCase()}${lineas.length ? ` (${cuantos(lineas.length)})` : ''}`;
      if (conCosto) pintarTotales();
      calcular();
    };
    // números calculados de cada renglón y el total de la factura
    const calcular = () => {
      for (const l of lineas) {
        const tr = tabla.querySelector(`tr[data-pid="${l.p.id}"]`); if (!tr) continue;
        const total = Number(l.cant || 0) * Number(l.por || 1);
        const eq = tr.querySelector('.eq'); if (eq) eq.textContent = l.por > 1 && total ? `= ${num(total)} ${l.p.unidad}` : '';
        const imp = tr.querySelector('.imp'); if (imp) imp.textContent = dinero(Number(l.cant || 0) * Number(l.costo || 0));
        const hay = tr.querySelector('.hay'); if (hay) hay.classList.toggle('txt-malo', total > l.p.hay);
        const dif = tr.querySelector('.dif');
        if (dif) { const d = Number(l.cant) - l.p.hay; dif.innerHTML = l.cant === '' ? '—' : `<b class="${d > 0 ? 'txt-ok' : d < 0 ? 'txt-malo' : 'mute'}">${d > 0 ? '+' : ''}${num(d)}</b>`; }
      }
      if (conCosto) calcularTotales();
    };
    // totales de la factura de compra: el ITBIS se calcula al 18 % salvo que se escriba a mano
    let itbisMano = null, conItbis = true;
    const subtotal = () => lineas.reduce((a, l) => a + Math.round(Number(l.cant || 0) * Number(l.costo || 0) * 100) / 100, 0);
    const itbisDe = sub => !conItbis ? 0 : itbisMano != null ? itbisMano : Math.round(sub * 18) / 100;
    const pintarTotales = () => {
      const caja = v.querySelector('#totales');
      caja.innerHTML = `<div class="totales-doc">
        <div>Subtotal <b class="sub"></b></div>
        <label class="check"><input type="checkbox" name="llevaItbis" ${conItbis ? 'checked' : ''}> <span>La factura trae ITBIS</span></label>
        <label class="campo-linea">ITBIS RD$<input name="itbis" type="number" min="0" step="any" inputmode="decimal" ${conItbis ? '' : 'disabled'}></label>
        <div class="total">Total de la factura <b class="tot"></b></div></div>`;
      caja.querySelector('[name=llevaItbis]').addEventListener('change', e => { conItbis = e.target.checked; caja.querySelector('[name=itbis]').disabled = !conItbis; calcularTotales(); });
      caja.querySelector('[name=itbis]').addEventListener('input', e => { itbisMano = e.target.value === '' ? null : Number(e.target.value); calcularTotales(true); });
    };
    const calcularTotales = (escribiendo) => {
      const caja = v.querySelector('#totales'); const sub = subtotal(), it = itbisDe(sub);
      caja.querySelector('.sub').textContent = dinero(sub);
      if (!escribiendo) caja.querySelector('[name=itbis]').value = conItbis ? it : 0;
      caja.querySelector('.tot').textContent = dinero(sub + it);
    };
    // lo que se escribe en la tabla se guarda en "lineas"
    tabla.addEventListener('input', e => {
      const tr = e.target.closest('tr[data-pid]'); if (!tr) return;
      const l = lineas.find(x => x.p.id === tr.dataset.pid);
      if (e.target.classList.contains('c')) l.cant = e.target.value;
      if (e.target.classList.contains('cj') || e.target.classList.contains('su')) {
        const cj = tr.querySelector('.cj').value, su = tr.querySelector('.su').value;
        l.cant = cj === '' && su === '' ? '' : Number(cj || 0) * Number(l.p.empaque_unidades) + Number(su || 0);
        tr.querySelector('.tot-cajas').textContent = l.cant === '' ? '—' : num(l.cant);
      }
      if (e.target.classList.contains('costo')) l.costo = e.target.value;
      if (e.target.classList.contains('est')) l.estante = e.target.value;
      calcular();
    });
    // cambiar de unidad a empaque cambia lo que significa el costo: se vuelve a dibujar ese renglón
    tabla.addEventListener('change', e => {
      if (!e.target.classList.contains('por')) return;
      const l = lineas.find(x => x.p.id === e.target.closest('tr').dataset.pid);
      l.por = Number(e.target.value); pintar();
      const s = tabla.querySelector(`tr[data-pid="${l.p.id}"] .por`); if (s) s.focus();
    });
    // Enter en una cantidad vuelve al buscador, listo para el siguiente artículo
    tabla.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); e.target.blur(); bArt.focus(); } });
    tabla.addEventListener('click', e => {
      const b = e.target.closest('[data-quitar]'); if (!b) return;
      const i = lineas.findIndex(x => x.p.id === b.closest('tr').dataset.pid); lineas.splice(i, 1); pintar();
    });

    // buscador: solo artículos del almacén; si no existe y es un ingreso, se ofrece crearlo ahí mismo, dentro de la
    // misma lista (el programa lo ubica solo en su familia)
    const crearAqui = D.tipo === 'ingreso' && puedeAlm('articulos');
    EPT.sugerencias(v.querySelector('.busca-doc'), lista, {
      libre: false, extra: extraAlm(F), detalle: detalleAlm(F),
      alElegir: (inp, p) => { inp.value = ''; agregar(p && todos.find(x => x.id === p.id)); },
      nada: crearAqui ? txt => txt.length < 3 ? '' : `<span>«${esc(txt)}» no está en el almacén.</span>
          <button type="button" class="peque prin" data-nada>${icono('mas')}Crear artículo nuevo</button><span class="mute">El programa lo ubica solo en su familia.</span>` : null,
      alNada: (txt, inp) => editarArticulo(null, { nombre: txt, despues: async r => {
        todos = (await cargarInventario()).filter(p => p.activo);
        const nuevo = todos.find(p => p.id === r.id); lista.push(nuevo);
        inp.value = ''; agregar(nuevo);
      } }),
    });
    // "Ver la lista": elegir tocando, sin tener que escribir
    v.querySelector('#btnVerLista').addEventListener('click', () => elegirDeLista({ arts: lista, F, despacho: D.tipo === 'despacho',
      cuantos: p => { const l = lineas.find(x => x.p.id === p.id); return l ? Number(l.cant || 0) : null; }, alAgregar: p => agregar(todos.find(x => x.id === p.id), false) }));
    // lo escaneado con el cursor fuera del buscador también se agrega a este documento
    EPT.alEscanear = p => { if (!document.body.contains(f)) return false; const x = todos.find(y => y.id === p.id); if (!x) return false; agregar(x); return true; };
    conArticulos.forEach(id => { const p = todos.find(x => x.id === id); if (p) lineas.push({ p, cant: D.tipo === 'ajuste' ? '' : 1, por: 1, costo: Number(p.ultimo_costo) || Number(p.costo) || '', estante: '', contado: '' }); });
    pintar();
    (f.querySelector('input:not([type=hidden])') || bArt).focus();

    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const err = v.querySelector('#errDoc'), bt = v.querySelector('#btnGuardarDoc'); err.textContent = '';
      try {
        f.querySelectorAll('[required]').forEach(x => { if (!x.value.trim()) { x.classList.add('falta'); x.focus(); throw new Error('Llene lo que está marcado en rojo'); } });
        if (!lineas.length) { bArt.focus(); throw new Error('Agregue al menos un artículo'); }
        for (const l of lineas) {
          const total = Number(l.cant || 0) * Number(l.por || 1);
          if (D.tipo === 'ingreso' || D.tipo === 'despacho') { if (!(total > 0)) throw new Error('Escriba la cantidad de ' + l.p.descripcion); }
          if (D.tipo === 'despacho' && total > l.p.hay) throw new Error(`No hay suficiente ${l.p.descripcion}: hay ${num(l.p.hay)}`);
          if (conCosto && (l.costo === '' || Number(l.costo) < 0)) throw new Error('Escriba el costo de ' + l.p.descripcion);
          if (D.tipo === 'traslado' && !l.estante.trim()) throw new Error('Escriba el estante nuevo de ' + l.p.descripcion);
          if (D.tipo === 'ajuste' && l.cant === '') throw new Error('Escriba cuántos contó de ' + l.p.descripcion);
        }
        bt.disabled = true;
        const val = n => f[n] ? f[n].value.trim() : '';
        const unidades = l => Number(l.cant || 0) * Number(l.por || 1);
        if (despacho && destino === 'repuestos') {
          const t = await EPT.rpc('ept_despacho_a_repuestos', { p: { comentario: val('motivo'),
            lineas: lineas.map(l => ({ producto_id: l.p.id, cantidad: unidades(l) })) } });
          EPT.olvidar('productos');
          EPT.aviso(`Despachado ${dn(t.numero)} a Repuestos`);
          abrirDespacho(t.id, true);
          return;
        }
        // a una persona: el nombre del mecánico o del ayudante elegido, o el que se escribió
        const q = f.querySelector('[name=quien]');
        const para = !despacho ? '' : q.tagName === 'SELECT' ? q.selectedOptions[0].textContent.trim() + (destino === 'ayudante' ? ' (ayudante)' : '') : q.value.trim();
        const r = await EPT.rpc('ept_almacen_documento', { p: {
          tipo: D.tipo, clase, suplidor: val('suplidor'), doc_suplidor: val('doc_suplidor'), numero_factura: val('numero_factura'), ncf: val('ncf'),
          fecha_factura: val('fecha_factura'), para, motivo: val('motivo'),
          itbis: conCosto ? itbisDe(subtotal()) : 0,
          lineas: lineas.map(l => {
            const por = Number(l.por || 1), cant = Number(l.cant || 0);
            return { producto_id: l.p.id, cantidad: D.tipo === 'ajuste' ? cant : cant * por,
              presentacion: por > 1 ? `${num(cant)} ${l.p.empaque_nombre.toLowerCase()} de ${num(por)}` : '',
              // el costo se escribe por empaque o por unidad; al servidor va por unidad
              costo: conCosto ? Number(l.costo) / por : undefined, estante: l.estante };
          }) } });
        EPT.olvidar('productos');
        EPT.aviso(despacho ? `Despachado ${r.codigo} a ${para}` : `${D.nombre} ${r.codigo} registrado`);
        abrirDocumento(r.id, true);
      } catch (e) { err.textContent = EPT.error(e); bt.disabled = false; err.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    });
    window.scrollTo(0, 0);
  }
  EPT.nuevoDocumentoAlmacen = nuevoDocumento;

  // Ventana "Elegir de la lista": todos los artículos del almacén para tocar y agregar, sin escribir.
  // Se achica con los botones de tipo (Piezas, Insumos, Misceláneos), la familia o unas letras. Se queda abierta
  // para agregar varios; cada uno muestra cuántos van ya en el documento. En un despacho, lo que no hay no se puede tocar.
  function elegirDeLista({ arts, F, despacho, cuantos, alAgregar }) {
    let clase = '', fam = '', q = '';
    const bp = EPT.buscadorPiezas(arts, { extra: extraAlm(F) });
    EPT.ventana({ titulo: 'Elegir artículos', boton: null,
      cuerpo: `<div class="buscador">${icono('buscar')}<input id="pkBusca" type="search" placeholder="Escriba para achicar la lista" autocomplete="off"></div>
        <div id="pkClases"></div>
        <label class="campo">Familia<select id="pkFam"></select></label>
        <ul class="lista corta elegir" id="pkLista"></ul>`,
      alAbrir(f) {
        const ul = f.querySelector('#pkLista'), sel = f.querySelector('#pkFam'), cl = f.querySelector('#pkClases');
        const pintar = () => {
          const deClase = arts.filter(p => !clase || p.clase_articulo === clase);
          const fams = F.fams.filter(x => deClase.some(p => F.porSub.get(p.subfamilia_id)?.familia_id === x.id));
          if (fam && !fams.some(x => x.id === fam)) fam = '';
          cl.innerHTML = botonesClase(arts, clase);
          sel.innerHTML = `<option value="">Todas (${deClase.length})</option>` + fams.map(x => `<option value="${x.id}" ${x.id === fam ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
          const ls = (q.trim() ? bp.buscar(q, Infinity) : arts).filter(p => (!clase || p.clase_articulo === clase) && (!fam || F.porSub.get(p.subfamilia_id)?.familia_id === fam));
          ul.innerHTML = ls.map(p => {
            const no = despacho && p.hay <= 0, van = cuantos(p);
            return `<li class="${no ? 'apagado' : 'toca'}" data-a="${p.id}"><span class="codigo">${esc(p.codigo)}</span>
              <div class="q"><b>${esc(p.descripcion)}</b><span><span class="cod-movil">${esc(p.codigo)} · </span>${detalleAlm(F)(p)}</span></div>
              ${no ? '<span class="mute">No hay</span>' : `<span class="van ${van != null ? 'si' : ''}">${van != null ? `✓ ${van ? num(van) : ''}` : `${icono('mas')}Agregar`}</span>`}</li>`;
          }).join('') || '<li class="vacio">No hay artículos con esa búsqueda.</li>';
        };
        let t; f.querySelector('#pkBusca').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value; pintar(); }, 120); });
        f.querySelector('#pkBusca').addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
        cl.addEventListener('click', e => { const b = e.target.closest('[data-clase]'); if (b) { clase = b.dataset.clase; pintar(); } });
        sel.addEventListener('change', () => { fam = sel.value; pintar(); });
        ul.addEventListener('click', e => {
          const li = e.target.closest('li.toca[data-a]'); if (!li) return;
          const p = arts.find(x => x.id === li.dataset.a); alAgregar(p);
          const van = cuantos(p), s = li.querySelector('.van'); s.classList.add('si'); s.textContent = `✓ ${van ? num(van) : ''}`;
          EPT.aviso(`${p.descripcion} agregado`);
        });
        pintar();
      } });
  }

  // ---------- Ver un documento (se puede imprimir) ----------
  async function abrirDocumento(id, recien) {
    const v = EPT.$('#vista'); v.innerHTML = '<div class="vacio">Cargando…</div>';
    const d = await EPT.leer(sb.from('almacen_documentos')
      .select('*,usuario:usuarios(nombre),lineas:almacen_documento_lineas(renglon,cantidad,presentacion,costo,importe,estante_antes,estante_despues,sistema,diferencia,hay_despues,producto:productos(codigo,descripcion,unidad))')
      .eq('id', id).single());
    const D = DOC[d.clase]; const ls = [...d.lineas].sort((a, b) => a.renglon - b.renglon);
    EPT.$('#subtitulo').textContent = D.nombre + ' ' + codDoc(d);
    EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnImprimir">${icono('imprimir')}Imprimir</button><button type="button" id="btnVolverDoc">${icono('atras')}Volver</button>`;
    EPT.$('#btnImprimir').addEventListener('click', () => window.print());
    EPT.$('#btnVolverDoc').addEventListener('click', () => EPT.ir(LISTA_DE[d.tipo]));
    const cab = { ingreso: `<th>Código</th><th>Artículo</th><th>Cantidad</th>${d.clase === 'compra' ? '<th style="text-align:right">Costo</th><th style="text-align:right">Importe</th>' : ''}<th>Quedó</th>`,
      despacho: `<th>Código</th><th>Artículo</th><th>Cantidad</th><th>Quedó</th>`,
      traslado: '<th>Código</th><th>Artículo</th><th>Estante antes</th><th>Estante nuevo</th>',
      ajuste: '<th>Código</th><th>Artículo</th><th>Decía el programa</th><th>Contado</th><th>Diferencia</th>' }[d.tipo];
    const fila = l => { const p = l.producto; const c = `<td>${esc(p.codigo)}</td><td><b>${esc(p.descripcion)}</b></td>`;
      const cant = `${num(l.cantidad)} ${esc(p.unidad)}${l.presentacion ? `<br><small class="mute">${esc(l.presentacion)}</small>` : ''}`;
      return { ingreso: `${c}<td>${cant}</td>${d.clase === 'compra' ? `<td style="text-align:right">${dinero(l.costo)}</td><td style="text-align:right">${dinero(l.importe)}</td>` : ''}<td>${l.hay_despues == null ? '—' : num(l.hay_despues)}</td>`,
        despacho: `${c}<td>${cant}</td><td>${l.hay_despues == null ? '—' : num(l.hay_despues)}</td>`,
        traslado: `${c}<td>${esc(l.estante_antes || '—')}</td><td><b>${esc(l.estante_despues || '—')}</b></td>`,
        ajuste: `${c}<td>${num(l.sistema)}</td><td>${num(l.cantidad)}</td><td><b class="${l.diferencia > 0 ? 'txt-ok' : l.diferencia < 0 ? 'txt-malo' : 'mute'}">${l.diferencia > 0 ? '+' : ''}${num(l.diferencia)}</b></td>` }[d.tipo]; };
    v.innerHTML = `
      ${recien ? `<div class="alerta">${icono('ok')}<div><b>Registrado.</b> ${d.tipo === 'ingreso' ? 'La existencia ya subió' + (d.clase === 'compra' ? ' y el costo quedó al día.' : '.') : d.tipo === 'despacho' ? 'La existencia ya bajó.' : d.tipo === 'traslado' ? 'Los estantes ya cambiaron.' : 'La existencia quedó como se contó.'}</div></div>` : ''}
      <div class="panel comprobante"><div class="cuerpo">
        <div class="comp-cab"><span class="logo"></span><div><b>EL PALACIO DE LA TRANSMISIÓN</b><span>${esc(D.nombre)} · documento interno del almacén</span></div></div>
        <div class="fila"><span class="ot-num">${codDoc(d)}</span><span class="estado ok">Registrado</span></div>
        <dl class="datos">
          <div><dt>Fecha</dt><dd>${fecha(d.fecha)}</dd></div>
          <div><dt>Registró</dt><dd>${esc(d.usuario?.nombre || '')}</dd></div>
          ${d.suplidor ? `<div><dt>Suplidor</dt><dd>${esc(d.suplidor)}</dd></div>` : ''}
          ${d.numero_factura ? `<div><dt>${esc(d.doc_suplidor || 'Factura')}</dt><dd>${esc(d.numero_factura)}</dd></div>` : ''}
          ${d.ncf ? `<div><dt>NCF</dt><dd>${esc(d.ncf)}</dd></div>` : ''}
          ${d.fecha_factura ? `<div><dt>Fecha de la factura</dt><dd>${fechaCorta(d.fecha_factura)}</dd></div>` : ''}
          ${d.para ? `<div><dt>Para</dt><dd>${esc(d.para)}</dd></div>` : ''}
          ${d.motivo ? `<div class="ancho"><dt>${d.tipo === 'traslado' ? 'Nota' : 'Motivo'}</dt><dd>${esc(d.motivo)}</dd></div>` : ''}
        </dl></div>
        <div class="desliza"><table class="tabla"><thead><tr>${cab}</tr></thead><tbody>${ls.map(l => `<tr>${fila(l)}</tr>`).join('')}</tbody></table></div>
        ${d.clase === 'compra' ? `<div class="totales-doc fijo"><div>Subtotal <b>${dinero(d.subtotal)}</b></div><div>ITBIS <b>${dinero(d.itbis)}</b></div><div class="total">Total de la factura <b>${dinero(d.total)}</b></div></div>` : ''}
        <div class="firmas"><div>${d.tipo === 'despacho' ? 'Despachó (Almacén)' : 'Registró (Almacén)'}</div><div>${d.tipo === 'despacho' ? 'Recibió' : d.clase === 'compra' ? 'Entregó (suplidor)' : 'Revisó'}</div></div>
      </div>`;
    window.scrollTo(0, 0);
  }

  // =====================================================================
  // Requisiciones: lo que Repuestos le pide al Almacén (es la "solicitud de traspaso" de Libra).
  // Se ve en el Almacén ("Pedidos de Repuestos") y en Repuestos ("Pedidos al almacén").
  // =====================================================================
  let filtroReq = 'abiertas';
  let volverReq = 'requisiciones';
  async function listaRequisiciones(v) {
    const q = sb.from('requisiciones').select('id,numero,estado,fecha,motivo,orden:ordenes(numero),creador:usuarios!requisiciones_creado_por_fkey(nombre),lineas:requisicion_lineas(id)').order('numero', { ascending: false }).limit(200);
    const filas = await EPT.leer(filtroReq === 'abiertas' ? q.in('estado', ['nueva', 'pendiente', 'aprobada', 'parcial']) : q);
    const c = k => filas.filter(r => r.estado === k).length;
    v.innerHTML = `<div class="fila" style="margin-bottom:14px"><div class="seg" role="group">
        <button type="button" data-f="abiertas" aria-pressed="${filtroReq === 'abiertas'}">Por atender</button>
        <button type="button" data-f="todas" aria-pressed="${filtroReq === 'todas'}">Todas</button></div>
        ${filtroReq === 'abiertas' ? `<div class="contadores" style="margin:0"><span><b>${c('nueva') + c('pendiente')}</b> por decidir</span><span><b>${c('aprobada') + c('parcial')}</b> aprobadas por despachar</span></div>` : ''}</div>
      <div class="panel">${filas.length ? `<ul class="lista">${filas.map(r => `<li class="toca" data-r="${r.id}"><span class="serie">${rn(r.numero)}</span>
        <div class="q"><b>${r.orden ? ot(r.orden.numero) : 'Reposición de Repuestos'}${r.motivo ? ' · ' + esc(r.motivo) : ''}</b>
          <span>${cuantos(r.lineas.length)} · ${esc(r.creador?.nombre || '')} · ${fecha(r.fecha)}</span></div>${chip(REQ, r.estado)}</li>`).join('')}</ul>`
        : '<div class="vacio">No hay pedidos por atender.</div>'}</div>`;
    v.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { filtroReq = b.dataset.f; EPT.recargar(); }));
    v.querySelectorAll('[data-r]').forEach(li => li.addEventListener('click', () => abrirRequisicion(li.dataset.r)));
  }
  EPT.listaRequisiciones = listaRequisiciones;

  EPT.pantalla({
    id: 'requisiciones', titulo: 'Pedidos de Repuestos', pestana: 'Pedidos de Repuestos', grupo: 'Almacén', icono: 'deposito', peso: 2,
    explica: 'Lo que Repuestos le pide al almacén (requisiciones R-). Se aprueba y se despacha a Repuestos.',
    ver: () => ['almacen.resolver', 'almacen.transferir', 'almacen.diferencia'].some(p => EPT.puede(p)),
    mostrar: listaRequisiciones,
  });

  async function abrirRequisicion(id) {
    if (['requisiciones', 'rep_pedidos_alm'].includes(EPT.actual)) volverReq = EPT.actual;
    const v = EPT.$('#vista'); v.innerHTML = '<div class="vacio">Cargando…</div>';
    const r = await EPT.leer(sb.from('requisiciones').select('id,numero,estado,fecha,motivo,motivo_rechazo,resuelto,orden:ordenes(id,numero,vehiculo:vehiculos(marca,modelo,placa)),creador:usuarios!requisiciones_creado_por_fkey(nombre),resolvio:usuarios!requisiciones_resuelto_por_fkey(nombre),lineas:requisicion_lineas(id,cantidad,disponible_repuestos,aprobada,enviada,producto:productos(id,codigo,descripcion,unidad))').eq('id', id).single());
    const desps = await EPT.leer(sb.from('transferencias').select('id,numero,estado,fecha_envio').eq('requisicion_id', id).order('numero'));
    const ids = r.lineas.map(l => l.producto.id);
    const exA = Object.fromEntries((await EPT.leer(sb.from('existencias').select('producto_id,cantidad').eq('ubicacion', 'almacen').in('producto_id', ids))).map(e => [e.producto_id, Number(e.cantidad)]));
    const decidir = ['nueva', 'pendiente'].includes(r.estado) && EPT.puede('almacen.resolver');
    const despachar = ['aprobada', 'parcial'].includes(r.estado) && EPT.puede('almacen.transferir') && r.lineas.some(l => Number(l.enviada) < Number(l.aprobada));
    EPT.$('#subtitulo').textContent = rn(r.numero) + (r.orden ? ` · ${ot(r.orden.numero)} · ${[r.orden.vehiculo?.marca, r.orden.vehiculo?.modelo, r.orden.vehiculo?.placa].filter(Boolean).join(' ')}` : ' · Reposición de Repuestos');
    EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnVolverReq">${icono('atras')}Volver</button>`;
    EPT.$('#btnVolverReq').addEventListener('click', () => EPT.ir(EPT.puedeVer(volverReq) ? volverReq : 'inicio'));
    v.innerHTML = `
      <div class="panel"><div class="cuerpo"><div class="fila"><span class="ot-num">${rn(r.numero)}</span>${chip(REQ, r.estado)}
        ${['nueva', 'pendiente'].includes(r.estado) && EPT.puede('repuestos.requisicion') ? '<button type="button" class="liso peque der" id="btnCancReq">Cancelar requisición</button>' : ''}</div>
        <dl class="datos"><div><dt>Pidió</dt><dd>${esc(r.creador?.nombre || '')} · ${fecha(r.fecha)}</dd></div>
          ${r.resolvio ? `<div><dt>Resolvió</dt><dd>${esc(r.resolvio.nombre)} · ${fecha(r.resuelto)}</dd></div>` : ''}
          ${r.motivo ? `<div class="ancho"><dt>Motivo</dt><dd>${esc(r.motivo)}</dd></div>` : ''}
          ${r.motivo_rechazo ? `<div class="ancho"><dt>Respuesta del Almacén</dt><dd>${esc(r.motivo_rechazo)}</dd></div>` : ''}</dl></div></div>
      <div class="panel" style="margin-top:16px"><header><h2>Piezas</h2></header><div class="desliza">
        <table class="tabla entregar"><thead><tr><th>Pieza</th><th>Pidió</th><th>Tenía Repuestos</th><th>Hay en el Almacén</th><th>Aprobado</th><th>Despachado</th>
          ${decidir ? '<th>Aprobar</th>' : ''}${despachar ? '<th>Despachar ahora</th>' : ''}</tr></thead><tbody>
        ${r.lineas.map(l => { const hay = exA[l.producto.id] || 0; const falta = Number(l.aprobada) - Number(l.enviada);
          return `<tr data-l="${l.id}" data-pid="${l.producto.id}"><td><b>${esc(l.producto.descripcion)}</b> <small class="mute">${esc(l.producto.codigo)}</small></td>
            <td>${num(l.cantidad)}</td><td>${num(l.disponible_repuestos)}</td><td><b class="${hay < Number(l.cantidad) ? 'txt-aviso' : ''}">${num(hay)}</b></td>
            <td>${num(l.aprobada)}</td><td>${num(l.enviada)}</td>
            ${decidir ? `<td><input class="cant apr" type="number" min="0" max="${l.cantidad}" step="any" value="${Math.min(Number(l.cantidad), hay)}"></td>` : ''}
            ${despachar ? `<td>${falta > 0 ? `<input class="cant des" type="number" min="0" max="${falta}" step="any" value="${Math.min(falta, hay)}">` : ''}</td>` : ''}</tr>`; }).join('')}
        </tbody></table></div>
        ${decidir ? `<div class="pie-panel"><button type="button" class="prin" id="btnAprobar">${icono('ok')}Aprobar</button>
          <button type="button" id="btnSinEx">No hay existencia</button><button type="button" class="liso peque der" id="btnRechazar">Rechazar…</button></div>` : ''}
        ${despachar ? `<div class="pie-panel"><button type="button" class="prin" id="btnDespachar">${icono('camion')}Despachar a Repuestos</button></div>` : ''}
      </div>
      ${desps.length ? `<div class="panel" style="margin-top:16px"><header><h2>Despachos</h2></header><ul class="lista">${desps.map(t => `<li class="toca" data-t="${t.id}">
        <div class="q"><b>${dn(t.numero)}</b><span>${fecha(t.fecha_envio)}</span></div>${chip(DES, t.estado)}</li>`).join('')}</ul></div>` : ''}`;
    const listo = () => abrirRequisicion(id);
    v.querySelectorAll('[data-t]').forEach(li => li.addEventListener('click', () => abrirDespacho(li.dataset.t)));
    const fl = cls => [...v.querySelectorAll('tr[data-l]')].map(tr => ({ linea_id: tr.dataset.l, val: Number(tr.querySelector('input.' + cls)?.value || 0),
      pedida: Number(r.lineas.find(l => l.id === tr.dataset.l).cantidad) }));
    const ba = EPT.$('#btnAprobar');
    if (ba) ba.addEventListener('click', () => {
      const ls = fl('apr'); const todo = ls.every(x => x.val === x.pedida);
      if (ls.every(x => x.val === 0)) { EPT.aviso('No aprobó nada: use "No hay existencia" o "Rechazar"', true); return; }
      EPT.ventana({
        titulo: todo ? 'Aprobar todo' : 'Aprobar en parte', boton: 'Aprobar',
        cuerpo: `<p style="margin:0">${todo ? `Se aprueba todo lo que pidió Repuestos en ${rn(r.numero)}.` : 'Se aprueba solo lo que escribió en "Aprobar".'}</p>
          ${todo ? '' : '<label class="campo">Nota para Repuestos <small class="opc">(opcional)</small><input name="motivo" maxlength="200" placeholder="Ej. solo hay 4"></label>'}`,
        async alGuardar(f) {
          await EPT.rpc('ept_requisicion_resolver', todo ? { p_req: r.id, p_decision: 'aprobar' }
            : { p_req: r.id, p_decision: 'parcial', p_lineas: ls.map(x => ({ linea_id: x.linea_id, aprobada: x.val })), p_motivo: f.motivo.value });
          EPT.aviso('Aprobada. Ahora despáchela.'); listo();
        },
      });
    });
    const negar = decision => EPT.ventana({
      titulo: decision === 'rechazar' ? 'Rechazar ' + rn(r.numero) : 'No hay existencia', boton: decision === 'rechazar' ? 'Rechazar' : 'Avisar a Repuestos',
      cuerpo: `<label class="campo">${decision === 'rechazar' ? '¿Por qué se rechaza?' : 'Nota para Repuestos'} ${decision === 'rechazar' ? '' : '<small class="opc">(opcional)</small>'}<input name="motivo" maxlength="200" ${decision === 'rechazar' ? 'required' : ''}></label>`,
      async alGuardar(f) { await EPT.rpc('ept_requisicion_resolver', { p_req: r.id, p_decision: decision, p_motivo: f.motivo.value }); EPT.aviso('Se avisó a Repuestos'); listo(); },
    });
    const bs = EPT.$('#btnSinEx'); if (bs) bs.addEventListener('click', () => negar('sin_existencia'));
    const br = EPT.$('#btnRechazar'); if (br) br.addEventListener('click', () => negar('rechazar'));
    const bc = EPT.$('#btnCancReq'); if (bc) bc.addEventListener('click', () => EPT.ventana({
      titulo: 'Cancelar ' + rn(r.numero), boton: 'Cancelar requisición', cuerpo: '<label class="campo">¿Por qué?<input name="motivo" required maxlength="200"></label>',
      async alGuardar(f) { await EPT.rpc('ept_requisicion_cancelar', { p_req: r.id, p_motivo: f.motivo.value }); EPT.aviso('Requisición cancelada'); listo(); } }));
    const bd = EPT.$('#btnDespachar');
    if (bd) bd.addEventListener('click', async () => {
      const ls = fl('des').filter(x => x.val > 0);
      if (!ls.length) { EPT.aviso('Escriba cuánto despacha', true); return; }
      bd.disabled = true;
      try {
        const t = await EPT.rpc('ept_transferencia_enviar', { p_req: r.id, p_lineas: ls.map(x => ({ linea_id: x.linea_id, cantidad: x.val })) });
        EPT.aviso(`Despacho ${dn(t.numero)} registrado. Va en camino a Repuestos.`); abrirDespacho(t.id, true);
      } catch (e) { EPT.aviso(EPT.error(e), true); bd.disabled = false; }
    });
    window.scrollTo(0, 0);
  }

  // =====================================================================
  // Despacho a Repuestos (D-): va "en camino" hasta que Repuestos registra el ingreso
  // =====================================================================
  async function abrirDespacho(id, recien) {
    const volver = EPT.actual;
    const v = EPT.$('#vista'); v.innerHTML = '<div class="vacio">Cargando…</div>';
    const t = await EPT.leer(sb.from('transferencias').select('id,numero,estado,origen,destino,fecha_envio,fecha_recibo,fecha_resuelto,nota_diferencia,comentario,envio:usuarios!transferencias_enviado_por_fkey(nombre),recibio:usuarios!transferencias_recibido_por_fkey(nombre),requisicion:requisiciones(id,numero,orden:ordenes(id,numero,vehiculo:vehiculos(marca,modelo,placa))),lineas:transferencia_lineas(id,enviada,recibida,diferencia_nota,producto:productos(id,codigo,descripcion,unidad))').eq('id', id).single());
    const ingresar = t.estado === 'en_transito' && EPT.puede('repuestos.recibir');
    const resolver = t.estado === 'con_diferencia' && EPT.puede('almacen.diferencia');
    EPT.$('#subtitulo').textContent = 'Despacho ' + dn(t.numero) + ' · Almacén → Repuestos';
    EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnImprimir">${icono('imprimir')}Imprimir comprobante</button><button type="button" id="btnVolverDes">${icono('atras')}Volver</button>`;
    EPT.$('#btnVolverDes').addEventListener('click', () => EPT.ir(['alm_despachos', 'rep_ingresos', 'requisiciones', 'rep_pedidos_alm'].includes(volver) ? volver : EPT.puedeVer('alm_despachos') ? 'alm_despachos' : 'rep_ingresos'));
    EPT.$('#btnImprimir').addEventListener('click', () => window.print());
    v.innerHTML = `
      ${recien ? `<div class="alerta">${icono('camion')}<div><b>Despachado.</b> La mercancía va en camino. Repuestos debe registrar el ingreso de lo que llegó.</div></div>` : ''}
      <div class="panel comprobante"><div class="cuerpo">
        <div class="comp-cab"><span class="logo"></span><div><b>EL PALACIO DE LA TRANSMISIÓN</b><span>Comprobante de despacho interno · no es una venta</span></div></div>
        <div class="fila"><span class="ot-num">${dn(t.numero)}</span>${chip(DES, t.estado)}</div>
        <dl class="datos"><div><dt>De</dt><dd>Almacén</dd></div><div><dt>Para</dt><dd>Repuestos</dd></div>
          ${t.requisicion ? `<div><dt>Requisición</dt><dd>${rn(t.requisicion.numero)}${t.requisicion.orden ? ' · ' + ot(t.requisicion.orden.numero) : ''}</dd></div>` : `<div><dt>Comentario</dt><dd>${esc(t.comentario || 'Sin requisición')}</dd></div>`}
          <div><dt>Despachó</dt><dd>${esc(t.envio?.nombre || '')} · ${fecha(t.fecha_envio)}</dd></div>
          ${t.recibio ? `<div><dt>Registró el ingreso</dt><dd>${esc(t.recibio.nombre)} · ${fecha(t.fecha_recibo)}</dd></div>` : ''}
          ${t.nota_diferencia ? `<div class="ancho"><dt>Diferencia</dt><dd>${esc(t.nota_diferencia.replace(/^aparecio:/, 'Apareció:').replace(/^regresa:/, 'Regresó al Almacén:').replace(/^perdida:/, 'Se perdió:'))} · ${fecha(t.fecha_resuelto)}</dd></div>` : ''}</dl>
      </div>
      <div class="desliza"><table class="tabla entregar"><thead><tr><th>Pieza</th><th>Despachado</th><th>${ingresar ? 'Llegó' : 'Ingresó'}</th>${ingresar ? '<th>Si llegó menos, ¿qué pasó?</th>' : ''}</tr></thead><tbody>
        ${t.lineas.map(l => `<tr data-l="${l.id}" data-pid="${l.producto.id}" data-des="${l.enviada}"><td><b>${esc(l.producto.descripcion)}</b> <small class="mute">${esc(l.producto.codigo)}</small></td>
          <td>${num(l.enviada)} ${esc(l.producto.unidad)}</td>
          <td>${ingresar ? `<input class="cant ing" type="number" min="0" max="${l.enviada}" step="any" value="${l.enviada}">`
            : l.recibida == null ? '—' : `<b class="${Number(l.recibida) < Number(l.enviada) ? 'txt-malo' : 'txt-ok'}">${num(l.recibida)}</b>`}
            ${!ingresar && l.diferencia_nota ? `<br><small class="mute">${esc(l.diferencia_nota)}</small>` : ''}</td>
          ${ingresar ? '<td><input class="nota" maxlength="200" style="min-height:40px"></td>' : ''}</tr>`).join('')}
      </tbody></table></div>
      <div class="firmas"><div>Despachó (Almacén)</div><div>Ingresó (Repuestos)</div></div>
      ${ingresar ? `<div class="pie-panel no-imprimir"><button type="button" class="prin" id="btnIngreso">${icono('ok')}Registrar ingreso</button></div>` : ''}
      ${resolver ? `<div class="pie-panel no-imprimir"><span>Lo que faltó sigue <b>en camino</b> hasta resolverlo:</span>
        <button type="button" class="peque" data-res="aparecio">Apareció: ingresa a Repuestos</button>
        <button type="button" class="peque" data-res="regresa">Regresa al Almacén</button>
        <button type="button" class="peque" data-res="perdida">Se perdió</button></div>` : ''}
      </div>`;
    const listo = () => abrirDespacho(id);
    const bi = EPT.$('#btnIngreso');
    if (bi) bi.addEventListener('click', async () => {
      const ls = [...v.querySelectorAll('tr[data-l]')].map(tr => ({ linea_id: tr.dataset.l, recibida: Number(tr.querySelector('.ing').value), nota: tr.querySelector('.nota').value, des: Number(tr.dataset.des) }));
      if (ls.some(x => x.recibida < x.des && !x.nota.trim())) { EPT.aviso('Llegó menos de lo despachado: escriba qué pasó', true); return; }
      bi.disabled = true;
      try { const r = await EPT.rpc('ept_transferencia_recibir', { p_trans: t.id, p_lineas: ls });
        EPT.aviso(r.diferencia ? 'Ingreso registrado con diferencia: se avisó al Almacén' : 'Ingreso registrado: ya está en la existencia de Repuestos');
        // si era para una orden, se sigue despachando dentro de esa orden (paso 4)
        if (t.requisicion?.orden) EPT.abrirOrden(t.requisicion.orden.id); else listo(); }
      catch (e) { EPT.aviso(EPT.error(e), true); bi.disabled = false; }
    });
    v.querySelectorAll('[data-res]').forEach(b => b.addEventListener('click', () => EPT.ventana({
      titulo: b.textContent, boton: 'Resolver',
      cuerpo: `<label class="campo">¿Qué pasó?<input name="nota" required maxlength="200"></label>`,
      async alGuardar(f) { await EPT.rpc('ept_transferencia_resolver', { p_trans: t.id, p_decision: b.dataset.res, p_nota: f.nota.value }); EPT.aviso('Diferencia resuelta'); listo(); } })));
    window.scrollTo(0, 0);
  }
  EPT.abrirTransferencia = abrirDespacho;
  EPT.abrirRequisicion = abrirRequisicion;

  // =====================================================================
  // Inicio: lo que hace el Almacén, en palabras de todos los días
  // =====================================================================
  const nuevo = clase => () => nuevoDocumento(clase);
  EPT.verbo({ grupo: 'Almacén', peso: 1, prin: true, titulo: 'Entró mercancía', sub: 'Registrar la factura de compra', ir: 'alm_ingresos', hacer: nuevo('compra'), ver: () => puedeAlm('ingreso') });
  EPT.verbo({ grupo: 'Almacén', peso: 2, titulo: 'Salió mercancía', sub: 'A Repuestos, a un mecánico, a un ayudante o a otra persona', ir: 'alm_despachos', hacer: nuevo('persona'), ver: () => puedeAlm('despacho') });
  EPT.verbo({ grupo: 'Almacén', peso: 3, titulo: 'Pedidos de Repuestos', sub: 'Aprobar y despachar', ir: 'requisiciones',
    cuenta: () => EPT.leer(sb.from('requisiciones').select('id').in('estado', ['nueva', 'pendiente', 'aprobada', 'parcial'])).then(l => l.length) });
  EPT.verbo({ grupo: 'Almacén', peso: 4, titulo: 'Cambiar de estante', sub: 'Hacer un traslado', ir: 'alm_traslados', hacer: nuevo('traslado'), ver: () => puedeAlm('traslado') });
  EPT.verbo({ grupo: 'Almacén', peso: 5, titulo: 'Conté y no cuadra', sub: 'Hacer un ajuste', ir: 'alm_ajustes', hacer: nuevo('conteo'), ver: () => puedeAlm('ajustar') });
  EPT.verbo({ grupo: 'Almacén', peso: 6, titulo: 'Ver lo que hay', sub: 'Existencia del almacén', ir: 'inventario' });
  EPT.verbo({ grupo: 'Almacén', peso: 7, titulo: 'Crear artículo', sub: 'Pieza, insumo, misceláneo o producto', ir: 'inventario', hacer: () => editarArticulo(null), ver: () => puedeAlm('articulos') });
})();
