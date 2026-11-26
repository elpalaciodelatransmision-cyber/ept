// EPT CONTROL OPERATIVO · Presupuestos (Repuestos).
// Es una proyección de lo que costaría el trabajo: NO toca el inventario ni reserva piezas.
// Reglas del dueño:
//   · el precio de cada pieza o servicio sale del programa; cambiarlo es un botón aparte ("Cambiar precio");
//   · vale 24 horas desde que se emite; después los precios pueden variar (se dice al pie, con fecha y hora exactas);
//   · antes de convertirlo en orden de trabajo se le pueden agregar o quitar artículos; Caja respeta su precio.
(function () {
  'use strict';
  const { sb, esc, icono } = EPT;
  Object.assign(EPT.ICONOS, {
    presupuesto: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7M9 8h3"/>',
    whatsapp: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c.3 2 1.8 3.8 4 4.5l1.2-1.2 1.8.8-.4 1.6c-3.4.2-6.6-2.8-6.6-6.2L10.6 8.6l.8 1.8z"/>',
  });
  const num = n => Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
  const dinero = n => 'RD$ ' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fecha = f => new Date(f).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  // "20 de noviembre de 2026 a las 10:42 a. m." (para la nota de validez: sin lugar a dudas)
  const fechaLarga = f => { const d = new Date(f);
    return `${d.toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })} a las ${d.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' })}`; };
  const prN = n => 'PR-' + String(n).padStart(4, '0');
  const ot = n => 'OT-' + String(n).padStart(5, '0');
  const puede = () => EPT.puede('presupuesto.hacer');
  const vencido = p => p.estado === 'vigente' && new Date(p.vence) < new Date();
  const estado = p => p.estado === 'convertido' ? `<span class="estado ok">Convertido${p.orden ? ' en ' + ot(p.orden.numero) : ''}</span>`
    : p.estado === 'anulado' ? '<span class="estado malo">Anulado</span>'
    : vencido(p) ? '<span class="estado aviso">Vencido</span>' : '<span class="estado info">Vigente</span>';
  const vehiculoTxt = p => [p.marca, p.modelo, p.anio, p.placa].filter(Boolean).join(' ');

  // =====================================================================
  // Lista
  // =====================================================================
  let filtro = 'vigentes', busca = '';
  EPT.pantalla({
    id: 'presupuestos', titulo: 'Presupuestos', pestana: 'Presupuestos', grupo: 'Repuestos', icono: 'presupuesto', peso: 6,
    explica: 'Lo que costaría un trabajo, para el cliente. Es solo una proyección: no toca el inventario. Vale 24 horas.',
    ver: () => puede() || EPT.puede('reportes.ver'),
    async mostrar(v) {
      if (puede()) {
        EPT.$('#barraBotones').innerHTML = `<button type="button" class="prin" id="btnNuevoPres">${icono('mas')}Nuevo presupuesto</button>`;
        EPT.$('#btnNuevoPres').addEventListener('click', () => editar(null));
      }
      const q = sb.from('presupuestos').select('id,numero,estado,emitido,vence,cliente_nombre,telefono,marca,modelo,anio,placa,total,lineas,orden:ordenes!presupuestos_orden_id_fkey(numero)').order('numero', { ascending: false }).limit(300);
      const todos = await EPT.leer(filtro === 'vigentes' ? q.eq('estado', 'vigente') : filtro === 'convertidos' ? q.eq('estado', 'convertido') : q);
      v.innerHTML = `<div class="fila" style="margin-bottom:14px"><div class="seg" role="group">
          ${[['vigentes', 'Vigentes'], ['convertidos', 'Convertidos en orden'], ['todos', 'Todos']].map(([k, t]) => `<button type="button" data-f="${k}" aria-pressed="${k === filtro}">${t}</button>`).join('')}</div>
          <div class="buscador">${icono('buscar')}<input type="search" id="bPres" value="${esc(busca)}" placeholder="Número, cliente, teléfono, placa o pieza"></div></div>
        <div class="panel" id="listaPres"></div>`;
      const caja = v.querySelector('#listaPres');
      const pintar = () => {
        const pal = EPT.llano(busca.trim()).split(/\s+/).filter(Boolean);
        const ls = todos.filter(p => pal.every(w => EPT.llano([prN(p.numero), p.cliente_nombre, p.telefono, vehiculoTxt(p), ...p.lineas.map(l => l.descripcion + ' ' + l.codigo)].join(' ')).includes(w)));
        caja.innerHTML = ls.length ? `<ul class="lista">${ls.map(p => `<li class="toca" data-p="${p.id}"><span class="serie">${prN(p.numero)}</span>
            <div class="q"><b>${esc(p.cliente_nombre)}${vehiculoTxt(p) ? ' · ' + esc(vehiculoTxt(p)) : ''}</b>
              <span>${p.lineas.length} línea${p.lineas.length === 1 ? '' : 's'} · ${dinero(p.total)} · ${fecha(p.emitido)}</span></div>${estado(p)}</li>`).join('')}</ul>`
          : `<div class="vacio">${todos.length ? 'No se encontró nada con esa búsqueda.' : 'No hay presupuestos aquí.'}</div>`;
      };
      let t; v.querySelector('#bPres').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { busca = e.target.value; pintar(); }, 150); });
      v.querySelectorAll('.seg [data-f]').forEach(b => b.addEventListener('click', () => { filtro = b.dataset.f; EPT.recargar(); }));
      caja.addEventListener('click', e => { const li = e.target.closest('[data-p]'); if (li) ver(li.dataset.p); });
      pintar();
    },
  });

  // =====================================================================
  // Hacer o cambiar un presupuesto: 1) cliente y vehículo  2) piezas y servicios  3) guardar
  // =====================================================================
  async function editar(id) {
    if (!puede()) { EPT.aviso('No tiene permiso para esto', true); return; }
    const [pr, prods, servs, cfg] = await Promise.all([
      id ? EPT.leer(sb.from('presupuestos').select('*').eq('id', id).single()) : null,
      EPT.cargarProductos(), EPT.cargarServicios(),
      EPT.leer(sb.from('config').select('valor').eq('clave', 'itbis')),
    ]);
    const pct = Number(cfg[0]?.valor ?? 18);
    const puedePrecio = EPT.puede('presupuesto.precio');
    let clienteId = pr ? pr.cliente_id : null, vehiculoId = pr ? pr.vehiculo_id : null;
    // líneas: { clave, tipo, producto_id, servicio_id, codigo, descripcion, cantidad, prog (precio del programa), precio, cambiado }
    let n = 0;
    const lineas = (pr ? pr.lineas : []).map(l => {
      const actual = l.producto_id ? prods.find(x => x.id === l.producto_id) : l.servicio_id ? servs.find(x => x.id === l.servicio_id) : null;
      // el precio del programa de HOY (si la línea lleva uno de los otros precios de la pieza, el de ese nombre)
      const otro = l.precio_nombre && actual ? (actual.precios_extra || []).find(x => x.nombre.toUpperCase() === l.precio_nombre.toUpperCase()) : null;
      const prog = !actual ? null : l.precio_nombre ? (otro ? Number(otro.precio) : null) : Number(actual.precio);
      return { clave: ++n, tipo: l.tipo, producto_id: l.producto_id, servicio_id: l.servicio_id, codigo: l.codigo, descripcion: l.descripcion,
        precio_nombre: l.precio_nombre || null, cantidad: l.cantidad, prog, precio: l.cambiado ? l.precio : prog, cambiado: !!l.cambiado };
    });
    const v = EPT.$('#vista');
    EPT.$('#subtitulo').textContent = pr ? 'Cambiar ' + prN(pr.numero) : 'Nuevo presupuesto';
    EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnCancPres">Cancelar</button>`;
    EPT.$('#btnCancPres').addEventListener('click', () => pr ? ver(pr.id) : EPT.ir('presupuestos'));
    v.innerHTML = `<div class="panel"><div class="cuerpo doc-nuevo"><form id="fPres" novalidate>
      ${pr && vencido(pr) ? '<p class="alerta" style="margin:0">Este presupuesto venció. Al guardarlo se ponen los precios de hoy y vale 24 horas más.</p>' : ''}
      <div class="paso-doc"><i>1</i>¿Para quién?</div>
      <div class="dos"><label class="campo">Nombre del cliente<input name="cliente" required maxlength="80" value="${esc(pr ? pr.cliente_nombre : '')}"></label>
        <label class="campo">Teléfono<input name="telefono" type="tel" maxlength="20" placeholder="Busca si ya vino" value="${esc(pr ? pr.telefono : '')}"></label></div>
      <p class="pista" id="pistaCli" hidden></p>
      <div class="cuatro-col"><label class="campo">Marca<input name="marca" maxlength="30" value="${esc(pr ? pr.marca : '')}"></label>
        <label class="campo">Modelo<input name="modelo" maxlength="30" value="${esc(pr ? pr.modelo : '')}"></label>
        <label class="campo">Año<input name="anio" inputmode="numeric" maxlength="4" value="${esc(pr ? pr.anio : '')}"></label>
        <label class="campo">Placa<input name="placa" autocapitalize="characters" maxlength="12" placeholder="Busca si ya vino" value="${esc(pr ? pr.placa : '')}"></label></div>
      <div class="paso-doc"><i>2</i>¿Qué lleva? Piezas y servicios</div>
      <div class="dos"><div class="campo">Pieza<div class="busca-doc">${EPT.campoPieza('id="bPieza"')}</div></div>
        <label class="campo">Servicio<select id="sServ"><option value="">Elija un servicio…</option>${EPT.servicioOpciones(servs)}<option value="otro">Otro (escribirlo)</option></select></label></div>
      <div class="desliza"><table class="tabla doc-lineas" id="tPres"></table></div>
      <div id="totPres"></div>
      <label class="campo">Nota para el cliente <small class="opc">(opcional)</small><input name="nota" maxlength="300" value="${esc(pr ? pr.nota : '')}"></label>
      <div class="paso-doc"><i>3</i>Revise y guarde</div>
      <p class="error" role="alert" id="errPres"></p>
      <button type="submit" class="prin grande-btn" id="btnGuardarPres">Guardar presupuesto</button>
    </form></div></div>`;
    const f = v.querySelector('#fPres'), tabla = v.querySelector('#tPres');

    const pintar = () => {
      tabla.innerHTML = lineas.length ? `<thead><tr><th>Descripción</th><th>Cant.</th><th>Precio</th><th style="text-align:right">Importe</th><th></th></tr></thead><tbody>
        ${lineas.map(l => {
          const sinPrecio = !l.cambiado && !(Number(l.prog) > 0);
          return `<tr data-k="${l.clave}"><td><b>${esc(l.descripcion)}</b> ${l.codigo ? `<small class="mute">${esc(l.codigo)}</small>` : ''}
              ${l.tipo === 'servicio' ? '<br><small class="mute">Servicio</small>' : l.tipo === 'otro' ? '<br><small class="mute">Escrito a mano</small>' : ''}
              ${l.precio_nombre ? EPT.notaKit() : ''}</td>
            <td><input class="cant c" type="number" min="0" step="any" inputmode="decimal" value="${l.cantidad}" aria-label="Cantidad"></td>
            <td>${l.cambiado ? `<input class="cant p" type="number" min="0" step="any" inputmode="decimal" value="${l.precio ?? ''}" aria-label="Precio">
                ${l.prog != null ? `<br><small class="mute">En el programa: ${Number(l.prog) > 0 ? dinero(l.prog) : 'sin precio'}</small> <button type="button" class="liso peque" data-volver>Usar el del programa</button>` : ''}`
              : sinPrecio ? `<span class="txt-malo">Sin precio en el programa</span><br>${puedePrecio ? '<button type="button" class="peque" data-cambiar>Escribir precio</button>' : '<small class="mute">Pida que le pongan precio</small>'}`
              : `${dinero(l.prog)}${puedePrecio ? '<br><button type="button" class="liso peque" data-cambiar>Cambiar precio</button>' : ''}`}</td>
            <td class="imp" style="text-align:right"></td>
            <td><button type="button" class="liso peque" data-quitar>Quitar</button></td></tr>`; }).join('')}</tbody>`
        : '<tbody><tr><td class="vacio" style="padding:18px">Todavía no lleva nada. Busque una pieza o elija un servicio.</td></tr></tbody>';
      calcular();
    };
    const precioDe = l => l.cambiado ? Number(l.precio || 0) : Number(l.prog || 0);
    const calcular = () => {
      let sub = 0;
      for (const l of lineas) {
        const imp = Math.round(Number(l.cantidad || 0) * precioDe(l) * 100) / 100; sub += imp;
        const td = tabla.querySelector(`tr[data-k="${l.clave}"] .imp`); if (td) td.textContent = dinero(imp);
      }
      const it = Math.round(sub * pct) / 100;
      v.querySelector('#totPres').innerHTML = `<div class="totales-doc fijo"><div>Subtotal <b>${dinero(sub)}</b></div><div>ITBIS ${num(pct)} % <b>${dinero(it)}</b></div>
        <div class="total">Total estimado <b>${dinero(sub + it)}</b></div></div>`;
      v.querySelector('#btnGuardarPres').textContent = `Guardar presupuesto${lineas.length ? ` (${lineas.length} línea${lineas.length === 1 ? '' : 's'})` : ''}`;
    };
    const agregar = l => {
      const ya = lineas.find(x => (l.producto_id && x.producto_id === l.producto_id && (x.precio_nombre || null) === (l.precio_nombre || null)) || (l.servicio_id && x.servicio_id === l.servicio_id));
      if (ya) { ya.cantidad = Number(ya.cantidad || 0) + 1; pintar(); return; }
      lineas.push({ clave: ++n, cantidad: 1, cambiado: false, ...l }); pintar();
      const inp = tabla.querySelector(`tr[data-k="${n}"] input`); if (inp) { inp.focus(); inp.select(); }
    };

    // piezas: todas las del programa (Repuestos, almacén y usadas)
    EPT.sugerencias(v.querySelector('.busca-doc'), prods, { libre: false, alElegir: async (inp, p) => {
      inp.value = ''; if (!p) return;
      const otro = await EPT.elegirPrecio(p);   // pieza de un kit: el completo o una pieza suelta
      if (otro === undefined) return;          // cerró sin elegir
      const pr0 = otro ? Number(otro.precio) : Number(p.precio);
      agregar({ tipo: 'pieza', producto_id: p.id, codigo: p.codigo, descripcion: otro ? `${p.descripcion} — ${otro.nombre}` : p.descripcion,
        precio_nombre: otro ? otro.nombre : null, prog: pr0, precio: pr0 });
    } });
    v.querySelector('#sServ').addEventListener('change', e => {
      const val = e.target.value; e.target.value = ''; if (!val) return;
      if (val === 'otro') return EPT.ventana({ titulo: 'Otra línea', boton: 'Agregar',
        cuerpo: `<label class="campo">Descripción<input name="d" required maxlength="160" placeholder="Ej. Remolque"></label>
          <label class="campo">Precio RD$<input name="p" type="number" min="0" step="any" inputmode="decimal" required></label>`,
        async alGuardar(fv) {
          if (!fv.d.value.trim()) throw new Error('Escriba la descripción');
          if (fv.p.value === '' || Number(fv.p.value) < 0) throw new Error('Escriba el precio');
          lineas.push({ clave: ++n, tipo: 'otro', descripcion: fv.d.value.trim(), codigo: '', cantidad: 1, prog: null, precio: Number(fv.p.value), cambiado: true }); pintar();
        } });
      const s = servs.find(x => x.id === val);
      agregar({ tipo: 'servicio', servicio_id: s.id, codigo: s.codigo || '', descripcion: s.nombre, prog: Number(s.precio), precio: Number(s.precio) });
    });
    tabla.addEventListener('input', e => {
      const l = lineas.find(x => String(x.clave) === e.target.closest('tr')?.dataset.k); if (!l) return;
      if (e.target.classList.contains('c')) l.cantidad = e.target.value;
      if (e.target.classList.contains('p')) l.precio = e.target.value;
      calcular();
    });
    tabla.addEventListener('click', e => {
      const tr = e.target.closest('tr[data-k]'); if (!tr) return;
      const i = lineas.findIndex(x => String(x.clave) === tr.dataset.k), l = lineas[i];
      if (e.target.closest('[data-quitar]')) { lineas.splice(i, 1); pintar(); }
      else if (e.target.closest('[data-cambiar]')) { l.cambiado = true; l.precio = Number(l.prog) > 0 ? l.prog : ''; pintar(); const p = tabla.querySelector(`tr[data-k="${l.clave}"] .p`); if (p) { p.focus(); p.select(); } }
      else if (e.target.closest('[data-volver]')) { l.cambiado = false; l.precio = l.prog; pintar(); }
    });

    // cliente o carro que ya vino: se llenan los datos
    const pista = v.querySelector('#pistaCli');
    const datosCliente = (cli, veh) => {
      clienteId = cli.id; f.cliente.value = cli.nombre; f.telefono.value = cli.telefono || '';
      if (veh) { vehiculoId = veh.id; f.marca.value = veh.marca; f.modelo.value = veh.modelo; f.anio.value = veh.anio; f.placa.value = veh.placa; }
      pista.hidden = false; pista.textContent = veh ? `Este carro ya vino antes. Cliente: ${cli.nombre}.` : `Cliente ya registrado: ${cli.nombre}.`;
    };
    f.placa.addEventListener('change', async () => {
      const p = f.placa.value.trim().toUpperCase(); f.placa.value = p; vehiculoId = null; if (!p) return;
      const x = (await EPT.leer(sb.from('vehiculos').select('id,marca,modelo,anio,placa,cliente:clientes(id,nombre,telefono)').eq('placa', p).limit(1)))[0];
      if (x) datosCliente(x.cliente, x);
    });
    f.telefono.addEventListener('change', async () => {
      const t = f.telefono.value.trim(); if (!t || vehiculoId) return; clienteId = null;
      const c = (await EPT.leer(sb.from('clientes').select('id,nombre,telefono').eq('telefono', t).limit(1)))[0];
      if (c) datosCliente(c, null);
    });
    f.cliente.addEventListener('input', () => { clienteId = null; vehiculoId = null; pista.hidden = true; });
    ['marca', 'modelo', 'anio'].forEach(k => f[k].addEventListener('input', () => { vehiculoId = null; }));

    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const err = v.querySelector('#errPres'), bt = v.querySelector('#btnGuardarPres'); err.textContent = '';
      try {
        if (!f.cliente.value.trim()) { f.cliente.classList.add('falta'); f.cliente.focus(); throw new Error('Escriba el nombre del cliente'); }
        if (!lineas.length) throw new Error('Agregue al menos una pieza o un servicio');
        for (const l of lineas) {
          if (!(Number(l.cantidad) > 0)) throw new Error('Escriba la cantidad de ' + l.descripcion);
          if (!(precioDe(l) > 0)) throw new Error(`${l.descripcion} no tiene precio: toque «Escribir precio»`);
        }
        bt.disabled = true;
        const r = await EPT.rpc('ept_presupuesto_guardar', { p: {
          id: pr ? pr.id : null, cliente_id: clienteId, vehiculo_id: vehiculoId,
          cliente: { nombre: f.cliente.value, telefono: f.telefono.value },
          vehiculo: { marca: f.marca.value, modelo: f.modelo.value, anio: f.anio.value, placa: f.placa.value },
          nota: f.nota.value,
          lineas: lineas.map(l => ({ producto_id: l.producto_id || null, servicio_id: l.servicio_id || null, descripcion: l.descripcion,
            precio_nombre: l.precio_nombre || null, cantidad: Number(l.cantidad), cambiado: l.cambiado, precio: l.cambiado ? Number(l.precio) : undefined })) } });
        EPT.aviso(`Presupuesto ${prN(r.numero)} guardado`);
        ver(r.id);
      } catch (e) { err.textContent = EPT.error(e); bt.disabled = false; err.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    });
    pintar();
    f.cliente.focus();
    window.scrollTo(0, 0);
  }
  EPT.nuevoPresupuesto = () => editar(null);

  // =====================================================================
  // Ver (hoja para el cliente), cambiar, convertir en orden, anular
  // =====================================================================
  async function ver(id) {
    const v = EPT.$('#vista'); v.innerHTML = '<div class="vacio">Cargando…</div>';
    const p = await EPT.leer(sb.from('presupuestos').select('*,orden:ordenes!presupuestos_orden_id_fkey(id,numero),creador:usuarios!presupuestos_creado_por_fkey(nombre)').eq('id', id).single());
    const vig = p.estado === 'vigente', venc = vencido(p);
    EPT.$('#subtitulo').textContent = 'Presupuesto ' + prN(p.numero);
    const tel = String(p.telefono || '').replace(/\D/g, ''); const wa = tel.length === 10 ? '1' + tel : tel;
    EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnImpPres">${icono('imprimir')}Imprimir</button>
      ${wa.length >= 10 ? `<button type="button" id="btnWa">${icono('whatsapp')}WhatsApp</button>` : ''}
      <button type="button" id="btnVolverPres">${icono('atras')}Presupuestos</button>`;
    EPT.$('#btnImpPres').addEventListener('click', () => window.print());
    EPT.$('#btnVolverPres').addEventListener('click', () => EPT.ir('presupuestos'));
    const bw = EPT.$('#btnWa');
    if (bw) bw.addEventListener('click', () => {
      const txt = `EL PALACIO DE LA TRANSMISIÓN\nPresupuesto ${prN(p.numero)} · ${vehiculoTxt(p)}\n` +
        p.lineas.map(l => `• ${num(l.cantidad)} × ${l.descripcion}: ${dinero(l.importe)}`).join('\n') +
        `\nTotal estimado (con ITBIS): ${dinero(p.total)}\nVálido por 24 horas: hasta el ${fechaLarga(p.vence)}. Pasado ese plazo, los precios pueden variar.`;
      window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
    });
    v.innerHTML = `
      ${p.estado === 'convertido' && p.orden ? `<div class="alerta">${icono('ok')}<div>El cliente lo aceptó: es la orden <b>${ot(p.orden.numero)}</b>. <button type="button" class="peque" id="btnIrOrden">Abrir la orden</button></div></div>` : ''}
      ${vig && venc ? `<div class="alerta">${icono('reloj')}<div><b>Venció</b> (pasaron las 24 horas). Para convertirlo en orden, toque «Agregar o quitar» y guárdelo: se ponen los precios de hoy.</div></div>` : ''}
      ${vig && puede() ? `<div class="fila no-imprimir" style="margin-bottom:14px">
          ${venc ? '' : `<button type="button" class="prin" id="btnConvertir">${icono('adelante')}Convertir en orden de trabajo</button>`}
          <button type="button" id="btnEditarPres">${icono('mas')}Agregar o quitar</button>
          <button type="button" class="liso peque der" id="btnAnularPres">Anular…</button></div>` : ''}
      <div class="panel hoja-pres"><div class="cuerpo">
        <div class="comp-cab"><span class="logo"></span><div><b>EL PALACIO DE LA TRANSMISIÓN</b><span>Presupuesto · no es una factura</span></div></div>
        <div class="fila"><span class="ot-num">${prN(p.numero)}</span>${estado(p)}</div>
        <dl class="datos"><div><dt>Cliente</dt><dd>${esc(p.cliente_nombre)}${p.telefono ? ' · ' + esc(p.telefono) : ''}</dd></div>
          ${vehiculoTxt(p) ? `<div><dt>Vehículo</dt><dd>${esc(vehiculoTxt(p))}</dd></div>` : ''}
          <div><dt>Hecho por</dt><dd>${esc(p.creador?.nombre || 'Repuestos')} · ${fecha(p.emitido)}</dd></div>
          ${p.nota ? `<div class="ancho"><dt>Nota</dt><dd>${esc(p.nota)}</dd></div>` : ''}
          ${p.estado === 'anulado' ? `<div class="ancho"><dt>Anulado</dt><dd>${esc(p.motivo_anulado)}</dd></div>` : ''}</dl>
        <div class="desliza" style="margin-top:16px"><table class="tabla"><thead><tr><th>Descripción</th><th>Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Importe</th></tr></thead><tbody>
          ${p.lineas.map(l => `<tr><td><b>${esc(l.descripcion)}</b> ${l.codigo ? `<small class="mute">${esc(l.codigo)}</small>` : ''}${l.precio_nombre ? EPT.notaKit('no-imprimir') : ''}</td><td>${num(l.cantidad)}</td>
            <td style="text-align:right">${dinero(l.precio)}</td><td style="text-align:right">${dinero(l.importe)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="totales-doc fijo"><div>Subtotal <b>${dinero(p.subtotal)}</b></div><div>ITBIS ${num(p.itbis_pct)} % <b>${dinero(p.itbis)}</b></div>
          <div class="total">Total estimado <b>${dinero(p.total)}</b></div></div>
        <p class="nota-precios">Este presupuesto es válido por <b>24 horas</b> desde su emisión: del ${esc(fechaLarga(p.emitido))} hasta el ${esc(fechaLarga(p.vence))}.
          Pasado ese plazo, los precios pueden variar. Este documento no es una factura y no reserva piezas.</p>
      </div></div>`;
    const bo = v.querySelector('#btnIrOrden'); if (bo) bo.addEventListener('click', () => EPT.abrirOrden(p.orden.id));
    const be = v.querySelector('#btnEditarPres'); if (be) be.addEventListener('click', () => editar(p.id));
    const ba = v.querySelector('#btnAnularPres'); if (ba) ba.addEventListener('click', () => EPT.ventana({
      titulo: 'Anular ' + prN(p.numero), boton: 'Anular',
      cuerpo: `<p class="mute" style="margin:0">No se borra: queda anulado con el motivo.</p><label class="campo">¿Por qué se anula?<input name="m" required maxlength="200"></label>`,
      async alGuardar(f) { await EPT.rpc('ept_presupuesto_anular', { p_id: p.id, p_motivo: f.m.value }); EPT.aviso('Presupuesto anulado'); ver(p.id); } }));
    const bc = v.querySelector('#btnConvertir'); if (bc) bc.addEventListener('click', () => convertir(p));
    window.scrollTo(0, 0);
  }

  async function convertir(p) {
    const mecs = await EPT.cargarMecanicos();
    EPT.ventana({
      titulo: 'Convertir ' + prN(p.numero) + ' en orden de trabajo', boton: 'Crear la orden',
      cuerpo: `<p style="margin:0">Se crea la orden de <b>${esc(p.cliente_nombre)}</b>${vehiculoTxt(p) ? ' · ' + esc(vehiculoTxt(p)) : ''}.
          Las piezas se piden en el paso 3 (ya vienen puestas) y Caja cobra los precios de este presupuesto.</p>
        <p class="mute" style="margin:0">¿Falta o sobra algo? Cancele y toque «Agregar o quitar» primero.</p>
        ${EPT.puede('mecanico.asignar') ? `<label class="campo">Mecánico o ayudante<select name="mec">${EPT.opcionesMec(mecs)}</select></label>` : ''}
        <div class="dos"><label class="campo">Kilometraje <small class="opc">(opcional)</small><input name="km" inputmode="numeric" maxlength="10"></label>
          <label class="campo">¿Por qué vino?<input name="motivo" maxlength="200" value="Presupuesto ${prN(p.numero)} aceptado"></label></div>`,
      async alGuardar(f) {
        const r = await EPT.rpc('ept_presupuesto_convertir', { p_id: p.id, p: { mecanico_id: f.mec ? f.mec.value || null : null, kilometraje: f.km.value, motivo: f.motivo.value } });
        EPT.aviso(`Orden ${r.ot} creada desde ${prN(p.numero)}`);
        EPT.abrirOrden(r.id);
      },
    });
  }

  EPT.verbo({ grupo: 'Repuestos', peso: 4, titulo: 'Hacer un presupuesto', sub: 'Para un cliente · no toca el inventario', ir: 'presupuestos', hacer: () => editar(null), ver: puede });
})();
