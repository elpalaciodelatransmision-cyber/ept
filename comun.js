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
    return data;
  };
  EPT.leer = async consulta => {
    const { data, error } = await consulta;
    if (error) throw new Error(EPT.error(error));
    return data;
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
