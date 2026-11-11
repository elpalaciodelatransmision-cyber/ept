// EPT CONTROL OPERATIVO · Piezas usadas: los lotes de piezas usadas que se compran, guardados en su propio lugar.
// Cada usada es su propio producto (US-0001…) con su precio. Se piden en las órdenes como cualquier pieza.
(function () {
  'use strict';
  const { sb, esc, icono } = EPT;
  Object.assign(EPT.ICONOS, {
    usada: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  });
  const num = n => Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
  const dinero = n => 'RD$ ' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fecha = f => new Date(f).toLocaleString('es-DO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const ver = () => ['usadas.registrar', 'repuestos.despachar', 'inventario.ajustar'].some(p => EPT.puede(p));

  let vista = 'piezas', busca = '';
  EPT.pantalla({
    id: 'usadas', titulo: 'Piezas usadas', subtitulo: 'Lotes de piezas usadas que se compran; se piden en las órdenes como cualquier pieza',
    icono: 'usada', grupo: 'Repuestos', atajo: 'Piezas usadas', ver,
    async mostrar(v) {
      if (EPT.puede('usadas.registrar')) {
        EPT.$('#barraBotones').innerHTML = `<button type="button" class="prin" id="btnLote">${icono('mas')}Registrar lote</button>`;
        EPT.$('#btnLote').addEventListener('click', registrarLote);
      }
      const [prods, ex, lotes] = await Promise.all([
        EPT.leerTodo(() => sb.from('productos').select('id,codigo,descripcion,precio,marca_pieza,numero_parte,activo').eq('usada', true).order('descripcion')).then(EPT.alfabetico),
        EPT.leer(sb.from('existencias').select('producto_id,cantidad').eq('ubicacion', 'usadas')),
        EPT.leer(sb.from('lotes_usados').select('id,numero,fecha,suplidor,costo_total,nota,usuario:usuarios(nombre),lineas:lote_lineas(cantidad,nota,producto:productos(codigo,descripcion))').order('numero', { ascending: false }).limit(200)),
      ]);
      const hay = Object.fromEntries(ex.map(e => [e.producto_id, Number(e.cantidad)]));
      const conExistencia = prods.filter(p => p.activo && hay[p.id] > 0).length;
      v.innerHTML = `
        <div class="fila" style="margin-bottom:14px">
          <div class="seg" role="group" aria-label="Mostrar">
            <button type="button" data-v="piezas" aria-pressed="${vista === 'piezas'}">Piezas (${conExistencia})</button>
            <button type="button" data-v="lotes" aria-pressed="${vista === 'lotes'}">Lotes comprados (${lotes.length})</button>
          </div>
          ${vista === 'piezas' ? `<div class="buscador">${icono('buscar')}<input id="bUsada" type="search" value="${esc(busca)}" placeholder="Código, nombre o número de parte"></div>` : ''}
        </div>
        <div class="panel" id="listaUsadas"></div>`;
      v.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { vista = b.dataset.v; EPT.recargar(); }));
      const caja = v.querySelector('#listaUsadas');
      const pintarPiezas = () => {
        const pal = EPT.llano(busca.trim()).split(/\s+/).filter(Boolean);
        const lista = prods.filter(p => p.activo && (hay[p.id] > 0 || pal.length)
          && pal.every(w => EPT.llano(`${p.codigo} ${p.descripcion} ${p.marca_pieza} ${p.numero_parte}`).includes(w)));
        caja.innerHTML = lista.length ? `<ul class="lista">${lista.map(p => `<li>
            <span class="codigo">${esc(p.codigo)}</span>
            <div class="q"><b>${esc(p.descripcion)}</b><span>${[p.marca_pieza, p.numero_parte].filter(Boolean).map(esc).join(' ') || 'Usada'} · ${dinero(p.precio)}</span></div>
            <div class="stock"><span class="${hay[p.id] > 0 ? '' : 'txt-malo'}"><b>${num(hay[p.id] || 0)}</b> hay</span></div></li>`).join('')}</ul>`
          : `<div class="vacio">${pal.length ? 'No se encontró nada con eso.' : 'Todavía no hay piezas usadas. Toque "Registrar lote".'}</div>`;
      };
      if (vista === 'piezas') {
        pintarPiezas();
        let t; v.querySelector('#bUsada').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { busca = e.target.value; pintarPiezas(); }, 200); });
      } else {
        caja.innerHTML = lotes.length ? `<ul class="lista lotes">${lotes.map(l => {
          const piezas = l.lineas.reduce((s, x) => s + Number(x.cantidad), 0);
          return `<li><div class="q"><b>L-${l.numero} · ${esc(l.suplidor)}</b>
            <span>${fecha(l.fecha)} · ${num(piezas)} pieza${piezas === 1 ? '' : 's'} · costó ${dinero(l.costo_total)}${l.usuario ? ' · ' + esc(l.usuario.nombre) : ''}${l.nota ? ' · ' + esc(l.nota) : ''}</span>
            <span>${l.lineas.map(x => `${num(x.cantidad)} × ${esc(x.producto.codigo)} ${esc(x.producto.descripcion)}`).join(' · ')}</span></div></li>`; }).join('')}</ul>`
          : '<div class="vacio">Todavía no se ha registrado ningún lote.</div>';
      }
    },
  });

  async function registrarLote() {
    const prods = await EPT.cargarProductos();
    const bp = EPT.buscadorPiezas(prods);
    const renglon = () => `<div class="renglon lote">
        ${EPT.campoPieza('name="pieza"')}
        <input name="cant" type="number" min="1" step="any" value="1" inputmode="decimal" aria-label="Cantidad">
        <input name="precio" type="number" min="0" step="any" inputmode="decimal" placeholder="Precio" aria-label="Precio de venta RD$">
        <button type="button" class="liso" data-quitar aria-label="Quitar">✕</button></div>`;
    EPT.ventana({
      titulo: 'Registrar lote de piezas usadas', boton: 'Guardar lote',
      cuerpo: `
        <div class="dos"><label class="campo">¿A quién se le compró?<input name="suplidor" required maxlength="80"></label>
          <label class="campo">Cuánto costó el lote RD$ <small class="opc">(opcional)</small><input name="costo" type="number" min="0" step="any" inputmode="decimal"></label></div>
        <label class="campo">Nota <small class="opc">(opcional)</small><input name="nota" maxlength="200"></label>
        <p class="pista" style="margin:0">Busque cada pieza en el catálogo: la usada toma su nombre, marca, número de parte y transmisiones.
          Si no está, escríbala. Si ya existe la misma usada (<b>US-…</b>), se suma a la que hay. El precio es el de venta de la usada.</p>
        <div><div class="renglon lote cab"><span>Pieza</span><span>Cantidad</span><span>Precio RD$</span><span></span></div>
          <div id="renglones">${renglon()}</div>
          <button type="button" id="otraPieza" style="margin-top:8px">${icono('mas')}Otra pieza</button></div>`,
      alAbrir(f) {
        const caja = f.querySelector('#renglones');
        // si eligen una usada que ya existe, el precio es el que ya tiene
        EPT.sugerencias(caja, prods, { alElegir: (inp, p) => {
          const r = inp.closest('.renglon'), pr = r.querySelector('[name=precio]');
          pr.disabled = !!(p && p.usada); pr.value = p && p.usada ? p.precio : pr.value;
          r.querySelector('[name=cant]').focus();
        } });
        caja.addEventListener('input', e => {
          if (!e.target.classList.contains('pz-busca')) return;
          const pr = e.target.closest('.renglon').querySelector('[name=precio]'); if (pr.disabled) { pr.disabled = false; pr.value = ''; }
        });
        f.querySelector('#otraPieza').addEventListener('click', () => { caja.insertAdjacentHTML('beforeend', renglon()); caja.lastElementChild.querySelector('input').focus(); });
        caja.addEventListener('click', e => { if (e.target.closest('[data-quitar]') && caja.children.length > 1) e.target.closest('.renglon').remove(); });
      },
      async alGuardar(f) {
        const lineas = [...f.querySelectorAll('#renglones .renglon')].map(r => {
          const texto = r.querySelector('[name=pieza]').value.trim(); if (!texto) return null;
          const cant = Number(r.querySelector('[name=cant]').value); if (!(cant > 0)) throw new Error('Revise las cantidades');
          const p = bp.deTexto(texto);
          if (p && p.usada) return { producto_id: p.id, cantidad: cant };
          const precio = r.querySelector('[name=precio]').value;
          if (precio === '' || Number(precio) < 0) throw new Error(`Escriba el precio de venta de "${p ? p.descripcion : texto}"`);
          return p ? { base_id: p.id, cantidad: cant, precio: Number(precio) } : { descripcion: texto, cantidad: cant, precio: Number(precio) };
        }).filter(Boolean);
        if (!lineas.length) throw new Error('Escriba al menos una pieza');
        const r = await EPT.rpc('ept_lote_registrar', { p: { suplidor: f.suplidor.value, costo_total: Number(f.costo.value || 0), nota: f.nota.value, lineas } });
        EPT.aviso(`Lote L-${r.numero} guardado: ${r.piezas} pieza${r.piezas === 1 ? '' : 's'} en Piezas usadas`);
        vista = 'piezas'; EPT.ir('usadas');
      },
    });
  }
})();
