// EPT CONTROL OPERATIVO · Vehículos y transmisiones: marcas y modelos (casilla "la trabajamos"),
// qué transmisión lleva cada modelo por años y motor (con su fuente), y la lista de transmisiones.
(function () {
  'use strict';
  const { sb, esc, icono } = EPT;
  Object.assign(EPT.ICONOS, { engrane: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>' });
  const TIPOS = { automatica: 'Automática', cvt: 'CVT', manual: 'Manual', dct: 'Doble embrague', otra: 'Otra' };
  let pestana = 'marcas', marcaAbierta = null, buscaCat = '';
  const puede = () => EPT.puede('catalogo.gestionar');

  EPT.pantalla({
    id: 'catalogo', titulo: 'Vehículos y transmisiones', subtitulo: 'Qué transmisión lleva cada vehículo',
    icono: 'engrane', grupo: 'Repuestos', ver: () => EPT.puede('catalogo.gestionar') || EPT.puede('productos.gestionar') || EPT.puede('repuestos.despachar'),
    async mostrar(v) {
      v.innerHTML = `<div class="fila" style="margin-bottom:14px"><div class="seg" role="group">
          <button type="button" data-t="marcas" aria-pressed="${pestana === 'marcas'}">Marcas y modelos</button>
          <button type="button" data-t="trans" aria-pressed="${pestana === 'trans'}">Transmisiones</button></div>
          <div class="buscador">${icono('buscar')}<input id="bCat" type="search" value="${esc(buscaCat)}" placeholder="${pestana === 'marcas' ? 'Buscar marca o modelo' : 'Buscar transmisión'}"></div></div>
        <div id="cajaCat"><div class="vacio">Cargando…</div></div>`;
      v.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { pestana = b.dataset.t; buscaCat = ''; marcaAbierta = null; EPT.recargar(); }));
      let t; v.querySelector('#bCat').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { buscaCat = e.target.value; pintar(); }, 250); });
      await pintar();
    },
  });

  let cache = null;
  // se guarda en memoria unos minutos; al guardar una marca, modelo, transmisión o aplicación se vuelve a bajar
  const cargar = () => EPT.memoria('vehiculos', async () => {
    const [marcas, modelos, trans, apl] = await Promise.all([
      EPT.leer(sb.from('vehiculo_marcas').select('id,nombre,activo').order('nombre')),
      EPT.leerTodo(() => sb.from('vehiculo_modelos').select('id,marca_id,nombre,activo').order('nombre')),
      EPT.leer(sb.from('transmisiones').select('id,codigo,fabricante,tipo,velocidades,otros_nombres,notas,activo').order('codigo')),
      EPT.leerTodo(() => sb.from('aplicaciones').select('id,modelo_id,anio_desde,anio_hasta,motor,traccion,transmision_id,fuente,verificado,activo').eq('activo', true)),
    ]);
    cache = { marcas, modelos, trans, apl };
    return cache;
  }, { cambiaCon: /catalogo|aplicacion|transmision|marca|modelo/ }).then(d => (cache = d));

  async function pintar() {
    const d = cache && pestana === cache.pest ? cache : await cargar(); d.pest = pestana;
    const caja = EPT.$('#cajaCat'); if (!caja) return;
    const barra = EPT.$('#barraBotones');
    barra.innerHTML = puede() ? (pestana === 'marcas'
      ? `<button type="button" class="prin" id="btnNuevaMarca">${icono('mas')}Marca</button>`
      : `<button type="button" class="prin" id="btnNuevaTrans">${icono('mas')}Transmisión</button>`) : '';
    const q = buscaCat.trim().toLowerCase();
    if (pestana === 'trans') {
      const lista = d.trans.filter(t => !q || [t.codigo, t.fabricante, t.otros_nombres].join(' ').toLowerCase().includes(q));
      caja.innerHTML = `<div class="panel">${lista.length ? `<ul class="lista">${lista.map(t => {
        const n = d.apl.filter(a => a.transmision_id === t.id).length;
        return `<li class="${puede() ? 'toca' : ''} ${t.activo ? '' : 'apagado'}" data-t="${t.id}"><span class="codigo">${esc(t.codigo)}</span>
          <div class="q"><b>${esc(t.fabricante || '—')} · ${esc(TIPOS[t.tipo] || t.tipo)}${t.velocidades ? ' · ' + t.velocidades + ' vel.' : ''}</b>
          <span>${t.otros_nombres ? 'También: ' + esc(t.otros_nombres) + ' · ' : ''}${n} aplicación${n === 1 ? '' : 'es'}</span></div></li>`; }).join('')}</ul>`
        : '<div class="vacio">No hay transmisiones todavía.</div>'}</div>`;
      caja.querySelectorAll('[data-t]').forEach(li => li.addEventListener('click', () => { if (puede()) fichaTrans(d.trans.find(t => t.id === li.dataset.t)); }));
      const bt = EPT.$('#btnNuevaTrans'); if (bt) bt.addEventListener('click', () => fichaTrans(null));
      return;
    }
    // marcas y modelos
    const marcas = d.marcas.filter(m => !q || m.nombre.toLowerCase().includes(q) || d.modelos.some(x => x.marca_id === m.id && x.nombre.toLowerCase().includes(q)));
    caja.innerHTML = `<p class="mute" style="margin:0 0 10px">Quite la marca de "La trabajamos" para que no aparezca en búsquedas ni listas. Lo mismo con cada modelo.</p>
      <div class="panel">${marcas.length ? `<ul class="lista">${marcas.map(m => {
        const mods = d.modelos.filter(x => x.marca_id === m.id && (!q || m.nombre.toLowerCase().includes(q) || x.nombre.toLowerCase().includes(q)));
        const abierta = marcaAbierta === m.id || (q && mods.length && !m.nombre.toLowerCase().includes(q));
        return `<li class="marca ${m.activo ? '' : 'apagado'}">
          <button type="button" class="liso abrir" data-abrir="${m.id}" aria-expanded="${abierta}"><b>${esc(m.nombre)}</b> <span class="mute">${d.modelos.filter(x => x.marca_id === m.id).length} modelos</span></button>
          <label class="check der"><input type="checkbox" data-act="vehiculo_marcas" data-id="${m.id}" ${m.activo ? 'checked' : ''} ${puede() ? '' : 'disabled'}><span>La trabajamos</span></label></li>
          ${abierta ? `<li class="modelos"><div>${mods.map(x => {
            const apls = d.apl.filter(a => a.modelo_id === x.id).sort((a, b) => (a.anio_desde ?? 9999) - (b.anio_desde ?? 9999));
            return `<div class="modelo ${x.activo ? '' : 'apagado'}"><div class="fila"><b>${esc(x.nombre)}</b>
              <label class="check der"><input type="checkbox" data-act="vehiculo_modelos" data-id="${x.id}" ${x.activo ? 'checked' : ''} ${puede() && m.activo ? '' : 'disabled'}><span>La trabajamos</span></label></div>
              ${apls.length ? `<ul class="apl">${apls.map(a => { const t = d.trans.find(y => y.id === a.transmision_id) || {};
                return `<li${puede() ? ` class="toca" data-apl="${a.id}"` : ''}><b>${EPT.anios(a)}</b> ${esc([a.motor, a.traccion].filter(Boolean).join(' · '))}
                  → <span class="codigo">${esc(t.codigo || '?')}</span> ${a.verificado ? '<span class="txt-ok">✔</span>' : '<span class="txt-aviso" title="Por verificar">?</span>'}</li>`; }).join('')}</ul>` : '<p class="mute" style="margin:4px 0 0">Sin transmisiones anotadas.</p>'}
              ${puede() ? `<button type="button" class="liso peque" data-nueva-apl="${x.id}">${icono('mas')}Años y transmisión</button>` : ''}</div>`; }).join('')}
            ${puede() ? `<button type="button" class="peque" data-nuevo-mod="${m.id}">${icono('mas')}Modelo de ${esc(m.nombre)}</button>` : ''}</div></li>` : ''}`; }).join('')}</ul>`
      : '<div class="vacio">No hay marcas todavía.</div>'}</div>`;
    caja.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => { marcaAbierta = marcaAbierta === b.dataset.abrir ? null : b.dataset.abrir; pintar(); }));
    caja.querySelectorAll('input[data-act]').forEach(c => c.addEventListener('change', async () => {
      try { await EPT.rpc('ept_catalogo_activar', { p_tabla: c.dataset.act, p_id: c.dataset.id, p_activo: c.checked });
        const lista = c.dataset.act === 'vehiculo_marcas' ? d.marcas : d.modelos; const x = lista.find(y => y.id === c.dataset.id); if (x) x.activo = c.checked;
        EPT.aviso(c.checked ? 'Marcada: la trabajamos' : 'Desactivada: no aparecerá'); pintar();
      } catch (e) { c.checked = !c.checked; EPT.aviso(EPT.error(e), true); } }));
    caja.querySelectorAll('[data-nuevo-mod]').forEach(b => b.addEventListener('click', () => fichaModelo(b.dataset.nuevoMod)));
    caja.querySelectorAll('[data-nueva-apl]').forEach(b => b.addEventListener('click', () => fichaAplicacion(b.dataset.nuevaApl, null, d)));
    caja.querySelectorAll('[data-apl]').forEach(li => li.addEventListener('click', () => { const a = d.apl.find(x => x.id === li.dataset.apl); fichaAplicacion(a.modelo_id, a, d); }));
    const bm = EPT.$('#btnNuevaMarca'); if (bm) bm.addEventListener('click', fichaMarca);
  }

  const listo = async () => { cache = null; await pintar(); };

  function fichaMarca() {
    EPT.ventana({ titulo: 'Nueva marca', cuerpo: `<label class="campo">Marca<input name="nombre" required maxlength="60"></label>`,
      async alGuardar(f) { marcaAbierta = await EPT.rpc('ept_marca_guardar', { p_id: null, p_nombre: f.nombre.value, p_activo: true }); EPT.aviso('Marca agregada'); listo(); } });
  }
  function fichaModelo(marca) {
    EPT.ventana({ titulo: 'Nuevo modelo', cuerpo: `<label class="campo">Modelo<input name="nombre" required maxlength="80"></label>`,
      async alGuardar(f) { await EPT.rpc('ept_modelo_guardar', { p_id: null, p_marca: marca, p_nombre: f.nombre.value, p_activo: true }); marcaAbierta = marca; EPT.aviso('Modelo agregado'); listo(); } });
  }
  function fichaAplicacion(modelo, a, d) {
    EPT.ventana({
      titulo: a ? 'Cambiar años y transmisión' : 'Años y transmisión',
      cuerpo: `<div class="dos"><label class="campo">Desde el año<input name="desde" type="number" min="1950" max="2100" value="${a && a.anio_desde != null ? a.anio_desde : ''}" placeholder="por confirmar"></label>
          <label class="campo">Hasta el año<input name="hasta" type="number" min="1950" max="2100" value="${a && a.anio_hasta != null ? a.anio_hasta : ''}" placeholder="vacío = hasta hoy"></label></div>
        <div class="dos"><label class="campo">Motor <small class="opc">(opcional)</small><input name="motor" maxlength="60" value="${esc(a ? a.motor : '')}" placeholder="Ej. 1.8L 2ZR-FE"></label>
          <label class="campo">Tracción <small class="opc">(opcional)</small><input name="traccion" maxlength="20" value="${esc(a ? a.traccion : '')}" placeholder="FWD, 4WD…"></label></div>
        <label class="campo">Transmisión<select name="trans" required><option value="">Elija…</option>${d.trans.filter(t => t.activo).map(t => `<option value="${t.id}" ${a && a.transmision_id === t.id ? 'selected' : ''}>${esc(t.codigo)} · ${esc(t.fabricante)}</option>`).join('')}</select></label>
        <label class="campo">¿De dónde salió el dato?<input name="fuente" maxlength="300" value="${esc(a ? a.fuente : '')}"></label>
        <label class="check"><input type="checkbox" name="verif" ${a && a.verificado ? 'checked' : ''}><span>Verificado</span></label>
        ${a ? `<p style="margin:0"><button type="button" class="liso peque" id="btnQuitarApl" style="color:var(--malo)">Quitar este dato</button></p>` : ''}`,
      alAbrir(f, dlg) { const q = f.querySelector('#btnQuitarApl'); if (q) q.addEventListener('click', async () => {
        try { await EPT.rpc('ept_catalogo_activar', { p_tabla: 'aplicaciones', p_id: a.id, p_activo: false }); dlg.close(); EPT.aviso('Quitado'); listo(); } catch (e) { EPT.aviso(EPT.error(e), true); } }); },
      async alGuardar(f) {
        await EPT.rpc('ept_aplicacion_guardar', { p_id: a ? a.id : null, p: { modelo_id: modelo, anio_desde: f.desde.value ? Number(f.desde.value) : null, anio_hasta: f.hasta.value ? Number(f.hasta.value) : null,
          motor: f.motor.value, traccion: f.traccion.value, transmision_id: f.trans.value, fuente: f.fuente.value, verificado: f.verif.checked } });
        EPT.aviso('Guardado'); listo();
      },
    });
  }
  function fichaTrans(t) {
    EPT.ventana({
      titulo: t ? t.codigo : 'Nueva transmisión',
      cuerpo: `<div class="dos"><label class="campo">Código<input name="codigo" required maxlength="30" value="${esc(t ? t.codigo : '')}" autocapitalize="characters" placeholder="Ej. U341E"></label>
          <label class="campo">Fabricante<input name="fab" maxlength="40" value="${esc(t ? t.fabricante : '')}" placeholder="Aisin, Jatco, GM…"></label></div>
        <div class="dos"><label class="campo">Tipo<select name="tipo">${Object.entries(TIPOS).map(([k, n]) => `<option value="${k}" ${t && t.tipo === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="campo">Velocidades<input name="vel" type="number" min="1" max="12" value="${t && t.velocidades ? t.velocidades : ''}"></label></div>
        <label class="campo">Otros nombres <small class="opc">(ej. JF011E)</small><input name="otros" maxlength="120" value="${esc(t ? t.otros_nombres : '')}"></label>
        <label class="campo">Notas<input name="notas" maxlength="300" value="${esc(t ? t.notas : '')}"></label>`,
      async alGuardar(f) {
        await EPT.rpc('ept_transmision_guardar', { p_id: t ? t.id : null, p: { codigo: f.codigo.value, fabricante: f.fab.value, tipo: f.tipo.value, velocidades: f.vel.value, otros_nombres: f.otros.value, notas: f.notas.value } });
        EPT.aviso('Guardado'); listo();
      },
    });
  }
})();
