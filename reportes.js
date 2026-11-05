// EPT CONTROL OPERATIVO · Administración: tablero general con filtros, reportes (Excel / PDF) y auditoría.
(function () {
  'use strict';
  const { sb, esc, icono } = EPT;
  Object.assign(EPT.ICONOS, {
    tablero: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    reporte: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
    lupa: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M8 11h6"/>',
  });
  const num = n => Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
  const dinero = n => 'RD$ ' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ot = n => 'OT-' + String(n).padStart(5, '0');
  const fecha = f => f ? new Date(f).toLocaleString('es-DO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const dia = f => f ? new Date(f).toLocaleDateString('es-DO') : '';
  const hoy = () => new Date().toISOString().slice(0, 10);
  const haceDias = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const ESTADOS = { abierta: 'Sin mecánico', en_reparacion: 'En reparación', esperando_piezas: 'Esperando piezas', terminada: 'Terminada', en_revision: 'Por revisar',
    en_caja: 'En Caja', facturada: 'Facturada', cerrada: 'Cerrada', cancelada: 'Cancelada' };
  const veh = v => [v?.marca, v?.modelo, v?.placa].filter(Boolean).join(' ');
  const cuenta = async q => { const { count, error } = await q; if (error) throw new Error(EPT.error(error)); return count || 0; };
  const cnt = t => sb.from(t).select('id', { count: 'exact', head: true });

  // ---------- Tablero ----------
  const F = { desde: haceDias(30), hasta: hoy(), mecanico: '', estado: '', q: '' };
  EPT.pantalla({
    id: 'tablero', titulo: 'Tablero', subtitulo: 'Todo lo que está pasando, sin preguntar departamento por departamento',
    icono: 'tablero', grupo: 'Administración', atajo: 'Tablero', peso: -10, ver: () => EPT.puede('reportes.ver'),
    async mostrar(v) {
      const [abiertas, reparacion, esperando, solPend, reqPend, transito, porCaja, porCobrar, cerradas, difTaller, difTrans, devPend, autPend, mecs] = await Promise.all([
        cuenta(cnt('ordenes').in('estado', ['abierta', 'en_reparacion', 'esperando_piezas', 'en_revision', 'en_caja', 'facturada'])),
        cuenta(cnt('ordenes').eq('estado', 'en_reparacion')), cuenta(cnt('ordenes').eq('estado', 'esperando_piezas')),
        cuenta(cnt('solicitudes').in('estado', ['pendiente', 'parcial'])), cuenta(cnt('requisiciones').in('estado', ['nueva', 'pendiente', 'aprobada', 'parcial'])),
        cuenta(cnt('transferencias').eq('estado', 'en_transito')), cuenta(cnt('ordenes').eq('estado', 'en_caja')),
        cuenta(cnt('facturas').in('estado', ['pendiente_pago', 'pago_parcial'])), cuenta(cnt('ordenes').eq('estado', 'cerrada').gte('actualizado', F.desde).lte('actualizado', F.hasta + 'T23:59:59')),
        cuenta(sb.from('recepciones_taller').select('id', { count: 'exact', head: true }).neq('nota', '').gte('fecha', F.desde)),
        cuenta(cnt('transferencias').eq('estado', 'con_diferencia')), cuenta(cnt('devoluciones').eq('estado', 'pendiente')),
        cuenta(cnt('autorizaciones').eq('estado', 'pendiente')),
        EPT.leer(sb.from('mecanicos').select('id,nombre').order('nombre')),
      ]);
      const ind = [
        ['Órdenes abiertas', abiertas, 'ordenes', ''], ['Vehículos en reparación', reparacion, 'ordenes', 'en_reparacion'], ['Esperando piezas', esperando, 'ordenes', 'esperando_piezas', esperando ? 'aviso' : ''],
        ['Pedidos pendientes en Repuestos', solPend, 'pedidos', '', solPend ? 'aviso' : ''], ['Requisiciones pendientes de Almacén', reqPend, 'requisiciones', '', reqPend ? 'aviso' : ''],
        ['Transferencias en camino', transito, 'transferencias', ''], ['Terminadas pendientes de Caja', porCaja, 'caja', '', porCaja ? 'aviso' : ''],
        ['Facturas pendientes de pago', porCobrar, 'caja', '', porCobrar ? 'aviso' : ''], ['Órdenes cerradas en el período', cerradas, '', 'cerrada'],
        ['Diferencias reportadas', difTaller + difTrans, 'transferencias', '', difTaller + difTrans ? 'malo' : ''], ['Devoluciones pendientes', devPend, 'pedidos', '', devPend ? 'aviso' : ''],
        ['Autorizaciones esperando', autPend, 'autorizaciones', '', autPend ? 'aviso' : ''],
      ];
      v.innerHTML = `
        <div class="rejilla">
          <div class="panel"><header><h2>Ahora mismo</h2></header><ul class="lista indicadores">${ind.slice(0, 6).map(fila).join('')}</ul></div>
          <div class="panel"><header><h2>Caja y control</h2></header><ul class="lista indicadores">${ind.slice(6).map(fila).join('')}</ul></div>
        </div>
        <div class="panel" style="margin-top:16px"><header><h2>Buscar órdenes</h2></header>
          <div class="cuerpo filtros">
            <label class="campo">Desde<input type="date" id="fDesde" value="${F.desde}"></label>
            <label class="campo">Hasta<input type="date" id="fHasta" value="${F.hasta}"></label>
            <label class="campo">Mecánico<select id="fMec"><option value="">Todos</option>${mecs.map(m => `<option value="${m.id}" ${F.mecanico === m.id ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select></label>
            <label class="campo">Estado<select id="fEst"><option value="">Todos</option>${Object.entries(ESTADOS).map(([k, t]) => `<option value="${k}" ${F.estado === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <label class="campo ancho2">Cliente, teléfono, placa, vehículo o número<input id="fQ" type="search" value="${esc(F.q)}"></label>
          </div>
          <div id="resOrdenes"></div></div>`;
      v.querySelectorAll('[data-ir-ind]').forEach(li => li.addEventListener('click', () => {
        if (li.dataset.estado) { F.estado = li.dataset.estado; v.querySelector('#fEst').value = F.estado; buscar(); v.querySelector('#resOrdenes').scrollIntoView({ behavior: 'smooth' }); }
        else if (li.dataset.irInd) EPT.ir(li.dataset.irInd);
      }));
      const leerF = () => { F.desde = v.querySelector('#fDesde').value; F.hasta = v.querySelector('#fHasta').value; F.mecanico = v.querySelector('#fMec').value; F.estado = v.querySelector('#fEst').value; F.q = v.querySelector('#fQ').value.trim(); };
      let t; v.querySelectorAll('.filtros input,.filtros select').forEach(x => x.addEventListener(x.type === 'search' ? 'input' : 'change', () => { clearTimeout(t); t = setTimeout(() => { leerF(); buscar(); }, 300); }));
      await buscar();
      function fila([t, n, ir, est, cls]) { return `<li class="toca" data-ir-ind="${ir}" data-estado="${est}"><div class="q"><b style="font-weight:600">${t}</b></div><b class="cifra ${cls ? 'txt-' + cls : ''}">${num(n)}</b></li>`; }
    },
  });

  async function buscar() {
    let q = sb.from('ordenes').select('id,numero,fecha,estado,motivo,cliente:clientes(nombre,telefono),vehiculo:vehiculos(marca,modelo,anio,placa),mecanico:mecanicos(nombre)')
      .gte('fecha', F.desde).lte('fecha', F.hasta + 'T23:59:59').order('numero', { ascending: false }).limit(500);
    if (F.mecanico) q = q.eq('mecanico_id', F.mecanico);
    if (F.estado) q = q.eq('estado', F.estado);
    let filas = await EPT.leer(q);
    if (F.q) { const b = F.q.toLowerCase().replace(/[\s-]/g, ''); filas = filas.filter(o => [ot(o.numero), o.numero, o.cliente?.nombre, o.cliente?.telefono, o.vehiculo?.placa, o.vehiculo?.marca, o.vehiculo?.modelo].some(x => String(x || '').toLowerCase().replace(/[\s-]/g, '').includes(b))); }
    const caja = EPT.$('#resOrdenes'); if (!caja) return;
    caja.innerHTML = filas.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Orden</th><th>Fecha</th><th>Cliente</th><th>Vehículo</th><th>Mecánico</th><th>Estado</th></tr></thead><tbody>
      ${filas.map(o => `<tr class="toca" data-o="${o.id}"><td><a href="#" data-o="${o.id}">${ot(o.numero)}</a></td><td>${dia(o.fecha)}</td><td>${esc(o.cliente?.nombre || '')}</td><td>${esc(veh(o.vehiculo))}</td><td>${esc(o.mecanico?.nombre || '')}</td><td>${esc(ESTADOS[o.estado] || o.estado)}</td></tr>`).join('')}
      </tbody></table></div><p class="mute" style="margin:8px 18px 14px">${filas.length} orden${filas.length === 1 ? '' : 'es'}</p>`
      : '<div class="vacio">No hay órdenes con esos filtros.</div>';
    caja.querySelectorAll('[data-o]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); EPT.abrirOrden(a.dataset.o); }));
  }

  // ---------- Reportes ----------
  // Cada reporte: título, columnas y cómo traer las filas para el período
  const R = {
    ordenes: { t: 'Órdenes por período', cols: ['Orden', 'Fecha', 'Cliente', 'Teléfono', 'Vehículo', 'Mecánico', 'Motivo', 'Estado'],
      async filas(d, h) { return (await EPT.leer(sb.from('ordenes').select('numero,fecha,estado,motivo,cliente:clientes(nombre,telefono),vehiculo:vehiculos(marca,modelo,placa),mecanico:mecanicos(nombre)').gte('fecha', d).lte('fecha', h).order('numero')))
        .map(o => [ot(o.numero), dia(o.fecha), o.cliente?.nombre, o.cliente?.telefono, veh(o.vehiculo), o.mecanico?.nombre || '', o.motivo, ESTADOS[o.estado] || o.estado]); } },
    consumo_orden: { t: 'Consumo de materiales por orden', cols: ['Orden', 'Pieza', 'Código', 'Usadas', 'Dañadas', 'Fecha'],
      async filas(d, h) { return (await EPT.leer(sb.from('consumos').select('utilizada,danada,fecha,producto:productos(codigo,descripcion),orden:ordenes(numero)').gte('fecha', d).lte('fecha', h).order('fecha')))
        .map(c => [ot(c.orden.numero), c.producto.descripcion, c.producto.codigo, Number(c.utilizada), Number(c.danada), dia(c.fecha)]); } },
    consumo_mecanico: { t: 'Consumo por mecánico', cols: ['Mecánico', 'Pieza', 'Usadas', 'Dañadas', 'Órdenes'],
      async filas(d, h) { const fs = await EPT.leer(sb.from('consumos').select('utilizada,danada,producto:productos(descripcion),orden:ordenes(numero,mecanico:mecanicos(nombre))').gte('fecha', d).lte('fecha', h));
        const g = {}; fs.forEach(c => { const k = (c.orden.mecanico?.nombre || 'Sin mecánico') + '|' + c.producto.descripcion; const x = g[k] || (g[k] = { u: 0, d: 0, o: new Set() }); x.u += Number(c.utilizada); x.d += Number(c.danada); x.o.add(c.orden.numero); });
        return Object.entries(g).sort().map(([k, x]) => [...k.split('|'), x.u, x.d, x.o.size]); } },
    salidas: { t: 'Salidas de Repuestos al taller', cols: ['Fecha', 'Orden', 'Pieza', 'Código', 'Cantidad', 'Mecánico', 'Despachó'],
      async filas(d, h) { return (await EPT.leer(sb.from('despacho_lineas').select('cantidad,producto:productos(codigo,descripcion),despacho:despachos!inner(fecha,orden:ordenes(numero),mecanico:mecanicos(nombre),usuario:usuarios(nombre))').gte('despacho.fecha', d).lte('despacho.fecha', h)))
        .sort((a, b) => a.despacho.fecha.localeCompare(b.despacho.fecha)).map(l => [fecha(l.despacho.fecha), l.despacho.orden ? ot(l.despacho.orden.numero) : '', l.producto.descripcion, l.producto.codigo, Number(l.cantidad), l.despacho.mecanico?.nombre || '', l.despacho.usuario?.nombre || '']); } },
    transferencias: { t: 'Transferencias de Almacén', cols: ['Transferencia', 'Requisición', 'Salió', 'Llegó', 'Pieza', 'Enviado', 'Recibido', 'Estado'],
      async filas(d, h) { return (await EPT.leer(sb.from('transferencia_lineas').select('enviada,recibida,producto:productos(descripcion),t:transferencias!inner(numero,estado,fecha_envio,fecha_recibo,requisicion:requisiciones(numero))').gte('t.fecha_envio', d).lte('t.fecha_envio', h)))
        .map(l => ['T-' + l.t.numero, l.t.requisicion ? 'R-' + l.t.requisicion.numero : '', fecha(l.t.fecha_envio), fecha(l.t.fecha_recibo), l.producto.descripcion, Number(l.enviada), l.recibida == null ? '' : Number(l.recibida), l.t.estado.replace(/_/g, ' ')]); } },
    mas_pedidos: { t: 'Productos más solicitados', cols: ['Pieza', 'Código', 'Veces pedida', 'Cantidad pedida', 'Cantidad entregada'],
      async filas(d, h) { const fs = await EPT.leer(sb.from('solicitud_lineas').select('cantidad,despachada,descripcion,codigo,s:solicitudes!inner(fecha)').gte('s.fecha', d).lte('s.fecha', h));
        const g = {}; fs.forEach(l => { const k = l.descripcion + '|' + l.codigo; const x = g[k] || (g[k] = [0, 0, 0]); x[0]++; x[1] += Number(l.cantidad); x[2] += Number(l.despachada); });
        return Object.entries(g).sort((a, b) => b[1][1] - a[1][1]).map(([k, x]) => [...k.split('|'), ...x]); } },
    devoluciones: { t: 'Devoluciones', cols: ['Fecha', 'Orden', 'Pieza', 'Cantidad', 'Estado', '¿Volvió al estante?', 'Nota'],
      async filas(d, h) { return (await EPT.leer(sb.from('devoluciones').select('fecha,cantidad,estado,apta,observaciones,producto:productos(descripcion),orden:ordenes(numero)').gte('fecha', d).lte('fecha', h).order('fecha')))
        .map(x => [dia(x.fecha), ot(x.orden.numero), x.producto.descripcion, Number(x.cantidad), x.estado, x.apta == null ? '' : x.apta ? 'Sí' : 'No', x.observaciones]); } },
    diferencias: { t: 'Diferencias', cols: ['Fecha', 'Dónde', 'Documento', 'Pieza', 'Esperado', 'Llegó', 'Qué pasó'],
      async filas(d, h) {
        const [rt, tl] = await Promise.all([
          EPT.leer(sb.from('recepciones_taller').select('fecha,cantidad_recibida,nota,linea:despacho_lineas(cantidad,producto:productos(descripcion),despacho:despachos(orden:ordenes(numero)))').neq('nota', '').gte('fecha', d).lte('fecha', h)),
          EPT.leer(sb.from('transferencia_lineas').select('enviada,recibida,diferencia_nota,producto:productos(descripcion),t:transferencias!inner(numero,fecha_recibo,nota_diferencia)').neq('diferencia_nota', '').gte('t.fecha_recibo', d).lte('t.fecha_recibo', h))]);
        return [...rt.map(r => [dia(r.fecha), 'Taller', r.linea.despacho.orden ? ot(r.linea.despacho.orden.numero) : '', r.linea.producto.descripcion, Number(r.linea.cantidad), Number(r.cantidad_recibida), r.nota]),
          ...tl.map(l => [dia(l.t.fecha_recibo), 'Transferencia', 'T-' + l.t.numero, l.producto.descripcion, Number(l.enviada), Number(l.recibida), l.diferencia_nota + (l.t.nota_diferencia ? ' → ' + l.t.nota_diferencia : '')])]; } },
    tiempo_req: { t: 'Tiempo de atención de requisiciones', cols: ['Requisición', 'Pedida', 'Resuelta', 'Horas para resolver', 'Estado'],
      async filas(d, h) { return (await EPT.leer(sb.from('requisiciones').select('numero,fecha,resuelto,estado').gte('fecha', d).lte('fecha', h).order('numero')))
        .map(r => ['R-' + r.numero, fecha(r.fecha), fecha(r.resuelto), r.resuelto ? Math.round((new Date(r.resuelto) - new Date(r.fecha)) / 36e5 * 10) / 10 : '', r.estado.replace(/_/g, ' ')]); } },
    pend_caja: { t: 'Órdenes pendientes de Caja', cols: ['Orden', 'Cliente', 'Vehículo', 'Llegó a Caja'], sinFechas: true,
      async filas() { return (await EPT.leer(sb.from('ordenes').select('numero,actualizado,cliente:clientes(nombre),vehiculo:vehiculos(marca,modelo,placa)').eq('estado', 'en_caja').order('actualizado')))
        .map(o => [ot(o.numero), o.cliente?.nombre, veh(o.vehiculo), fecha(o.actualizado)]); } },
    facturacion: { t: 'Facturación', cols: ['Fecha', 'Factura', 'Orden', 'Cliente', 'Subtotal', 'Cargos', 'Descuentos', 'ITBIS', 'Total', 'Estado'],
      async filas(d, h) { return (await EPT.leer(sb.from('facturas').select('fecha_factura,numero_externo,subtotal,cargos,descuento,impuesto,total,estado,orden:ordenes(numero,cliente:clientes(nombre))').gte('fecha_factura', d).lte('fecha_factura', h).order('fecha_factura')))
        .map(f => [dia(f.fecha_factura), f.numero_externo, ot(f.orden.numero), f.orden.cliente?.nombre, Number(f.subtotal), Number(f.cargos), Number(f.descuento), Number(f.impuesto), Number(f.total), f.estado.replace(/_/g, ' ')]); }, sumar: [4, 5, 6, 7, 8] },
    cobros: { t: 'Cobros', cols: ['Fecha', 'Factura', 'Orden', 'Forma', 'Referencia', 'Importe', 'Cobró'],
      async filas(d, h) { return (await EPT.leer(sb.from('pagos').select('fecha,forma,referencia,importe,usuario:usuarios(nombre),factura:facturas(numero_externo,orden:ordenes(numero))').gte('fecha', d).lte('fecha', h).order('fecha')))
        .map(p => [fecha(p.fecha), p.factura.numero_externo, ot(p.factura.orden.numero), p.forma, p.referencia, Number(p.importe), p.usuario?.nombre || '']); }, sumar: [5] },
    saldos: { t: 'Saldos pendientes', cols: ['Factura', 'Orden', 'Cliente', 'Teléfono', 'Total', 'Pagado', 'Saldo', 'Desde'], sinFechas: true,
      async filas() { return (await EPT.leer(sb.from('facturas').select('numero_externo,total,pagado,fecha_factura,orden:ordenes(numero,cliente:clientes(nombre,telefono))').in('estado', ['pendiente_pago', 'pago_parcial']).order('fecha_factura')))
        .map(f => [f.numero_externo, ot(f.orden.numero), f.orden.cliente?.nombre, f.orden.cliente?.telefono, Number(f.total), Number(f.pagado), Number(f.total) - Number(f.pagado), dia(f.fecha_factura)]); }, sumar: [4, 5, 6] },
  };
  const RD = { desde: haceDias(30), hasta: hoy(), cual: 'ordenes' };
  let ultimo = null;

  EPT.pantalla({
    id: 'reportes', titulo: 'Reportes', subtitulo: 'Elija el reporte y el período; sáquelo en Excel o imprímalo en PDF',
    icono: 'reporte', grupo: 'Administración', atajo: 'Reportes', ver: () => EPT.puede('reportes.ver'),
    async mostrar(v) {
      EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnRepXls">${icono('excel')}Excel</button><button type="button" id="btnRepPdf">${icono('imprimir')}PDF / imprimir</button>`;
      v.innerHTML = `<div class="panel no-imprimir"><div class="cuerpo filtros">
          <label class="campo ancho2">Reporte<select id="rCual">${Object.entries(R).map(([k, r]) => `<option value="${k}" ${RD.cual === k ? 'selected' : ''}>${r.t}</option>`).join('')}</select></label>
          <label class="campo">Desde<input type="date" id="rDesde" value="${RD.desde}"></label><label class="campo">Hasta<input type="date" id="rHasta" value="${RD.hasta}"></label></div></div>
        <div class="panel comprobante" style="margin-top:16px" id="rCaja"><div class="vacio">Cargando…</div></div>`;
      const correr = async () => {
        RD.cual = v.querySelector('#rCual').value; RD.desde = v.querySelector('#rDesde').value; RD.hasta = v.querySelector('#rHasta').value;
        const r = R[RD.cual]; v.querySelectorAll('#rDesde,#rHasta').forEach(x => { x.disabled = !!r.sinFechas; });
        const caja = v.querySelector('#rCaja'); caja.innerHTML = '<div class="vacio">Cargando…</div>';
        try {
          const filas = await r.filas(RD.desde, RD.hasta + 'T23:59:59');
          const tot = r.sumar ? r.cols.map((_, i) => r.sumar.includes(i) ? filas.reduce((a, f) => a + Number(f[i] || 0), 0) : '') : null;
          ultimo = { r, filas, tot };
          const celda = (x, i) => typeof x === 'number' ? (r.sumar && r.sumar.includes(i) || /Importe|Total|Saldo|Pagado|Subtotal|ITBIS|Cargos|Descuentos/.test(r.cols[i]) ? dinero(x) : num(x)) : esc(x ?? '');
          caja.innerHTML = `<div class="cuerpo"><div class="comp-cab"><span class="logo"></span><div><b>EL PALACIO DE LA TRANSMISIÓN · ${esc(r.t)}</b>
              <span>${r.sinFechas ? 'Al ' + new Date().toLocaleDateString('es-DO') : 'Del ' + new Date(RD.desde + 'T12:00').toLocaleDateString('es-DO') + ' al ' + new Date(RD.hasta + 'T12:00').toLocaleDateString('es-DO')} · ${filas.length} renglón${filas.length === 1 ? '' : 'es'}</span></div></div></div>
            ${filas.length ? `<div class="desliza"><table class="tabla"><thead><tr>${r.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
              ${filas.map(f => `<tr>${f.map((x, i) => `<td>${celda(x, i)}</td>`).join('')}</tr>`).join('')}
              ${tot ? `<tr class="total">${tot.map((x, i) => `<td>${i === 0 ? '<b>Total</b>' : x === '' ? '' : '<b>' + dinero(x) + '</b>'}</td>`).join('')}</tr>` : ''}</tbody></table></div>`
              : '<div class="vacio">No hay datos en ese período.</div>'}`;
        } catch (e) { caja.innerHTML = `<div class="vacio">${esc(EPT.error(e))}</div>`; }
      };
      v.querySelectorAll('#rCual,#rDesde,#rHasta').forEach(x => x.addEventListener('change', correr));
      EPT.$('#btnRepPdf').addEventListener('click', () => window.print());
      EPT.$('#btnRepXls').addEventListener('click', () => {
        if (!ultimo || !window.XLSX) return EPT.aviso('No se pudo armar el Excel', true);
        const datos = [[ultimo.r.t], [ultimo.r.sinFechas ? 'Al ' + new Date().toLocaleDateString('es-DO') : `Del ${RD.desde} al ${RD.hasta}`], [], ultimo.r.cols, ...ultimo.filas, ...(ultimo.tot ? [ultimo.tot.map((x, i) => i === 0 ? 'Total' : x)] : [])];
        const hoja = XLSX.utils.aoa_to_sheet(datos); hoja['!cols'] = ultimo.r.cols.map(() => ({ wch: 20 }));
        const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, 'Reporte');
        const nombre = `EPT_${RD.cual}_${hoy()}.xlsx`; XLSX.writeFile(libro, nombre); EPT.aviso(`Excel descargado: ${nombre}`);
      });
      await correr();
    },
  });
  EPT.reportes = R;

  // ---------- Auditoría ----------
  const A = { desde: haceDias(7), hasta: hoy(), tabla: '', usuario: '' };
  const TABLAS = { ordenes: 'Órdenes', solicitudes: 'Pedidos del taller', despachos: 'Entregas', recepciones_taller: 'Recibido por el mecánico', consumos: 'Piezas usadas',
    devoluciones: 'Devoluciones', mano_obra: 'Mano de obra', requisiciones: 'Requisiciones', transferencias: 'Transferencias', existencias: 'Existencias',
    movimientos_inventario: 'Movimientos de inventario', ajustes_inventario: 'Ajustes', facturas: 'Facturas', pagos: 'Pagos', autorizaciones: 'Autorizaciones',
    productos: 'Productos', servicios: 'Servicios', usuarios: 'Usuarios', usuario_permisos: 'Permisos', mecanicos: 'Mecánicos', config: 'Configuración' };
  EPT.pantalla({
    id: 'auditoria', titulo: 'Auditoría', subtitulo: 'Quién hizo qué, cuándo, y cómo estaba antes',
    icono: 'lupa', grupo: 'Administración', ver: () => EPT.puede('auditoria.ver'),
    async mostrar(v) {
      const usuarios = await EPT.leer(sb.from('usuarios').select('id,nombre').order('nombre'));
      v.innerHTML = `<div class="panel"><div class="cuerpo filtros">
          <label class="campo">Desde<input type="date" id="aDesde" value="${A.desde}"></label><label class="campo">Hasta<input type="date" id="aHasta" value="${A.hasta}"></label>
          <label class="campo">Qué<select id="aTabla"><option value="">Todo</option>${Object.entries(TABLAS).map(([k, t]) => `<option value="${k}" ${A.tabla === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="campo">Quién<select id="aUsr"><option value="">Todos</option>${usuarios.map(u => `<option value="${u.id}" ${A.usuario === u.id ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}</select></label></div>
        <div id="aCaja"></div></div>`;
      const nombres = Object.fromEntries(usuarios.map(u => [u.id, u.nombre]));
      const correr = async () => {
        A.desde = v.querySelector('#aDesde').value; A.hasta = v.querySelector('#aHasta').value; A.tabla = v.querySelector('#aTabla').value; A.usuario = v.querySelector('#aUsr').value;
        let q = sb.from('auditoria').select('id,fecha,usuario_id,departamento,accion,tabla,registro_id,anterior,nuevo,motivo').gte('fecha', A.desde).lte('fecha', A.hasta + 'T23:59:59').order('id', { ascending: false }).limit(500);
        if (A.tabla) q = q.eq('tabla', A.tabla); if (A.usuario) q = q.eq('usuario_id', A.usuario);
        const filas = await EPT.leer(q);
        const cambios = a => { if (!a.anterior || !a.nuevo) return ''; return Object.keys(a.nuevo).filter(k => JSON.stringify(a.anterior[k]) !== JSON.stringify(a.nuevo[k]) && !['actualizado'].includes(k))
          .map(k => `${k}: ${esc(String(a.anterior[k] ?? ''))} → <b>${esc(String(a.nuevo[k] ?? ''))}</b>`).join(' · '); };
        v.querySelector('#aCaja').innerHTML = filas.length ? `<div class="desliza"><table class="tabla auditoria"><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Acción</th><th>Cambio</th></tr></thead><tbody>
          ${filas.map(a => `<tr><td>${fecha(a.fecha)}</td><td>${esc(nombres[a.usuario_id] || (a.usuario_id ? '?' : 'Sistema'))}<br><small class="mute">${esc(EPT.DEPARTAMENTOS[a.departamento] || '')}</small></td>
            <td>${esc(TABLAS[a.tabla] || a.tabla)}</td><td>${a.accion === 'insert' ? 'Nuevo' : a.accion === 'update' ? 'Cambio' : esc(a.accion)}</td>
            <td style="text-align:left">${cambios(a) || '<span class="mute">registro nuevo</span>'}${a.motivo ? `<br><small>Motivo: ${esc(a.motivo)}</small>` : ''}</td></tr>`).join('')}
          </tbody></table></div><p class="mute" style="margin:8px 18px 14px">${filas.length}${filas.length === 500 ? '+ (afine los filtros)' : ''} registros · nada de esto se puede borrar</p>`
          : '<div class="vacio">Sin registros con esos filtros.</div>';
      };
      v.querySelectorAll('.filtros input,.filtros select').forEach(x => x.addEventListener('change', correr));
      await correr();
    },
  });
})();
