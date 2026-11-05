// EPT CONTROL OPERATIVO · Repuestos: pedidos del taller (entregar, pedir a Almacén, cerrar faltante),
// devoluciones, y productos con existencias, transmisiones que sirven y equivalencias entre marcas.
(function () {
  'use strict';
  const { sb, esc, icono } = EPT;
  Object.assign(EPT.ICONOS, {
    estante: '<path d="M4 4v16M20 4v16M4 9h16M4 15h16"/><path d="M8 6.5h3M13 12h3M7 17.5h4"/>',
    entregar: '<path d="M3 12h13M12 7l5 5-5 5"/><path d="M20 5v14"/>',
    volver: '<path d="M9 14l-5-5 5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  });
  const num = n => Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
  const dinero = n => 'RD$ ' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ot = n => 'OT-' + String(n).padStart(5, '0');
  const fecha = f => new Date(f).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const SOL = { pendiente: ['Nueva', 'aviso'], parcial: ['Entregada en parte', 'aviso'], pendiente_almacen: ['Esperando Almacén', 'info'], despachada: ['Entregada', 'ok'], cancelada: ['Cancelada', 'malo'] };
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
        EPT.leer(sb.from('solicitudes').select('id,numero,estado,fecha,justificacion,mecanico:mecanicos(nombre),orden:ordenes(id,numero,vehiculo:vehiculos(marca,modelo,placa)),lineas:solicitud_lineas(id)')
          .in('estado', ['pendiente', 'parcial', 'pendiente_almacen']).order('fecha')),
        EPT.leer(sb.from('devoluciones').select('id,cantidad,fecha,observaciones,producto:productos(codigo,descripcion,unidad),orden:ordenes(numero)').eq('estado', 'pendiente').order('fecha')),
      ]);
      const cuenta = k => sols.filter(s => s.estado === k).length;
      v.innerHTML = `
        <div class="contadores">
          <span><b>${cuenta('pendiente')}</b> nuevas</span><span><b>${cuenta('parcial')}</b> entregadas en parte</span>
          <span><b>${cuenta('pendiente_almacen')}</b> esperando Almacén</span><span><b>${devs.length}</b> devoluciones</span></div>
        <div class="panel"><header><h2>Por entregar</h2></header>
          ${sols.length ? `<ul class="lista">${sols.map(s => `<li class="toca" data-sol="${s.id}">
            <div class="q"><b>S-${s.numero} · ${s.orden ? ot(s.orden.numero) + ' · ' + esc([s.orden.vehiculo?.marca, s.orden.vehiculo?.modelo, s.orden.vehiculo?.placa].filter(Boolean).join(' ')) : 'Sin orden'}</b>
              <span>${esc(s.mecanico?.nombre || '')} · ${s.lineas.length} pieza${s.lineas.length === 1 ? '' : 's'} · ${fecha(s.fecha)}</span></div>${chip(s.estado)}</li>`).join('')}</ul>`
            : '<div class="vacio">No hay pedidos pendientes. 👍</div>'}
        </div>
        ${EPT.puede('repuestos.devolucion') ? `<div class="panel" style="margin-top:16px"><header><h2>Devoluciones por recibir</h2></header>
          ${devs.length ? `<ul class="lista">${devs.map(d => `<li>
            <div class="q"><b>${num(d.cantidad)} ${esc(d.producto.unidad)} · ${esc(d.producto.descripcion)}</b>
              <span>${ot(d.orden.numero)} · ${fecha(d.fecha)}${d.observaciones ? ' · ' + esc(d.observaciones) : ''}</span></div>
            <div class="fila"><button type="button" class="prin peque" data-dev="${d.id}" data-apta="1">Sirve: al estante</button>
              <button type="button" class="peque" data-dev="${d.id}" data-apta="0">No sirve</button></div></li>`).join('')}</ul>`
            : '<div class="vacio">No hay devoluciones por recibir.</div>'}</div>` : ''}`;
      v.querySelectorAll('[data-sol]').forEach(li => li.addEventListener('click', () => abrirSolicitud(li.dataset.sol)));
      v.querySelectorAll('[data-dev]').forEach(b => b.addEventListener('click', () => recibirDevolucion(b.dataset.dev, b.dataset.apta === '1', devs.find(d => d.id === b.dataset.dev))));
    },
  });

  function recibirDevolucion(id, apta, d) {
    EPT.ventana({
      titulo: apta ? 'Vuelve al estante' : 'No sirve', boton: apta ? 'Recibir y sumar' : 'Recibir sin sumar',
      cuerpo: `<p style="margin:0"><b>${num(d.cantidad)} ${esc(d.producto.descripcion)}</b> de ${ot(d.orden.numero)}</p>
        ${apta ? '<p class="mute" style="margin:0">Se suma a la existencia de Repuestos.</p>' : '<label class="campo">¿Por qué no sirve?<input name="nota" required maxlength="200"></label>'}`,
      async alGuardar(f) {
        await EPT.rpc('ept_devolucion_recibir', { p_devolucion: id, p_apta: apta, p_nota: apta ? '' : f.nota.value });
        EPT.aviso(apta ? 'Devolución recibida: sumada al estante' : 'Devolución recibida'); EPT.recargar();
      },
    });
  }

  // ---------- Entregar una solicitud ----------
  async function abrirSolicitud(id) {
    const v = EPT.$('#vista'); v.innerHTML = '<div class="vacio">Cargando…</div>';
    const [s, prods] = await Promise.all([
      EPT.leer(sb.from('solicitudes').select('id,numero,estado,fecha,justificacion,mecanico:mecanicos(nombre),orden:ordenes(id,numero,cliente:clientes(nombre),vehiculo:vehiculos(marca,modelo,anio,placa)),lineas:solicitud_lineas(id,producto_id,codigo,descripcion,cantidad,unidad,despachada,cerrada,observaciones)').eq('id', id).single()),
      EPT.cargarProductos(),
    ]);
    const exR = await existenciasDe(s.lineas.map(l => l.producto_id).filter(Boolean));
    const exA = await existenciasDe(s.lineas.map(l => l.producto_id).filter(Boolean), 'almacen');
    const abierta = ['pendiente', 'parcial', 'pendiente_almacen'].includes(s.estado);
    EPT.$('#titulo').textContent = 'S-' + s.numero;
    EPT.$('#subtitulo').textContent = s.orden ? `${ot(s.orden.numero)} · ${[s.orden.vehiculo?.marca, s.orden.vehiculo?.modelo, s.orden.vehiculo?.anio, s.orden.vehiculo?.placa].filter(Boolean).join(' ')}` : 'Sin orden';
    EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnVolverPed">${icono('atras')}Pedidos</button>`;
    EPT.$('#btnVolverPed').addEventListener('click', () => EPT.ir('pedidos'));
    const etiqueta = p => `${p.codigo} — ${p.descripcion}`;
    v.innerHTML = `
      <div class="panel"><div class="cuerpo"><div class="fila"><span class="ot-num">S-${s.numero}</span>${chip(s.estado)}
        ${s.orden ? `<button type="button" class="der" id="verOrden">Ver ${ot(s.orden.numero)}</button>` : ''}</div>
        <dl class="datos"><div><dt>Mecánico</dt><dd>${esc(s.mecanico?.nombre || '—')}</dd></div>
          <div><dt>Cliente</dt><dd>${esc(s.orden?.cliente?.nombre || '—')}</dd></div><div><dt>Pedida</dt><dd>${fecha(s.fecha)}</dd></div>
          ${s.justificacion ? `<div class="ancho"><dt>Justificación</dt><dd>${esc(s.justificacion)}</dd></div>` : ''}</dl></div></div>
      <div class="panel" style="margin-top:16px"><header><h2>Piezas</h2></header><div class="desliza">
        <table class="tabla entregar"><thead><tr><th>Pieza</th><th>Pidió</th><th>Entregado</th><th>Falta</th><th>En Repuestos</th><th>En Almacén</th>${abierta ? '<th>Entregar ahora</th>' : ''}</tr></thead><tbody>
        ${s.lineas.map(l => { const falta = l.cerrada ? 0 : Number(l.cantidad) - Number(l.despachada); const hay = exR[l.producto_id] || 0;
          return `<tr data-l="${l.id}" data-falta="${falta}">
            <td>${l.producto_id ? `<b>${esc(l.descripcion)}</b> <small class="mute">${esc(l.codigo)}</small>` :
              `<b>${esc(l.descripcion)}</b> <span class="estado aviso">sin código</span>${abierta && falta > 0 ? `<br><input class="elige" list="dlProdRep" placeholder="Elija el producto del catálogo">` : ''}`}
              ${l.observaciones ? `<br><small class="mute">${esc(l.observaciones)}</small>` : ''}</td>
            <td>${num(l.cantidad)}</td><td>${num(l.despachada)}</td><td><b class="${falta ? 'txt-aviso' : 'txt-ok'}">${num(falta)}</b></td>
            <td class="hay">${l.producto_id ? num(hay) : '—'}</td><td class="hayA">${l.producto_id ? num(exA[l.producto_id] || 0) : '—'}</td>
            ${abierta ? `<td>${falta > 0 ? `<input class="cant" type="number" min="0" max="${falta}" step="any" inputmode="decimal" value="${l.producto_id ? Math.min(falta, hay) : 0}">` : ''}</td>` : ''}</tr>`; }).join('')}
        </tbody></table></div>
        <datalist id="dlProdRep">${prods.map(p => `<option value="${esc(etiqueta(p))}">`).join('')}</datalist>
        ${abierta ? `<div class="pie-panel">
          ${EPT.puede('repuestos.despachar') ? `<button type="button" class="prin" id="btnEntregar">${icono('entregar')}Entregar</button>` : ''}
          ${EPT.puede('repuestos.requisicion') ? `<button type="button" id="btnFaltante">Pedir lo que falta a Almacén</button>` : ''}
          ${EPT.puede('repuestos.despachar') ? `<button type="button" class="liso peque der" id="btnCerrar">No se entregará el resto…</button>` : ''}</div>` : ''}
      </div>`;
    const ver = EPT.$('#verOrden'); if (ver) ver.addEventListener('click', () => EPT.abrirOrden(s.orden.id));
    const porEtiqueta = new Map(prods.map(p => [etiqueta(p).toLowerCase(), p]));
    const porCodigo = new Map(prods.map(p => [p.codigo.toLowerCase(), p]));
    // al elegir producto para una línea sin código se muestra su existencia
    v.querySelectorAll('input.elige').forEach(inp => inp.addEventListener('change', async () => {
      const p = porEtiqueta.get(inp.value.trim().toLowerCase()) || porCodigo.get(inp.value.trim().toLowerCase());
      const tr = inp.closest('tr');
      if (!p) { tr.querySelector('.hay').textContent = '—'; return; }
      const e = await existenciasDe([p.id]); const ea = await existenciasDe([p.id], 'almacen');
      tr.querySelector('.hay').textContent = num(e[p.id] || 0); tr.querySelector('.hayA').textContent = num(ea[p.id] || 0);
      tr.querySelector('.cant').value = Math.min(Number(tr.dataset.falta), e[p.id] || 0);
    }));
    const lineaDe = tr => {
      const l = s.lineas.find(x => x.id === tr.dataset.l); const inp = tr.querySelector('input.elige');
      let pid = l.producto_id;
      if (!pid && inp) { const p = porEtiqueta.get(inp.value.trim().toLowerCase()) || porCodigo.get(inp.value.trim().toLowerCase()); pid = p ? p.id : null; }
      return { l, pid, cant: Number(tr.querySelector('.cant')?.value || 0), falta: Number(tr.dataset.falta), hay: Number(String(tr.querySelector('.hay').textContent).replace(/,/g, '')) || 0 };
    };
    const filas = () => [...v.querySelectorAll('tr[data-l]')].map(lineaDe);
    const recargar = () => abrirSolicitud(id);

    const be = EPT.$('#btnEntregar');
    if (be) be.addEventListener('click', async () => {
      const ls = filas().filter(x => x.cant > 0);
      if (!ls.length) { EPT.aviso('Escriba cuánto entrega', true); return; }
      const sinProd = ls.find(x => !x.pid); if (sinProd) { EPT.aviso(`Elija el producto de "${sinProd.l.descripcion}"`, true); return; }
      be.disabled = true;
      try {
        await EPT.rpc('ept_despachar', { p_solicitud: s.id, p_lineas: ls.map(x => ({ solicitud_linea_id: x.l.id, producto_id: x.pid, cantidad: x.cant })) });
        EPT.aviso('Entregado. Se avisó al taller.'); recargar();
      } catch (e) { EPT.aviso(EPT.error(e), true); be.disabled = false; }
    });
    const bf = EPT.$('#btnFaltante');
    if (bf) bf.addEventListener('click', () => {
      // lo que falta después de lo que se entrega ahora
      const todas = filas().map(x => ({ ...x, pedir: Math.max(0, x.falta - x.cant) })).filter(x => x.pedir > 0);
      if (!todas.length) { EPT.aviso('No falta nada por pedir', true); return; }
      const ls = todas.filter(x => x.pid), sinProd = todas.filter(x => !x.pid);
      if (!ls.length) { EPT.aviso(`Elija primero el producto de "${sinProd[0].l.descripcion}"`, true); return; }
      EPT.ventana({
        titulo: 'Pedir a Almacén', boton: 'Enviar requisición',
        cuerpo: `${sinProd.length ? `<div class="alerta" style="margin:0">${icono('nota')}<div>Sin producto elegido (no se piden): <b>${sinProd.map(x => esc(x.l.descripcion)).join(', ')}</b>. Elíjalo en la tabla para pedirlo.</div></div>` : ''}
          <p class="mute" style="margin:0">Lo que no alcanza en Repuestos:</p>
          <ul class="lista">${ls.map((x, i) => `<li style="padding:8px 0;min-height:0"><div class="q"><b>${esc(x.l.descripcion)}</b></div>
            <input type="number" name="q${i}" min="1" step="any" value="${x.pedir}" style="width:90px;text-align:center" aria-label="Cantidad"></li>`).join('')}</ul>
          <label class="campo">Motivo <small class="opc">(opcional)</small><input name="motivo" maxlength="200" value="${s.orden ? 'Para ' + ot(s.orden.numero) : ''}"></label>`,
        async alGuardar(f) {
          const r = await EPT.rpc('ept_requisicion_crear', { p_solicitud: s.id, p_motivo: f.motivo.value,
            p_lineas: ls.map((x, i) => ({ solicitud_linea_id: x.l.id, producto_id: x.pid, cantidad: Number(f['q' + i].value) })) });
          EPT.aviso(`Requisición R-${r.numero} enviada a Almacén`); recargar();
        },
      });
    });
    const bc = EPT.$('#btnCerrar');
    if (bc) bc.addEventListener('click', () => EPT.ventana({
      titulo: 'No se entregará el resto', boton: 'Cerrar lo que falta',
      cuerpo: `<p style="margin:0">Lo que falta de S-${s.numero} se marca como no entregado y el taller puede seguir.</p>
        <label class="campo">¿Por qué?<input name="motivo" required maxlength="200" placeholder="Ej. no hay en Almacén; se usará otra pieza"></label>`,
      async alGuardar(f) { await EPT.rpc('ept_solicitud_cerrar_faltante', { p_solicitud: s.id, p_motivo: f.motivo.value }); EPT.aviso('Cerrado. Se avisó al taller.'); recargar(); },
    }));
    window.scrollTo(0, 0);
  }

  EPT.abrirSolicitud = abrirSolicitud;

  // ---------- Productos y existencias ----------
  let datosCat = null;
  async function cargarCatalogo() {
    const [prods, tipos, pt, trans, apl, equiv, exist] = await Promise.all([
      EPT.leer(sb.from('productos').select('id,codigo,descripcion,unidad,precio,tipo_id,marca_pieza,numero_parte,notas,minimo,activo,sin_codigo').order('descripcion').limit(10000)),
      EPT.leer(sb.from('pieza_tipos').select('id,nombre,grupo,orden').order('orden')),
      EPT.leer(sb.from('producto_transmisiones').select('producto_id,transmision_id').eq('activo', true).limit(50000)),
      EPT.leer(sb.from('transmisiones').select('id,codigo,fabricante,tipo,velocidades,otros_nombres').eq('activo', true).order('codigo')),
      EPT.leer(sb.from('aplicaciones').select('transmision_id,anio_desde,anio_hasta,motor,modelo:vehiculo_modelos(nombre,activo,marca:vehiculo_marcas(nombre,activo))').eq('activo', true).limit(50000)),
      EPT.leer(sb.from('equivalencias').select('id,producto_id,marca,numero_parte,clase,fuente,verificado').eq('activo', true).limit(50000)),
      EPT.leer(sb.from('existencias').select('producto_id,ubicacion,cantidad').limit(50000)),
    ]);
    // solo marcas y modelos que se trabajan
    const aplicaciones = apl.filter(a => a.modelo && a.modelo.activo && a.modelo.marca && a.modelo.marca.activo);
    const ex = {}; exist.forEach(e => { (ex[e.producto_id] = ex[e.producto_id] || {})[e.ubicacion] = Number(e.cantidad); });
    const transDe = {}; pt.forEach(x => (transDe[x.producto_id] = transDe[x.producto_id] || []).push(x.transmision_id));
    const eqDe = {}; equiv.forEach(e => (eqDe[e.producto_id] = eqDe[e.producto_id] || []).push(e));
    const vehDe = {}; aplicaciones.forEach(a => (vehDe[a.transmision_id] = vehDe[a.transmision_id] || []).push(a));
    datosCat = { prods, tipos, trans, ex, transDe, eqDe, vehDe };
    return datosCat;
  }
  const textoVehiculos = (tids, d) => (tids || []).flatMap(t => d.vehDe[t] || [])
    .map(a => `${a.modelo.marca.nombre} ${a.modelo.nombre} ${a.anio_desde}-${a.anio_hasta}`);

  let buscaProd = '', tipoProd = '';
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
          <select id="fTipo" style="flex:0 1 280px"><option value="">Todos los tipos</option>${d.tipos.map(t => `<option value="${t.id}" ${t.id === tipoProd ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></div>
        <div class="panel" id="listaProd"></div>`;
      let t; v.querySelector('#bProd').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { buscaProd = e.target.value; pintarProductos(); }, 250); });
      v.querySelector('#fTipo').addEventListener('change', e => { tipoProd = e.target.value; pintarProductos(); });
      pintarProductos();
    },
  });

  function coincide(p, d, q) {
    if (!q) return true;
    const pal = q.toLowerCase().split(/\s+/).filter(Boolean);
    const trans = (d.transDe[p.id] || []).map(id => d.trans.find(x => x.id === id)).filter(Boolean);
    const anios = pal.filter(w => /^(19|20)\d{2}$/.test(w)).map(Number);
    const texto = [p.codigo, p.descripcion, p.marca_pieza, p.numero_parte, p.notas,
      ...(d.eqDe[p.id] || []).flatMap(e => [e.marca, e.numero_parte]),
      ...trans.flatMap(x => [x.codigo, x.otros_nombres, x.fabricante]),
      ...(d.transDe[p.id] || []).flatMap(t => d.vehDe[t] || []).map(a => `${a.modelo.marca.nombre} ${a.modelo.nombre} ${a.motor}`)].join(' ').toLowerCase();
    const okPal = pal.filter(w => !/^(19|20)\d{2}$/.test(w)).every(w => texto.includes(w));
    if (!okPal) return false;
    if (!anios.length) return true;
    return (d.transDe[p.id] || []).flatMap(t => d.vehDe[t] || []).some(a => anios.every(y => y >= a.anio_desde && y <= a.anio_hasta));
  }

  function pintarProductos() {
    const d = datosCat; const caja = EPT.$('#listaProd'); if (!caja || !d) return;
    const lista = d.prods.filter(p => p.activo && (!tipoProd || p.tipo_id === tipoProd) && coincide(p, d, buscaProd.trim())).slice(0, 300);
    caja.innerHTML = lista.length ? `<ul class="lista">${lista.map(p => {
      const e = d.ex[p.id] || {}; const r = e.repuestos || 0; const bajo = Number(p.minimo) > 0 && r <= Number(p.minimo);
      const trans = (d.transDe[p.id] || []).map(id => (d.trans.find(x => x.id === id) || {}).codigo).filter(Boolean);
      return `<li class="toca" data-p="${p.id}"><span class="codigo">${esc(p.codigo)}</span>
        <div class="q"><b>${esc(p.descripcion)}</b><span>${[p.marca_pieza, p.numero_parte].filter(Boolean).map(esc).join(' ')}${trans.length ? ' · ' + esc(trans.slice(0, 6).join(', ')) + (trans.length > 6 ? '…' : '') : ''}</span></div>
        <div class="stock"><span class="${bajo ? 'txt-malo' : ''}"><b>${num(r)}</b> Rep.</span><span class="mute"><b>${num(e.almacen || 0)}</b> Alm.</span></div></li>`; }).join('')}</ul>`
      : `<div class="vacio">${d.prods.length ? 'No se encontró nada con eso.' : 'Todavía no hay productos. Toque "Nuevo producto".'}</div>`;
    caja.querySelectorAll('[data-p]').forEach(li => li.addEventListener('click', () => fichaProducto(d.prods.find(p => p.id === li.dataset.p))));
  }

  async function fichaProducto(p) {
    const d = datosCat || await cargarCatalogo();
    const puede = EPT.puede('productos.gestionar');
    const elegidas = new Set(p ? d.transDe[p.id] || [] : []);
    const movs = p ? await EPT.leer(sb.from('movimientos_inventario').select('fecha,ubicacion,cantidad,tipo,nota,usuario:usuarios(nombre)').eq('producto_id', p.id).order('fecha', { ascending: false }).limit(15)) : [];
    const e = p ? d.ex[p.id] || {} : {};
    const TIPOMOV = { despacho_taller: 'Entregado al taller', devolucion_taller: 'Devuelto por el taller', transferencia_salida: 'Salió a Repuestos', transferencia_llegada: 'Llegó de Almacén', transferencia_diferencia: 'Diferencia de transferencia', ajuste: 'Ajuste', carga_inicial: 'Carga inicial', importacion: 'Importado' };
    const vehiculos = textoVehiculos([...elegidas], d);
    EPT.ventana({
      titulo: p ? p.codigo + ' · ' + p.descripcion : 'Nuevo producto', boton: puede ? 'Guardar' : '',
      cuerpo: `
        ${p ? `<div class="contadores"><span><b>${num(e.repuestos || 0)}</b> en Repuestos</span><span><b>${num(e.almacen || 0)}</b> en Almacén</span><span><b>${num(e.transito || 0)}</b> en camino</span></div>` : ''}
        <fieldset ${puede ? '' : 'disabled'} class="limpio">
        <div class="dos"><label class="campo">Código <small class="opc">${p ? '' : '(vacío = SC-…)'}</small><input name="codigo" value="${esc(p ? p.codigo : '')}" maxlength="40" autocapitalize="characters"></label>
          <label class="campo">Tipo de pieza<select name="tipo"><option value="">—</option>${d.tipos.map(t => `<option value="${t.id}" ${p && p.tipo_id === t.id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></label></div>
        <label class="campo">Nombre de la pieza<input name="desc" value="${esc(p ? p.descripcion : '')}" required maxlength="160"></label>
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
          ${movs.length ? `<div class="campo">Últimos movimientos<ul class="lista">${movs.map(m => `<li style="padding:6px 0;min-height:0"><div class="q"><b>${esc(TIPOMOV[m.tipo] || m.tipo)} · ${m.ubicacion === 'almacen' ? 'Almacén' : m.ubicacion === 'transito' ? 'En camino' : 'Repuestos'}</b>
            <span>${fecha(m.fecha)} · ${esc(m.usuario?.nombre || '')}${m.nota ? ' · ' + esc(m.nota) : ''}</span></div><b class="${Number(m.cantidad) < 0 ? 'txt-malo' : 'txt-ok'}">${Number(m.cantidad) > 0 ? '+' : ''}${num(m.cantidad)}</b></li>`).join('')}</ul></div>` : ''}` : ''}`,
      alAbrir(f, dlg) {
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
        <div class="dos"><label class="campo">Dónde<select name="ub"><option value="repuestos">Repuestos</option><option value="almacen">Almacén</option></select></label>
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
