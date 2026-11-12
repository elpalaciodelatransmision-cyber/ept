// EPT CONTROL OPERATIVO · Repuestos: pedidos del taller (entregar, pedir a Almacén, cerrar faltante),
// devoluciones, y productos con existencias, transmisiones que sirven y equivalencias entre marcas.
(function () {
  'use strict';
  const { sb, esc, icono } = EPT;
  Object.assign(EPT.ICONOS, {
    camara: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    enlace: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    estante: '<path d="M4 4v16M20 4v16M4 9h16M4 15h16"/><path d="M8 6.5h3M13 12h3M7 17.5h4"/>',
    entregar: '<path d="M3 12h13M12 7l5 5-5 5"/><path d="M20 5v14"/>',
    volver: '<path d="M9 14l-5-5 5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  });
  const num = n => Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
  const dinero = n => 'RD$ ' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ot = n => 'OT-' + String(n).padStart(5, '0');
  const fecha = f => new Date(f).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const SOL = { pendiente: ['Nueva', 'aviso'], parcial: ['Despachada en parte', 'aviso'], pendiente_almacen: ['Esperando al Almacén', 'info'], despachada: ['Despachada', 'ok'], cancelada: ['Cancelada', 'malo'] };
  const chip = k => { const [t, c] = SOL[k] || [k, '']; return `<span class="estado ${c}">${esc(t)}</span>`; };
  const verRep = () => ['repuestos.despachar', 'repuestos.requisicion', 'repuestos.devolucion'].some(p => EPT.puede(p));

  async function existenciasDe(ids, ubicacion = 'repuestos') {
    if (!ids.length) return {};
    const filas = await EPT.leer(sb.from('existencias').select('producto_id,cantidad').eq('ubicacion', ubicacion).in('producto_id', ids));
    return Object.fromEntries(filas.map(f => [f.producto_id, Number(f.cantidad)]));
  }

  // ---------- Pedidos del taller ----------
  EPT.pantalla({
    id: 'pedidos', titulo: 'Pedidos del taller', subtitulo: 'Lo que piden los mecánicos y lo que devuelven',
    icono: 'entregar', grupo: 'Repuestos', atajo: 'Pedidos del taller', ver: verRep,
    async mostrar(v) {
      const [sols, devs] = await Promise.all([
        EPT.leer(sb.from('solicitudes').select('id,numero,estado,fecha,justificacion,mecanico:mecanicos(nombre),orden:ordenes(id,numero,paso,vehiculo:vehiculos(marca,modelo,placa)),lineas:solicitud_lineas(id)')
          .in('estado', ['pendiente', 'parcial', 'pendiente_almacen']).order('fecha'))
          .then(l => l.filter(s => !s.orden || s.orden.paso === 4)),
        EPT.leer(sb.from('devoluciones').select('id,cantidad,fecha,observaciones,producto:productos(codigo,descripcion,unidad),orden:ordenes(numero)').eq('estado', 'pendiente').order('fecha')),
      ]);
      const cuenta = k => sols.filter(s => s.estado === k).length;
      v.innerHTML = `
        <div class="contadores">
          <span><b>${cuenta('pendiente')}</b> nuevas</span><span><b>${cuenta('parcial')}</b> despachadas en parte</span>
          <span><b>${cuenta('pendiente_almacen')}</b> esperando al Almacén</span><span><b>${devs.length}</b> devoluciones</span></div>
        <div class="panel"><header><h2>Por despachar</h2></header>
          ${sols.length ? `<ul class="lista">${sols.map(s => `<li class="toca" data-sol="${s.id}">
            <div class="q"><b>S-${s.numero} · ${s.orden ? ot(s.orden.numero) + ' · ' + esc([s.orden.vehiculo?.marca, s.orden.vehiculo?.modelo, s.orden.vehiculo?.placa].filter(Boolean).join(' ')) : 'Sin orden'}</b>
              <span>${esc(s.mecanico?.nombre || '')} · ${s.lineas.length} pieza${s.lineas.length === 1 ? '' : 's'} · ${fecha(s.fecha)}</span></div>${chip(s.estado)}</li>`).join('')}</ul>`
            : '<div class="vacio">No hay pedidos pendientes. 👍</div>'}
        </div>
        ${EPT.puede('repuestos.devolucion') ? `<div class="panel" style="margin-top:16px"><header><h2>Devoluciones por ingresar</h2></header>
          ${devs.length ? `<ul class="lista">${devs.map(d => `<li>
            <div class="q"><b>${num(d.cantidad)} ${esc(d.producto.unidad)} · ${esc(d.producto.descripcion)}</b>
              <span>${ot(d.orden.numero)} · ${fecha(d.fecha)}${d.observaciones ? ' · ' + esc(d.observaciones) : ''}</span></div>
            <div class="fila"><button type="button" class="prin peque" data-dev="${d.id}" data-apta="1">Sirve: al estante</button>
              <button type="button" class="peque" data-dev="${d.id}" data-apta="0">No sirve</button></div></li>`).join('')}</ul>`
            : '<div class="vacio">No hay devoluciones por ingresar.</div>'}</div>` : ''}`;
      v.querySelectorAll('[data-sol]').forEach(li => li.addEventListener('click', () => abrirSolicitud(li.dataset.sol)));
      v.querySelectorAll('[data-dev]').forEach(b => b.addEventListener('click', () => recibirDevolucion(b.dataset.dev, b.dataset.apta === '1', devs.find(d => d.id === b.dataset.dev))));
    },
  });

  function recibirDevolucion(id, apta, d) {
    EPT.ventana({
      titulo: apta ? 'Vuelve al estante' : 'No sirve', boton: apta ? 'Ingresar y sumar' : 'Ingresar sin sumar',
      cuerpo: `<p style="margin:0"><b>${num(d.cantidad)} ${esc(d.producto.descripcion)}</b> de ${ot(d.orden.numero)}</p>
        ${apta ? '<p class="mute" style="margin:0">Se suma a la existencia de Repuestos.</p>' : '<label class="campo">¿Por qué no sirve?<input name="nota" required maxlength="200"></label>'}`,
      async alGuardar(f) {
        await EPT.rpc('ept_devolucion_recibir', { p_devolucion: id, p_apta: apta, p_nota: apta ? '' : f.nota.value });
        EPT.aviso(apta ? 'Ingreso registrado: sumada al estante' : 'Ingreso de la devolución registrado (no se suma)'); EPT.recargar();
      },
    });
  }

  // ---------- Entregar una solicitud ----------
  // Si el pedido es de una orden, se entrega dentro de la orden (paso 4). Solo los pedidos sin orden se abren aparte.
  async function abrirSolicitud(id) {
    const v = EPT.$('#vista'); v.innerHTML = '<div class="vacio">Cargando…</div>';
    const s = await EPT.leer(sb.from('solicitudes').select('id,numero,orden_id').eq('id', id).single());
    if (s.orden_id) return EPT.abrirOrden(s.orden_id);
    EPT.$('#titulo').textContent = 'S-' + s.numero;
    EPT.$('#subtitulo').textContent = 'Pedido sin orden';
    EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnVolverPed">${icono('atras')}Pedidos</button>`;
    EPT.$('#btnVolverPed').addEventListener('click', () => EPT.ir('pedidos'));
    v.innerHTML = '<div></div>';
    await pintarEntrega(v.firstElementChild, id, () => abrirSolicitud(id));
    window.scrollTo(0, 0);
  }

  // Pinta un pedido con su tabla para entregar dentro de "caja". listo() vuelve a cargar la pantalla de afuera.
  async function pintarEntrega(caja, id, listo) {
    const [s, prods] = await Promise.all([
      EPT.leer(sb.from('solicitudes').select('id,numero,estado,fecha,justificacion,mecanico:mecanicos(nombre),orden:ordenes(id,numero),lineas:solicitud_lineas(id,producto_id,codigo,descripcion,cantidad,unidad,despachada,cerrada,observaciones)').eq('id', id).single()),
      EPT.cargarProductos(),
    ]);
    const ids = s.lineas.map(l => l.producto_id).filter(Boolean);
    const [exR, exA, exU] = await Promise.all([existenciasDe(ids), existenciasDe(ids, 'almacen'), existenciasDe(ids, 'usadas')]);
    const usada = id => !!(prods.find(x => x.id === id) || {}).usada;
    const hayPara = id => usada(id) ? exU[id] || 0 : exR[id] || 0;
    const abierta = ['pendiente', 'parcial', 'pendiente_almacen'].includes(s.estado);
    caja.innerHTML = `
      <div class="sol"><div class="fila"><b>S-${s.numero}</b><span class="mute">${esc(s.mecanico?.nombre || '')} · ${fecha(s.fecha)}</span>${chip(s.estado)}</div>
        ${s.justificacion ? `<p class="mute" style="margin:4px 0">Justificación: ${esc(s.justificacion)}</p>` : ''}
        <div class="desliza"><table class="tabla entregar"><thead><tr><th>Pieza</th><th>Pidió</th><th>Despachado</th><th>Falta</th><th>Hay para despachar</th><th>En el Almacén</th>${abierta ? '<th>Despachar ahora</th>' : ''}</tr></thead><tbody>
        ${s.lineas.map(l => { const falta = l.cerrada ? 0 : Number(l.cantidad) - Number(l.despachada); const hay = hayPara(l.producto_id);
          return `<tr data-l="${l.id}" data-falta="${falta}">
            <td>${l.producto_id ? `<b>${esc(l.descripcion)}</b> <small class="mute">${esc(l.codigo)}</small>${usada(l.producto_id) ? ' <span class="marca-usada">USADA</span>' : ''}` :
              `<b>${esc(l.descripcion)}</b> <span class="estado aviso">sin código</span>${abierta && falta > 0 ? `<br>${EPT.campoPieza()}` : ''}`}
              ${l.observaciones ? `<br><small class="mute">${esc(l.observaciones)}</small>` : ''}</td>
            <td>${num(l.cantidad)}</td><td>${num(l.despachada)}</td><td><b class="${falta ? 'txt-aviso' : 'txt-ok'}">${num(falta)}</b></td>
            <td class="hay">${l.producto_id ? num(hay) + (usada(l.producto_id) ? ' <small class="mute">usadas</small>' : '') : '—'}</td><td class="hayA">${l.producto_id && !usada(l.producto_id) ? num(exA[l.producto_id] || 0) : '—'}</td>
            ${abierta ? `<td>${falta > 0 ? `<input class="cant" type="number" min="0" max="${falta}" step="any" inputmode="decimal" value="${l.producto_id ? Math.min(falta, hay) : 0}">` : ''}</td>` : ''}</tr>`; }).join('')}
        </tbody></table></div>
        ${abierta ? `<div class="botones" style="margin-top:10px">
          ${EPT.puede('repuestos.despachar') ? `<button type="button" class="prin" data-e="entregar">${icono('entregar')}Despachar</button>` : ''}
          ${EPT.puede('repuestos.requisicion') ? `<button type="button" data-e="faltante">Pedir lo que falta al Almacén</button>` : ''}
          ${EPT.puede('repuestos.despachar') ? `<button type="button" class="liso peque" data-e="cerrar">No se despachará el resto…</button>` : ''}</div>` : ''}
      </div>`;
    // al elegir producto para una línea sin código se muestra su existencia
    const mostrarExistencia = async (inp, p) => {
      const tr = inp.closest('tr');
      if (!p) { tr.querySelector('.hay').textContent = '—'; tr.querySelector('.hayA').textContent = '—'; return; }
      const [e, ea] = await Promise.all([existenciasDe([p.id], p.usada ? 'usadas' : 'repuestos'), existenciasDe([p.id], 'almacen')]);
      tr.querySelector('.hay').textContent = num(e[p.id] || 0); tr.querySelector('.hayA').textContent = p.usada ? '—' : num(ea[p.id] || 0);
      tr.querySelector('.cant').value = Math.min(Number(tr.dataset.falta), e[p.id] || 0);
    };
    const bp = EPT.sugerencias(caja.querySelector('table.entregar'), prods, { libre: false, alElegir: mostrarExistencia });
    caja.querySelectorAll('.pz-busca').forEach(inp => inp.addEventListener('change', () => mostrarExistencia(inp, bp.deTexto(inp.value))));
    const lineaDe = tr => {
      const l = s.lineas.find(x => x.id === tr.dataset.l); const inp = tr.querySelector('.pz-busca');
      let pid = l.producto_id;
      if (!pid && inp) { const p = bp.deTexto(inp.value); pid = p ? p.id : null; }
      return { l, pid, cant: Number(tr.querySelector('.cant')?.value || 0), falta: Number(tr.dataset.falta) };
    };
    const filas = () => [...caja.querySelectorAll('tr[data-l]')].map(lineaDe);
    const boton = k => caja.querySelector(`[data-e="${k}"]`);

    const be = boton('entregar');
    if (be) be.addEventListener('click', async () => {
      const ls = filas().filter(x => x.cant > 0);
      if (!ls.length) { EPT.aviso('Escriba cuánto despacha', true); return; }
      const sinProd = ls.find(x => !x.pid); if (sinProd) { EPT.aviso(`Elija el producto de "${sinProd.l.descripcion}"`, true); return; }
      be.disabled = true;
      try {
        await EPT.rpc('ept_despachar', { p_solicitud: s.id, p_lineas: ls.map(x => ({ solicitud_linea_id: x.l.id, producto_id: x.pid, cantidad: x.cant })) });
        EPT.aviso(s.orden ? 'Despachado. Cuando termine de despachar, toque Siguiente.' : 'Despachado.'); listo();
      } catch (e) { EPT.aviso(EPT.error(e), true); be.disabled = false; }
    });
    const bf = boton('faltante');
    if (bf) bf.addEventListener('click', () => {
      // lo que falta después de lo que se entrega ahora
      const todas = filas().map(x => ({ ...x, pedir: Math.max(0, x.falta - x.cant) })).filter(x => x.pedir > 0);
      if (!todas.length) { EPT.aviso('No falta nada por pedir', true); return; }
      const ls = todas.filter(x => x.pid && !usada(x.pid)), sinProd = todas.filter(x => !x.pid);
      if (!ls.length) { EPT.aviso(sinProd.length ? `Elija primero el producto de "${sinProd[0].l.descripcion}"` : 'Las piezas usadas no se piden al Almacén', true); return; }
      EPT.ventana({
        titulo: 'Pedir al Almacén', boton: 'Hacer requisición',
        cuerpo: `${sinProd.length ? `<div class="alerta" style="margin:0">${icono('nota')}<div>Sin producto elegido (no se piden): <b>${sinProd.map(x => esc(x.l.descripcion)).join(', ')}</b>. Elíjalo en la tabla para pedirlo.</div></div>` : ''}
          <p class="mute" style="margin:0">Lo que no alcanza en Repuestos:</p>
          <ul class="lista">${ls.map((x, i) => `<li style="padding:8px 0;min-height:0"><div class="q"><b>${esc(x.l.descripcion)}</b></div>
            <input type="number" name="q${i}" min="1" step="any" value="${x.pedir}" style="width:90px;text-align:center" aria-label="Cantidad"></li>`).join('')}</ul>
          <label class="campo">Motivo <small class="opc">(opcional)</small><input name="motivo" maxlength="200" value="${s.orden ? 'Para ' + ot(s.orden.numero) : ''}"></label>`,
        async alGuardar(f) {
          const r = await EPT.rpc('ept_requisicion_crear', { p_solicitud: s.id, p_motivo: f.motivo.value,
            p_lineas: ls.map((x, i) => ({ solicitud_linea_id: x.l.id, producto_id: x.pid, cantidad: Number(f['q' + i].value) })) });
          EPT.aviso(`Requisición R-${r.numero} hecha al Almacén`); listo();
        },
      });
    });
    const bc = boton('cerrar');
    if (bc) bc.addEventListener('click', () => EPT.ventana({
      titulo: 'No se despachará el resto', boton: 'Cerrar lo que falta',
      cuerpo: `<p style="margin:0">Lo que falta de S-${s.numero} se marca como no despachado.</p>
        <label class="campo">¿Por qué?<input name="motivo" required maxlength="200" placeholder="Ej. no hay en el Almacén; se usará otra pieza"></label>`,
      async alGuardar(f) { await EPT.rpc('ept_solicitud_cerrar_faltante', { p_solicitud: s.id, p_motivo: f.motivo.value }); EPT.aviso('Cerrado.'); listo(); },
    }));
  }

  EPT.abrirSolicitud = abrirSolicitud;
  EPT.pintarEntrega = pintarEntrega;

  // ---------- Productos y existencias ----------
  // Lo pesado (piezas, transmisiones, vehículos, equivalencias) se baja una vez y se guarda en memoria unos minutos;
  // las existencias se piden siempre frescas porque cambian con cada entrega.
  const CATALOGO_CAMBIA = /producto|importar|catalogo|equivalencia|aplicacion|transmision|marca|modelo/;
  let datosCat = null;
  const cargarFijo = () => EPT.memoria('catalogo', async () => {
    const [prods, tipos, pt, trans, apl, equiv] = await Promise.all([
      EPT.leerTodo(() => sb.from('productos').select('id,codigo,descripcion,unidad,precio,tipo_id,subfamilia_id,cobrable,en_almacen,marca_pieza,numero_parte,notas,minimo,activo,sin_codigo,foto,usada,producto_base').order('descripcion')).then(EPT.alfabetico),
      EPT.leer(sb.from('pieza_tipos').select('id,nombre,grupo,orden').order('orden')),
      EPT.leerTodo(() => sb.from('producto_transmisiones').select('producto_id,transmision_id').eq('activo', true), ['producto_id', 'transmision_id']),
      EPT.leer(sb.from('transmisiones').select('id,codigo,fabricante,tipo,velocidades,otros_nombres').eq('activo', true).order('codigo')),
      EPT.leerTodo(() => sb.from('aplicaciones').select('id,transmision_id,anio_desde,anio_hasta,motor,modelo:vehiculo_modelos(nombre,activo,marca:vehiculo_marcas(nombre,activo))').eq('activo', true)),
      EPT.leerTodo(() => sb.from('equivalencias').select('id,producto_id,marca,numero_parte,clase,fuente,verificado').eq('activo', true)),
    ]);
    // solo marcas y modelos que se trabajan
    const aplicaciones = apl.filter(a => a.modelo && a.modelo.activo && a.modelo.marca && a.modelo.marca.activo);
    const transDe = {}; pt.forEach(x => (transDe[x.producto_id] = transDe[x.producto_id] || []).push(x.transmision_id));
    const eqDe = {}; equiv.forEach(e => (eqDe[e.producto_id] = eqDe[e.producto_id] || []).push(e));
    const vehDe = {}; aplicaciones.forEach(a => (vehDe[a.transmision_id] = vehDe[a.transmision_id] || []).push(a));
    const transPorId = new Map(trans.map(t => [t.id, t])); const tipoPorId = new Map(tipos.map(t => [t.id, t.nombre]));
    const prodPorId = new Map(prods.map(p => [p.id, p]));
    // lo que se busca de cada pieza se arma UNA vez (antes se armaba en cada letra y el celular se congelaba)
    const busca = new Map(); const codigosTrans = new Map(); const vehiculos = new Map();
    for (const p of prods) {
      const ts = (transDe[p.id] || []).map(id => transPorId.get(id)).filter(Boolean);
      const vs = (transDe[p.id] || []).flatMap(t => vehDe[t] || []);
      codigosTrans.set(p.id, ts.map(x => x.codigo));
      vehiculos.set(p.id, vs);
      // el tipo de pieza va en español (las descripciones de los catálogos vienen en inglés): "junta", "banda", "filtro"…
      busca.set(p.id, EPT.llano([p.codigo, p.descripcion, tipoPorId.get(p.tipo_id), p.marca_pieza, p.numero_parte, p.notas,
        ...(eqDe[p.id] || []).flatMap(e => [e.marca, e.numero_parte]),
        ...ts.flatMap(x => [x.codigo, x.otros_nombres, x.fabricante]),
        ...vs.map(a => `${a.modelo.marca.nombre} ${a.modelo.nombre} ${a.motor}`)].filter(Boolean).join(' ')));
    }
    return { prods, tipos, trans, transDe, eqDe, vehDe, transPorId, prodPorId, busca, codigosTrans, vehiculos };
  }, { cambiaCon: CATALOGO_CAMBIA });
  async function cargarCatalogo() {
    const [fijo, exist, F] = await Promise.all([cargarFijo(),
      EPT.leerTodo(() => sb.from('existencias').select('producto_id,ubicacion,cantidad'), ['producto_id', 'ubicacion']), EPT.cargarFamilias()]);
    const ex = {}; exist.forEach(e => { (ex[e.producto_id] = ex[e.producto_id] || {})[e.ubicacion] = Number(e.cantidad); });
    const nuevas = {}, usadas = {};
    fijo.prods.forEach(p => {
      const e = ex[p.id] || {};
      if (p.usada) { if (p.producto_base) usadas[p.producto_base] = (usadas[p.producto_base] || 0) + (e.usadas || 0); }
      else nuevas[p.id] = (e.repuestos || 0) + (e.almacen || 0);
    });
    // nuevas y usadas de la misma pieza, mire uno u otro producto
    const cuantas = p => p.usada ? { nuevas: p.producto_base ? nuevas[p.producto_base] || 0 : null, usadas: (ex[p.id] || {}).usadas || 0 }
      : { nuevas: nuevas[p.id] || 0, usadas: usadas[p.id] || 0 };
    datosCat = { ...fijo, ex, cuantas, F };
    return datosCat;
  }
  const textoVehiculos = (tids, d) => (tids || []).flatMap(t => d.vehDe[t] || [])
    .map(a => `${a.modelo.marca.nombre} ${a.modelo.nombre} ${EPT.anios(a)}`);

  let buscaProd = '', famProd = '', subProd = '', cuantosProd = 100;
  EPT.pantalla({
    id: 'productos', titulo: 'Productos y existencias', subtitulo: 'Busque por código, nombre, número de parte, transmisión o vehículo',
    icono: 'estante', grupo: 'Repuestos', atajo: 'Productos',
    ver: () => verRep() || EPT.puede('productos.gestionar') || EPT.puede('almacen.resolver') || EPT.puede('inventario.ajustar'),
    async mostrar(v) {
      if (EPT.puede('productos.gestionar')) {
        EPT.$('#barraBotones').innerHTML = `<button type="button" class="prin" id="btnNuevoProd">${icono('mas')}Nuevo producto</button>`;
        EPT.$('#btnNuevoProd').addEventListener('click', () => fichaProducto(null));
      }
      const d = await cargarCatalogo();
      v.innerHTML = `<div class="fila" style="margin-bottom:14px">
          <div class="buscador">${icono('buscar')}<input id="bProd" type="search" value="${esc(buscaProd)}" placeholder="Ej. filtro, 35330, U341E, Corolla 2010"></div>
          <select id="fFamP" style="flex:0 1 260px" aria-label="Familia"><option value="">Todas las familias</option>${d.F.fams.map(f => `<option value="${f.id}" ${f.id === famProd ? 'selected' : ''}>${esc(f.nombre)}</option>`).join('')}</select>
          <select id="fSubP" style="flex:0 1 240px" aria-label="Subfamilia" ${famProd ? '' : 'disabled'}><option value="">Todas las subfamilias</option>${famProd ? d.F.subsDe(famProd).map(x => `<option value="${x.id}" ${x.id === subProd ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('') : ''}</select></div>
        <div class="panel" id="listaProd"></div>`;
      let t; v.querySelector('#bProd').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { buscaProd = e.target.value; cuantosProd = 100; pintarProductos(); }, 200); });
      v.querySelector('#fFamP').addEventListener('change', e => { famProd = e.target.value; subProd = ''; cuantosProd = 100; EPT.recargar(); });
      v.querySelector('#fSubP').addEventListener('change', e => { subProd = e.target.value; cuantosProd = 100; pintarProductos(); });
      // un solo oyente para toda la lista (antes uno por renglón)
      v.querySelector('#listaProd').addEventListener('click', e => {
        if (e.target.closest('#masProd')) { cuantosProd += 100; pintarProductos(); return; }
        const li = e.target.closest('[data-p]'); if (li) fichaProducto(datosCat.prodPorId.get(li.dataset.p));
      });
      pintarProductos();
    },
  });

  function coincide(p, d, pal, anios) {
    if (pal.length && !pal.every(w => d.busca.get(p.id).includes(w))) return false;
    if (!anios.length) return true;
    // años vacíos = por confirmar (no se puede asegurar); sin "hasta" = hasta hoy
    return d.vehiculos.get(p.id).some(a => a.anio_desde != null && anios.every(y => y >= a.anio_desde && y <= (a.anio_hasta ?? 9999)));
  }

  function pintarProductos() {
    const d = datosCat; const caja = EPT.$('#listaProd'); if (!caja || !d) return;
    const todas = EPT.llano(buscaProd.trim()).split(/\s+/).filter(Boolean);
    const anios = todas.filter(w => /^(19|20)\d{2}$/.test(w)).map(Number);
    const pal = todas.filter(w => !/^(19|20)\d{2}$/.test(w));
    // se cuentan todas las que coinciden pero se dibujan de 100 en 100 (dibujar cientos de renglones traba el celular)
    const halladas = d.prods.filter(p => p.activo && (!famProd || d.F.porSub.get(p.subfamilia_id)?.familia_id === famProd) && (!subProd || p.subfamilia_id === subProd) && coincide(p, d, pal, anios));
    const lista = halladas.slice(0, cuantosProd);
    caja.innerHTML = lista.length ? `<ul class="lista">${lista.map(p => {
      const e = d.ex[p.id] || {}; const r = e.repuestos || 0; const bajo = Number(p.minimo) > 0 && r <= Number(p.minimo);
      const trans = d.codigosTrans.get(p.id) || [];
      return `<li class="toca" data-p="${p.id}">${p.foto ? `<img class="mini" src="${esc(urlFoto(p.foto))}" alt="" loading="lazy">` : ''}<span class="codigo">${esc(p.codigo)}</span>
        <div class="q"><b>${esc(p.descripcion)}</b><span>${esc(d.F.porSub.get(p.subfamilia_id)?.nombre || '')}${p.marca_pieza || p.numero_parte ? ' · ' : ''}${[p.marca_pieza, p.numero_parte].filter(Boolean).map(esc).join(' ')}${trans.length ? ' · ' + esc(trans.slice(0, 6).join(', ')) + (trans.length > 6 ? '…' : '') : ''}</span></div>
        <div class="stock">${p.usada ? `<span><b>${num(e.usadas || 0)}</b> Usadas</span>${d.cuantas(p).nuevas != null ? `<span class="mute"><b>${num(d.cuantas(p).nuevas)}</b> Nuevas</span>` : ''}`
          : `<span class="${bajo ? 'txt-malo' : ''}"><b>${num(r)}</b> Rep.</span><span class="mute"><b>${num(e.almacen || 0)}</b> Alm.</span><span class="mute"><b>${num(d.cuantas(p).usadas)}</b> Usadas</span>`}</div></li>`; }).join('')}</ul>
      ${halladas.length > lista.length ? `<div class="pie-panel"><span class="mute">Se ven ${num(lista.length)} de ${num(halladas.length)}</span><button type="button" class="peque der" id="masProd">Mostrar 100 más</button></div>` : ''}`
      : `<div class="vacio">${d.prods.length ? 'No se encontró nada con eso.' : 'Todavía no hay productos. Toque "Nuevo producto".'}</div>`;
  }

  // ---------- Foto de la pieza ----------
  // Foto propia (tomada con el celular o subida), y dos ayudas para verla antes de mandar a comprar:
  // la página del fabricante de donde salió el dato y una búsqueda de imágenes con su marca y número.
  const urlFoto = ruta => ruta ? sb.storage.from('piezas').getPublicUrl(ruta).data.publicUrl : '';
  function fotoPieza(p, d, puede) {
    const fuente = (/Fuente: (https?:\/\/\S+)/.exec(p.notas || '') || [])[1] || '';
    const trans = (d.transDe[p.id] || []).map(id => (d.trans.find(x => x.id === id) || {}).codigo).filter(Boolean);
    const q = [p.marca_pieza, p.numero_parte || p.codigo, trans[0] ? trans[0].replace(/\s*\(.*\)/, '') : '', 'transmission'].filter(Boolean).join(' ');
    return `<div class="foto-pieza">
      <div class="marco">${p.foto ? `<img src="${esc(urlFoto(p.foto))}" alt="Foto de ${esc(p.descripcion)}">` : '<span>Sin foto propia todavía</span>'}</div>
      <div class="botones-foto">
        ${puede ? `<label class="btn peque">${icono('camara')}${p.foto ? 'Cambiar foto' : 'Tomar o subir foto'}<input type="file" accept="image/*" capture="environment" id="fotoArchivo" hidden></label>` : ''}
        ${fuente ? `<a class="btn peque" href="${esc(fuente)}" target="_blank" rel="noopener">${icono('enlace')}Ver en el catálogo del fabricante</a>` : ''}
        <a class="btn peque" href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}" target="_blank" rel="noopener">${icono('buscar')}Buscar fotos en internet</a>
        <small class="mute">Para mandar a comprar: ${esc([p.marca_pieza, p.numero_parte].filter(Boolean).join(' ') || p.codigo)}</small>
      </div></div>`;
  }
  async function subirFoto(p, archivo, dlg) {
    if (!archivo) return;
    try {
      EPT.aviso('Subiendo la foto…');
      // se achica a 1200 px y se guarda como JPG para que cargue rápido en el celular
      const img = await createImageBitmap(archivo);
      const k = Math.min(1, 1200 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
      const ruta = `${p.id}/${Date.now()}.jpg`;
      const { error } = await sb.storage.from('piezas').upload(ruta, blob, { contentType: 'image/jpeg' });
      if (error) throw new Error(/row-level|permission|403/i.test(error.message) ? 'No tiene permiso para subir fotos' : error.message);
      await EPT.rpc('ept_producto_foto', { p_id: p.id, p_ruta: ruta });
      p.foto = ruta;
      EPT.aviso('Foto guardada');
      dlg.close(); fichaProducto(p);
    } catch (e) { EPT.aviso(EPT.error(e), true); }
  }

  async function fichaProducto(p) {
    const d = datosCat || await cargarCatalogo();
    const puede = EPT.puede('productos.gestionar');
    const elegidas = new Set(p ? d.transDe[p.id] || [] : []);
    const movs = p ? await EPT.leer(sb.from('movimientos_inventario').select('fecha,ubicacion,cantidad,tipo,nota,usuario:usuarios(nombre)').eq('producto_id', p.id).order('fecha', { ascending: false }).limit(15)) : [];
    const e = p ? d.ex[p.id] || {} : {};
    const TIPOMOV = { despacho_taller: 'Despachado al taller', devolucion_taller: 'Ingreso por devolución del taller', transferencia_salida: 'Despacho del Almacén a Repuestos', transferencia_llegada: 'Ingreso del despacho del Almacén', transferencia_diferencia: 'Diferencia de despacho', ajuste: 'Ajuste', carga_inicial: 'Carga inicial', importacion: 'Importado', compra_lote: 'Ingreso de lote de usadas', ingreso_almacen: 'Ingreso al Almacén', despacho_persona: 'Despacho a una persona' };
    const vehiculos = textoVehiculos([...elegidas], d);
    EPT.ventana({
      titulo: p ? p.codigo + ' · ' + p.descripcion : 'Nuevo producto', boton: puede ? 'Guardar' : '',
      cuerpo: `
        ${p ? fotoPieza(p, d, puede) : ''}
        ${p ? `<div class="contadores">${p.usada ? `<span class="marca-usada">USADA</span><span><b>${num(e.usadas || 0)}</b> usadas</span>${d.cuantas(p).nuevas != null ? `<span><b>${num(d.cuantas(p).nuevas)}</b> nuevas de esta pieza</span>` : ''}`
          : `<span><b>${num(e.repuestos || 0)}</b> en Repuestos</span><span><b>${num(e.almacen || 0)}</b> en el Almacén</span><span><b>${num(e.transito || 0)}</b> en camino</span><span><b>${num(d.cuantas(p).usadas)}</b> usadas</span>`}</div>` : ''}
        <fieldset ${puede ? '' : 'disabled'} class="limpio">
        <div class="dos"><label class="campo">Código <small class="opc">${p ? '' : '(vacío = SC-…)'}</small><input name="codigo" value="${esc(p ? p.codigo : '')}" maxlength="40" autocapitalize="characters"></label>
          <label class="campo">Tipo de pieza<select name="tipo"><option value="">—</option>${d.tipos.map(t => `<option value="${t.id}" ${p && p.tipo_id === t.id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></label></div>
        <label class="campo">Nombre de la pieza<input name="desc" value="${esc(p ? p.descripcion : '')}" required maxlength="160"></label>
        <div class="dos">${EPT.selectFamilias(d.F, p ? p.subfamilia_id : '')}</div>
        ${EPT.botonesCobro(p ? p.cobrable : null, { etiqueta: 'Cuando se usa en una orden' })}
        <div class="dos"><label class="campo">Marca de la pieza<input name="marca" value="${esc(p ? p.marca_pieza : '')}" maxlength="60" placeholder="Aisin, Transtar, Raybestos…"></label>
          <label class="campo">Número de parte<input name="np" value="${esc(p ? p.numero_parte : '')}" maxlength="60"></label></div>
        <div class="tres-col"><label class="campo">Unidad<input name="unidad" value="${esc(p ? p.unidad : 'UNID')}" maxlength="12"></label>
          <label class="campo">Precio RD$<input name="precio" type="number" min="0" step="any" value="${p ? p.precio : ''}"></label>
          <label class="campo">Mínimo<input name="minimo" type="number" min="0" step="any" value="${p ? p.minimo : 0}"></label></div>
        <label class="campo">Notas<input name="notas" value="${esc(p ? p.notas : '')}" maxlength="300"></label>
        <div class="campo">Transmisiones que sirve
          <input id="bTrans" placeholder="Buscar transmisión (ej. U341, RE0F10A)" style="margin-top:4px">
          <div class="marcas" id="lTrans">${d.trans.map(t => `<label class="check"><input type="checkbox" value="${t.id}" ${elegidas.has(t.id) ? 'checked' : ''}><span>${esc(t.codigo)} <small class="mute">${esc([t.fabricante, t.otros_nombres].filter(Boolean).join(' · '))}</small></span></label>`).join('') || '<p class="mute">Todavía no hay transmisiones en el catálogo.</p>'}</div></div>
        </fieldset>
        ${vehiculos.length ? `<div class="campo">Vehículos (según sus transmisiones)<p class="mute" style="margin:0;font-weight:400">${esc([...new Set(vehiculos)].slice(0, 40).join(' · '))}</p></div>` : ''}
        ${p ? `<div class="campo">Equivalencias en otras marcas
          ${(d.eqDe[p.id] || []).length ? `<ul class="lista">${d.eqDe[p.id].map(x => `<li style="padding:8px 0;min-height:0"><div class="q"><b>${esc(x.marca)} ${esc(x.numero_parte)}</b>
            <span>${x.clase === 'original' ? 'Original' : x.clase === 'reemplaza' ? 'Reemplaza' : 'Alterna'} · ${x.verificado ? '<span class="txt-ok">verificada</span>' : '<span class="txt-aviso">por verificar</span>'}${x.fuente ? ' · ' + esc(x.fuente) : ''}</span></div>
            ${puede ? `<button type="button" class="liso peque" data-quitar-eq="${x.id}">Quitar</button>` : ''}</li>`).join('')}</ul>` : '<p class="mute" style="margin:0;font-weight:400">Sin equivalencias.</p>'}
          ${puede ? `<button type="button" class="peque" id="btnEq" style="margin-top:6px;justify-self:start">${icono('mas')}Equivalencia</button>` : ''}</div>
          <div class="fila">${EPT.puede('inventario.ajustar') ? `<button type="button" class="peque" id="btnAjuste">Ajustar existencia…</button>` : ''}</div>
          ${movs.length ? `<div class="campo">Últimos movimientos<ul class="lista">${movs.map(m => `<li style="padding:6px 0;min-height:0"><div class="q"><b>${esc(TIPOMOV[m.tipo] || m.tipo)} · ${{ almacen: 'Almacén', transito: 'En camino', usadas: 'Piezas usadas' }[m.ubicacion] || 'Repuestos'}</b>
            <span>${fecha(m.fecha)} · ${esc(m.usuario?.nombre || '')}${m.nota ? ' · ' + esc(m.nota) : ''}</span></div><b class="${Number(m.cantidad) < 0 ? 'txt-malo' : 'txt-ok'}">${Number(m.cantidad) > 0 ? '+' : ''}${num(m.cantidad)}</b></li>`).join('')}</ul></div>` : ''}` : ''}`,
      alAbrir(f, dlg) {
        EPT.enlazarFamilias(datosCat.F, f);
        EPT.enlazarCobro(f);
        const fa = f.querySelector('#fotoArchivo');
        if (fa) fa.addEventListener('change', () => subirFoto(p, fa.files[0], dlg));
        f.querySelector('#bTrans').addEventListener('input', ev => { const q = ev.target.value.trim().toLowerCase();
          f.querySelectorAll('#lTrans label').forEach(l => { l.hidden = q && !l.textContent.toLowerCase().includes(q); }); });
        const be = f.querySelector('#btnEq'); if (be) be.addEventListener('click', () => { dlg.close(); nuevaEquivalencia(p); });
        f.querySelectorAll('[data-quitar-eq]').forEach(b => b.addEventListener('click', async () => {
          try { await EPT.rpc('ept_catalogo_activar', { p_tabla: 'equivalencias', p_id: b.dataset.quitarEq, p_activo: false }); b.closest('li').remove(); EPT.aviso('Equivalencia quitada'); }
          catch (er) { EPT.aviso(EPT.error(er), true); } }));
        const ba = f.querySelector('#btnAjuste'); if (ba) ba.addEventListener('click', () => { dlg.close(); ajustar(p); });
      },
      async alGuardar(f) {
        const r = await EPT.rpc('ept_producto_guardar', { p_id: p ? p.id : null, p: { codigo: f.codigo.value, descripcion: f.desc.value, unidad: f.unidad.value,
          precio: Number(f.precio.value || 0), tipo_id: f.tipo.value, marca_pieza: f.marca.value, numero_parte: f.np.value, notas: f.notas.value, minimo: Number(f.minimo.value || 0) } });
        // familia y si se cobra (si no eligió subfamilia, queda la que le toca por su tipo; sin elegir cobro = se cobra)
        const cobra = EPT.seCobra(f);
        if (f.subfamilia.value ? (!p || f.subfamilia.value !== p.subfamilia_id || cobra !== p.cobrable) : (p ? cobra !== p.cobrable : !cobra)) {
          const sub = f.subfamilia.value || (await EPT.leer(sb.from('productos').select('subfamilia_id').eq('id', r.id).single())).subfamilia_id;
          await EPT.rpc('ept_producto_clasificar', { p_producto: r.id, p_subfamilia: sub, p_cobrable: cobra });
        }
        const marcadas = [...f.querySelectorAll('#lTrans input:checked')].map(x => x.value);
        if (p || marcadas.length) await EPT.rpc('ept_producto_transmisiones', { p_producto: r.id, p_transmisiones: marcadas, p_fuente: '' });
        EPT.aviso(p ? 'Producto guardado' : `Producto creado: ${r.codigo}`); EPT.recargar();
      },
    });
  }

  function nuevaEquivalencia(p) {
    EPT.ventana({
      titulo: 'Equivalencia de ' + p.codigo, boton: 'Agregar',
      cuerpo: `<p class="mute" style="margin:0">La misma pieza con número de otra marca, para poder cambiarla por una compatible.</p>
        <div class="dos"><label class="campo">Marca<input name="marca" required maxlength="60" placeholder="Ej. Transtar"></label>
          <label class="campo">Número de parte<input name="np" required maxlength="60"></label></div>
        <label class="campo">Clase<select name="clase"><option value="alterna">Alterna (otra marca que sirve)</option><option value="original">Original del fabricante</option><option value="reemplaza">Reemplaza a un número viejo</option></select></label>
        <label class="campo">¿De dónde salió? <small class="opc">(catálogo, página, suplidor)</small><input name="fuente" maxlength="300"></label>
        <label class="check"><input type="checkbox" name="verif"><span>Verificada (se comprobó en un catálogo)</span></label>`,
      async alGuardar(f) {
        await EPT.rpc('ept_equivalencia_guardar', { p_producto: p.id, p_marca: f.marca.value, p_numero: f.np.value, p_clase: f.clase.value, p_fuente: f.fuente.value, p_verificado: f.verif.checked });
        EPT.aviso('Equivalencia agregada'); await cargarCatalogo(); fichaProducto(datosCat.prods.find(x => x.id === p.id));
      },
    });
  }

  function ajustar(p) {
    EPT.ventana({
      titulo: 'Ajustar ' + p.codigo, boton: 'Guardar ajuste',
      cuerpo: `<p class="mute" style="margin:0">Sume o reste. Queda en el historial con su motivo; no se borra.</p>
        <div class="dos"><label class="campo">Dónde<select name="ub">${p.usada ? '<option value="usadas">Piezas usadas</option>' : '<option value="repuestos">Repuestos</option>' + (EPT.puede('almacen.ajustar') ? '<option value="almacen">Almacén</option>' : '')}</select></label>
          <label class="campo">Cantidad <small class="opc">(+ suma, − resta)</small><input name="cant" type="number" step="any" required class="grande"></label></div>
        <label class="campo">Motivo<input name="motivo" required maxlength="200" placeholder="Ej. conteo físico"></label>
        <label class="check"><input type="checkbox" name="inicial"><span>Es la carga inicial (lo que había al empezar)</span></label>`,
      async alGuardar(f) {
        const q = await EPT.rpc('ept_ajuste_inventario', { p_producto: p.id, p_ubicacion: f.ub.value, p_cantidad: Number(f.cant.value), p_motivo: f.motivo.value, p_carga_inicial: f.inicial.checked });
        EPT.aviso(`Ajustado. Ahora hay ${num(q)}.`); EPT.recargar();
      },
    });
  }
})();
