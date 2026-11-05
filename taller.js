// EPT CONTROL OPERATIVO · Taller: órdenes de trabajo y su expediente.
// Pensado para gente de taller: una lista de carros, se toca uno y ahí están todos sus botones.
(function () {
  'use strict';
  const { sb, esc, icono } = EPT;

  Object.assign(EPT.ICONOS, {
    carro: '<path d="M5 17h14M3 13l2-6h14l2 6v4h-2.5M5.5 17H3v-4h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
    buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    caja: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
    llave: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    atras: '<path d="M15 5l-7 7 7 7"/>',
    nota: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M8 9h8M8 13h5"/>',
  });

  const ESTADOS = {
    abierta: ['Sin mecánico', 'aviso'], en_reparacion: ['En reparación', 'info'], esperando_piezas: ['Esperando piezas', 'aviso'],
    terminada: ['Terminada', 'ok'], en_revision: ['Por revisar', 'aviso'], en_caja: ['En Caja', 'ok'],
    facturada: ['Facturada', 'ok'], cerrada: ['Cerrada', ''], cancelada: ['Cancelada', 'malo'],
  };
  const SOL = { pendiente: ['Pendiente', 'aviso'], parcial: ['Entregada en parte', 'aviso'], despachada: ['Entregada', 'ok'],
    pendiente_almacen: ['Esperando Almacén', 'info'], cancelada: ['Cancelada', 'malo'] };
  const chip = (mapa, k) => { const [t, c] = mapa[k] || [k, '']; return `<span class="estado ${c}">${esc(t)}</span>`; };
  const ot = n => 'OT-' + String(n).padStart(5, '0');
  const num = n => Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
  const dinero = n => 'RD$ ' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fecha = f => new Date(f).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const EN_TALLER = ['abierta', 'en_reparacion', 'esperando_piezas'];
  const verTaller = () => ['orden.crear', 'orden.editar', 'solicitud.crear', 'consumo.registrar', 'orden.revisar', 'mano_obra.registrar']
    .some(p => EPT.puede(p));

  let filtro = 'taller';
  let buscado = '';

  // ---------- Lista de órdenes ----------
  EPT.pantalla({
    id: 'ordenes', titulo: 'Órdenes de trabajo', subtitulo: 'Los carros que están en el taller',
    icono: 'carro', grupo: 'Taller', atajo: 'Órdenes de trabajo', ver: verTaller,
    async mostrar(v) {
      if (EPT.puede('orden.crear')) {
        EPT.$('#barraBotones').innerHTML = `<button type="button" class="prin" id="btnNuevaOrden">${icono('mas')}Nueva orden</button>`;
        EPT.$('#btnNuevaOrden').addEventListener('click', nuevaOrden);
      }
      v.innerHTML = `
        <div class="fila" style="margin-bottom:14px">
          <div class="buscador">${icono('buscar')}<input id="bOrden" type="search" placeholder="Placa, teléfono, cliente o número" value="${esc(buscado)}"></div>
          <div class="seg" role="group" aria-label="Mostrar">
            <button type="button" data-f="taller" aria-pressed="${filtro === 'taller'}">En el taller</button>
            <button type="button" data-f="revision" aria-pressed="${filtro === 'revision'}">Por revisar</button>
            <button type="button" data-f="todas" aria-pressed="${filtro === 'todas'}">Todas</button>
          </div>
        </div>
        <div class="panel" id="listaOrdenes"><div class="vacio">Cargando…</div></div>`;
      v.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { filtro = b.dataset.f; EPT.recargar(); }));
      let t; v.querySelector('#bOrden').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { buscado = e.target.value.trim(); pintarLista(); }, 300); });
      await pintarLista();
    },
  });

  async function pintarLista() {
    let q = sb.from('ordenes').select('id,numero,fecha,estado,motivo,cliente:clientes(nombre,telefono),vehiculo:vehiculos(marca,modelo,anio,placa),mecanico:mecanicos(nombre)')
      .order('numero', { ascending: false }).limit(100);
    if (filtro === 'taller') q = q.in('estado', EN_TALLER);
    if (filtro === 'revision') q = q.eq('estado', 'en_revision');
    let filas = await EPT.leer(q);
    if (buscado) {
      const b = buscado.toLowerCase().replace(/[\s-]/g, '');
      filas = filas.filter(o => [ot(o.numero), String(o.numero), o.cliente?.nombre, o.cliente?.telefono, o.vehiculo?.placa, o.vehiculo?.marca, o.vehiculo?.modelo]
        .some(x => String(x || '').toLowerCase().replace(/[\s-]/g, '').includes(b)));
    }
    const caja = EPT.$('#listaOrdenes'); if (!caja) return;
    caja.innerHTML = filas.length ? `<ul class="lista">${filas.map(o => `
      <li class="toca" data-id="${o.id}">
        <div class="q"><b>${ot(o.numero)} · ${esc([o.vehiculo?.marca, o.vehiculo?.modelo].filter(Boolean).join(' '))} ${esc(o.vehiculo?.placa || '')}</b>
          <span>${esc(o.cliente?.nombre || '')} · ${o.mecanico ? esc(o.mecanico.nombre) : 'sin mecánico'}</span></div>
        ${chip(ESTADOS, o.estado)}
      </li>`).join('')}</ul>`
      : `<div class="vacio">${buscado ? 'No se encontró nada con eso.' : filtro === 'taller' ? 'No hay carros en el taller ahora.' : 'No hay órdenes aquí.'}</div>`;
    caja.querySelectorAll('li[data-id]').forEach(li => li.addEventListener('click', () => abrirOrden(li.dataset.id)));
  }

  // ---------- Nueva orden ----------
  async function mecanicosActivos() {
    return EPT.leer(sb.from('mecanicos').select('id,nombre').eq('activo', true).order('nombre'));
  }
  const opcionesMec = (lista, sel) => `<option value="">— Sin asignar —</option>` +
    lista.map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('');

  async function nuevaOrden() {
    const mecs = await mecanicosActivos();
    let clienteId = null, vehiculoId = null;
    EPT.ventana({
      titulo: 'Nueva orden de trabajo', boton: 'Crear orden',
      cuerpo: `
        <div class="dos">
          <label class="campo">Placa<input name="placa" autocapitalize="characters" maxlength="12" placeholder="Busca si ya vino"></label>
          <label class="campo">Teléfono del cliente<input name="telefono" type="tel" maxlength="20"></label>
        </div>
        <p class="pista" id="pistaCliente" hidden></p>
        <label class="campo">Nombre del cliente<input name="cliente" required maxlength="80"></label>
        <div class="tres-col">
          <label class="campo">Marca<input name="marca" maxlength="30"></label>
          <label class="campo">Modelo<input name="modelo" maxlength="30"></label>
          <label class="campo">Año<input name="anio" inputmode="numeric" maxlength="4"></label>
        </div>
        <div class="dos">
          <label class="campo">Kilometraje<input name="km" inputmode="numeric" maxlength="10"></label>
          ${EPT.puede('mecanico.asignar') ? `<label class="campo">Mecánico<select name="mecanico">${opcionesMec(mecs)}</select></label>` : ''}
        </div>
        <label class="campo">¿Por qué vino?<input name="motivo" maxlength="200" placeholder="Ej. no cambia a tercera"></label>
        ${EPT.puede('diagnostico.registrar') ? `<label class="campo">Diagnóstico <small class="opc">(si ya se sabe)</small><textarea name="diagnostico" maxlength="1000"></textarea></label>` : ''}
        <label class="campo">Observaciones <small class="opc">(opcional)</small><input name="obs" maxlength="300"></label>`,
      alAbrir(f) {
        const pista = f.querySelector('#pistaCliente');
        const datosCliente = async (cli, veh) => {
          clienteId = cli.id; f.cliente.value = cli.nombre; f.telefono.value = cli.telefono || '';
          if (veh) { vehiculoId = veh.id; f.marca.value = veh.marca; f.modelo.value = veh.modelo; f.anio.value = veh.anio; f.placa.value = veh.placa; }
          pista.hidden = false;
          pista.textContent = veh ? `Este carro ya vino antes. Cliente: ${cli.nombre}.` : `Cliente ya registrado: ${cli.nombre}.`;
        };
        f.placa.addEventListener('change', async () => {
          const p = f.placa.value.trim().toUpperCase(); f.placa.value = p; vehiculoId = null; if (!p) return;
          const v = (await EPT.leer(sb.from('vehiculos').select('id,marca,modelo,anio,placa,cliente:clientes(id,nombre,telefono)').eq('placa', p).limit(1)))[0];
          if (v) datosCliente(v.cliente, v);
        });
        f.telefono.addEventListener('change', async () => {
          const t = f.telefono.value.trim(); if (!t || vehiculoId) return; clienteId = null;
          const c = (await EPT.leer(sb.from('clientes').select('id,nombre,telefono').eq('telefono', t).limit(1)))[0];
          if (c) datosCliente(c, null);
        });
        // si cambian el nombre a mano, es otro cliente
        f.cliente.addEventListener('input', () => { clienteId = null; vehiculoId = null; pista.hidden = true; });
        ['marca', 'modelo', 'anio'].forEach(n => f[n].addEventListener('input', () => { vehiculoId = null; }));
      },
      async alGuardar(f) {
        const d = Object.fromEntries(new FormData(f));
        const p = {
          kilometraje: d.km, motivo: d.motivo, diagnostico: d.diagnostico || '', observaciones: d.obs,
          mecanico_id: d.mecanico || null,
        };
        if (clienteId) p.cliente_id = clienteId; else p.cliente = { nombre: d.cliente, telefono: d.telefono };
        if (vehiculoId) p.vehiculo_id = vehiculoId; else p.vehiculo = { marca: d.marca, modelo: d.modelo, anio: d.anio, placa: d.placa };
        const r = await EPT.rpc('ept_orden_crear', { p });
        EPT.aviso(`Orden ${r.ot} creada`);
        abrirOrden(r.id);
      },
    });
  }

  // ---------- Expediente de una orden ----------
  async function cargarOrden(id) {
    const [o, sols, desp, saldo, mano, diags, notas] = await Promise.all([
      EPT.leer(sb.from('ordenes').select('*,cliente:clientes(id,nombre,telefono),vehiculo:vehiculos(id,marca,modelo,anio,placa),mecanico:mecanicos(id,nombre)').eq('id', id).single()),
      EPT.leer(sb.from('solicitudes').select('id,numero,estado,fecha,mecanico:mecanicos(nombre),lineas:solicitud_lineas(id,descripcion,codigo,cantidad,unidad,despachada,recibida,observaciones)').eq('orden_id', id).order('numero')),
      EPT.leer(sb.from('despachos').select('id,fecha,usuario:usuarios(nombre),lineas:despacho_lineas(id,cantidad,producto:productos(descripcion,unidad),recepcion:recepciones_taller(cantidad_recibida,fecha,nota))').eq('orden_id', id).order('fecha')),
      EPT.rpc('ept_saldo_orden', { p_orden: id }),
      EPT.leer(sb.from('mano_obra').select('id,descripcion,importe,fecha,adicional,anulada,motivo_anulacion,mecanico:mecanicos(nombre)').eq('orden_id', id).order('fecha')),
      EPT.leer(sb.from('diagnosticos').select('texto,fecha,usuario:usuarios(nombre)').eq('orden_id', id).order('fecha')),
      EPT.leer(sb.from('observaciones').select('texto,fecha,departamento,usuario:usuarios(nombre)').eq('orden_id', id).order('fecha')),
    ]);
    const [cons, devs] = await Promise.all([
      EPT.leer(sb.from('consumos').select('utilizada,danada,observaciones,fecha,producto:productos(descripcion)').eq('orden_id', id).order('fecha')),
      EPT.leer(sb.from('devoluciones').select('cantidad,estado,fecha,producto:productos(descripcion)').eq('orden_id', id).order('fecha')),
    ]);
    return { o, sols, desp, saldo, mano, diags, notas, cons, devs };
  }

  async function abrirOrden(id) {
    EPT.actual = 'ordenes';
    const v = EPT.$('#vista');
    v.innerHTML = '<div class="vacio">Cargando…</div>';
    let x;
    try { x = await cargarOrden(id); } catch (e) { v.innerHTML = `<div class="panel"><div class="vacio">${esc(EPT.error(e))}</div></div>`; return; }
    const { o, sols, desp, saldo, mano, diags, notas, cons, devs } = x;
    const enTaller = EN_TALLER.includes(o.estado);
    const veh = [o.vehiculo.marca, o.vehiculo.modelo, o.vehiculo.anio].filter(Boolean).join(' ');
    EPT.$('#titulo').textContent = ot(o.numero);
    EPT.$('#subtitulo').textContent = `${veh} ${o.vehiculo.placa}`.trim();
    EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnVolver">${icono('atras')}Órdenes</button>`;
    EPT.$('#btnVolver').addEventListener('click', () => EPT.ir('ordenes'));

    // una entrega se confirma una sola vez: el servidor la manda como objeto; se deja siempre como lista
    desp.forEach(d => d.lineas.forEach(l => { l.recepcion = l.recepcion ? [].concat(l.recepcion) : []; }));
    const sinRecibir = desp.flatMap(d => d.lineas.filter(l => !l.recepcion.length).map(l => ({ ...l, fecha: d.fecha })));
    const totalMano = mano.filter(m => !m.anulada).reduce((s, m) => s + Number(m.importe), 0);

    // Botones grandes: solo lo que esta persona puede hacer ahora
    const acciones = [];
    if (enTaller) {
      if (EPT.puede('solicitud.crear')) acciones.push(['pedir', 'caja', 'Pedir repuestos']);
      if (EPT.puede('mano_obra.registrar')) acciones.push(['mano', 'llave', 'Servicio / mano de obra']);
      if (EPT.puede('diagnostico.registrar')) acciones.push(['diag', 'nota', 'Diagnóstico']);
      if (EPT.puede('trabajo.finalizar')) acciones.push(['terminar', 'ok', 'Terminé el trabajo']);
    }
    if (o.estado === 'en_revision' && EPT.puede('orden.revisar')) {
      acciones.push(['aprobar', 'ok', 'Aprobar y enviar a Caja'], ['devolver', 'atras', 'Devolver al taller']);
    }

    v.innerHTML = `
      ${o.nota_estado && o.estado !== 'cancelada' ? `<div class="alerta">${icono('nota')}<div><b>Devuelta por el jefe de taller:</b> ${esc(o.nota_estado)}</div></div>` : ''}
      <div class="panel ficha-ot">
        <div class="cuerpo">
          <div class="fila"><span class="ot-num">${ot(o.numero)}</span>${chip(ESTADOS, o.estado)}
            ${enTaller && EPT.puede('orden.editar') ? `<button type="button" class="der" data-acc="editar">Editar</button>` : ''}</div>
          <dl class="datos">
            <div><dt>Vehículo</dt><dd>${esc(veh || '—')} <b>${esc(o.vehiculo.placa)}</b></dd></div>
            <div><dt>Cliente</dt><dd>${esc(o.cliente.nombre)}${o.cliente.telefono ? ` · <a href="tel:${esc(o.cliente.telefono)}">${esc(o.cliente.telefono)}</a>` : ''}</dd></div>
            <div><dt>Mecánico</dt><dd>${o.mecanico ? esc(o.mecanico.nombre) : '<span class="estado aviso">Sin asignar</span>'}</dd></div>
            <div><dt>Kilometraje</dt><dd>${esc(o.kilometraje || '—')}</dd></div>
            <div class="ancho"><dt>Motivo</dt><dd>${esc(o.motivo || '—')}</dd></div>
            ${o.observaciones ? `<div class="ancho"><dt>Observaciones</dt><dd>${esc(o.observaciones)}</dd></div>` : ''}
            ${o.estado === 'cancelada' ? `<div class="ancho"><dt>Cancelada</dt><dd>${esc(o.nota_estado)}</dd></div>` : ''}
          </dl>
        </div>
      </div>

      ${acciones.length ? `<div class="acciones" style="margin:16px 0">${acciones.map(([k, ic, t]) =>
        `<button type="button" class="accion" data-acc="${k}">${icono(ic)}${esc(t)}</button>`).join('')}</div>` : ''}

      ${sinRecibir.length && EPT.puede('recepcion.confirmar') && enTaller ? `
      <div class="panel destacado"><header><h2>Confirme lo que recibió el mecánico</h2></header>
        <ul class="lista">${sinRecibir.map(l => `<li><div class="q"><b>${num(l.cantidad)} ${esc(l.producto.unidad)} · ${esc(l.producto.descripcion)}</b><span>Entregado ${fecha(l.fecha)}</span></div>
          <button type="button" class="prin" data-recibir="${l.id}" data-cant="${l.cantidad}" data-desc="${esc(l.producto.descripcion)}">Recibí</button></li>`).join('')}</ul></div>` : ''}

      <div class="rejilla">
        <div class="panel"><header><h2>Repuestos pedidos</h2></header>
          ${sols.length ? sols.map(s => `
            <div class="sol">
              <div class="fila"><b>S-${s.numero}</b><span class="mute">${esc(s.mecanico?.nombre || '')} · ${fecha(s.fecha)}</span>${chip(SOL, s.estado)}
                ${['pendiente', 'pendiente_almacen'].includes(s.estado) && enTaller && EPT.puede('solicitud.crear') ? `<button type="button" class="liso peque der" data-cancelar-sol="${s.id}" data-n="${s.numero}">Cancelar</button>` : ''}</div>
              <table class="tabla"><thead><tr><th>Pieza</th><th>Pedido</th><th>Entregado</th><th>Recibido</th></tr></thead><tbody>
              ${s.lineas.map(l => `<tr><td>${esc(l.descripcion)}${l.codigo ? ` <small class="mute">${esc(l.codigo)}</small>` : ''}${l.observaciones ? `<br><small class="mute">${esc(l.observaciones)}</small>` : ''}</td>
                <td>${num(l.cantidad)}</td><td>${num(l.despachada)}</td><td>${num(l.recibida)}</td></tr>`).join('')}
              </tbody></table>
            </div>`).join('') : '<div class="vacio">No se han pedido repuestos.</div>'}
        </div>

        <div class="panel"><header><h2>Piezas que tiene el mecánico</h2></header>
          ${saldo.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Pieza</th><th>Recibió</th><th>Usó</th><th>Devolvió</th><th>Le quedan</th><th></th></tr></thead><tbody>
            ${saldo.map(p => `<tr><td>${esc(p.descripcion)}</td><td>${num(p.entregado)}</td><td>${num(Number(p.utilizado) + Number(p.danado))}${Number(p.danado) ? ` <small class="mute">(${num(p.danado)} dañ.)</small>` : ''}</td>
              <td>${num(p.devuelto)}</td><td><b class="${Number(p.en_mano) ? 'txt-aviso' : 'txt-ok'}">${num(p.en_mano)}</b></td>
              <td><div class="botones">${Number(p.en_mano) > 0 && enTaller ? `
                ${EPT.puede('consumo.registrar') ? `<button type="button" class="peque" data-usar="${p.producto_id}" data-max="${p.en_mano}" data-desc="${esc(p.descripcion)}">Usó</button>` : ''}
                ${EPT.puede('devolucion.registrar') ? `<button type="button" class="peque" data-devolver="${p.producto_id}" data-max="${p.en_mano}" data-desc="${esc(p.descripcion)}">Devolver</button>` : ''}` : ''}</div></td></tr>`).join('')}
          </tbody></table></div>` : '<div class="vacio">Todavía no ha recibido piezas.</div>'}
        </div>

        <div class="panel"><header><h2>Servicios y mano de obra</h2>${mano.length ? `<span class="der"><b>${dinero(totalMano)}</b></span>` : ''}</header>
          ${mano.length ? `<ul class="lista">${mano.map(m => `<li class="${m.anulada ? 'anulada' : ''}"><div class="q"><b>${esc(m.descripcion)}</b>
            <span>${esc(m.mecanico?.nombre || '')}${m.adicional ? ' · adicional' : ''}${m.anulada ? ` · <span class="txt-malo">Anulada: ${esc(m.motivo_anulacion)}</span>` : ''}</span></div>
            <b class="precio">${dinero(m.importe)}</b>
            ${!m.anulada && enTaller && EPT.puede('mano_obra.registrar') ? `<button type="button" class="liso peque" data-anular="${m.id}" data-desc="${esc(m.descripcion)}">Anular</button>` : ''}</li>`).join('')}</ul>`
            : '<div class="vacio">Falta registrar la mano de obra.</div>'}
        </div>

        <div class="panel"><header><h2>Diagnóstico y notas</h2><button type="button" class="liso peque der" data-acc="nota">${icono('mas')}Nota</button></header>
          ${diags.length || notas.length ? `<ul class="lista">${[
            ...diags.map(d => ({ f: d.fecha, t: d.texto, q: 'Diagnóstico · ' + (d.usuario?.nombre || '') })),
            ...notas.map(n => ({ f: n.fecha, t: n.texto, q: (EPT.DEPARTAMENTOS[n.departamento] || '') + ' · ' + (n.usuario?.nombre || '') })),
          ].sort((a, b) => a.f.localeCompare(b.f)).map(n => `<li><div class="q"><span>${esc(n.q)} · ${fecha(n.f)}</span><div class="texto">${esc(n.t)}</div></div></li>`).join('')}</ul>`
            : '<div class="vacio">Sin diagnóstico todavía.</div>'}
        </div>
      </div>

      <div class="panel" style="margin-top:16px"><header><h2>Línea de tiempo</h2></header>
        <ol class="tiempo">${lineaDeTiempo(x).map(e => `<li><span class="cuando">${fecha(e.f)}</span><span class="que">${esc(e.t)}</span>${e.q ? `<span class="quien">${esc(e.q)}</span>` : ''}</li>`).join('')}</ol>
      </div>
      ${enTaller && EPT.puede('orden.editar') && !desp.length ? `<p style="margin-top:16px"><button type="button" class="liso peque" data-acc="cancelar" style="color:var(--malo)">Cancelar esta orden</button></p>` : ''}`;

    const recargar = () => abrirOrden(id);
    v.querySelectorAll('[data-acc]').forEach(b => b.addEventListener('click', () => ({
      editar: () => editarOrden(o, recargar), pedir: () => pedirRepuestos(o, recargar), mano: () => manoDeObra(o, recargar),
      diag: () => textoLibre('Diagnóstico', 'ept_diagnostico_agregar', o, recargar), nota: () => textoLibre('Nota', 'ept_observacion_agregar', o, recargar),
      terminar: () => terminar(o, recargar), aprobar: () => revisar(o, true, recargar), devolver: () => revisar(o, false, recargar),
      cancelar: () => cancelarOrden(o),
    })[b.dataset.acc]()));
    v.querySelectorAll('[data-recibir]').forEach(b => b.addEventListener('click', () => recibir(b.dataset, recargar)));
    v.querySelectorAll('[data-usar]').forEach(b => b.addEventListener('click', () => usar(o, b.dataset, recargar)));
    v.querySelectorAll('[data-devolver]').forEach(b => b.addEventListener('click', () => devolver(o, b.dataset, recargar)));
    v.querySelectorAll('[data-anular]').forEach(b => b.addEventListener('click', () => anularMano(b.dataset.anular, b.dataset.desc, recargar)));
    v.querySelectorAll('[data-cancelar-sol]').forEach(b => b.addEventListener('click', () => cancelarSolicitud(b.dataset, recargar)));
    window.scrollTo(0, 0);
  }
  EPT.abrirOrden = abrirOrden;

  function lineaDeTiempo({ o, sols, desp, mano, diags, cons, devs }) {
    const ev = [{ f: o.fecha, t: 'Entrada del vehículo' + (o.motivo ? ': ' + o.motivo : '') }];
    diags.forEach(d => ev.push({ f: d.fecha, t: 'Diagnóstico', q: d.usuario?.nombre }));
    sols.forEach(s => ev.push({ f: s.fecha, t: `Pidió repuestos S-${s.numero} (${s.lineas.length} pieza${s.lineas.length === 1 ? '' : 's'})`, q: s.mecanico?.nombre }));
    desp.forEach(d => {
      ev.push({ f: d.fecha, t: 'Repuestos entregó: ' + d.lineas.map(l => `${num(l.cantidad)} ${l.producto.descripcion}`).join(', '), q: d.usuario?.nombre });
      d.lineas.forEach(l => l.recepcion.forEach(r => ev.push({ f: r.fecha,
        t: `Mecánico recibió ${num(r.cantidad_recibida)} de ${num(l.cantidad)} ${l.producto.descripcion}` + (r.nota ? ' — ' + r.nota : '') })));
    });
    cons.forEach(c => ev.push({ f: c.fecha, t: `Usó ${num(c.utilizada)} ${c.producto.descripcion}` + (Number(c.danada) ? ` (${num(c.danada)} dañada)` : '') }));
    devs.forEach(d => ev.push({ f: d.fecha, t: `Devolvió ${num(d.cantidad)} ${d.producto.descripcion}` + (d.estado === 'pendiente' ? ' (Repuestos aún no la recibe)' : '') }));
    mano.forEach(m => ev.push({ f: m.fecha, t: `Mano de obra: ${m.descripcion} ${dinero(m.importe)}` + (m.anulada ? ' (anulada)' : '') }));
    if (!EN_TALLER.includes(o.estado)) ev.push({ f: o.actualizado, t: 'Estado: ' + (ESTADOS[o.estado] || [o.estado])[0] });
    return ev.sort((a, b) => String(a.f).localeCompare(String(b.f)));
  }

  // ---------- Ventanas de acción ----------
  async function editarOrden(o, listo) {
    const mecs = await mecanicosActivos();
    EPT.ventana({
      titulo: 'Editar ' + ot(o.numero),
      cuerpo: `
        <div class="dos"><label class="campo">Cliente<input name="cliente" value="${esc(o.cliente.nombre)}" required></label>
          <label class="campo">Teléfono<input name="telefono" type="tel" value="${esc(o.cliente.telefono)}"></label></div>
        <div class="tres-col"><label class="campo">Marca<input name="marca" value="${esc(o.vehiculo.marca)}"></label>
          <label class="campo">Modelo<input name="modelo" value="${esc(o.vehiculo.modelo)}"></label>
          <label class="campo">Año<input name="anio" value="${esc(o.vehiculo.anio)}" inputmode="numeric"></label></div>
        <div class="dos"><label class="campo">Placa<input name="placa" value="${esc(o.vehiculo.placa)}"></label>
          <label class="campo">Kilometraje<input name="km" value="${esc(o.kilometraje)}" inputmode="numeric"></label></div>
        ${EPT.puede('mecanico.asignar') ? `<label class="campo">Mecánico<select name="mecanico">${opcionesMec(mecs, o.mecanico_id)}</select></label>` : ''}
        <label class="campo">Motivo<input name="motivo" value="${esc(o.motivo)}"></label>
        <label class="campo">Observaciones<input name="obs" value="${esc(o.observaciones)}"></label>`,
      async alGuardar(f) {
        const d = Object.fromEntries(new FormData(f));
        const p = { kilometraje: d.km, motivo: d.motivo, observaciones: d.obs,
          cliente: { nombre: d.cliente, telefono: d.telefono }, vehiculo: { marca: d.marca, modelo: d.modelo, anio: d.anio, placa: d.placa } };
        if ('mecanico' in d) p.mecanico_id = d.mecanico || null;
        await EPT.rpc('ept_orden_editar', { p_orden: o.id, p });
        EPT.aviso('Orden guardada'); listo();
      },
    });
  }

  async function pedirRepuestos(o, listo) {
    const [mecs, prods] = await Promise.all([mecanicosActivos(),
      EPT.leer(sb.from('productos').select('id,codigo,descripcion,unidad').eq('activo', true).order('descripcion').limit(5000))]);
    const etiqueta = p => `${p.codigo} — ${p.descripcion}`;
    const porEtiqueta = new Map(prods.map(p => [etiqueta(p).toLowerCase(), p]));
    const porCodigo = new Map(prods.map(p => [p.codigo.toLowerCase(), p]));
    const renglon = () => `<div class="renglon">
        <input name="pieza" list="dlPiezas" placeholder="Código o nombre de la pieza" maxlength="120">
        <input name="cant" type="number" min="1" step="any" value="1" inputmode="decimal" aria-label="Cantidad">
        <input name="nota" placeholder="Nota (opcional)" maxlength="120">
        <button type="button" class="liso" data-quitar aria-label="Quitar">✕</button></div>`;
    EPT.ventana({
      titulo: 'Pedir repuestos · ' + ot(o.numero), boton: 'Enviar a Repuestos',
      cuerpo: `
        <label class="campo">Mecánico que las pide<select name="mecanico" required>${opcionesMec(mecs, o.mecanico_id).replace('— Sin asignar —', 'Elija…')}</select></label>
        <div><div class="renglon cab"><span>Pieza</span><span>Cantidad</span><span>Nota</span><span></span></div>
          <div id="renglones">${renglon()}</div>
          <button type="button" id="otraPieza" style="margin-top:8px">${icono('mas')}Otra pieza</button></div>
        <datalist id="dlPiezas">${prods.map(p => `<option value="${esc(etiqueta(p))}">`).join('')}</datalist>`,
      alAbrir(f) {
        const caja = f.querySelector('#renglones');
        f.querySelector('#otraPieza').addEventListener('click', () => { caja.insertAdjacentHTML('beforeend', renglon()); caja.lastElementChild.querySelector('input').focus(); });
        caja.addEventListener('click', e => { if (e.target.closest('[data-quitar]') && caja.children.length > 1) e.target.closest('.renglon').remove(); });
      },
      async alGuardar(f) {
        if (!f.mecanico.value) throw new Error('Elija el mecánico');
        const lineas = [...f.querySelectorAll('#renglones .renglon')].map(r => {
          const texto = r.querySelector('[name=pieza]').value.trim(); const cant = Number(r.querySelector('[name=cant]').value);
          if (!texto) return null;
          if (!(cant > 0)) throw new Error('Revise las cantidades');
          const p = porEtiqueta.get(texto.toLowerCase()) || porCodigo.get(texto.toLowerCase());
          return p ? { producto_id: p.id, cantidad: cant, observaciones: r.querySelector('[name=nota]').value }
            : { descripcion: texto, cantidad: cant, observaciones: r.querySelector('[name=nota]').value };
        }).filter(Boolean);
        if (!lineas.length) throw new Error('Escriba al menos una pieza');
        const r = await EPT.rpc('ept_solicitud_crear', { p_orden: o.id, p_mecanico: f.mecanico.value, p_lineas: lineas });
        EPT.aviso(`Solicitud S-${r.numero} enviada a Repuestos`); listo();
      },
    });
  }

  function recibir(d, listo) {
    const entregado = Number(d.cant);
    EPT.ventana({
      titulo: 'Recibí: ' + d.desc, boton: 'Confirmar',
      cuerpo: `<p class="mute" style="margin:0">Repuestos entregó <b>${num(entregado)}</b>. ¿Cuántas recibió el mecánico?</p>
        <label class="campo">Recibió<input name="cant" type="number" min="0" max="${entregado}" step="any" value="${entregado}" inputmode="decimal" class="grande"></label>
        <label class="campo" id="cNota" hidden>¿Qué pasó? <small class="opc">(llegó menos)</small><input name="nota" maxlength="200"></label>`,
      alAbrir(f) { f.cant.addEventListener('input', () => { f.querySelector('#cNota').hidden = !(Number(f.cant.value) < entregado); }); },
      async alGuardar(f) {
        await EPT.rpc('ept_recepcion_confirmar', { p_linea: d.recibir, p_cantidad: Number(f.cant.value), p_nota: f.nota.value });
        EPT.aviso(Number(f.cant.value) < entregado ? 'Recibido. Se avisó la diferencia a Repuestos.' : 'Recibido'); listo();
      },
    });
  }

  function usar(o, d, listo) {
    EPT.ventana({
      titulo: 'Usó: ' + d.desc, boton: 'Guardar',
      cuerpo: `<p class="mute" style="margin:0">Le quedan <b>${num(d.max)}</b> en mano.</p>
        <div class="dos"><label class="campo">Usadas<input name="usada" type="number" min="0" max="${d.max}" step="any" value="${d.max}" inputmode="decimal" class="grande"></label>
          <label class="campo">Dañadas <small class="opc">(no sirven)</small><input name="danada" type="number" min="0" step="any" value="0" inputmode="decimal" class="grande"></label></div>
        <label class="campo" id="cNota" hidden>¿Por qué se dañó?<input name="obs" maxlength="200"></label>`,
      alAbrir(f) { f.danada.addEventListener('input', () => { f.querySelector('#cNota').hidden = !(Number(f.danada.value) > 0); }); },
      async alGuardar(f) {
        await EPT.rpc('ept_consumo_registrar', { p_orden: o.id, p_producto: d.usar, p_utilizada: Number(f.usada.value), p_danada: Number(f.danada.value), p_obs: f.obs.value });
        EPT.aviso('Guardado'); listo();
      },
    });
  }

  function devolver(o, d, listo) {
    EPT.ventana({
      titulo: 'Devolver: ' + d.desc, boton: 'Devolver a Repuestos',
      cuerpo: `<p class="mute" style="margin:0">Le quedan <b>${num(d.max)}</b> en mano. Repuestos revisará si vuelve al estante.</p>
        <label class="campo">Cantidad<input name="cant" type="number" min="1" max="${d.max}" step="any" value="${d.max}" inputmode="decimal" class="grande"></label>
        <label class="campo">Nota <small class="opc">(opcional)</small><input name="obs" maxlength="200" placeholder="Ej. sobró, no era la correcta"></label>`,
      async alGuardar(f) {
        await EPT.rpc('ept_devolucion_registrar', { p_orden: o.id, p_producto: d.devolver, p_cantidad: Number(f.cant.value), p_obs: f.obs.value });
        EPT.aviso('Devolución enviada a Repuestos'); listo();
      },
    });
  }

  // Servicio del catálogo (con su precio y sus piezas) u otro trabajo escrito a mano
  async function manoDeObra(o, listo) {
    const [mecs, servs, prods] = await Promise.all([mecanicosActivos(), EPT.cargarServicios(), EPT.cargarProductos()]);
    const puedePedir = EPT.puede('solicitud.crear');
    EPT.ventana({
      titulo: 'Servicio / mano de obra · ' + ot(o.numero), boton: 'Agregar',
      cuerpo: `
        <label class="campo">Servicio<select name="servicio"><option value="">Elija…</option>${EPT.servicioOpciones(servs)}
          <option value="otro">Otro trabajo (escribirlo)</option></select></label>
        <p class="mute" id="descServ" style="margin:-6px 0 0" hidden></p>
        <label class="campo" id="cDesc" hidden>Trabajo realizado<input name="desc" maxlength="200" placeholder="Ej. Ajustar varillaje"></label>
        <label class="campo">Nota <small class="opc">(opcional)</small><input name="nota" maxlength="150"></label>
        <div class="dos"><label class="campo">Mecánico<select name="mecanico">${opcionesMec(mecs, o.mecanico_id)}</select></label>
          <label class="campo">Importe RD$<input name="importe" type="number" min="0" step="any" inputmode="decimal" required></label></div>
        <label class="check" id="cPedir" hidden><input type="checkbox" name="pedir" checked> <span id="txtPedir"></span></label>
        <label class="check"><input type="checkbox" name="adicional"> <span>Es un trabajo adicional (no estaba en el motivo)</span></label>`,
      alAbrir(f) {
        f.servicio.addEventListener('change', () => {
          const s = servs.find(x => x.id === f.servicio.value);
          f.querySelector('#cDesc').hidden = f.servicio.value !== 'otro';
          const d = f.querySelector('#descServ'); d.hidden = !(s && s.descripcion); d.textContent = s ? s.descripcion : '';
          if (s) f.importe.value = Number(s.precio) ? s.precio : '';
          const conPiezas = s && s.piezas.length && puedePedir;
          f.querySelector('#cPedir').hidden = !conPiezas;
          if (conPiezas) f.querySelector('#txtPedir').textContent = 'Pedir a Repuestos sus piezas: ' + EPT.piezasTexto(s.piezas, prods);
        });
      },
      async alGuardar(f) {
        if (!f.servicio.value) throw new Error('Elija el servicio');
        if (f.importe.value === '') throw new Error('Escriba el importe');
        if (f.servicio.value === 'otro') {
          if (!f.desc.value.trim()) throw new Error('Escriba qué trabajo se hizo');
          await EPT.rpc('ept_mano_obra_agregar', { p_orden: o.id, p_descripcion: f.desc.value + (f.nota.value.trim() ? ' — ' + f.nota.value.trim() : ''),
            p_mecanico: f.mecanico.value || null, p_importe: Number(f.importe.value), p_servicio: null, p_adicional: f.adicional.checked });
          EPT.aviso('Mano de obra agregada');
        } else {
          const pedir = !f.querySelector('#cPedir').hidden && f.pedir.checked;
          const r = await EPT.rpc('ept_servicio_hacer', { p_orden: o.id, p_servicio: f.servicio.value, p_mecanico: f.mecanico.value || null,
            p_importe: Number(f.importe.value), p_nota: f.nota.value, p_pedir_piezas: pedir, p_adicional: f.adicional.checked });
          EPT.aviso(r.solicitud ? `Servicio agregado y piezas pedidas (S-${r.solicitud.numero})` : 'Servicio agregado');
        }
        listo();
      },
    });
  }

  function anularMano(id, desc, listo) {
    EPT.ventana({
      titulo: 'Anular mano de obra', boton: 'Anular',
      cuerpo: `<p style="margin:0"><b>${esc(desc)}</b></p><p class="mute" style="margin:0">No se borra: queda tachada en la orden con el motivo.</p>
        <label class="campo">¿Por qué se anula?<input name="motivo" required maxlength="200"></label>`,
      async alGuardar(f) { await EPT.rpc('ept_mano_obra_anular', { p_id: id, p_motivo: f.motivo.value }); EPT.aviso('Anulada'); listo(); },
    });
  }

  function textoLibre(que, funcion, o, listo) {
    EPT.ventana({
      titulo: que + ' · ' + ot(o.numero), boton: 'Guardar',
      cuerpo: `<label class="campo">${esc(que)}<textarea name="texto" required maxlength="1000"></textarea></label>`,
      async alGuardar(f) {
        if (!f.texto.value.trim()) throw new Error('Escriba algo');
        await EPT.rpc(funcion, funcion === 'ept_diagnostico_agregar' ? { p_orden: o.id, p_texto: f.texto.value } : { p_orden: o.id, p_texto: f.texto.value });
        EPT.aviso('Guardado'); listo();
      },
    });
  }

  async function terminar(o, listo) {
    const r = await EPT.rpc('ept_trabajo_finalizar', { p_orden: o.id }).catch(e => { EPT.aviso(EPT.error(e), true); return null; });
    if (!r) return;
    if (r.ok) { EPT.aviso('Trabajo terminado. Pasa a revisión del jefe de taller.'); listo(); return; }
    EPT.ventana({
      titulo: 'Todavía falta', boton: '',
      cuerpo: `<p style="margin:0">Antes de terminar ${ot(o.numero)} resuelva esto:</p>
        <ul class="faltan">${r.faltan.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`,
    });
  }

  function revisar(o, aprobar, listo) {
    EPT.ventana({
      titulo: aprobar ? 'Enviar a Caja' : 'Devolver al taller', boton: aprobar ? 'Aprobar y enviar' : 'Devolver',
      cuerpo: aprobar ? `<p style="margin:0">¿Revisó ${ot(o.numero)} y está todo correcto? Pasará a Caja para facturar.</p>`
        : `<label class="campo">¿Qué hay que corregir?<textarea name="nota" required maxlength="500"></textarea></label>`,
      async alGuardar(f) {
        await EPT.rpc('ept_orden_revisar', { p_orden: o.id, p_aprobar: aprobar, p_nota: aprobar ? '' : f.nota.value });
        EPT.aviso(aprobar ? 'Enviada a Caja' : 'Devuelta al taller'); listo();
      },
    });
  }

  function cancelarSolicitud(d, listo) {
    EPT.ventana({
      titulo: 'Cancelar S-' + d.n, boton: 'Cancelar solicitud',
      cuerpo: `<label class="campo">¿Por qué se cancela?<input name="motivo" required maxlength="200"></label>`,
      async alGuardar(f) { await EPT.rpc('ept_solicitud_cancelar', { p_solicitud: d.cancelarSol, p_motivo: f.motivo.value }); EPT.aviso('Solicitud cancelada'); listo(); },
    });
  }

  function cancelarOrden(o) {
    EPT.ventana({
      titulo: 'Cancelar ' + ot(o.numero), boton: 'Cancelar orden',
      cuerpo: `<p style="margin:0">La orden queda guardada como cancelada; no se borra.</p>
        <label class="campo">¿Por qué se cancela?<input name="motivo" required maxlength="200"></label>`,
      async alGuardar(f) { await EPT.rpc('ept_orden_cancelar', { p_orden: o.id, p_motivo: f.motivo.value }); EPT.aviso('Orden cancelada'); abrirOrden(o.id); },
    });
  }
})();
