// EPT CONTROL OPERATIVO · Almacén: inventario por familias, requisiciones de Repuestos y despachos.
// Palabras de la casa: todo lo que SALE es un DESPACHO, todo lo que ENTRA es un INGRESO,
// y mover dentro del almacén (de estante) es un TRASLADO.
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
  const ot = n => 'OT-' + String(n).padStart(5, '0');
  const fecha = f => f ? new Date(f).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const REQ = { nueva: ['Nueva', 'aviso'], pendiente: ['Pendiente', 'aviso'], aprobada: ['Aprobada', 'info'], parcial: ['Aprobada en parte', 'info'],
    rechazada: ['Rechazada', 'malo'], sin_existencia: ['Sin existencia', 'malo'], cancelada: ['Cancelada', ''], recibida: ['Completada', 'ok'] };
  const DES = { en_preparacion: ['En preparación', 'aviso'], en_transito: ['En camino', 'info'], recibida: ['Ingresado', 'ok'],
    con_diferencia: ['Con diferencia', 'malo'], diferencia_resuelta: ['Diferencia resuelta', 'ok'] };
  const chip = (m, k) => { const [t, c] = m[k] || [k, '']; return `<span class="estado ${c}">${esc(t)}</span>`; };
  const dn = n => 'D-' + n, rn = n => 'R-' + n;
  const puedeAlm = p => EPT.puede('almacen.' + p);
  const manejaAlmacen = () => ['articulos', 'ingreso', 'despacho', 'traslado', 'ajustar', 'resolver', 'transferir'].some(puedeAlm);

  // =====================================================================
  // Inventario del almacén, por familias y subfamilias
  // El Almacén lo maneja; Repuestos solo lo consulta para hacer sus requisiciones.
  // =====================================================================
  let famInv = '', subInv = '', buscaInv = '';
  const cargarInventario = () => EPT.leer(sb.from('productos')
    .select('id,codigo,descripcion,unidad,marca_pieza,numero_parte,minimo,notas,subfamilia_id,cobrable,codigo_barras,estante,empaque_nombre,empaque_unidades,activo,existencias(ubicacion,cantidad)')
    .eq('en_almacen', true).order('codigo'))
    .then(l => l.map(p => ({ ...p, hay: Number((p.existencias || []).find(e => e.ubicacion === 'almacen')?.cantidad || 0) })));
  const bajo = p => Number(p.minimo) > 0 && p.hay <= Number(p.minimo);

  EPT.pantalla({
    id: 'inventario', titulo: 'Inventario del almacén', subtitulo: 'Por familia y subfamilia, con existencia y mínimo',
    icono: 'anaquel', grupo: 'Almacén', atajo: 'Inventario', peso: -1,
    ver: () => manejaAlmacen() || ['repuestos.requisicion', 'repuestos.despachar', 'reportes.ver'].some(p => EPT.puede(p)),
    async mostrar(v) {
      if (puedeAlm('articulos')) {
        EPT.$('#barraBotones').innerHTML = `<button type="button" class="prin" id="btnNuevoArt">${icono('mas')}Nuevo artículo</button>`;
        EPT.$('#btnNuevoArt').addEventListener('click', () => editarArticulo(null));
      }
      const [arts, F] = await Promise.all([cargarInventario(), EPT.cargarFamilias()]);
      const activos = arts.filter(p => p.activo);
      const deFam = fid => activos.filter(p => F.porSub.get(p.subfamilia_id)?.familia_id === fid);
      const famsCon = F.fams.filter(f => deFam(f.id).length);
      if (famInv && !famsCon.some(f => f.id === famInv)) { famInv = ''; subInv = ''; }
      v.innerHTML = `
        ${manejaAlmacen() ? '' : `<p class="guia" style="margin-top:0">${icono('ojo')}Solo para consultar. Para pedir algo al almacén haga una requisición desde el pedido.</p>`}
        <div class="filtros-inv">
          <label class="campo">Familia<select id="fFam"><option value="">Todas las familias (${activos.length})</option>
            ${famsCon.map(f => `<option value="${f.id}" ${f.id === famInv ? 'selected' : ''}>${esc(f.nombre)} (${deFam(f.id).length})</option>`).join('')}</select></label>
          <label class="campo">Subfamilia<select id="fSub" ${famInv ? '' : 'disabled'}><option value="">Todas</option>
            ${famInv ? F.subsDe(famInv).filter(s => activos.some(p => p.subfamilia_id === s.id)).map(s => `<option value="${s.id}" ${s.id === subInv ? 'selected' : ''}>${esc(s.nombre)} (${activos.filter(p => p.subfamilia_id === s.id).length})</option>`).join('') : ''}</select></label>
        </div>
        <div class="fila" style="margin-bottom:14px">
          <div class="buscador">${icono('buscar')}<input id="bInv" type="search" value="${esc(buscaInv)}" placeholder="Código, nombre, marca, referencia, estante o escanee el código de barras"></div>
          <div class="contadores" style="margin:0"><span class="txt-malo"><b id="cBajo">0</b> bajo el mínimo</span><span><b id="cCero">0</b> sin existencia</span></div>
        </div>
        <div class="panel" id="listaInv"></div>`;
      v.querySelector('#fFam').addEventListener('change', e => { famInv = e.target.value; subInv = ''; EPT.recargar(); });
      v.querySelector('#fSub').addEventListener('change', e => { subInv = e.target.value; pintar(); });
      const caja = v.querySelector('#listaInv');
      const pintar = () => {
        const pal = EPT.llano(buscaInv.trim()).split(/\s+/).filter(Boolean);
        const lista = EPT.alfabetico(activos.filter(p => (!famInv || F.porSub.get(p.subfamilia_id)?.familia_id === famInv) && (!subInv || p.subfamilia_id === subInv)
          && pal.every(w => EPT.llano([p.codigo, p.descripcion, p.marca_pieza, p.numero_parte, p.estante, p.codigo_barras, F.nombre(p.subfamilia_id)].join(' ')).includes(w))));
        v.querySelector('#cBajo').textContent = lista.filter(bajo).length;
        v.querySelector('#cCero').textContent = lista.filter(p => p.hay <= 0).length;
        caja.innerHTML = lista.length ? `<ul class="lista">${lista.map(p => `<li class="toca" data-a="${p.id}"><span class="codigo">${esc(p.codigo)}</span>
            <div class="q"><b>${esc(p.descripcion)}</b><span>${[F.nombre(p.subfamilia_id), p.marca_pieza, p.numero_parte, p.estante ? 'Estante ' + p.estante : '', p.cobrable ? '' : 'No se cobra'].filter(Boolean).map(esc).join(' · ')}</span></div>
            <div class="stock"><span class="${bajo(p) ? 'txt-malo' : p.hay <= 0 ? 'mute' : ''}"><b>${num(p.hay)}</b> ${esc(p.unidad)}</span>${Number(p.minimo) > 0 ? `<span class="mute">mín. ${num(p.minimo)}</span>` : ''}</div></li>`).join('')}</ul>`
          : `<div class="vacio">${arts.length ? 'No hay artículos con esa búsqueda.' : 'Todavía no hay artículos en el almacén.'}</div>`;
      };
      let t; const bi = v.querySelector('#bInv');
      bi.addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { buscaInv = e.target.value; pintar(); }, 150); });
      // el lector de código de barras escribe el código y da Enter: si es exacto, abre el artículo
      bi.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const c = bi.value.trim(); const p = activos.find(x => x.codigo_barras === c || x.codigo.toUpperCase() === c.toUpperCase());
        if (p) { e.preventDefault(); bi.select(); fichaArticulo(p, F); }
      });
      caja.addEventListener('click', e => { const li = e.target.closest('[data-a]'); if (li) fichaArticulo(activos.find(p => p.id === li.dataset.a), F); });
      pintar();
    },
  });

  // ---------- Ficha de un artículo: datos, existencia, botones y su historial ----------
  async function fichaArticulo(p, F) {
    const [movs, regs, viejo] = await Promise.all([
      EPT.leer(sb.from('movimientos_inventario').select('fecha,cantidad,tipo,nota,usuario:usuarios(nombre)').eq('producto_id', p.id).eq('ubicacion', 'almacen').order('fecha', { ascending: false }).limit(30)),
      EPT.leer(sb.from('almacen_registros').select('fecha,tipo,antes,despues,nota,usuario:usuarios(nombre)').eq('producto_id', p.id).eq('tipo', 'traslado').order('fecha', { ascending: false }).limit(10)),
      EPT.leer(sb.from('historial_almacen_viejo').select('fecha,tipo,cantidad,presentacion,nota').eq('producto_id', p.id).order('fecha', { ascending: false }).limit(30)),
    ]);
    const TIPO = { ingreso_almacen: 'Ingreso', despacho_persona: 'Despacho a una persona', transferencia_salida: 'Despacho a Repuestos', transferencia_diferencia: 'Diferencia de despacho',
      ajuste: 'Ajuste', carga_inicial: 'Existencia inicial', importacion: 'Importación' };
    const hist = [
      ...movs.map(m => ({ f: m.fecha, t: `${TIPO[m.tipo] || m.tipo} ${Number(m.cantidad) > 0 ? '+' : ''}${num(m.cantidad)}`, n: m.nota, q: m.usuario?.nombre })),
      ...regs.map(r => ({ f: r.fecha, t: 'Traslado', n: `Estante ${r.antes || '—'} → ${r.despues || '—'}${r.nota ? ' · ' + r.nota : ''}`, q: r.usuario?.nombre })),
      ...viejo.map(h => ({ f: h.fecha, t: `${h.tipo} ${num(h.cantidad)}`, n: [h.presentacion, h.nota].filter(Boolean).join(' · '), q: 'programa anterior' })),
    ].sort((a, b) => String(b.f).localeCompare(String(a.f))).slice(0, 40);
    const botones = [
      puedeAlm('ingreso') && ['ingreso', 'ingreso', 'Ingreso', 'prin'],
      puedeAlm('despacho') && ['despacho', 'despacho', 'Despacho a una persona', ''],
      puedeAlm('traslado') && ['traslado', 'traslado', 'Traslado', ''],
      puedeAlm('ajustar') && ['ajustar', 'ajuste', 'Ajustar', 'liso'],
      puedeAlm('articulos') && ['editar', '', 'Editar', 'liso'],
    ].filter(Boolean);
    EPT.ventana({
      titulo: p.codigo + ' · ' + p.descripcion, boton: '',
      cuerpo: `
        <div class="existencia-grande"><b class="${bajo(p) ? 'txt-malo' : ''}">${num(p.hay)}</b> ${esc(p.unidad)} en el almacén
          ${Number(p.minimo) > 0 ? `<span class="mute">· mínimo ${num(p.minimo)}</span>` : ''}${bajo(p) ? ' <span class="estado malo">Bajo el mínimo</span>' : ''}</div>
        <dl class="datos">
          <div class="ancho"><dt>Familia · Subfamilia</dt><dd>${esc(F.nombre(p.subfamilia_id))}</dd></div>
          <div><dt>Estante</dt><dd>${esc(p.estante || '—')}</dd></div>
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
        if (puedeAlm('articulos')) EPT.enlazarCobro(f, async v => {
          await EPT.rpc('ept_producto_clasificar', { p_producto: p.id, p_subfamilia: p.subfamilia_id, p_cobrable: v });
          p.cobrable = v; EPT.aviso(v ? 'Ahora se cobra al cliente' : 'Ahora no se cobra al cliente'); EPT.recargar();
        });
        f.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
          d.close();
          ({ ingreso: () => mover(p, 'ingreso'), despacho: () => mover(p, 'despacho'), traslado: () => trasladar(p), ajustar: () => ajustar(p), editar: () => editarArticulo(p) })[b.dataset.x]();
        }));
      },
    });
  }

  // Ingreso, o despacho a una persona (la excepción: lo normal es despachar a Repuestos por requisición).
  // Se puede anotar en unidades o en cajas/paquetes.
  function mover(p, que) {
    const ing = que === 'ingreso';
    const emp = Number(p.empaque_unidades) > 1 && p.empaque_nombre;
    EPT.ventana({
      titulo: (ing ? 'Ingreso · ' : 'Despacho a una persona · ') + p.descripcion, boton: ing ? 'Registrar ingreso' : 'Registrar despacho',
      cuerpo: `${ing ? '' : '<p class="alerta" style="margin:0">Lo normal es despachar a Repuestos por requisición. Use esto solo cuando algo tiene que salir hacia otra persona.</p>'}
        <p class="mute" style="margin:0">Hay <b>${num(p.hay)}</b> ${esc(p.unidad)} en el almacén.</p>
        <div class="dos"><label class="campo">Cantidad<input name="cant" type="number" min="0" step="any" inputmode="decimal" class="grande" required></label>
          ${emp ? `<label class="campo">En<select name="en"><option value="1">${esc(p.unidad)}</option><option value="${p.empaque_unidades}">${esc(p.empaque_nombre)} de ${num(p.empaque_unidades)}</option></select></label>` : ''}</div>
        <p class="mute" id="total" style="margin:-6px 0 0"></p>
        ${ing ? '<label class="campo">¿De dónde vino? <small class="opc">(suplidor o factura, opcional)</small><input name="de" maxlength="120"></label>'
          : '<label class="campo">¿A qué persona?<input name="para" maxlength="120" required placeholder="Nombre de quien lo recibe"></label>'}
        <label class="campo">${ing ? 'Nota <small class="opc">(opcional)</small>' : 'Motivo'}<input name="nota" maxlength="200" ${ing ? '' : 'required placeholder="Ej. limpieza de la oficina"'}></label>`,
      alAbrir(f) {
        const tot = () => { const n = Number(f.cant.value || 0) * Number(f.en ? f.en.value : 1);
          f.querySelector('#total').textContent = f.en && f.en.value !== '1' && n ? `Son ${num(n)} ${p.unidad}.` : ''; };
        f.cant.addEventListener('input', tot); if (f.en) f.en.addEventListener('change', tot);
      },
      async alGuardar(f) {
        const cant = Number(f.cant.value || 0), por = Number(f.en ? f.en.value : 1), total = cant * por;
        if (!(cant > 0)) { f.cant.classList.add('falta'); f.cant.focus(); throw new Error(ing ? 'Escriba cuánto ingresa' : 'Escriba cuánto despacha'); }
        const pres = por > 1 ? `${num(cant)} ${p.empaque_nombre.toLowerCase()} de ${num(por)}` : `${num(cant)} ${p.unidad}`;
        if (ing) await EPT.rpc('ept_almacen_ingreso', { p_producto: p.id, p_cantidad: total, p_presentacion: pres, p_suplidor: f.de.value, p_nota: f.nota.value });
        else {
          if (!f.para.value.trim()) { f.para.classList.add('falta'); f.para.focus(); throw new Error('Escriba a qué persona se le despacha'); }
          if (!f.nota.value.trim()) { f.nota.classList.add('falta'); f.nota.focus(); throw new Error('Escriba el motivo del despacho'); }
          await EPT.rpc('ept_almacen_despacho', { p_producto: p.id, p_cantidad: total, p_presentacion: pres, p_para: f.para.value, p_nota: f.nota.value });
        }
        EPT.aviso(ing ? `Ingreso registrado: +${num(total)}` : `Despacho registrado: −${num(total)}`); EPT.recargar();
      },
    });
  }

  function trasladar(p) {
    EPT.ventana({
      titulo: 'Traslado · ' + p.descripcion, boton: 'Trasladar',
      cuerpo: `<p class="mute" style="margin:0">Ahora está en el estante <b>${esc(p.estante || 'sin estante')}</b>. La existencia no cambia.</p>
        <label class="campo">Estante nuevo<input name="estante" maxlength="40" required></label>
        <label class="campo">Nota <small class="opc">(opcional)</small><input name="nota" maxlength="200"></label>`,
      async alGuardar(f) {
        if (!f.estante.value.trim()) { f.estante.classList.add('falta'); f.estante.focus(); throw new Error('Escriba el estante nuevo'); }
        await EPT.rpc('ept_almacen_traslado', { p_producto: p.id, p_estante: f.estante.value, p_nota: f.nota.value });
        EPT.aviso('Traslado registrado'); EPT.recargar();
      },
    });
  }

  function ajustar(p) {
    EPT.ventana({
      titulo: 'Ajustar · ' + p.descripcion, boton: 'Ajustar',
      cuerpo: `<p class="mute" style="margin:0">El sistema dice <b>${num(p.hay)}</b>. Escriba cuántos hay de verdad (después de contar).</p>
        <label class="campo">Hay de verdad<input name="real" type="number" min="0" step="any" inputmode="decimal" class="grande" required></label>
        <p class="mute" id="dif" style="margin:-6px 0 0"></p>
        <label class="campo">Motivo<input name="motivo" maxlength="200" required placeholder="Ej. conteo físico"></label>`,
      alAbrir(f) { f.real.addEventListener('input', () => { const d = Number(f.real.value) - p.hay;
        f.querySelector('#dif').textContent = f.real.value === '' || !d ? '' : `${d > 0 ? 'Sube' : 'Baja'} ${num(Math.abs(d))}.`; }); },
      async alGuardar(f) {
        if (f.real.value === '') { f.real.classList.add('falta'); f.real.focus(); throw new Error('Escriba cuántos hay'); }
        const d = Number(f.real.value) - p.hay;
        if (!d) throw new Error('Es lo mismo que dice el sistema: no hay nada que ajustar');
        if (!f.motivo.value.trim()) { f.motivo.classList.add('falta'); f.motivo.focus(); throw new Error('Escriba el motivo del ajuste'); }
        await EPT.rpc('ept_ajuste_inventario', { p_producto: p.id, p_ubicacion: 'almacen', p_cantidad: d, p_motivo: f.motivo.value });
        EPT.aviso('Ajuste registrado'); EPT.recargar();
      },
    });
  }

  // Nuevo o editar. El estante se pone al crearlo; después se cambia con Traslado.
  async function editarArticulo(p) {
    const F = await EPT.cargarFamilias();
    const nuevo = !p;
    // al crear desde una familia elegida en la pantalla, viene ya puesta
    const subIni = p ? p.subfamilia_id : (subInv || (famInv ? F.subsDe(famInv)[0]?.id : ''));
    EPT.ventana({
      titulo: nuevo ? 'Nuevo artículo del almacén' : 'Editar ' + p.codigo, boton: 'Guardar',
      cuerpo: `
        <label class="campo">Nombre<input name="desc" maxlength="160" required value="${esc(p ? p.descripcion : '')}" placeholder="Ej. Aceite ATF Dexron VI, 1 cuarto"></label>
        <div class="dos">${EPT.selectFamilias(F, subIni)}</div>
        <p class="mute" style="margin:-6px 0 0"><button type="button" class="liso peque" id="btnNuevaSub">${icono('mas')}Agregar una familia o subfamilia</button></p>
        ${EPT.botonesCobro(p ? p.cobrable : null, { etiqueta: 'Cuando se usa en una orden' })}
        <div class="dos"><label class="campo">Marca <small class="opc">(opcional)</small><input name="marca" maxlength="60" value="${esc(p ? p.marca_pieza : '')}"></label>
          <label class="campo">Referencia <small class="opc">(opcional)</small><input name="ref" maxlength="60" value="${esc(p ? p.numero_parte : '')}"></label></div>
        <div class="dos"><label class="campo">Unidad<select name="unidad">${['UNID', 'GALÓN', 'LITRO', 'CUARTO', 'PAR', 'JUEGO', 'PIE', 'METRO', 'LIBRA', 'CAJAS'].map(u => `<option ${u === (p ? p.unidad : 'UNID') ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
          <label class="campo">Mínimo de reposición<input name="minimo" type="number" min="0" step="any" inputmode="decimal" value="${p ? Number(p.minimo) || '' : ''}"></label></div>
        <div class="dos"><label class="campo">Empaque <small class="opc">(opcional)</small><select name="emp"><option value="">Ninguno</option>${['Caja', 'Paquete', 'Docena'].map(e => `<option ${p && p.empaque_nombre === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
          <label class="campo">Unidades por empaque<input name="porEmp" type="number" min="1" step="1" inputmode="numeric" value="${p && Number(p.empaque_unidades) > 1 ? p.empaque_unidades : ''}"></label></div>
        ${nuevo ? `<div class="dos"><label class="campo">Estante <small class="opc">(opcional)</small><input name="estante" maxlength="40"></label>
          <label class="campo">Existencia de hoy <small class="opc">(lo que hay)</small><input name="ini" type="number" min="0" step="any" inputmode="decimal"></label></div>` : ''}
        <div class="dos"><label class="campo">Código <small class="opc">${nuevo ? '(vacío = se pone solo, ej. ACE-001)' : ''}</small><input name="codigo" maxlength="30" value="${esc(p ? p.codigo : '')}" ${nuevo ? '' : 'disabled'}></label>
          <label class="campo">Código de barras <small class="opc">(opcional)</small><input name="barras" maxlength="40" value="${esc(p ? p.codigo_barras : '')}"></label></div>
        <label class="campo">Notas <small class="opc">(opcional)</small><input name="notas" maxlength="300" value="${esc(p ? p.notas : '')}"></label>`,
      alAbrir(f, d) {
        // al elegir familia en un artículo nuevo, se marca solo si se cobra (se puede cambiar)
        EPT.enlazarCobro(f);
        EPT.enlazarFamilias(F, f);
        f.querySelector('#btnNuevaSub').addEventListener('click', () => { d.close(); nuevaSubfamilia(F, () => editarArticulo(p)); });
      },
      async alGuardar(f) {
        if (!f.desc.value.trim()) { f.desc.classList.add('falta'); f.desc.focus(); throw new Error('Escriba el nombre'); }
        if (!f.subfamilia.value) { f.familia.classList.add('falta'); f.familia.focus(); throw new Error('Elija la familia y la subfamilia'); }
        if (f.emp.value && !(Number(f.porEmp.value) > 1)) { f.porEmp.classList.add('falta'); f.porEmp.focus(); throw new Error('Escriba cuántas unidades trae cada ' + f.emp.value.toLowerCase()); }
        const r = await EPT.rpc('ept_almacen_articulo_guardar', { p: {
          id: p ? p.id : null, codigo: nuevo ? f.codigo.value : undefined, descripcion: f.desc.value, subfamilia_id: f.subfamilia.value, cobrable: EPT.seCobra(f),
          unidad: f.unidad.value, marca_pieza: f.marca.value, numero_parte: f.ref.value, minimo: f.minimo.value,
          empaque_nombre: f.emp.value, empaque_unidades: f.emp.value ? f.porEmp.value : 1, codigo_barras: f.barras.value, notas: f.notas.value,
          estante: nuevo ? f.estante.value : undefined, existencia_inicial: nuevo ? f.ini.value : undefined } });
        EPT.aviso(nuevo ? `Artículo creado: ${r.codigo}` : 'Artículo guardado'); EPT.recargar();
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
  // Requisiciones: lo que Repuestos le pide al Almacén
  // =====================================================================
  let filtroReq = 'abiertas';
  EPT.pantalla({
    id: 'requisiciones', titulo: 'Requisiciones', subtitulo: 'Lo que Repuestos le pide al Almacén',
    icono: 'deposito', grupo: 'Almacén', atajo: 'Requisiciones',
    ver: () => ['almacen.resolver', 'almacen.transferir', 'repuestos.requisicion', 'almacen.diferencia'].some(p => EPT.puede(p)),
    async mostrar(v) {
      const q = sb.from('requisiciones').select('id,numero,estado,fecha,motivo,orden:ordenes(numero),creador:usuarios!requisiciones_creado_por_fkey(nombre),lineas:requisicion_lineas(id)').order('numero', { ascending: false }).limit(200);
      const filas = await EPT.leer(filtroReq === 'abiertas' ? q.in('estado', ['nueva', 'pendiente', 'aprobada', 'parcial']) : q);
      const c = k => filas.filter(r => r.estado === k).length;
      v.innerHTML = `<div class="fila" style="margin-bottom:14px"><div class="seg" role="group">
          <button type="button" data-f="abiertas" aria-pressed="${filtroReq === 'abiertas'}">Por atender</button>
          <button type="button" data-f="todas" aria-pressed="${filtroReq === 'todas'}">Todas</button></div>
          ${filtroReq === 'abiertas' ? `<div class="contadores" style="margin:0"><span><b>${c('nueva') + c('pendiente')}</b> por decidir</span><span><b>${c('aprobada') + c('parcial')}</b> aprobadas por despachar</span></div>` : ''}</div>
        <div class="panel">${filas.length ? `<ul class="lista">${filas.map(r => `<li class="toca" data-r="${r.id}">
          <div class="q"><b>${rn(r.numero)}${r.orden ? ' · ' + ot(r.orden.numero) : ''}</b>
            <span>${r.lineas.length} pieza${r.lineas.length === 1 ? '' : 's'} · ${esc(r.creador?.nombre || '')} · ${fecha(r.fecha)}${r.motivo ? ' · ' + esc(r.motivo) : ''}</span></div>${chip(REQ, r.estado)}</li>`).join('')}</ul>`
          : '<div class="vacio">No hay requisiciones por atender.</div>'}</div>`;
      v.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { filtroReq = b.dataset.f; EPT.recargar(); }));
      v.querySelectorAll('[data-r]').forEach(li => li.addEventListener('click', () => abrirRequisicion(li.dataset.r)));
    },
  });

  async function abrirRequisicion(id) {
    const v = EPT.$('#vista'); v.innerHTML = '<div class="vacio">Cargando…</div>';
    const r = await EPT.leer(sb.from('requisiciones').select('id,numero,estado,fecha,motivo,motivo_rechazo,resuelto,orden:ordenes(id,numero,vehiculo:vehiculos(marca,modelo,placa)),creador:usuarios!requisiciones_creado_por_fkey(nombre),resolvio:usuarios!requisiciones_resuelto_por_fkey(nombre),lineas:requisicion_lineas(id,cantidad,disponible_repuestos,aprobada,enviada,producto:productos(id,codigo,descripcion,unidad))').eq('id', id).single());
    const desps = await EPT.leer(sb.from('transferencias').select('id,numero,estado,fecha_envio').eq('requisicion_id', id).order('numero'));
    const ids = r.lineas.map(l => l.producto.id);
    const exA = Object.fromEntries((await EPT.leer(sb.from('existencias').select('producto_id,cantidad').eq('ubicacion', 'almacen').in('producto_id', ids))).map(e => [e.producto_id, Number(e.cantidad)]));
    const decidir = ['nueva', 'pendiente'].includes(r.estado) && EPT.puede('almacen.resolver');
    const despachar = ['aprobada', 'parcial'].includes(r.estado) && EPT.puede('almacen.transferir') && r.lineas.some(l => Number(l.enviada) < Number(l.aprobada));
    EPT.$('#titulo').textContent = rn(r.numero);
    EPT.$('#subtitulo').textContent = r.orden ? `${ot(r.orden.numero)} · ${[r.orden.vehiculo?.marca, r.orden.vehiculo?.modelo, r.orden.vehiculo?.placa].filter(Boolean).join(' ')}` : 'Reposición de Repuestos';
    EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnVolverReq">${icono('atras')}Requisiciones</button>`;
    EPT.$('#btnVolverReq').addEventListener('click', () => EPT.ir('requisiciones'));
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
          return `<tr data-l="${l.id}"><td><b>${esc(l.producto.descripcion)}</b> <small class="mute">${esc(l.producto.codigo)}</small></td>
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
  // Despachos: lo que el Almacén despacha a Repuestos por una requisición
  // =====================================================================
  let filtroDes = 'abiertas';
  EPT.pantalla({
    id: 'transferencias', titulo: 'Despachos a Repuestos', subtitulo: 'Lo que el Almacén despacha por requisición (no es venta)',
    icono: 'camion', grupo: 'Almacén', atajo: 'Despachos',
    ver: () => ['almacen.transferir', 'repuestos.recibir', 'almacen.diferencia'].some(p => EPT.puede(p)),
    async mostrar(v) {
      const q = sb.from('transferencias').select('id,numero,estado,fecha_envio,fecha_recibo,requisicion:requisiciones(numero,orden:ordenes(numero)),lineas:transferencia_lineas(id)').order('numero', { ascending: false }).limit(200);
      const filas = await EPT.leer(filtroDes === 'abiertas' ? q.in('estado', ['en_preparacion', 'en_transito', 'con_diferencia']) : q);
      v.innerHTML = `<div class="fila" style="margin-bottom:14px"><div class="seg" role="group">
          <button type="button" data-f="abiertas" aria-pressed="${filtroDes === 'abiertas'}">En camino o con diferencia</button>
          <button type="button" data-f="todas" aria-pressed="${filtroDes === 'todas'}">Todos</button></div></div>
        <div class="panel">${filas.length ? `<ul class="lista">${filas.map(t => `<li class="toca" data-t="${t.id}">
          <div class="q"><b>${dn(t.numero)}${t.requisicion ? ' · ' + rn(t.requisicion.numero) : ''}${t.requisicion?.orden ? ' · ' + ot(t.requisicion.orden.numero) : ''}</b>
            <span>${t.lineas.length} pieza${t.lineas.length === 1 ? '' : 's'} · despachado ${fecha(t.fecha_envio)}${t.fecha_recibo ? ' · ingresó ' + fecha(t.fecha_recibo) : ''}</span></div>${chip(DES, t.estado)}</li>`).join('')}</ul>`
          : '<div class="vacio">No hay mercancía en camino.</div>'}</div>`;
      v.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { filtroDes = b.dataset.f; EPT.recargar(); }));
      v.querySelectorAll('[data-t]').forEach(li => li.addEventListener('click', () => abrirDespacho(li.dataset.t)));
    },
  });

  async function abrirDespacho(id, recien) {
    const v = EPT.$('#vista'); v.innerHTML = '<div class="vacio">Cargando…</div>';
    const t = await EPT.leer(sb.from('transferencias').select('id,numero,estado,origen,destino,fecha_envio,fecha_recibo,fecha_resuelto,nota_diferencia,envio:usuarios!transferencias_enviado_por_fkey(nombre),recibio:usuarios!transferencias_recibido_por_fkey(nombre),requisicion:requisiciones(id,numero,orden:ordenes(id,numero,vehiculo:vehiculos(marca,modelo,placa))),lineas:transferencia_lineas(id,enviada,recibida,diferencia_nota,producto:productos(codigo,descripcion,unidad))').eq('id', id).single());
    const ingresar = t.estado === 'en_transito' && EPT.puede('repuestos.recibir');
    const resolver = t.estado === 'con_diferencia' && EPT.puede('almacen.diferencia');
    EPT.$('#titulo').textContent = 'Despacho ' + dn(t.numero);
    EPT.$('#subtitulo').textContent = 'Almacén → Repuestos';
    EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnImprimir">${icono('imprimir')}Imprimir comprobante</button><button type="button" id="btnVolverDes">${icono('atras')}Despachos</button>`;
    EPT.$('#btnVolverDes').addEventListener('click', () => EPT.ir('transferencias'));
    EPT.$('#btnImprimir').addEventListener('click', () => window.print());
    v.innerHTML = `
      ${recien ? `<div class="alerta">${icono('camion')}<div><b>Despachado.</b> La mercancía va en camino. Repuestos debe registrar el ingreso de lo que llegó.</div></div>` : ''}
      <div class="panel comprobante"><div class="cuerpo">
        <div class="comp-cab"><span class="logo"></span><div><b>EL PALACIO DE LA TRANSMISIÓN</b><span>Comprobante de despacho interno · no es una venta</span></div></div>
        <div class="fila"><span class="ot-num">${dn(t.numero)}</span>${chip(DES, t.estado)}</div>
        <dl class="datos"><div><dt>De</dt><dd>Almacén</dd></div><div><dt>Para</dt><dd>Repuestos</dd></div>
          <div><dt>Requisición</dt><dd>${t.requisicion ? rn(t.requisicion.numero) : '—'}${t.requisicion?.orden ? ' · ' + ot(t.requisicion.orden.numero) : ''}</dd></div>
          <div><dt>Despachó</dt><dd>${esc(t.envio?.nombre || '')} · ${fecha(t.fecha_envio)}</dd></div>
          ${t.recibio ? `<div><dt>Registró el ingreso</dt><dd>${esc(t.recibio.nombre)} · ${fecha(t.fecha_recibo)}</dd></div>` : ''}
          ${t.nota_diferencia ? `<div class="ancho"><dt>Diferencia</dt><dd>${esc(t.nota_diferencia.replace(/^aparecio:/, 'Apareció:').replace(/^regresa:/, 'Regresó al Almacén:').replace(/^perdida:/, 'Se perdió:'))} · ${fecha(t.fecha_resuelto)}</dd></div>` : ''}</dl>
      </div>
      <div class="desliza"><table class="tabla entregar"><thead><tr><th>Pieza</th><th>Despachado</th><th>${ingresar ? 'Llegó' : 'Ingresó'}</th>${ingresar ? '<th>Si llegó menos, ¿qué pasó?</th>' : ''}</tr></thead><tbody>
        ${t.lineas.map(l => `<tr data-l="${l.id}" data-des="${l.enviada}"><td><b>${esc(l.producto.descripcion)}</b> <small class="mute">${esc(l.producto.codigo)}</small></td>
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
})();
