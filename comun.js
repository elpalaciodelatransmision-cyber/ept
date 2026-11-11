// EPT CONTROL OPERATIVO · parte común: conexión, entrada, menú, ventanas y avisos.
// Cada departamento agrega sus pantallas con EPT.pantalla({...}). El servidor revisa los permisos;
// aquí solo se esconden las opciones que la persona no puede usar.
(function () {
  'use strict';
  const URL = 'https://mufckymwgrtpfbkoaiwp.supabase.co';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11ZmNreW13Z3J0cGZia29haXdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MDA4NjAsImV4cCI6MjEwOTQ3Njg2MH0.lI3Z_sNtLpT3iF_Lkuly27x5McXFAmKno9V9_AWE-k4';
  const DOMINIO = '@ept.local';

  const sb = window.supabase ? window.supabase.createClient(URL, ANON) : null;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICONOS = {
    inicio: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    luna: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    adelante: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.8 3.1 2.5 3.5 5.2"/>',
    mecanicos: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
  };
  const icono = n => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONOS[n] || ''}</svg>`;

  const DEPARTAMENTOS = { taller: 'Taller', repuestos: 'Repuestos', almacen: 'Almacén', caja: 'Caja', admin: 'Administración' };

  const EPT = window.EPT = {
    sb, $, esc, icono, ICONOS, DEPARTAMENTOS,
    yo: null, permisos: new Set(), pantallas: [], actual: null,
    puede: p => EPT.permisos.has(p),
  };

  // Años de una aplicación: "2009–2013", "2018 en adelante", "hasta 2001", "años por confirmar"
  EPT.anios = a => a.anio_desde == null && a.anio_hasta == null ? 'años por confirmar'
    : a.anio_desde == null ? 'hasta ' + a.anio_hasta
    : a.anio_hasta == null ? a.anio_desde + ' en adelante'
    : a.anio_desde === a.anio_hasta ? String(a.anio_desde) : a.anio_desde + '–' + a.anio_hasta;

  // Mensajes del servidor en palabras sencillas
  EPT.error = e => {
    const m = String((e && (e.message || e.error)) || e || '');
    if (/42501|permission denied|No tiene permiso/i.test(m)) return m.startsWith('No tiene permiso') ? m.replace(/\s*\(.*\)$/, '') : 'No tiene permiso para esto';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión a internet. Intente de nuevo.';
    if (/duplicate key|already exists|ya existe/i.test(m)) return 'Eso ya existe';
    return m || 'Algo salió mal. Intente de nuevo.';
  };

  let temporizador;
  EPT.aviso = (texto, malo) => {
    let a = $('.aviso-flot');
    if (!a) { a = document.createElement('div'); a.className = 'aviso-flot'; a.setAttribute('role', 'status'); document.body.append(a); }
    a.textContent = texto; a.classList.toggle('malo', !!malo); a.hidden = false;
    clearTimeout(temporizador); temporizador = setTimeout(() => { a.hidden = true; }, malo ? 5000 : 2600);
  };

  // Llamar una función del servidor; devuelve los datos o lanza el error ya traducido
  EPT.rpc = async (f, args) => {
    const { data, error } = await sb.rpc(f, args || {});
    if (error) throw new Error(EPT.error(error));
    olvidarPor(f);
    return data;
  };

  // ---------- Memoria de listas grandes ----------
  // Las listas pesadas (piezas, catálogo) se bajan una vez y se reusan unos minutos, así las pantallas abren al momento.
  // Cuando esta persona guarda algo que las cambia (según el nombre de la función del servidor) se vuelven a bajar.
  const memoria = new Map();
  EPT.memoria = (clave, cargar, { minutos = 10, cambiaCon = /./ } = {}) => {
    const m = memoria.get(clave);
    if (m && Date.now() - m.cuando < minutos * 60000) return m.promesa;
    const promesa = cargar();
    memoria.set(clave, { promesa, cuando: Date.now(), cambiaCon });
    promesa.catch(() => memoria.delete(clave));
    return promesa;
  };
  const olvidarPor = funcion => { for (const [k, m] of memoria) if (m.cambiaCon.test(funcion)) memoria.delete(k); };
  EPT.olvidar = clave => { if (clave) memoria.delete(clave); else memoria.clear(); };
  EPT.leer = async consulta => {
    const { data, error } = await consulta;
    if (error) throw new Error(EPT.error(error));
    return data;
  };
  // Listas grandes: el servidor entrega máximo 1,000 filas por consulta; se piden por partes hasta traer todo.
  // fabrica() arma la consulta cada vez; "orden" son las columnas únicas que dejan el orden fijo (para no saltar ni repetir).
  // Las partes se piden de 4 en 4 al mismo tiempo (una detrás de otra era lo que hacía lentas las pantallas grandes).
  EPT.leerTodo = async (fabrica, orden = ['id']) => {
    const parte = desde => { let q = fabrica(); for (const c of orden) q = q.order(c); return EPT.leer(q.range(desde, desde + 999)); };
    const todo = [];
    for (let desde = 0; ; desde += 4000) {
      const partes = await Promise.all([0, 1, 2, 3].map(i => parte(desde + i * 1000)));
      for (const p of partes) { todo.push(...p); if (p.length < 1000) return todo; }
    }
  };
  // Orden alfabético en español (el servidor pone mayúsculas antes que minúsculas y las tildes al final):
  // sin importar mayúsculas, tildes ni signos al principio ("#1 Brake" va con los números); empate por código.
  const alfabeto = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
  EPT.alfabetico = (lista, campo = 'descripcion') => {
    const llave = x => String(x[campo] || '').replace(/^[^0-9\p{L}]+/u, '');
    return lista.map(x => [llave(x), x]).sort((a, b) => alfabeto.compare(a[0], b[0]) || String(a[1].codigo || '').localeCompare(String(b[1].codigo || '')))
      .map(par => par[1]);
  };

  // ---------- Piezas para elegir (Pedir repuestos, Servicios, Despacho) ----------
  const llano = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  EPT.llano = llano;

  // Los 8 pasos de una orden (el servidor guarda en cuál va cada una: ordenes.paso)
  EPT.PASOS = ['Entrada', 'Diagnóstico', 'Pedir repuestos', 'Repuestos entrega', 'El mecánico recibe', 'Trabajo', 'Revisión', 'Caja'];
  EPT.barraPasos = (paso, todoHecho) => `<ol class="pasos" aria-label="Pasos de la orden">${EPT.PASOS.map((t, i) => {
    const n = i + 1, hecho = todoHecho || n < paso;
    return `<li class="${hecho ? 'hecho' : n === paso ? 'actual' : ''}"${n === paso && !todoHecho ? ' aria-current="step"' : ''}><span class="n">${hecho ? '✓' : n}</span><span class="t">${esc(t)}</span></li>`;
  }).join('')}</ol>`;
  const PIEZAS_CAMBIAN = /producto|importar|catalogo|equivalencia|lote/;
  EPT.cargarProductos = () => EPT.memoria('productos', () => EPT.leerTodo(() => sb.from('productos')
    .select('id,codigo,descripcion,unidad,numero_parte,precio,usada').eq('activo', true).order('descripcion')).then(EPT.alfabetico), { cambiaCon: PIEZAS_CAMBIAN });
  // buscador ya preparado (el texto de cada pieza se arma una sola vez, no en cada letra)
  EPT.buscadorPiezas = prods => {
    if (prods._buscador) return prods._buscador;
    const etiqueta = p => `${p.codigo} — ${p.descripcion}`;
    const textos = prods.map(p => llano(`${p.codigo} ${p.descripcion} ${p.numero_parte || ''} ${String(p.numero_parte || '').replace(/[^a-z0-9]/gi, '')}${p.usada ? ' usada' : ''}`));
    const porEtiqueta = new Map(prods.map(p => [etiqueta(p).toLowerCase(), p]));
    const porCodigo = new Map(prods.map(p => [String(p.codigo).toLowerCase(), p]));
    const b = {
      etiqueta,
      buscar(q, max = 12) {
        const palabras = llano(q).split(/\s+/).filter(Boolean); if (!palabras.length) return [];
        const r = [];
        for (let i = 0; i < prods.length && r.length < max; i++) if (palabras.every(w => textos[i].includes(w))) r.push(prods[i]);
        return r;
      },
      // lo escrito o elegido en el campo → la pieza del catálogo (o null si es texto libre)
      deTexto: t => { const x = String(t || '').trim().toLowerCase(); return porEtiqueta.get(x) || porCodigo.get(x) || null; },
    };
    Object.defineProperty(prods, '_buscador', { value: b });
    return b;
  };
  // el campo: <input class="pz-busca"> con su lista debajo
  EPT.campoPieza = (extra = '') => `<div class="busca-pieza"><input class="pz-busca" ${extra} placeholder="Código o nombre de la pieza" maxlength="120" autocomplete="off"><ul class="sugerencias" hidden></ul></div>`;
  // da vida a todos los campos .pz-busca dentro de "caja" (también los que se agreguen después)
  EPT.sugerencias = (caja, prods, { alElegir, libre = true } = {}) => {
    const bp = EPT.buscadorPiezas(prods);
    let espera = null;
    const lista = inp => inp.parentElement.querySelector('.sugerencias');
    const cerrar = inp => { const ul = lista(inp); ul.hidden = true; ul.innerHTML = ''; };
    const elegir = (inp, li) => { inp.value = li.dataset.v; cerrar(inp); if (alElegir) alElegir(inp, bp.deTexto(inp.value)); };
    const mostrar = inp => {
      const ul = lista(inp); const r = bp.buscar(inp.value);
      ul.innerHTML = r.map((p, i) => `<li data-v="${esc(bp.etiqueta(p))}"${i === 0 ? ' class="activa"' : ''}><b>${esc(p.codigo)}</b> ${esc(p.descripcion)}${p.usada ? ' <span class="marca-usada">USADA</span>' : ''}</li>`).join('')
        || (inp.value.trim() ? `<li class="nada">${libre ? 'No está en el catálogo: se pedirá tal como lo escribió' : 'No se encontró. Pruebe con el código o otra palabra.'}</li>` : '');
      ul.hidden = !ul.innerHTML;
    };
    caja.addEventListener('input', e => {
      if (!e.target.classList.contains('pz-busca')) return;
      clearTimeout(espera); espera = setTimeout(() => mostrar(e.target), 90);
    });
    caja.addEventListener('keydown', e => {
      if (!e.target.classList.contains('pz-busca')) return;
      const ul = lista(e.target); if (ul.hidden) return;
      const items = [...ul.querySelectorAll('li[data-v]')]; const act = ul.querySelector('li.activa'); let i = items.indexOf(act);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!items.length) return;
        i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(x => x.classList.remove('activa')); items[i].classList.add('activa'); items[i].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); if (act) elegir(e.target, act); else cerrar(e.target); }
      else if (e.key === 'Escape') { e.preventDefault(); cerrar(e.target); }
    });
    // tocar una sugerencia (pointerdown para que el campo no pierda el foco antes)
    caja.addEventListener('pointerdown', e => {
      const li = e.target.closest('.sugerencias li[data-v]'); if (!li) return;
      e.preventDefault(); elegir(li.closest('.busca-pieza').querySelector('.pz-busca'), li);
    });
    caja.addEventListener('focusout', e => { if (e.target.classList.contains('pz-busca')) setTimeout(() => cerrar(e.target), 150); });
    return bp;
  };
  EPT.funcion = async (nombre, cuerpo) => {
    const { data, error } = await sb.functions.invoke(nombre, { body: cuerpo });
    if (error) {
      let m = error.message;
      try { const d = await error.context.json(); if (d && d.error) m = d.error; } catch (_) { /* sin cuerpo */ }
      throw new Error(EPT.error(m));
    }
    return data;
  };

  // Ventana con formulario: html del cuerpo; al guardar llama alGuardar(form) y cierra si no hay error
  EPT.ventana = ({ titulo, cuerpo, boton = 'Guardar', alGuardar, alAbrir }) => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog" novalidate>
      <div class="tit"><h2>${esc(titulo)}</h2><button type="button" class="liso" data-cerrar aria-label="Cerrar">✕</button></div>
      ${cuerpo}
      <p class="error" role="alert"></p>
      <div class="pie"><button type="button" data-cerrar>Cancelar</button>${boton ? `<button class="prin" type="submit">${esc(boton)}</button>` : ''}</div>
    </form>`;
    document.body.append(d);
    const f = d.querySelector('form');
    d.addEventListener('close', () => d.remove());
    d.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => d.close()));
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const enviar = f.querySelector('button[type=submit]'); const err = f.querySelector('.error');
      err.textContent = ''; if (enviar) enviar.disabled = true;
      try { if (alGuardar) await alGuardar(f, d); if (d.open) d.close(); }
      catch (e) { err.textContent = EPT.error(e); }
      finally { if (enviar) enviar.disabled = false; }
    });
    d.showModal();
    if (alAbrir) alAbrir(f, d);
    const primero = f.querySelector('input:not([type=hidden]),select,textarea'); if (primero) primero.focus();
    return d;
  };

  // Cada pantalla: { id, titulo, subtitulo, icono, grupo, ver: () => boolean, mostrar: async (vista) => {} }
  EPT.pantalla = p => EPT.pantallas.push(p);

  function pintarMenu() {
    // orden fijo por departamento; dentro de cada uno, el "peso" (Tablero primero) y luego el orden en que se agregaron
    const GRUPOS = [undefined, 'Taller', 'Repuestos', 'Almacén', 'Caja', 'Administración'];
    const visibles = EPT.pantallas.map((p, i) => ({ p, i })).filter(({ p }) => !p.ver || p.ver())
      .sort((a, b) => (GRUPOS.indexOf(a.p.grupo) - GRUPOS.indexOf(b.p.grupo)) || ((a.p.peso || 0) - (b.p.peso || 0)) || (a.i - b.i)).map(x => x.p);
    let grupo = null; let h = '';
    for (const p of visibles) {
      if (p.grupo && p.grupo !== grupo) { h += `<div class="grupo">${esc(p.grupo)}</div>`; grupo = p.grupo; }
      h += `<button type="button" data-ir="${p.id}" ${EPT.actual === p.id ? 'aria-current="page"' : ''}>${icono(p.icono)}<span>${esc(p.titulo)}</span><span class="insignia" data-insignia="${p.id}"></span></button>`;
    }
    $('#menu').innerHTML = h;
  }

  EPT.ir = async id => {
    const p = EPT.pantallas.find(x => x.id === id && (!x.ver || x.ver())) || EPT.pantallas[0];
    EPT.actual = p.id;
    document.body.classList.remove('menu-abierto');
    $('#titulo').textContent = p.titulo;
    $('#subtitulo').textContent = p.subtitulo || '';
    $('#barraBotones').innerHTML = '';
    pintarMenu();
    const vista = $('#vista');
    vista.innerHTML = '<div class="vacio">Cargando…</div>';
    try { await p.mostrar(vista); }
    catch (e) { vista.innerHTML = `<div class="panel"><div class="vacio">${esc(EPT.error(e))}</div></div>`; }
    try { history.replaceState(null, '', '#' + p.id); } catch (_) { /* archivo local */ }
  };
  EPT.recargar = () => EPT.ir(EPT.actual);

  async function cargarPersona() {
    const yo = await EPT.rpc('yo');
    if (!yo || !yo.id) throw new Error('Su usuario no está activo. Hable con el administrador.');
    EPT.yo = yo;
    EPT.permisos = new Set(await EPT.rpc('mis_permisos'));
    $('#yoNombre').textContent = yo.nombre;
    $('#yoDep').textContent = DEPARTAMENTOS[yo.departamento] || '';
  }

  async function mostrarPrograma() {
    $('#vEntrada').hidden = true; $('#vApp').hidden = false;
    await EPT.ir((location.hash || '').slice(1) || 'inicio');
  }
  function mostrarEntrada(msg) {
    $('#vApp').hidden = true; $('#vEntrada').hidden = false;
    $('#eError').textContent = msg || '';
    $('#eUsuario').focus();
  }

  EPT.arrancar = async () => {
    if (!sb) { mostrarEntrada('No se pudo cargar el programa. Revise la conexión a internet.'); return; }
    $('#fEntrada').addEventListener('submit', async ev => {
      ev.preventDefault();
      const u = $('#eUsuario').value.trim().toLowerCase(); const c = $('#eClave').value;
      const b = ev.target.querySelector('button'); b.disabled = true; $('#eError').textContent = '';
      try {
        const { error } = await sb.auth.signInWithPassword({ email: u.includes('@') ? u : u + DOMINIO, password: c });
        if (error) throw new Error(/invalid login credentials/i.test(error.message) ? 'Usuario o contraseña incorrectos'
          : error.status === 401 ? 'El programa no pudo conectarse con el servidor. Avise al administrador.' : EPT.error(error));
        await cargarPersona();
        $('#eClave').value = '';
        await mostrarPrograma();
      } catch (e) {
        await sb.auth.signOut().catch(() => {});
        $('#eError').textContent = EPT.error(e);
      } finally { b.disabled = false; }
    });
    $('#btnSalir').addEventListener('click', async () => { await sb.auth.signOut(); EPT.yo = null; mostrarEntrada(); });
    // Fondo de la pantalla: mamey (claro) → blanco → oscuro. El botón dice a cuál se pasa; se recuerda en este aparato
    const TEMAS = { claro: 'blanco', blanco: 'oscuro', oscuro: 'claro' };
    const NOMBRE = { claro: ['sol', 'Fondo mamey'], blanco: ['sol', 'Fondo blanco'], oscuro: ['luna', 'Modo oscuro'] };
    const temaActual = () => document.documentElement.dataset.tema || (matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro');
    const pintarTema = () => { const [ic, t] = NOMBRE[TEMAS[temaActual()]]; $('#btnTema').innerHTML = `${icono(ic)}${t}`; };
    $('#btnTema').addEventListener('click', () => {
      const t = TEMAS[temaActual()];
      document.documentElement.dataset.tema = t;
      try { localStorage.setItem('ept-tema', t); } catch (_) { }
      pintarTema();
    });
    pintarTema();
    $('#btnMenu').addEventListener('click', () => document.body.classList.toggle('menu-abierto'));
    document.addEventListener('click', e => {
      if (document.body.classList.contains('menu-abierto') && !e.target.closest('#side,#btnMenu')) document.body.classList.remove('menu-abierto');
    });
    $('#menu').addEventListener('click', e => { const b = e.target.closest('[data-ir]'); if (b) EPT.ir(b.dataset.ir); });

    const { data } = await sb.auth.getSession();
    if (!data.session) return mostrarEntrada();
    try { await cargarPersona(); await mostrarPrograma(); }
    catch (e) { await sb.auth.signOut().catch(() => {}); mostrarEntrada(EPT.error(e)); }
  };

  // ---------- Inicio ----------
  EPT.pantalla({
    id: 'inicio', titulo: 'Inicio', icono: 'inicio',
    async mostrar(v) {
      const dep = DEPARTAMENTOS[EPT.yo.departamento] || '';
      const atajos = EPT.pantallas.filter(p => p.id !== 'inicio' && p.atajo && (!p.ver || p.ver()));
      v.innerHTML = `
        <div class="saludo"><h2>Hola, ${esc(EPT.yo.nombre.split(' ')[0])}</h2><p>${esc(dep)} · ¿Qué va a hacer?</p></div>
        ${atajos.length ? `<div class="acciones">${atajos.map(p =>
          `<button type="button" class="accion" data-ir="${p.id}">${icono(p.icono)}${esc(p.atajo)}</button>`).join('')}</div>`
        : `<div class="panel"><div class="vacio">Las pantallas de su departamento se agregan en las próximas etapas.</div></div>`}`;
      v.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => EPT.ir(b.dataset.ir)));

      // Avisos sin leer de su departamento (el servidor solo le manda los suyos)
      const avisos = await EPT.leer(sb.from('notificaciones').select('id,texto,enlace,fecha').eq('leida', false)
        .eq('departamento', EPT.yo.departamento)
        .order('fecha', { ascending: false }).limit(30));
      if (!avisos.length) return;
      v.insertAdjacentHTML('beforeend', `<div class="panel" style="margin-top:20px"><header><h2>Avisos</h2>
        <button type="button" class="liso peque der" id="btnLeidos">Marcar todo como visto</button></header>
        <ul class="lista avisos">${avisos.map(a => `<li class="${a.enlace ? 'toca' : ''}" data-id="${a.id}" data-enlace="${esc(a.enlace)}">
          <div class="q"><b style="white-space:normal">${esc(a.texto)}</b><span>${new Date(a.fecha).toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></div></li>`).join('')}</ul></div>`);
      v.querySelector('#btnLeidos').addEventListener('click', async () => {
        try { await EPT.rpc('ept_avisos_leidos', { p_ids: avisos.map(a => a.id) }); EPT.recargar(); } catch (e) { EPT.aviso(EPT.error(e), true); }
      });
      v.querySelectorAll('.avisos li.toca').forEach(li => li.addEventListener('click', async () => {
        EPT.rpc('ept_avisos_leidos', { p_ids: [li.dataset.id] }).catch(() => {});
        const [tipo, id] = li.dataset.enlace.split(':');
        const abrir = { orden: EPT.yo.departamento === 'caja' && EPT.abrirCobro ? EPT.abrirCobro : EPT.abrirOrden, solicitud: EPT.abrirSolicitud, requisicion: EPT.abrirRequisicion, transferencia: EPT.abrirTransferencia }[tipo];
        if (abrir && id) await abrir(id);
      }));
    },
  });
})();
