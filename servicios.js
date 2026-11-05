// EPT CONTROL OPERATIVO · Servicios: catálogo (códigos SEV-…, partes, piezas que usa, precio) y servicios hechos.
// Igual que la pestaña Servicios del módulo de almacén; hacer un servicio se registra dentro de la orden de trabajo.
(function () {
  'use strict';
  const { sb, esc, icono } = EPT;
  Object.assign(EPT.ICONOS, {
    servicio: '<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="16" r="3"/><path d="M18 11.5v1.5M18 19v1.5M22.5 16H21M15 16h-1.5"/>',
    excel: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 11l5 6M14 11l-5 6"/>',
  });

  const dinero = n => 'RD$ ' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = n => Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
  const ot = n => 'OT-' + String(n).padStart(5, '0');
  // Orden del catálogo por código: SEV-REPA-01, SEV-REPA-01.1, SEV-REPA-01.2, SEV-VACI-02…
  const cola = c => { const m = /^SEV-[A-Z0-9]+-([\d.]+)$/.exec(c || ''); return m ? m[1].split('.').map(Number) : [1e9]; };
  const porCodigo = (a, b) => { const x = cola(a.codigo), y = cola(b.codigo); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? -1) - (y[i] ?? -1); if (d) return d; } return a.nombre.localeCompare(b.nombre); };
  const nivel = s => Math.max(0, cola(s.codigo).length - 1);
  EPT.servicioOpciones = (lista, sel) => [...lista].sort(porCodigo).map(s =>
    `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${' '.repeat(nivel(s))}${esc(s.codigo)} · ${esc(s.nombre)}</option>`).join('');

  EPT.cargarServicios = () => EPT.leer(sb.from('servicios').select('id,codigo,nombre,descripcion,precio,piezas,padre_id').eq('activo', true));
  EPT.cargarProductos = () => EPT.leer(sb.from('productos').select('id,codigo,descripcion,unidad').eq('activo', true).order('descripcion').limit(5000));
  EPT.piezasTexto = (piezas, prods) => piezas.map(p => { const x = prods.find(q => q.id === p.producto_id); return `${x ? x.descripcion : '?'} × ${num(p.cantidad)}`; }).join(', ');

  let vistaServ = 'catalogo';

  EPT.pantalla({
    id: 'servicios', titulo: 'Servicios', subtitulo: 'Lo que ofrece el taller y lo que se ha hecho',
    icono: 'servicio', grupo: 'Taller', atajo: 'Servicios',
    ver: () => EPT.puede('servicios.gestionar') || EPT.puede('mano_obra.registrar') || EPT.puede('orden.revisar') || EPT.puede('reportes.ver'),
    async mostrar(v) {
      const barra = EPT.$('#barraBotones');
      barra.innerHTML = `<button type="button" id="btnExcelServ">${icono('excel')}Excel</button>` +
        (EPT.puede('servicios.gestionar') ? `<button type="button" class="prin" id="btnNuevoServ">${icono('mas')}Nuevo servicio</button>` : '');
      v.innerHTML = `<div class="seg" role="group" style="margin-bottom:14px">
          <button type="button" data-v="catalogo" aria-pressed="${vistaServ === 'catalogo'}">Servicios que ofrecemos</button>
          <button type="button" data-v="hechos" aria-pressed="${vistaServ === 'hechos'}">Servicios hechos</button></div>
        <div id="cajaServ"><div class="vacio">Cargando…</div></div>`;
      v.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { vistaServ = b.dataset.v; EPT.recargar(); }));
      const [servs, prods] = await Promise.all([EPT.cargarServicios(), EPT.cargarProductos()]);
      const nuevo = EPT.$('#btnNuevoServ'); if (nuevo) nuevo.addEventListener('click', () => fichaServicio(null, servs, prods));
      EPT.$('#btnExcelServ').addEventListener('click', () => descargarExcel(servs, prods).catch(e => EPT.aviso(EPT.error(e), true)));
      if (vistaServ === 'catalogo') pintarCatalogo(servs, prods); else await pintarHechos();
    },
  });

  function pintarCatalogo(servs, prods) {
    const caja = EPT.$('#cajaServ');
    const lista = [...servs].sort(porCodigo);
    const puede = EPT.puede('servicios.gestionar');
    caja.innerHTML = `<div class="panel">${lista.length ? `<ul class="lista">${lista.map(s => `
      <li class="${puede ? 'toca' : ''}" data-id="${s.id}" style="${nivel(s) ? `padding-left:${18 + 26 * nivel(s)}px` : ''}">
        <span class="codigo">${esc(s.codigo)}</span>
        <div class="q"><b>${esc(s.nombre)}${servs.some(x => x.padre_id === s.id) ? ' <small class="mute">(tiene partes)</small>' : ''}</b>
          <span>${s.descripcion ? esc(s.descripcion) + ' · ' : ''}${s.piezas.length ? 'Usa: ' + esc(EPT.piezasTexto(s.piezas, prods)) : 'Sin piezas asignadas'}</span></div>
        <b class="precio">${Number(s.precio) ? dinero(s.precio) : '<span class="estado aviso">Sin precio</span>'}</b>
      </li>`).join('')}</ul>` : '<div class="vacio">Todavía no hay servicios. Toque "Nuevo servicio".</div>'}</div>`;
    if (puede) caja.querySelectorAll('li[data-id]').forEach(li => li.addEventListener('click', () => fichaServicio(servs.find(s => s.id === li.dataset.id), servs, prods)));
  }

  async function pintarHechos() {
    const filas = await EPT.leer(sb.from('mano_obra')
      .select('id,fecha,descripcion,importe,anulada,motivo_anulacion,servicio:servicios(codigo,nombre),mecanico:mecanicos(nombre),orden:ordenes(id,numero,cliente:clientes(nombre),vehiculo:vehiculos(marca,modelo,placa))')
      .not('servicio_id', 'is', null).order('fecha', { ascending: false }).limit(300));
    const caja = EPT.$('#cajaServ');
    caja.innerHTML = `<div class="panel">${filas.length ? `<div class="desliza"><table class="tabla"><thead><tr>
        <th>Fecha</th><th>Servicio</th><th>Orden</th><th>Cliente</th><th>Vehículo</th><th>Mecánico</th><th>Importe</th></tr></thead><tbody>
      ${filas.map(m => `<tr class="${m.anulada ? 'anulada' : ''}">
        <td>${new Date(m.fecha).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td style="text-align:left"><b>${esc(m.descripcion)}</b>${m.anulada ? `<br><small class="txt-malo">Anulado: ${esc(m.motivo_anulacion)}</small>` : ''}</td>
        <td><a href="#" data-orden="${m.orden.id}">${ot(m.orden.numero)}</a></td>
        <td>${esc(m.orden.cliente?.nombre || '')}</td>
        <td>${esc([m.orden.vehiculo?.marca, m.orden.vehiculo?.modelo, m.orden.vehiculo?.placa].filter(Boolean).join(' '))}</td>
        <td>${esc(m.mecanico?.nombre || '')}</td><td>${dinero(m.importe)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vacio">Todavía no se ha hecho ningún servicio. Se registran dentro de cada orden de trabajo.</div>'}</div>`;
    caja.querySelectorAll('[data-orden]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); EPT.abrirOrden(a.dataset.orden); }));
  }

  // Lista de piezas que usa un servicio: se escribe código o nombre, cantidad y "Agregar"
  function selectorPiezas(caja, piezas, prods) {
    const etiqueta = p => `${p.codigo} — ${p.descripcion}`;
    const buscar = t => { const b = t.trim().toLowerCase(); return prods.find(p => etiqueta(p).toLowerCase() === b || p.codigo.toLowerCase() === b)
      || (prods.filter(p => p.descripcion.toLowerCase().includes(b)).length === 1 ? prods.find(p => p.descripcion.toLowerCase().includes(b)) : null); };
    const pintar = () => {
      caja.innerHTML = `${prods.length ? `<div class="renglon" style="grid-template-columns:minmax(0,1fr) 90px auto">
          <input class="pz-in" list="dlPzServ" placeholder="Código o nombre de la pieza"><input class="pz-q" type="number" min="1" step="any" value="1" inputmode="decimal" aria-label="Cantidad">
          <button type="button" class="pz-add">Agregar</button></div><p class="error pz-err" style="margin:0"></p>
          <datalist id="dlPzServ">${prods.map(p => `<option value="${esc(etiqueta(p))}">`).join('')}</datalist>`
        : '<p class="mute" style="margin:0">Todavía no hay productos cargados en Repuestos.</p>'}
        ${piezas.length ? `<ul class="lista">${piezas.map((p, i) => { const x = prods.find(q => q.id === p.producto_id); return `<li style="padding:8px 0;min-height:0">
          <div class="q"><b>${esc(x ? x.descripcion : '(pieza)')}</b><span>${esc(x ? x.codigo : '')}</span></div>
          <input type="number" min="1" step="any" value="${p.cantidad}" data-i="${i}" style="width:80px;text-align:center" aria-label="Cantidad">
          <button type="button" class="liso peque" data-quitar="${i}">Quitar</button></li>`; }).join('')}</ul>` : '<p class="mute" style="margin:6px 0 0">Sin piezas.</p>'}`;
      const add = caja.querySelector('.pz-add');
      if (add) add.addEventListener('click', () => {
        const p = buscar(caja.querySelector('.pz-in').value); const q = Number(caja.querySelector('.pz-q').value) || 1;
        if (!p) { caja.querySelector('.pz-err').textContent = 'No se encontró esa pieza. Escriba el código.'; return; }
        const ya = piezas.find(x => x.producto_id === p.id); if (ya) ya.cantidad += q; else piezas.push({ producto_id: p.id, cantidad: q });
        pintar(); caja.querySelector('.pz-in').focus();
      });
      caja.querySelectorAll('input[data-i]').forEach(x => x.addEventListener('change', () => { piezas[+x.dataset.i].cantidad = Math.max(1, Number(x.value) || 1); x.value = piezas[+x.dataset.i].cantidad; }));
      caja.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => { piezas.splice(+b.dataset.quitar, 1); pintar(); }));
    };
    pintar();
  }

  function fichaServicio(s, servs, prods) {
    const piezas = s ? s.piezas.map(p => ({ ...p })) : [];
    EPT.ventana({
      titulo: s ? s.codigo + ' · ' + s.nombre : 'Nuevo servicio', boton: 'Guardar servicio',
      cuerpo: `
        ${s ? '' : `<label class="campo">¿Es una parte de otro servicio?<select name="padre"><option value="">No, es un servicio principal</option>${EPT.servicioOpciones(servs)}</select></label>`}
        <label class="campo">Nombre del servicio<input name="nombre" value="${esc(s ? s.nombre : '')}" required maxlength="120"></label>
        <label class="campo">Precio de mano de obra RD$<input name="precio" type="number" min="0" step="any" inputmode="decimal" value="${s ? s.precio : ''}"></label>
        <label class="campo">Descripción <small class="opc">(qué incluye)</small><textarea name="desc" maxlength="500">${esc(s ? s.descripcion : '')}</textarea></label>
        <div class="campo">Piezas que usa normalmente <small class="opc">(se pueden pedir a Repuestos con un toque al hacer el servicio)</small><div id="pzServ"></div></div>
        ${s ? `<p style="margin:0"><button type="button" class="liso peque" id="btnQuitarServ" style="color:var(--malo)">Quitar del catálogo…</button></p>` : ''}`,
      alAbrir(f) {
        selectorPiezas(f.querySelector('#pzServ'), piezas, prods);
        const q = f.querySelector('#btnQuitarServ');
        if (q) q.addEventListener('click', () => { f.closest('dialog').close(); quitarServicio(s, servs); });
      },
      async alGuardar(f) {
        const r = await EPT.rpc('ept_servicio_guardar', { p_id: s ? s.id : null, p_padre: s ? null : (f.padre.value || null),
          p_nombre: f.nombre.value, p_descripcion: f.desc.value, p_precio: Number(f.precio.value || 0), p_piezas: piezas });
        EPT.aviso(s ? 'Servicio guardado' : `Servicio creado: ${r.codigo}`); EPT.recargar();
      },
    });
  }

  async function quitarServicio(s, servs) {
    const partes = servs.filter(x => x.padre_id === s.id);
    const veces = (await EPT.leer(sb.from('mano_obra').select('id', { count: 'exact', head: false }).eq('servicio_id', s.id).eq('anulada', false))).length;
    EPT.ventana({
      titulo: 'Quitar del catálogo', boton: partes.length ? '' : 'Sí, quitarlo',
      cuerpo: `<div class="confirma"><b>${esc(s.codigo)} · ${esc(s.nombre)}</b>
        ${partes.length ? `<p class="txt-malo">Tiene ${partes.length} parte${partes.length === 1 ? '' : 's'} (${esc(partes.map(x => x.codigo).join(', '))}). Quite primero sus partes.</p>`
          : `<p>${veces ? `Se ha hecho ${veces} ${veces === 1 ? 'vez' : 'veces'}. Esos registros <b>no</b> se borran: siguen en sus órdenes.` : 'Nunca se ha hecho.'}</p>
             <p>Ya no aparecerá para elegirlo en las órdenes.</p>`}</div>`,
      async alGuardar() { await EPT.rpc('ept_servicio_quitar', { p_id: s.id }); EPT.aviso('Servicio quitado del catálogo'); EPT.recargar(); },
    });
  }

  async function descargarExcel(servs, prods) {
    if (!window.XLSX) throw new Error('No se pudo cargar la herramienta de Excel. Revise la conexión.');
    const hechos = await EPT.leer(sb.from('mano_obra')
      .select('fecha,descripcion,importe,anulada,motivo_anulacion,mecanico:mecanicos(nombre),orden:ordenes(numero,cliente:clientes(nombre),vehiculo:vehiculos(marca,modelo,placa))')
      .not('servicio_id', 'is', null).order('fecha', { ascending: false }).limit(5000));
    const lista = [...servs].sort(porCodigo);
    const hoja1 = [['Código', 'Servicio', 'Parte de', 'Precio RD$', 'Descripción', 'Piezas que usa'],
      ...lista.map(s => [s.codigo, s.nombre, (servs.find(x => x.id === s.padre_id) || {}).codigo || '', Number(s.precio), s.descripcion, EPT.piezasTexto(s.piezas, prods)])];
    const hoja2 = [['Fecha', 'Servicio', 'Orden', 'Cliente', 'Vehículo / placa', 'Mecánico', 'Importe RD$', 'Estado'],
      ...hechos.map(m => [new Date(m.fecha).toLocaleString('es-DO'), m.descripcion, ot(m.orden.numero), m.orden.cliente?.nombre || '',
        [m.orden.vehiculo?.marca, m.orden.vehiculo?.modelo, m.orden.vehiculo?.placa].filter(Boolean).join(' '), m.mecanico?.nombre || '',
        Number(m.importe), m.anulada ? 'Anulado: ' + m.motivo_anulacion : 'Hecho'])];
    const libro = XLSX.utils.book_new();
    const h1 = XLSX.utils.aoa_to_sheet(hoja1); h1['!cols'] = [18, 36, 14, 14, 50, 50].map(w => ({ wch: w }));
    const h2 = XLSX.utils.aoa_to_sheet(hoja2); h2['!cols'] = [20, 40, 12, 26, 26, 20, 14, 30].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(libro, h1, 'SERVICIOS'); XLSX.utils.book_append_sheet(libro, h2, 'REALIZADOS');
    const nombre = `servicios_EPT_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(libro, nombre);
    EPT.aviso(`Excel descargado: ${nombre}. Está en Descargas.`);
  }
})();
