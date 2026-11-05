// EPT CONTROL OPERATIVO · Almacén: requisiciones de Repuestos y transferencias (con mercancía en tránsito y comprobante).
(function () {
  'use strict';
  const { sb, esc, icono } = EPT;
  Object.assign(EPT.ICONOS, {
    deposito: '<path d="M3 10l9-6 9 6v10H3z"/><path d="M7 20v-6h10v6M7 17h10"/>',
    camion: '<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8"/><circle cx="6" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
    imprimir: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2"/><path d="M6 14h12v7H6z"/>',
  });
  const num = n => Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
  const ot = n => 'OT-' + String(n).padStart(5, '0');
  const fecha = f => f ? new Date(f).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const REQ = { nueva: ['Nueva', 'aviso'], pendiente: ['Pendiente', 'aviso'], aprobada: ['Aprobada', 'info'], parcial: ['Aprobada en parte', 'info'],
    rechazada: ['Rechazada', 'malo'], sin_existencia: ['Sin existencia', 'malo'], cancelada: ['Cancelada', ''], recibida: ['Completada', 'ok'] };
  const TRA = { en_preparacion: ['En preparación', 'aviso'], en_transito: ['En camino', 'info'], recibida: ['Recibida', 'ok'],
    con_diferencia: ['Con diferencia', 'malo'], diferencia_resuelta: ['Diferencia resuelta', 'ok'] };
  const chip = (m, k) => { const [t, c] = m[k] || [k, '']; return `<span class="estado ${c}">${esc(t)}</span>`; };
  const tn = n => 'T-' + n, rn = n => 'R-' + n;

  // ---------- Requisiciones ----------
  let filtroReq = 'abiertas';
  EPT.pantalla({
    id: 'requisiciones', titulo: 'Requisiciones', subtitulo: 'Lo que Repuestos le pide a Almacén',
    icono: 'deposito', grupo: 'Almacén', atajo: 'Requisiciones',
    ver: () => ['almacen.resolver', 'almacen.transferir', 'repuestos.requisicion', 'almacen.diferencia'].some(p => EPT.puede(p)),
    async mostrar(v) {
      const q = sb.from('requisiciones').select('id,numero,estado,fecha,motivo,orden:ordenes(numero),creador:usuarios!requisiciones_creado_por_fkey(nombre),lineas:requisicion_lineas(id)').order('numero', { ascending: false }).limit(200);
      const filas = await EPT.leer(filtroReq === 'abiertas' ? q.in('estado', ['nueva', 'pendiente', 'aprobada', 'parcial']) : q);
      const c = k => filas.filter(r => r.estado === k).length;
      v.innerHTML = `<div class="fila" style="margin-bottom:14px"><div class="seg" role="group">
          <button type="button" data-f="abiertas" aria-pressed="${filtroReq === 'abiertas'}">Por atender</button>
          <button type="button" data-f="todas" aria-pressed="${filtroReq === 'todas'}">Todas</button></div>
          ${filtroReq === 'abiertas' ? `<div class="contadores" style="margin:0"><span><b>${c('nueva') + c('pendiente')}</b> por decidir</span><span><b>${c('aprobada') + c('parcial')}</b> aprobadas por enviar</span></div>` : ''}</div>
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
    const trans = await EPT.leer(sb.from('transferencias').select('id,numero,estado,fecha_envio').eq('requisicion_id', id).order('numero'));
    const ids = r.lineas.map(l => l.producto.id);
    const exA = Object.fromEntries((await EPT.leer(sb.from('existencias').select('producto_id,cantidad').eq('ubicacion', 'almacen').in('producto_id', ids))).map(e => [e.producto_id, Number(e.cantidad)]));
    const decidir = ['nueva', 'pendiente'].includes(r.estado) && EPT.puede('almacen.resolver');
    const enviar = ['aprobada', 'parcial'].includes(r.estado) && EPT.puede('almacen.transferir') && r.lineas.some(l => Number(l.enviada) < Number(l.aprobada));
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
          ${r.motivo_rechazo ? `<div class="ancho"><dt>Respuesta de Almacén</dt><dd>${esc(r.motivo_rechazo)}</dd></div>` : ''}</dl></div></div>
      <div class="panel" style="margin-top:16px"><header><h2>Piezas</h2></header><div class="desliza">
        <table class="tabla entregar"><thead><tr><th>Pieza</th><th>Pidió</th><th>Tenía Repuestos</th><th>Hay en Almacén</th><th>Aprobado</th><th>Enviado</th>
          ${decidir ? '<th>Aprobar</th>' : ''}${enviar ? '<th>Enviar ahora</th>' : ''}</tr></thead><tbody>
        ${r.lineas.map(l => { const hay = exA[l.producto.id] || 0; const porEnviar = Number(l.aprobada) - Number(l.enviada);
          return `<tr data-l="${l.id}"><td><b>${esc(l.producto.descripcion)}</b> <small class="mute">${esc(l.producto.codigo)}</small></td>
            <td>${num(l.cantidad)}</td><td>${num(l.disponible_repuestos)}</td><td><b class="${hay < Number(l.cantidad) ? 'txt-aviso' : ''}">${num(hay)}</b></td>
            <td>${num(l.aprobada)}</td><td>${num(l.enviada)}</td>
            ${decidir ? `<td><input class="cant apr" type="number" min="0" max="${l.cantidad}" step="any" value="${Math.min(Number(l.cantidad), hay)}"></td>` : ''}
            ${enviar ? `<td>${porEnviar > 0 ? `<input class="cant env" type="number" min="0" max="${porEnviar}" step="any" value="${Math.min(porEnviar, hay)}">` : ''}</td>` : ''}</tr>`; }).join('')}
        </tbody></table></div>
        ${decidir ? `<div class="pie-panel"><button type="button" class="prin" id="btnAprobar">${icono('ok')}Aprobar</button>
          <button type="button" id="btnSinEx">No hay existencia</button><button type="button" class="liso peque der" id="btnRechazar">Rechazar…</button></div>` : ''}
        ${enviar ? `<div class="pie-panel"><button type="button" class="prin" id="btnEnviar">${icono('camion')}Preparar y enviar a Repuestos</button></div>` : ''}
      </div>
      ${trans.length ? `<div class="panel" style="margin-top:16px"><header><h2>Transferencias</h2></header><ul class="lista">${trans.map(t => `<li class="toca" data-t="${t.id}">
        <div class="q"><b>${tn(t.numero)}</b><span>${fecha(t.fecha_envio)}</span></div>${chip(TRA, t.estado)}</li>`).join('')}</ul></div>` : ''}`;
    const listo = () => abrirRequisicion(id);
    v.querySelectorAll('[data-t]').forEach(li => li.addEventListener('click', () => abrirTransferencia(li.dataset.t)));
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
          EPT.aviso('Aprobada. Ahora prepare y envíe.'); listo();
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
    const be = EPT.$('#btnEnviar');
    if (be) be.addEventListener('click', async () => {
      const ls = fl('env').filter(x => x.val > 0);
      if (!ls.length) { EPT.aviso('Escriba cuánto envía', true); return; }
      be.disabled = true;
      try {
        const t = await EPT.rpc('ept_transferencia_enviar', { p_req: r.id, p_lineas: ls.map(x => ({ linea_id: x.linea_id, cantidad: x.val })) });
        EPT.aviso(`Transferencia ${tn(t.numero)} enviada. Va en camino.`); abrirTransferencia(t.id, true);
      } catch (e) { EPT.aviso(EPT.error(e), true); be.disabled = false; }
    });
    window.scrollTo(0, 0);
  }

  // ---------- Transferencias ----------
  let filtroTra = 'abiertas';
  EPT.pantalla({
    id: 'transferencias', titulo: 'Transferencias', subtitulo: 'Mercancía de Almacén a Repuestos (no es venta)',
    icono: 'camion', grupo: 'Almacén', atajo: 'Transferencias',
    ver: () => ['almacen.transferir', 'repuestos.recibir', 'almacen.diferencia'].some(p => EPT.puede(p)),
    async mostrar(v) {
      const q = sb.from('transferencias').select('id,numero,estado,fecha_envio,fecha_recibo,requisicion:requisiciones(numero,orden:ordenes(numero)),lineas:transferencia_lineas(id)').order('numero', { ascending: false }).limit(200);
      const filas = await EPT.leer(filtroTra === 'abiertas' ? q.in('estado', ['en_preparacion', 'en_transito', 'con_diferencia']) : q);
      v.innerHTML = `<div class="fila" style="margin-bottom:14px"><div class="seg" role="group">
          <button type="button" data-f="abiertas" aria-pressed="${filtroTra === 'abiertas'}">En camino o con diferencia</button>
          <button type="button" data-f="todas" aria-pressed="${filtroTra === 'todas'}">Todas</button></div></div>
        <div class="panel">${filas.length ? `<ul class="lista">${filas.map(t => `<li class="toca" data-t="${t.id}">
          <div class="q"><b>${tn(t.numero)}${t.requisicion ? ' · ' + rn(t.requisicion.numero) : ''}${t.requisicion?.orden ? ' · ' + ot(t.requisicion.orden.numero) : ''}</b>
            <span>${t.lineas.length} pieza${t.lineas.length === 1 ? '' : 's'} · salió ${fecha(t.fecha_envio)}${t.fecha_recibo ? ' · llegó ' + fecha(t.fecha_recibo) : ''}</span></div>${chip(TRA, t.estado)}</li>`).join('')}</ul>`
          : '<div class="vacio">No hay mercancía en camino.</div>'}</div>`;
      v.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { filtroTra = b.dataset.f; EPT.recargar(); }));
      v.querySelectorAll('[data-t]').forEach(li => li.addEventListener('click', () => abrirTransferencia(li.dataset.t)));
    },
  });

  async function abrirTransferencia(id, recien) {
    const v = EPT.$('#vista'); v.innerHTML = '<div class="vacio">Cargando…</div>';
    const t = await EPT.leer(sb.from('transferencias').select('id,numero,estado,origen,destino,fecha_envio,fecha_recibo,fecha_resuelto,nota_diferencia,envio:usuarios!transferencias_enviado_por_fkey(nombre),recibio:usuarios!transferencias_recibido_por_fkey(nombre),requisicion:requisiciones(id,numero,orden:ordenes(numero,vehiculo:vehiculos(marca,modelo,placa))),lineas:transferencia_lineas(id,enviada,recibida,diferencia_nota,producto:productos(codigo,descripcion,unidad))').eq('id', id).single());
    const recibir = t.estado === 'en_transito' && EPT.puede('repuestos.recibir');
    const resolver = t.estado === 'con_diferencia' && EPT.puede('almacen.diferencia');
    EPT.$('#titulo').textContent = tn(t.numero);
    EPT.$('#subtitulo').textContent = 'Almacén → Repuestos';
    EPT.$('#barraBotones').innerHTML = `<button type="button" id="btnImprimir">${icono('imprimir')}Imprimir comprobante</button><button type="button" id="btnVolverTra">${icono('atras')}Transferencias</button>`;
    EPT.$('#btnVolverTra').addEventListener('click', () => EPT.ir('transferencias'));
    EPT.$('#btnImprimir').addEventListener('click', () => window.print());
    v.innerHTML = `
      ${recien ? `<div class="alerta">${icono('camion')}<div><b>Enviada.</b> La mercancía está en camino. Repuestos debe confirmar lo que llegó.</div></div>` : ''}
      <div class="panel comprobante"><div class="cuerpo">
        <div class="comp-cab"><span class="logo"></span><div><b>EL PALACIO DE LA TRANSMISIÓN</b><span>Comprobante de transferencia interna · no es una venta</span></div></div>
        <div class="fila"><span class="ot-num">${tn(t.numero)}</span>${chip(TRA, t.estado)}</div>
        <dl class="datos"><div><dt>De</dt><dd>Almacén</dd></div><div><dt>Para</dt><dd>Repuestos</dd></div>
          <div><dt>Requisición</dt><dd>${t.requisicion ? rn(t.requisicion.numero) : '—'}${t.requisicion?.orden ? ' · ' + ot(t.requisicion.orden.numero) : ''}</dd></div>
          <div><dt>Envió</dt><dd>${esc(t.envio?.nombre || '')} · ${fecha(t.fecha_envio)}</dd></div>
          ${t.recibio ? `<div><dt>Recibió</dt><dd>${esc(t.recibio.nombre)} · ${fecha(t.fecha_recibo)}</dd></div>` : ''}
          ${t.nota_diferencia ? `<div class="ancho"><dt>Diferencia</dt><dd>${esc(t.nota_diferencia.replace(/^aparecio:/, 'Apareció:').replace(/^regresa:/, 'Regresó a Almacén:').replace(/^perdida:/, 'Se perdió:'))} · ${fecha(t.fecha_resuelto)}</dd></div>` : ''}</dl>
      </div>
      <div class="desliza"><table class="tabla entregar"><thead><tr><th>Pieza</th><th>Enviado</th><th>${recibir ? 'Llegó' : 'Recibido'}</th>${recibir ? '<th>Si llegó menos, ¿qué pasó?</th>' : ''}</tr></thead><tbody>
        ${t.lineas.map(l => `<tr data-l="${l.id}" data-env="${l.enviada}"><td><b>${esc(l.producto.descripcion)}</b> <small class="mute">${esc(l.producto.codigo)}</small></td>
          <td>${num(l.enviada)} ${esc(l.producto.unidad)}</td>
          <td>${recibir ? `<input class="cant rec" type="number" min="0" max="${l.enviada}" step="any" value="${l.enviada}">`
            : l.recibida == null ? '—' : `<b class="${Number(l.recibida) < Number(l.enviada) ? 'txt-malo' : 'txt-ok'}">${num(l.recibida)}</b>`}
            ${!recibir && l.diferencia_nota ? `<br><small class="mute">${esc(l.diferencia_nota)}</small>` : ''}</td>
          ${recibir ? '<td><input class="nota" maxlength="200" style="min-height:40px"></td>' : ''}</tr>`).join('')}
      </tbody></table></div>
      <div class="firmas"><div>Entregó (Almacén)</div><div>Recibió (Repuestos)</div></div>
      ${recibir ? `<div class="pie-panel no-imprimir"><button type="button" class="prin" id="btnRecibir">${icono('ok')}Confirmar lo que llegó</button></div>` : ''}
      ${resolver ? `<div class="pie-panel no-imprimir"><span>Lo que faltó sigue <b>en camino</b> hasta resolverlo:</span>
        <button type="button" class="peque" data-res="aparecio">Apareció: va a Repuestos</button>
        <button type="button" class="peque" data-res="regresa">Regresa a Almacén</button>
        <button type="button" class="peque" data-res="perdida">Se perdió</button></div>` : ''}
      </div>`;
    const listo = () => abrirTransferencia(id);
    const brc = EPT.$('#btnRecibir');
    if (brc) brc.addEventListener('click', async () => {
      const ls = [...v.querySelectorAll('tr[data-l]')].map(tr => ({ linea_id: tr.dataset.l, recibida: Number(tr.querySelector('.rec').value), nota: tr.querySelector('.nota').value, env: Number(tr.dataset.env) }));
      if (ls.some(x => x.recibida < x.env && !x.nota.trim())) { EPT.aviso('Llegó menos de lo enviado: escriba qué pasó', true); return; }
      brc.disabled = true;
      try { const r = await EPT.rpc('ept_transferencia_recibir', { p_trans: t.id, p_lineas: ls });
        EPT.aviso(r.diferencia ? 'Recibida con diferencia: se avisó a Almacén' : 'Recibida: ya está en la existencia de Repuestos'); listo(); }
      catch (e) { EPT.aviso(EPT.error(e), true); brc.disabled = false; }
    });
    v.querySelectorAll('[data-res]').forEach(b => b.addEventListener('click', () => EPT.ventana({
      titulo: b.textContent, boton: 'Resolver',
      cuerpo: `<label class="campo">¿Qué pasó?<input name="nota" required maxlength="200"></label>`,
      async alGuardar(f) { await EPT.rpc('ept_transferencia_resolver', { p_trans: t.id, p_decision: b.dataset.res, p_nota: f.nota.value }); EPT.aviso('Diferencia resuelta'); listo(); } })));
    window.scrollTo(0, 0);
  }
  EPT.abrirTransferencia = abrirTransferencia;
  EPT.abrirRequisicion = abrirRequisicion;
})();
