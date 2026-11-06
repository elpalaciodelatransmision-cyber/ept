// EPT CONTROL OPERATIVO · Integración: importar productos/existencias de Excel o CSV (con correspondencia de códigos),
// exportar, historial de sincronización y estado de la conexión futura con el programa actual de Almacén.
(function () {
  'use strict';
  const { sb, esc, icono } = EPT;
  Object.assign(EPT.ICONOS, { enlace: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>' });
  const num = n => Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
  const fecha = f => f ? new Date(f).toLocaleString('es-DO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const limpio = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  // Nombres de columna que se reconocen (como en el módulo de almacén)
  const ALIAS = {
    codigo: ['codigo', 'codigointerno', 'codigocorto', 'cod', 'sku', 'item', 'articulo'],
    codigo_externo: ['codigoexterno', 'codigoalmacen', 'codigootroprograma', 'codigobarras', 'barcode', 'codigodebarras', 'ref', 'referencia'],
    descripcion: ['descripcion', 'nombre', 'producto', 'pieza', 'detalle', 'articulonombre'],
    unidad: ['unidad', 'um', 'unidaddemedida', 'medida'],
    existencia: ['existencia', 'stock', 'cantidad', 'qty', 'inventario', 'disponible'],
    precio: ['precio', 'precioventa', 'pventa', 'valor', 'precio1'],
    marca: ['marca', 'fabricante'],
    numero_parte: ['numerodeparte', 'numeroparte', 'np', 'partnumber', 'noparte', 'oem'],
    ubicacion: ['ubicacion', 'lugar', 'estante', 'locacion'],
  };
  const campoDe = h => Object.keys(ALIAS).find(k => ALIAS[k].includes(limpio(h)));

  EPT.pantalla({
    id: 'integracion', titulo: 'Importar y exportar', subtitulo: 'Excel o CSV, y la conexión futura con el programa de Almacén',
    icono: 'enlace', grupo: 'Administración', ver: () => EPT.puede('integracion.gestionar'),
    async mostrar(v) {
      const [conectores, historial] = await Promise.all([
        EPT.leer(sb.from('integracion_conectores').select('id,nombre,tipo,activo,ajustes').order('nombre')),
        EPT.leer(sb.from('integracion_sync').select('id,tipo,inicio,fin,sincronizados,pendientes,errores,diferencias,detalle,usuario:usuarios(nombre)').order('inicio', { ascending: false }).limit(30)),
      ]);
      const excel = conectores.find(c => c.tipo === 'excel_csv');
      const futuro = conectores.find(c => c.ajustes && c.ajustes.estado === 'pendiente');
      v.innerHTML = `
        <div class="rejilla">
          <div class="panel"><header><h2>Importar productos</h2></header><div class="cuerpo" style="display:grid;gap:12px">
            <p class="mute" style="margin:0">Excel (.xlsx) o CSV. Se reconocen columnas como Código, Nombre, Unidad, Existencia, Precio, Marca, Número de parte y Código del otro programa.</p>
            <label class="campo">Archivo<input type="file" id="iArchivo" accept=".xlsx,.xls,.csv"></label>
            <div class="dos"><label class="campo">La existencia es de<select id="iUb"><option value="almacen">Almacén</option><option value="repuestos">Repuestos</option></select></label>
              <label class="check" style="align-self:end"><input type="checkbox" id="iCargar" checked><span>Cargar la existencia de los productos nuevos</span></label></div>
            <div id="iVista"></div></div></div>
          <div class="panel"><header><h2>Exportar a Excel</h2></header><div class="cuerpo" style="display:grid;gap:10px;justify-items:start">
            <button type="button" id="eProd">${icono('excel')}Productos con existencias</button>
            <button type="button" id="eMov">${icono('excel')}Movimientos de inventario (90 días)</button>
            <button type="button" id="eCod">${icono('excel')}Correspondencia de códigos</button></div>
            <header style="border-top:1px solid var(--line)"><h2>Programa actual de Almacén</h2><span class="estado aviso der">Pendiente</span></header>
            <div class="cuerpo"><p style="margin:0 0 8px">La conexión está <b>preparada pero apagada</b>. Para activarla hace falta saber:</p>
              <ol class="faltan" style="font-weight:400">${(futuro?.ajustes?.falta_saber || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol>
              <p class="mute" style="margin:8px 0 0">Mientras tanto, los dos programas trabajan por separado y se pueden pasar datos con Excel.</p></div></div>
        </div>
        <div class="panel" style="margin-top:16px"><header><h2>Historial de sincronización</h2></header>
          ${historial.length ? `<ul class="lista">${historial.map(h => `<li class="toca" data-h="${h.id}"><div class="q">
            <b>${h.tipo === 'exportacion' ? 'Exportación' : 'Importación'} · ${fecha(h.inicio)} · ${esc(h.usuario?.nombre || '')}</b>
            <span>${h.tipo === 'exportacion' ? esc(h.detalle.que || '') + ' · ' + num(h.sincronizados) + ' filas'
              : `${esc(h.detalle.archivo || '')} · ${num(h.detalle.nuevos)} nuevos · ${num(h.detalle.ya_existian)} ya existían · ${num(h.detalle.codigos_ligados)} códigos ligados`}</span></div>
            ${h.errores.length ? `<span class="estado malo">${h.errores.length} error${h.errores.length === 1 ? '' : 'es'}</span>` : ''}
            ${h.diferencias.length ? `<span class="estado aviso">${h.diferencias.length} diferencia${h.diferencias.length === 1 ? '' : 's'}</span>` : ''}</li>`).join('')}</ul>`
            : '<div class="vacio">Todavía no se ha importado ni exportado nada.</div>'}</div>`;

      v.querySelectorAll('[data-h]').forEach(li => li.addEventListener('click', () => detalleSync(historial.find(h => h.id === li.dataset.h))));
      v.querySelector('#iArchivo').addEventListener('change', e => leerArchivo(e.target.files[0], excel));
      v.querySelector('#eProd').addEventListener('click', () => exportar('productos').catch(er => EPT.aviso(EPT.error(er), true)));
      v.querySelector('#eMov').addEventListener('click', () => exportar('movimientos').catch(er => EPT.aviso(EPT.error(er), true)));
      v.querySelector('#eCod').addEventListener('click', () => exportar('codigos').catch(er => EPT.aviso(EPT.error(er), true)));
    },
  });

  async function leerArchivo(archivo, conector) {
    const caja = EPT.$('#iVista'); if (!archivo) { caja.innerHTML = ''; return; }
    if (!window.XLSX) { caja.innerHTML = '<p class="txt-malo">No se pudo cargar la herramienta de Excel.</p>'; return; }
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    const filasCrudas = libro.SheetNames.flatMap(n => XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, defval: '' }));
    // la fila de títulos es la primera que tenga al menos un nombre de pieza o código reconocido
    const iCab = filasCrudas.findIndex(f => f.some(c => campoDe(c) === 'descripcion'));
    if (iCab < 0) { caja.innerHTML = '<p class="txt-malo">No encontré la columna del nombre de la pieza (Nombre o Descripción).</p>'; return; }
    const cab = filasCrudas[iCab].map(campoDe);
    const filas = filasCrudas.slice(iCab + 1).map(f => { const o = {}; cab.forEach((k, i) => { if (k && String(f[i]).trim() !== '') o[k] = String(f[i]).trim(); }); return o; })
      .filter(o => o.descripcion);
    const reconocidas = [...new Set(cab.filter(Boolean))];
    caja.innerHTML = `<p style="margin:0"><b>${filas.length}</b> piezas en el archivo. Columnas reconocidas: ${reconocidas.map(esc).join(', ')}.</p>
      <div class="desliza" style="max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:8px"><table class="tabla"><thead><tr>${reconocidas.map(k => `<th>${esc(k.replace('_', ' '))}</th>`).join('')}</tr></thead>
        <tbody>${filas.slice(0, 15).map(o => `<tr>${reconocidas.map(k => `<td>${esc(o[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      ${filas.length > 15 ? `<p class="mute" style="margin:0">…y ${filas.length - 15} más.</p>` : ''}
      <p class="mute" style="margin:0">Lo que ya existe en EPT <b>no se cambia</b>: si el nombre, el precio o la existencia no coinciden, queda anotado como diferencia para revisar.</p>
      <button type="button" class="prin" id="iImportar" style="justify-self:start">Importar ${filas.length} piezas</button>`;
    caja.querySelector('#iImportar').addEventListener('click', async e => {
      e.target.disabled = true;
      try {
        const r = await EPT.rpc('ept_importar_productos', { p_conector: conector ? conector.id : null, p_filas: filas, p_ubicacion: EPT.$('#iUb').value,
          p_cargar_existencia: EPT.$('#iCargar').checked, p_archivo: archivo.name });
        EPT.aviso(`Listo: ${r.nuevos} nuevos, ${r.ya_existian} ya existían${r.diferencias.length ? `, ${r.diferencias.length} diferencias` : ''}${r.errores.length ? `, ${r.errores.length} errores` : ''}`);
        EPT.recargar();
      } catch (er) { EPT.aviso(EPT.error(er), true); e.target.disabled = false; }
    });
  }

  function detalleSync(h) {
    EPT.ventana({
      titulo: (h.tipo === 'exportacion' ? 'Exportación' : 'Importación') + ' · ' + fecha(h.inicio), boton: '',
      cuerpo: `${h.diferencias.length ? `<div class="campo">Diferencias (no se cambió nada; revise de dónde vienen)
          <div class="desliza"><table class="tabla"><thead><tr><th>Fila</th><th>Código</th><th>Qué</th><th>En EPT</th><th>En el archivo</th></tr></thead><tbody>
          ${h.diferencias.map(d => `<tr><td>${d.fila}</td><td>${esc(d.codigo)}</td><td>${esc(d.campo)}</td><td>${esc(String(d.en_ept))}</td><td><b>${esc(String(d.en_archivo))}</b></td></tr>`).join('')}</tbody></table></div></div>` : ''}
        ${h.errores.length ? `<div class="campo">Errores<ul class="faltan" style="font-weight:400">${h.errores.map(e => `<li>Fila ${e.fila} ${esc(e.codigo)}: ${esc(e.error)}</li>`).join('')}</ul></div>` : ''}
        ${!h.diferencias.length && !h.errores.length ? '<p style="margin:0">Todo entró sin diferencias ni errores.</p>' : ''}`,
    });
  }

  async function exportar(que) {
    if (!window.XLSX) throw new Error('No se pudo cargar la herramienta de Excel');
    let datos, nombre;
    if (que === 'productos') {
      const [prods, ex, tipos] = await Promise.all([EPT.leerTodo(() => sb.from('productos').select('id,codigo,descripcion,unidad,precio,marca_pieza,numero_parte,minimo,tipo_id,activo').order('codigo')),
        EPT.leerTodo(() => sb.from('existencias').select('producto_id,ubicacion,cantidad'), ['producto_id', 'ubicacion']), EPT.leer(sb.from('pieza_tipos').select('id,nombre'))]);
      const e = {}; ex.forEach(x => { (e[x.producto_id] = e[x.producto_id] || {})[x.ubicacion] = Number(x.cantidad); });
      datos = [['Código', 'Nombre', 'Tipo', 'Marca', 'Número de parte', 'Unidad', 'Precio', 'Mínimo', 'Repuestos', 'Almacén', 'En camino', 'Activo'],
        ...prods.map(p => [p.codigo, p.descripcion, (tipos.find(t => t.id === p.tipo_id) || {}).nombre || '', p.marca_pieza, p.numero_parte, p.unidad, Number(p.precio), Number(p.minimo),
          (e[p.id] || {}).repuestos || 0, (e[p.id] || {}).almacen || 0, (e[p.id] || {}).transito || 0, p.activo ? 'Sí' : 'No'])];
      nombre = 'productos';
    } else if (que === 'movimientos') {
      const desde = new Date(Date.now() - 90 * 864e5).toISOString();
      const m = await EPT.leerTodo(() => sb.from('movimientos_inventario').select('fecha,ubicacion,cantidad,tipo,nota,producto:productos(codigo,descripcion),orden:ordenes(numero),usuario:usuarios(nombre)').gte('fecha', desde).order('fecha'));
      datos = [['Fecha', 'Código', 'Pieza', 'Dónde', 'Cantidad', 'Tipo', 'Orden', 'Quién', 'Nota'],
        ...m.map(x => [new Date(x.fecha).toLocaleString('es-DO'), x.producto.codigo, x.producto.descripcion, x.ubicacion, Number(x.cantidad), x.tipo.replace(/_/g, ' '), x.orden ? 'OT-' + String(x.orden.numero).padStart(5, '0') : '', x.usuario?.nombre || '', x.nota])];
      nombre = 'movimientos';
    } else {
      const c = await EPT.leerTodo(() => sb.from('integracion_codigos').select('codigo_externo,producto:productos(codigo,descripcion),conector:integracion_conectores(nombre)'), ['conector_id', 'codigo_externo']);
      datos = [['Programa', 'Código en ese programa', 'Código en EPT', 'Pieza'], ...c.map(x => [x.conector.nombre, x.codigo_externo, x.producto.codigo, x.producto.descripcion])];
      nombre = 'correspondencia_codigos';
    }
    const hoja = XLSX.utils.aoa_to_sheet(datos); hoja['!cols'] = datos[0].map(() => ({ wch: 18 }));
    const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, nombre.slice(0, 30));
    const archivo = `EPT_${nombre}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(libro, archivo);
    await EPT.rpc('ept_registrar_exportacion', { p_que: nombre, p_filas: datos.length - 1 }).catch(() => {});
    EPT.aviso(`Excel descargado: ${archivo}`);
  }
})();
