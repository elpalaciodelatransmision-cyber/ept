// EPT CONTROL OPERATIVO · Caja: expediente de cobro, cargos/descuentos autorizados, factura de referencia, pagos y cierre.
// Administración: autorizaciones pendientes. La factura es de referencia: el número viene del programa de facturación.
(function () {
  'use strict';
  const { sb, esc, icono } = EPT;
  Object.assign(EPT.ICONOS, {
    caja_reg: '<rect x="3" y="8" width="18" height="12" rx="1.5"/><path d="M7 8V4h10v4M7 13h3M14 13h3M7 16.5h10"/>',
    sello: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8l5.5-.8z"/>',
  });
  const num = n => Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
  const dinero = n => 'RD$ ' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ot = n => 'OT-' + String(n).padStart(5, '0');
  const fecha = f => f ? new Date(f).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const FAC = { pendiente_pago: ['Pendiente de pago', 'aviso'], pago_parcial: ['Pago parcial', 'aviso'], pagada: ['Pagada', 'ok'], cerrada: ['Cerrada', 'ok'], anulada: ['Anulada', 'malo'] };
  const FORMAS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia bancaria', cheque: 'Cheque', credito: 'Crédito', otro: 'Otro' };
  const chip = (m, k) => { const [t, c] = m[k] || [k, '']; return `<span class="estado ${c}">${esc(t)}</span>`; };
  const verCaja = () => ['caja.facturar', 'caja.pago', 'caja.cerrar', 'caja.cargo', 'caja.observar'].some(p => EPT.puede(p));

  let vistaCaja = 'facturar';
  EPT.pantalla({
    id: 'caja', titulo: 'Facturación y cobro', subtitulo: 'Órdenes con el expediente cerrado por Repuestos',
    icono: 'caja_reg', grupo: 'Caja', atajo: 'Facturación y cobro', ver: () => verCaja() || EPT.puede('reportes.ver'),
    async mostrar(v) {
      const [porFacturar, facturas] = await Promise.all([
        EPT.leer(sb.from('ordenes').select('id,numero,actualizado,cliente:clientes(nombre),vehiculo:vehiculos(marca,modelo,placa),mecanico:mecanicos(nombre)').eq('estado', 'en_caja').order('actualizado')),
        EPT.leer(sb.from('facturas').select('id,numero_externo,estado,total,pagado,fecha_factura,orden:ordenes(id,numero,estado,cliente:clientes(nombre),vehiculo:vehiculos(marca,modelo,placa))')
          .order('fecha_factura', { ascending: false }).limit(300)),
      ]);
      const porCobrar = facturas.filter(f => ['pendiente_pago', 'pago_parcial'].includes(f.estado) || (f.estado === 'pagada' && f.orden.estado === 'facturada'));
      const saldo = porCobrar.reduce((a, f) => a + Number(f.total) - Number(f.pagado), 0);
      v.innerHTML = `<div class="fila" style="margin-bottom:14px"><div class="seg" role="group">
          <button type="button" data-v="facturar" aria-pressed="${vistaCaja === 'facturar'}">Por facturar (${porFacturar.length})</button>
          <button type="button" data-v="cobrar" aria-pressed="${vistaCaja === 'cobrar'}">Por cobrar o cerrar (${porCobrar.length})</button>
          <button type="button" data-v="historial" aria-pressed="${vistaCaja === 'historial'}">Historial</button></div>
          ${vistaCaja === 'cobrar' && saldo > 0 ? `<div class="contadores" style="margin:0"><span>Saldo por cobrar <b>${dinero(saldo)}</b></span></div>` : ''}</div>
        <div class="panel">${(() => {
          if (vistaCaja === 'facturar') return porFacturar.length ? `<ul class="lista">${porFacturar.map(o => `<li class="toca" data-o="${o.id}">
            <div class="q"><b>${ot(o.numero)} · ${esc([o.vehiculo?.marca, o.vehiculo?.modelo, o.vehiculo?.placa].filter(Boolean).join(' '))}</b>
            <span>${esc(o.cliente?.nombre || '')} · ${esc(o.mecanico?.nombre || '')} · llegó ${fecha(o.actualizado)}</span></div><span class="estado aviso">Por facturar</span></li>`).join('')}</ul>`
            : '<div class="vacio">No hay órdenes esperando facturación.</div>';
          const lista = vistaCaja === 'cobrar' ? porCobrar : facturas;
          return lista.length ? `<ul class="lista">${lista.map(f => `<li class="toca" data-o="${f.orden.id}">
            <div class="q"><b>${ot(f.orden.numero)} · Factura ${esc(f.numero_externo)}</b>
            <span>${esc(f.orden.cliente?.nombre || '')} · ${fecha(f.fecha_factura)} · total ${dinero(f.total)}${Number(f.total) - Number(f.pagado) > 0 && f.estado !== 'anulada' ? ' · <b>saldo ' + dinero(Number(f.total) - Number(f.pagado)) + '</b>' : ''}</span></div>
            ${f.estado === 'pagada' && f.orden.estado === 'facturada' ? '<span class="estado info">Pagada: falta cerrar</span>' : chip(FAC, f.estado)}</li>`).join('')}</ul>`
            : `<div class="vacio">${vistaCaja === 'cobrar' ? 'No hay saldos pendientes.' : 'Todavía no hay facturas.'}</div>`;
        })()}</div>`;
      v.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { vistaCaja = b.dataset.v; EPT.recargar(); }));
      v.querySelectorAll('[data-o]').forEach(li => li.addEventListener('click', () => abrirCobro(li.dataset.o)));
    },
  });

  async function abrirCobro(id) {
    const v = EPT.$('#vista'); v.innerHTML = '<div class="vacio">Cargando…</div>';
    const [o, facturas, auts] = await Promise.all([
      EPT.leer(sb.from('ordenes').select('id,numero,estado,entregada_en,kilometraje,motivo,nota_estado,cliente:clientes(nombre,telefono),vehiculo:vehiculos(marca,modelo,anio,placa),mecanico:mecanicos(nombre)').eq('id', id).single()),
      EPT.leer(sb.from('facturas').select('id,numero_externo,estado,subtotal,descuento,cargos,impuesto,total,pagado,detalle,fecha_factura,observacion,usuario:usuarios(nombre),pagos(id,forma,importe,referencia,fecha,usuario:usuarios(nombre))').eq('orden_id', id).order('fecha')),
      EPT.leer(sb.from('autorizaciones').select('id,tipo,detalle,importe,estado,nota_respuesta,fecha,pide:usuarios!autorizaciones_pedido_por_fkey(nombre)').eq('orden_id', id).in('tipo', ['cargo_adicional', 'descuento']).order('fecha')),
    ]);
    const f = facturas.filter(x => x.estado !== 'anulada').pop();
    const c = f ? f.detalle : await EPT.rpc('ept_caja_calcular', { p_orden: id });
    const enCaja = o.estado === 'en_caja';
    const aCaja = verCaja() || EPT.puede('reportes.ver');
    const saldo = f ? Number(f.total) - Number(f.pagado) : 0;
    EPT.$('#titulo').textContent = 'Cobro ' + ot(o.numero);
    EPT.$('#subtitulo').textContent = `${o.cliente.nombre} · ${[o.vehiculo.marca, o.vehiculo.modelo, o.vehiculo.anio, o.vehiculo.placa].filter(Boolean).join(' ')}`;
    EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnImpCobro">${icono('imprimir')}Imprimir</button><button type="button" id="btnVolverCaja">${icono('atras')}${aCaja ? 'Caja' : 'Órdenes'}</button>`;
    // Repuestos llega aquí al cerrar el expediente (para imprimir la orden de pago); vuelve a sus órdenes
    EPT.$('#btnVolverCaja').addEventListener('click', () => EPT.ir(aCaja ? 'caja' : 'ordenes'));
    EPT.$('#btnImpCobro').addEventListener('click', () => window.print());
    const pend = auts.filter(a => a.estado === 'pendiente');
    const acciones = [];
    if (enCaja) {
      if (EPT.puede('caja.facturar')) acciones.push(['facturar', 'sello', 'Registrar factura']);
      if (EPT.puede('caja.cargo')) acciones.push(['cargo', 'mas', 'Cargo adicional'], ['descuento', 'mas', 'Descuento']);
      if (EPT.puede('caja.observar')) acciones.push(['observar', 'atras', 'Devolver al taller']);
    }
    if (f && ['pendiente_pago', 'pago_parcial'].includes(f.estado) && EPT.puede('caja.pago')) acciones.push(['pago', 'caja_reg', 'Registrar pago']);
    if (o.estado === 'facturada' && EPT.puede('caja.cerrar') && (saldo === 0 || EPT.puede('autorizar'))) acciones.push(['cerrar', 'ok', 'Cerrar orden']);
    const filaTotal = (t, val, cls = '') => `<div class="${cls}"><span>${t}</span><b>${val}</b></div>`;
    v.innerHTML = `
      <div class="no-imprimir">${EPT.barraPasos(o.estado === 'cerrada' ? 8 : 7, !!o.entregada_en)}</div>
      ${pend.length ? `<div class="alerta">${icono('nota')}<div><b>Esperando autorización:</b> ${pend.map(a => `${a.tipo === 'descuento' ? 'descuento' : 'cargo'} ${dinero(a.importe)} (${esc(a.detalle)})`).join(', ')}. No se puede facturar hasta que Administración responda.</div></div>` : ''}
      <div class="panel comprobante"><div class="cuerpo">
        <div class="comp-cab"><span class="logo"></span><div><b>EL PALACIO DE LA TRANSMISIÓN</b><span>${f ? 'Expediente de cobro · factura de referencia ' + esc(f.numero_externo) : 'Orden de pago · páguese en Caja'} · no es comprobante fiscal</span></div></div>
        <div class="fila"><span class="ot-num">${ot(o.numero)}</span>${f ? chip(FAC, f.estado) : '<span class="estado aviso">Por facturar</span>'}${o.estado === 'cerrada' && (!f || f.estado !== 'cerrada') ? '<span class="estado ok">Orden cerrada</span>' : ''}</div>
        <dl class="datos"><div><dt>Cliente</dt><dd>${esc(o.cliente.nombre)}${o.cliente.telefono ? ' · ' + esc(o.cliente.telefono) : ''}</dd></div>
          <div><dt>Vehículo</dt><dd>${esc([o.vehiculo.marca, o.vehiculo.modelo, o.vehiculo.anio].filter(Boolean).join(' '))} <b>${esc(o.vehiculo.placa)}</b></dd></div>
          <div><dt>Mecánico</dt><dd>${esc(o.mecanico?.nombre || '—')}</dd></div><div><dt>Kilometraje</dt><dd>${esc(o.kilometraje || '—')}</dd></div></dl>
      </div>
      <div class="desliza"><table class="tabla"><thead><tr><th>Piezas usadas</th><th>Cantidad</th><th>Precio</th><th>Importe</th></tr></thead><tbody>
        ${c.piezas.length ? c.piezas.map(p => `<tr><td>${esc(p.descripcion)} <small class="mute">${esc(p.codigo)}</small>${Number(p.danada) ? `<br><small class="mute">${num(p.danada)} dañada(s): no se cobra</small>` : ''}</td>
          <td>${num(p.cantidad)} ${esc(p.unidad)}</td><td>${dinero(p.precio)}</td><td>${dinero(p.importe)}</td></tr>`).join('') : '<tr><td colspan="4" class="mute">No se usaron piezas.</td></tr>'}
        ${(c.no_cobrables || []).length ? `<tr><td colspan="4" class="mute"><b>Usado sin cobrar:</b> ${c.no_cobrables.map(p => `${num(p.cantidad)} ${esc(p.unidad)} ${esc(p.descripcion)}`).join(' · ')}</td></tr>` : ''}
      </tbody><thead><tr><th>Servicios y mano de obra</th><th></th><th></th><th></th></tr></thead><tbody>
        ${c.mano_obra.map(m => `<tr><td>${esc(m.descripcion)}${m.adicional ? ' <small class="mute">(adicional)</small>' : ''}<br><small class="mute">${esc(m.mecanico || '')}</small></td><td></td><td></td><td>${dinero(m.importe)}</td></tr>`).join('')}
      </tbody>${c.cargos.length || c.descuentos.length ? `<thead><tr><th>Cargos y descuentos autorizados</th><th></th><th></th><th></th></tr></thead><tbody>
        ${c.cargos.map(a => `<tr><td>${esc(a.detalle)}</td><td></td><td></td><td>${dinero(a.importe)}</td></tr>`).join('')}
        ${c.descuentos.map(a => `<tr><td>Descuento: ${esc(a.detalle)}</td><td></td><td></td><td class="txt-ok">− ${dinero(a.importe)}</td></tr>`).join('')}</tbody>` : ''}
      </table></div>
      <div class="totales">
        ${filaTotal('Piezas', dinero(c.subtotal_piezas))}${filaTotal('Mano de obra', dinero(c.subtotal_mano))}
        ${Number(c.total_cargos) ? filaTotal('Cargos adicionales', dinero(c.total_cargos)) : ''}${Number(c.total_descuentos) ? filaTotal('Descuentos', '− ' + dinero(c.total_descuentos)) : ''}
        ${filaTotal('Subtotal', dinero(c.base))}${filaTotal(`ITBIS ${num(c.itbis_pct)}%`, dinero(c.impuesto))}${filaTotal('TOTAL', dinero(c.total), 'gran')}
        ${f ? filaTotal('Pagado', dinero(f.pagado)) + filaTotal('Saldo', dinero(saldo), saldo > 0 ? 'saldo' : '') : ''}
      </div>
      ${f && f.pagos.length ? `<div class="desliza"><table class="tabla"><thead><tr><th>Pagos</th><th>Forma</th><th>Referencia</th><th>Importe</th></tr></thead><tbody>
        ${f.pagos.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(p => `<tr><td>${fecha(p.fecha)} · ${esc(p.usuario?.nombre || '')}</td><td>${esc(FORMAS[p.forma] || p.forma)}</td><td>${esc(p.referencia)}</td><td>${dinero(p.importe)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>
      ${acciones.length ? `<div class="acciones no-imprimir" style="margin-top:16px">${acciones.map(([k, ic, t]) => `<button type="button" class="accion" data-acc="${k}">${icono(ic)}${esc(t)}</button>`).join('')}</div>` : ''}
      ${auts.some(a => a.estado === 'rechazada') ? `<p class="mute no-imprimir">No autorizado: ${auts.filter(a => a.estado === 'rechazada').map(a => `${esc(a.detalle)} (${esc(a.nota_respuesta)})`).join(' · ')}</p>` : ''}
      ${f && f.pagado == 0 && ['pendiente_pago'].includes(f.estado) && EPT.puede('autorizar') ? `<p class="no-imprimir"><button type="button" class="liso peque" id="btnAnular" style="color:var(--malo)">Anular factura…</button></p>` : ''}
      <p class="no-imprimir"><button type="button" class="liso peque" id="btnVerOrden">Ver expediente del taller</button></p>`;
    const listo = () => abrirCobro(id);
    EPT.$('#btnVerOrden').addEventListener('click', () => EPT.abrirOrden(id));
    const an = EPT.$('#btnAnular'); if (an) an.addEventListener('click', () => EPT.ventana({ titulo: 'Anular factura ' + f.numero_externo, boton: 'Anular',
      cuerpo: '<p style="margin:0">La orden vuelve a "Por facturar". La factura queda guardada como anulada.</p><label class="campo">¿Por qué?<input name="m" required maxlength="200"></label>',
      async alGuardar(fm) { await EPT.rpc('ept_factura_anular', { p_factura: f.id, p_motivo: fm.m.value }); EPT.aviso('Factura anulada'); listo(); } }));
    v.querySelectorAll('[data-acc]').forEach(b => b.addEventListener('click', () => ({
      facturar: () => EPT.ventana({ titulo: 'Registrar factura · ' + ot(o.numero), boton: 'Registrar factura',
        cuerpo: `<p style="margin:0">Total a facturar: <b>${dinero(c.total)}</b></p>
          <p class="mute" style="margin:0">Haga la factura en su programa de facturación y escriba aquí su número (NCF o número interno).</p>
          <label class="campo">Número de factura<input name="n" required maxlength="40" autocapitalize="characters"></label>`,
        async alGuardar(fm) { await EPT.rpc('ept_facturar', { p_orden: id, p_numero_externo: fm.n.value }); EPT.aviso('Factura registrada'); listo(); } }),
      cargo: () => ajuste('cargo_adicional'), descuento: () => ajuste('descuento'),
      observar: () => EPT.ventana({ titulo: 'Devolver al taller', boton: 'Devolver',
        cuerpo: '<label class="campo">¿Qué hay que revisar?<textarea name="n" required maxlength="500"></textarea></label>',
        async alGuardar(fm) { await EPT.rpc('ept_caja_observar', { p_orden: id, p_nota: fm.n.value }); EPT.aviso('Devuelta al taller'); EPT.ir('caja'); } }),
      pago: () => EPT.ventana({ titulo: 'Registrar pago · ' + ot(o.numero), boton: 'Registrar pago',
        cuerpo: `<p style="margin:0">Saldo: <b>${dinero(saldo)}</b></p>
          <div class="dos"><label class="campo">Forma de pago<select name="forma">${Object.entries(FORMAS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
            <label class="campo">Importe recibido RD$<input name="imp" type="number" min="0.01" step="any" value="${saldo}" class="grande" required></label></div>
          <label class="campo" id="cRef">Referencia <small class="opc">(aprobación, número de transferencia bancaria o cheque)</small><input name="ref" maxlength="60"></label>`,
        async alGuardar(fm) { const r = await EPT.rpc('ept_pago_registrar', { p_factura: f.id, p_forma: fm.forma.value, p_importe: Number(fm.imp.value), p_referencia: fm.ref.value });
          EPT.aviso(Number(r.saldo) > 0 ? `Pago registrado. Queda ${dinero(r.saldo)}` : 'Pagada completa'); listo(); } }),
      cerrar: () => EPT.ventana({ titulo: 'Cerrar ' + ot(o.numero), boton: 'Cerrar orden',
        cuerpo: saldo > 0 ? `<p style="margin:0">Queda un saldo de <b>${dinero(saldo)}</b>. Solo se cierra a crédito si la empresa lo permite.</p><label class="campo">Nota del crédito<input name="n" required maxlength="200"></label>`
          : '<p style="margin:0">La factura está pagada. La orden queda cerrada.</p><input type="hidden" name="n" value="">',
        async alGuardar(fm) { await EPT.rpc('ept_orden_cerrar', { p_orden: id, p_nota: fm.n.value }); EPT.aviso('Orden cerrada'); listo(); } }),
    })[b.dataset.acc]()));
    function ajuste(tipo) {
      EPT.ventana({ titulo: tipo === 'descuento' ? 'Descuento' : 'Cargo adicional', boton: EPT.puede('autorizar') ? 'Agregar' : 'Pedir autorización',
        cuerpo: `${EPT.puede('autorizar') ? '' : '<p class="mute" style="margin:0">Administración debe autorizarlo antes de facturar.</p>'}
          <label class="campo">Concepto<input name="d" required maxlength="200" placeholder="${tipo === 'descuento' ? 'Ej. cliente frecuente' : 'Ej. aceite ATF adicional'}"></label>
          <label class="campo">Importe RD$<input name="i" type="number" min="0.01" step="any" required class="grande"></label>`,
        async alGuardar(fm) { const r = await EPT.rpc('ept_caja_ajuste', { p_orden: id, p_tipo: tipo, p_detalle: fm.d.value, p_importe: Number(fm.i.value) });
          EPT.aviso(r.aprobada ? 'Agregado' : 'Enviado a Administración para autorizar'); listo(); } });
    }
    window.scrollTo(0, 0);
  }
  EPT.abrirCobro = abrirCobro;

  // ---------- Autorizaciones (Administración) ----------
  EPT.pantalla({
    id: 'autorizaciones', titulo: 'Autorizaciones', subtitulo: 'Cargos y descuentos que esperan su visto bueno',
    icono: 'sello', grupo: 'Administración', atajo: 'Autorizaciones', ver: () => EPT.puede('autorizar'),
    async mostrar(v) {
      const filas = await EPT.leer(sb.from('autorizaciones').select('id,tipo,detalle,importe,estado,fecha,pedido_por,pide:usuarios!autorizaciones_pedido_por_fkey(nombre),orden:ordenes(id,numero,cliente:clientes(nombre))').eq('estado', 'pendiente').order('fecha'));
      v.innerHTML = `<div class="panel">${filas.length ? `<ul class="lista">${filas.map(a => `<li>
        <div class="q"><b>${a.tipo === 'descuento' ? 'Descuento' : 'Cargo adicional'} ${dinero(a.importe)} · ${a.orden ? ot(a.orden.numero) : ''}</b>
          <span>${esc(a.detalle)} · pidió ${esc(a.pide?.nombre || '')} · ${fecha(a.fecha)}${a.orden?.cliente ? ' · ' + esc(a.orden.cliente.nombre) : ''}</span></div>
        ${a.pedido_por === EPT.yo.id ? '<span class="mute">Lo pidió usted: otra persona debe autorizarlo</span>' : `<div class="fila">
          <button type="button" class="prin peque" data-a="${a.id}" data-si="1">Autorizar</button><button type="button" class="peque" data-a="${a.id}" data-si="0">No autorizar</button></div>`}</li>`).join('')}</ul>`
        : '<div class="vacio">No hay nada esperando autorización.</div>'}</div>`;
      v.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
        const si = b.dataset.si === '1';
        if (si) return EPT.rpc('ept_autorizacion_resolver', { p_id: b.dataset.a, p_aprobar: true }).then(() => { EPT.aviso('Autorizado'); EPT.recargar(); }).catch(e => EPT.aviso(EPT.error(e), true));
        EPT.ventana({ titulo: 'No autorizar', boton: 'No autorizar', cuerpo: '<label class="campo">¿Por qué?<input name="n" required maxlength="200"></label>',
          async alGuardar(fm) { await EPT.rpc('ept_autorizacion_resolver', { p_id: b.dataset.a, p_aprobar: false, p_nota: fm.n.value }); EPT.aviso('Respuesta enviada a Caja'); EPT.recargar(); } });
      }));
    },
  });
})();
