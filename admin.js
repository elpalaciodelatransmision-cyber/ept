// EPT CONTROL OPERATIVO · Control de accesos (usuarios, roles, permisos) y mecánicos.
(function () {
  'use strict';
  const { sb, esc, icono, DEPARTAMENTOS } = EPT;

  // ================= Control de accesos =================
  // Solo el Administrador general entra aquí: crea usuarios, les asigna el rol, decide qué puede hacer cada rol
  // y le da o le quita permisos a una persona. El servidor lo vuelve a revisar todo (ept_*: exigir_admin_general).
  const GRUPO = 'Control de accesos';
  const soloAdmin = () => EPT.puede('permisos.asignar');
  const RESERVADOS = new Set(['usuarios.gestionar', 'permisos.asignar']); // vienen solo con «todos los permisos»
  const ORDEN_DEP = ['taller', 'repuestos', 'almacen', 'caja', 'admin'];

  const leerRoles = () => EPT.leer(sb.from('roles').select('id,nombre,departamento,todo').order('nombre'));
  const OBSOLETOS = new Set(['recepcion.confirmar']); // ya no se usa (la entrega queda recibida sola): no se muestra
  const leerPermisos = () => EPT.leer(sb.from('permisos').select('codigo,departamento,descripcion').order('descripcion'))
    .then(l => l.filter(p => !OBSOLETOS.has(p.codigo)));
  const opcionesRol = (roles, sel) => ORDEN_DEP.map(dep => {
    const rs = roles.filter(r => (r.departamento || 'admin') === dep);
    return rs.length ? `<optgroup label="${esc(DEPARTAMENTOS[dep])}">${rs.map(r =>
      `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  const opcionesDep = sel => ORDEN_DEP.map(d => `<option value="${d}" ${d === sel ? 'selected' : ''}>${esc(DEPARTAMENTOS[d])}</option>`).join('');

  // Lista de permisos agrupada por departamento; fila(p) pinta los botones de cada permiso
  const listaPorDepartamento = (permisos, fila) => ORDEN_DEP.map(dep => {
    const ps = permisos.filter(p => p.departamento === dep);
    return ps.length ? `<div class="perm-dep">${esc(DEPARTAMENTOS[dep])}</div>` + ps.map(p =>
      `<div class="perm"><div class="q">${esc(p.descripcion)}</div>${fila(p)}</div>`).join('') : '';
  }).join('');
  const reservado = `<span class="mute" style="font-size:13px">Solo Administrador general</span>`;

  // Guarda al tocar un botón de .tres; si el servidor lo rechaza, el botón vuelve como estaba
  function alTocarTres(f, guardar) {
    f.querySelectorAll('.tres').forEach(t => t.addEventListener('click', async e => {
      const b = e.target.closest('button[data-v]'); if (!b || b.getAttribute('aria-pressed') === 'true') return;
      try {
        await guardar(t.dataset.p, b.dataset.v);
        t.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        EPT.aviso('Permiso guardado');
      } catch (er) { EPT.aviso(EPT.error(er), true); }
    }));
  }

  // ---------- Usuarios ----------
  EPT.pantalla({
    id: 'usuarios', titulo: 'Usuarios', pestana: 'Usuarios', subtitulo: 'Quién entra al programa, con qué rol y qué puede hacer',
    explica: 'Crear usuarios, asignarles el rol, darles o quitarles permisos, cambiar la contraseña.',
    icono: 'usuarios', grupo: GRUPO, atajo: 'Usuarios', peso: 1, ver: soloAdmin,
    async mostrar(v) {
      const [usuarios, roles] = await Promise.all([
        EPT.leer(sb.from('usuarios').select('id,usuario,nombre,departamento,rol_id,activo').order('activo', { ascending: false }).order('nombre')),
        leerRoles(),
      ]);
      const rol = id => roles.find(r => r.id === id) || {};
      EPT.$('#barraBotones').innerHTML = `<button type="button" class="prin" id="btnNuevoUsuario">${icono('mas')}Nuevo usuario</button>`;
      EPT.$('#btnNuevoUsuario').addEventListener('click', () => nuevoUsuario(roles));
      v.innerHTML = ORDEN_DEP.map(dep => {
        const us = usuarios.filter(u => u.departamento === dep);
        return us.length ? `<div class="panel" style="margin-bottom:16px"><header><h2>${esc(DEPARTAMENTOS[dep])}</h2>
          <span class="mute">${us.filter(u => u.activo).length} activo${us.filter(u => u.activo).length === 1 ? '' : 's'}</span></header>
          <ul class="lista">${us.map(u => `
          <li class="toca ${u.activo ? '' : 'apagado'}" data-id="${u.id}">
            <div class="q"><b>${esc(u.nombre)}</b><span>${esc(u.usuario)} · ${esc(rol(u.rol_id).nombre || '')}</span></div>
            <span class="estado ${u.activo ? 'ok' : ''}">${u.activo ? 'Activo' : 'Desactivado'}</span>
          </li>`).join('')}</ul></div>` : '';
      }).join('');
      v.querySelectorAll('li[data-id]').forEach(li => li.addEventListener('click', () =>
        fichaUsuario(usuarios.find(u => u.id === li.dataset.id), roles)));
    },
  });

  function nuevoUsuario(roles) {
    EPT.ventana({
      titulo: 'Nuevo usuario', boton: 'Crear usuario',
      cuerpo: `
        <label class="campo">Nombre completo<input name="nombre" required maxlength="80"></label>
        <label class="campo">Usuario para entrar <small style="font-weight:400;color:var(--mute)">(sin espacios, ej. juan.perez)</small>
          <input name="usuario" required autocapitalize="none" spellcheck="false" maxlength="30"></label>
        <label class="campo">Rol<select name="rol" required><option value="">Elija…</option>${opcionesRol(roles)}</select></label>
        <label class="campo">Contraseña <small style="font-weight:400;color:var(--mute)">(mínimo 8)</small>
          <input name="clave" type="text" required minlength="8" autocomplete="new-password" spellcheck="false"></label>`,
      async alGuardar(f) {
        const d = Object.fromEntries(new FormData(f));
        if (!d.nombre.trim() || !d.usuario.trim() || !d.rol) throw new Error('Llene todos los campos');
        if (d.clave.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
        await EPT.funcion('ept-usuarios', { accion: 'crear', usuario: d.usuario, nombre: d.nombre, rol_id: d.rol, clave: d.clave });
        EPT.aviso(`Usuario creado. Entra con: ${d.usuario.trim().toLowerCase()}`);
        EPT.recargar();
      },
    });
  }

  async function fichaUsuario(u, roles) {
    const [permisos, rolPermisos, propios] = await Promise.all([
      leerPermisos(),
      EPT.leer(sb.from('rol_permisos').select('permiso').eq('rol_id', u.rol_id)),
      EPT.leer(sb.from('usuario_permisos').select('permiso,concedido').eq('usuario_id', u.id)),
    ]);
    const rol = roles.find(r => r.id === u.rol_id) || {};
    const delRol = new Set(rolPermisos.map(x => x.permiso));
    const cambios = Object.fromEntries(propios.filter(p => p.concedido !== null).map(p => [p.permiso, p.concedido]));
    const esYo = u.id === EPT.yo.id;
    const nCambios = Object.keys(cambios).length;

    const tres = p => {
      if (RESERVADOS.has(p.codigo)) return reservado;
      const v = p.codigo in cambios ? (cambios[p.codigo] ? 'si' : 'no') : 'rol';
      return `<div class="tres" data-p="${p.codigo}">
        <button type="button" data-v="rol" aria-pressed="${v === 'rol'}" title="Lo que diga su rol">Rol (${delRol.has(p.codigo) ? 'Sí' : 'No'})</button>
        <button type="button" class="si" data-v="si" aria-pressed="${v === 'si'}">Sí</button>
        <button type="button" class="no" data-v="no" aria-pressed="${v === 'no'}">No</button></div>`;
    };
    const permisosPersona = rol.todo
      ? `<p class="mute" style="margin:8px 0 0">Su rol es <b>Administrador general</b>: tiene todos los permisos.</p>`
      : esYo ? ''
      : `<details><summary style="cursor:pointer;font-weight:700;min-height:40px;display:flex;align-items:center">
          Permisos de esta persona${nCambios ? ` · ${nCambios} distinto${nCambios === 1 ? '' : 's'} a su rol` : ''}</summary>
        <p style="margin:6px 0;color:var(--mute);font-size:13.5px">«Rol» = lo que trae su rol (${esc(rol.nombre || '')}). Cambie solo lo que esta persona deba tener distinto. Se guarda al tocar.</p>
        ${listaPorDepartamento(permisos, tres)}</details>`;

    EPT.ventana({
      titulo: u.nombre, boton: 'Guardar cambios',
      cuerpo: `
        <p style="margin:0;color:var(--mute)">Usuario: <b style="color:var(--ink)">${esc(u.usuario)}</b></p>
        <label class="campo">Nombre completo<input name="nombre" value="${esc(u.nombre)}" required maxlength="80"></label>
        <label class="campo">Rol<select name="rol">${opcionesRol(roles, u.rol_id)}</select></label>
        <label class="campo">Estado<select name="activo" ${esYo ? 'disabled' : ''}>
          <option value="1" ${u.activo ? 'selected' : ''}>Activo: puede entrar</option>
          <option value="0" ${u.activo ? '' : 'selected'}>Desactivado: no puede entrar</option></select></label>
        <div class="fila"><button type="button" class="peque" data-clave>Cambiar contraseña</button></div>
        ${permisosPersona}`,
      async alGuardar(f) {
        const d = Object.fromEntries(new FormData(f));
        await EPT.rpc('ept_cambiar_usuario', { p_id: u.id, p_nombre: d.nombre, p_rol: d.rol, p_activo: esYo ? true : d.activo === '1' });
        EPT.aviso('Cambios guardados');
        if (esYo) location.reload(); else EPT.recargar();
      },
      alAbrir(f) {
        f.querySelector('[data-clave]').addEventListener('click', () => cambiarClave(u));
        alTocarTres(f, (permiso, v) => EPT.rpc('ept_permiso_usuario', { p_id: u.id, p_permiso: permiso, p_concedido: v === 'rol' ? null : v === 'si' }));
      },
    });
  }

  function cambiarClave(u) {
    EPT.ventana({
      titulo: 'Contraseña de ' + u.nombre, boton: 'Cambiar',
      cuerpo: `<label class="campo">Contraseña nueva <small style="font-weight:400;color:var(--mute)">(mínimo 8)</small>
        <input name="clave" type="text" required minlength="8" autocomplete="new-password" spellcheck="false"></label>`,
      async alGuardar(f) {
        const clave = new FormData(f).get('clave');
        if (clave.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
        await EPT.funcion('ept-usuarios', { accion: 'clave', id: u.id, clave });
        EPT.aviso('Contraseña cambiada');
      },
    });
  }

  // ---------- Roles ----------
  EPT.pantalla({
    id: 'roles', titulo: 'Roles', pestana: 'Roles', subtitulo: 'Qué puede hacer cada rol',
    explica: 'Crear roles y marcar qué puede hacer cada uno. Lo que cambie aquí lo reciben todas las personas con ese rol.',
    icono: 'candado', grupo: GRUPO, atajo: 'Roles', peso: 2, ver: soloAdmin,
    async mostrar(v) {
      const [roles, rp, usuarios, permisos] = await Promise.all([
        leerRoles(),
        EPT.leer(sb.from('rol_permisos').select('rol_id,permiso')),
        EPT.leer(sb.from('usuarios').select('nombre,rol_id').eq('activo', true).order('nombre')),
        leerPermisos(),
      ]);
      EPT.$('#barraBotones').innerHTML = `<button type="button" class="prin" id="btnNuevoRol">${icono('mas')}Nuevo rol</button>`;
      EPT.$('#btnNuevoRol').addEventListener('click', () => nuevoRol(roles));
      const total = permisos.filter(p => !RESERVADOS.has(p.codigo)).length;
      v.innerHTML = ORDEN_DEP.map(dep => {
        const rs = roles.filter(r => (r.departamento || 'admin') === dep);
        return rs.length ? `<div class="panel" style="margin-bottom:16px"><header><h2>${esc(DEPARTAMENTOS[dep])}</h2></header>
          <ul class="lista">${rs.map(r => {
            const gente = usuarios.filter(u => u.rol_id === r.id).map(u => u.nombre);
            const n = r.todo ? total : rp.filter(x => x.rol_id === r.id).length;
            return `<li class="toca" data-id="${r.id}">
              <div class="q"><b>${esc(r.nombre)}</b><span>${gente.length ? esc(gente.join(', ')) : 'Nadie tiene este rol todavía'}</span></div>
              <span class="estado ${r.todo ? 'ok' : ''}">${r.todo ? 'Todos los permisos' : `${n} de ${total} permisos`}</span></li>`;
          }).join('')}</ul></div>` : '';
      }).join('');
      v.querySelectorAll('li[data-id]').forEach(li => li.addEventListener('click', () =>
        fichaRol(roles.find(r => r.id === li.dataset.id), permisos, rp)));
    },
  });

  function nuevoRol(roles) {
    EPT.ventana({
      titulo: 'Nuevo rol', boton: 'Crear rol',
      cuerpo: `
        <label class="campo">Nombre del rol <small style="font-weight:400;color:var(--mute)">(ej. Encargado de Caja)</small><input name="nombre" required maxlength="60"></label>
        <label class="campo">Departamento <small style="font-weight:400;color:var(--mute)">(a dónde le llegan los avisos)</small>
          <select name="dep" required><option value="">Elija…</option>${opcionesDep()}</select></label>
        <label class="campo">Empezar con los permisos de<select name="copia"><option value="">Ninguno: los marco yo</option>
          ${opcionesRol(roles.filter(r => !r.todo))}</select></label>`,
      async alGuardar(f) {
        const d = Object.fromEntries(new FormData(f));
        if (!d.nombre.trim() || !d.dep) throw new Error('Escriba el nombre y elija el departamento');
        await EPT.rpc('ept_rol_guardar', { p_id: null, p_nombre: d.nombre, p_departamento: d.dep, p_copiar_de: d.copia || null });
        EPT.aviso('Rol creado: tóquelo para marcar sus permisos');
        EPT.recargar();
      },
    });
  }

  function fichaRol(r, permisos, rp) {
    const tiene = new Set(rp.filter(x => x.rol_id === r.id).map(x => x.permiso));
    const dos = p => RESERVADOS.has(p.codigo) ? reservado : `<div class="tres" data-p="${p.codigo}">
        <button type="button" class="si" data-v="si" aria-pressed="${tiene.has(p.codigo)}">Sí</button>
        <button type="button" class="no" data-v="no" aria-pressed="${!tiene.has(p.codigo)}">No</button></div>`;
    if (r.todo) {
      EPT.ventana({ titulo: r.nombre, boton: '',
        cuerpo: `<p style="margin:0">Este rol tiene <b>todos los permisos</b>, incluido manejar usuarios, roles y permisos. No se cambia.</p>` });
      return;
    }
    let cambio = false;
    EPT.ventana({
      titulo: r.nombre, boton: 'Guardar nombre',
      cuerpo: `
        <div class="dos"><label class="campo">Nombre del rol<input name="nombre" value="${esc(r.nombre)}" required maxlength="60"></label>
        <label class="campo">Departamento<select name="dep">${opcionesDep(r.departamento)}</select></label></div>
        <div class="perm-dep" style="margin-top:14px">Qué puede hacer · se guarda al tocar</div>
        <p style="margin:2px 0 6px;color:var(--mute);font-size:13.5px">Lo reciben todas las personas con este rol (menos lo que se le haya cambiado a una persona en su ficha).</p>
        ${listaPorDepartamento(permisos, dos)}`,
      async alGuardar(f) {
        const d = Object.fromEntries(new FormData(f));
        await EPT.rpc('ept_rol_guardar', { p_id: r.id, p_nombre: d.nombre, p_departamento: d.dep, p_copiar_de: null });
        EPT.aviso('Rol guardado'); cambio = false; EPT.recargar();
      },
      alAbrir(f, d) {
        alTocarTres(f, async (permiso, v) => { await EPT.rpc('ept_rol_permiso', { p_rol: r.id, p_permiso: permiso, p_si: v === 'si' }); cambio = true; });
        d.addEventListener('close', () => { if (cambio) EPT.recargar(); });
      },
    });
  }

  // ---------- Historial de accesos ----------
  // Sale de la auditoría: quién creó usuarios, cambió roles o dio y quitó permisos, y cuándo
  EPT.pantalla({
    id: 'historial_accesos', titulo: 'Historial de accesos', pestana: 'Historial', subtitulo: 'Quién dio o quitó permisos, y cuándo',
    explica: 'Cada usuario creado, rol cambiado y permiso dado o quitado, con la fecha y quién lo hizo.',
    icono: 'reloj', grupo: GRUPO, peso: 3, ver: soloAdmin,
    async mostrar(v) {
      const [filas, usuarios, roles, permisos] = await Promise.all([
        EPT.leer(sb.from('auditoria').select('id,fecha,usuario_id,accion,tabla,anterior,nuevo')
          .in('tabla', ['usuarios', 'usuario_permisos', 'roles', 'rol_permisos']).order('id', { ascending: false }).limit(400)),
        EPT.leer(sb.from('usuarios').select('id,nombre')),
        leerRoles(),
        leerPermisos(),
      ]);
      const persona = id => (usuarios.find(u => u.id === id) || {}).nombre || 'El sistema';
      const nomRol = id => (roles.find(r => r.id === id) || {}).nombre || 'un rol';
      const permiso = c => `«${(permisos.find(p => p.codigo === c) || {}).descripcion || c}»`;
      const decir = c => c === true ? 'Sí' : c === false ? 'No' : 'lo que diga su rol';
      const texto = f => {
        const a = f.anterior || {}, n = f.nuevo || {};
        switch (f.tabla) {
          case 'rol_permisos':
            return f.accion === 'delete' ? `Rol «${esc(nomRol(a.rol_id))}»: ya no puede ${esc(permiso(a.permiso))}`
              : `Rol «${esc(nomRol(n.rol_id))}»: ahora puede ${esc(permiso(n.permiso))}`;
          case 'roles':
            if (f.accion === 'insert') return `Creó el rol «${esc(n.nombre)}» (${esc(DEPARTAMENTOS[n.departamento] || '')})`;
            return [a.nombre !== n.nombre && `Le cambió el nombre al rol «${esc(a.nombre)}»: ahora es «${esc(n.nombre)}»`,
              a.departamento !== n.departamento && `Pasó el rol «${esc(n.nombre)}» a ${esc(DEPARTAMENTOS[n.departamento] || '')}`].filter(Boolean).join(' · ');
          case 'usuarios':
            if (f.accion === 'insert') return `Creó el usuario «${esc(n.nombre)}» (${esc(n.usuario)}) con el rol «${esc(nomRol(n.rol_id))}»`;
            return [a.rol_id !== n.rol_id && `«${esc(n.nombre)}»: rol «${esc(nomRol(a.rol_id))}» → «${esc(nomRol(n.rol_id))}»`,
              a.activo !== n.activo && `«${esc(n.nombre)}»: ${n.activo ? 'lo activó, ya puede entrar' : 'lo desactivó, ya no puede entrar'}`,
              a.nombre !== n.nombre && `Cambió el nombre «${esc(a.nombre)}» → «${esc(n.nombre)}»`].filter(Boolean).join(' · ');
          case 'usuario_permisos':
            return `«${esc(persona(n.usuario_id))}»: ${esc(permiso(n.permiso))} → ${decir(n.concedido)}`;
        }
        return '';
      };
      const items = filas.map(f => ({ f, t: texto(f) })).filter(x => x.t);
      v.innerHTML = `<div class="panel">${items.length ? `<ul class="lista">${items.map(({ f, t }) => `
        <li><div class="q"><b style="white-space:normal;font-weight:600">${t}</b>
          <span>${esc(persona(f.usuario_id))} · ${new Date(f.fecha).toLocaleString('es-DO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div></li>`).join('')}</ul>`
        : '<div class="vacio">Todavía no hay cambios de usuarios, roles ni permisos.</div>'}</div>`;
    },
  });

  // ---------- Entradas al programa ----------
  EPT.pantalla({
    id: 'entradas', titulo: 'Entradas al programa', pestana: 'Entradas', subtitulo: 'Quién entró a EPT, cuándo y desde qué aparato',
    explica: 'Cada vez que alguien entra con su usuario o abre el programa, con la fecha, la hora y el aparato.',
    icono: 'yo', grupo: GRUPO, peso: 4, ver: soloAdmin,
    async mostrar(v) {
      const [filas, usuarios] = await Promise.all([
        EPT.leer(sb.from('entradas').select('id,fecha,tipo,dispositivo,usuario_id').order('fecha', { ascending: false }).limit(500)),
        EPT.leer(sb.from('usuarios').select('id,nombre,usuario').order('nombre')),
      ]);
      const persona = id => usuarios.find(u => u.id === id) || { nombre: '—', usuario: '' };
      let quien = '';
      v.innerHTML = `<div class="fila" style="margin-bottom:14px"><label class="campo" style="min-width:240px">Persona
          <select id="fQuien"><option value="">Todas</option>${usuarios.map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select></label></div>
        <div class="panel" id="listaEntradas"></div>`;
      const pintar = () => {
        const l = filas.filter(f => !quien || f.usuario_id === quien);
        v.querySelector('#listaEntradas').innerHTML = l.length ? `<ul class="lista">${l.map(f => `<li>
          <div class="q"><b>${esc(persona(f.usuario_id).nombre)} <small class="mute">${esc(persona(f.usuario_id).usuario)}</small></b>
            <span>${new Date(f.fecha).toLocaleString('es-DO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}${f.dispositivo ? ' · ' + esc(f.dispositivo) : ''}</span></div>
          <span class="estado ${f.tipo === 'entro' ? 'ok' : ''}">${f.tipo === 'entro' ? 'Entró con su clave' : 'Abrió el programa'}</span></li>`).join('')}</ul>`
          : '<div class="vacio">Todavía no hay entradas anotadas.</div>';
      };
      v.querySelector('#fQuien').addEventListener('change', e => { quien = e.target.value; pintar(); });
      pintar();
    },
  });

  // ---------- Mecánicos y ayudantes ----------
  // Los dos van en la misma lista al pedir y despachar piezas (a veces se le despacha a un ayudante),
  // pero se distinguen: el ayudante sale con "(ayudante)".
  const TIPO_MEC = { mecanico: 'Mecánicos', ayudante: 'Ayudantes' };
  EPT.pantalla({
    id: 'mecanicos', peso: 4, titulo: 'Mecánicos y ayudantes', pestana: 'Mecánicos y ayudantes', subtitulo: 'La lista que se usa al pedir y despachar piezas',
    explica: 'Las personas del taller a quienes se les asigna una orden o se les despachan piezas.',
    icono: 'mecanicos', grupo: 'Administración', atajo: 'Mecánicos y ayudantes',
    ver: () => EPT.puede('mecanicos.gestionar'),
    async mostrar(v) {
      const lista = await EPT.leer(sb.from('mecanicos').select('id,nombre,activo,tipo').order('activo', { ascending: false }).order('nombre'));
      EPT.$('#barraBotones').innerHTML = `<button type="button" class="prin" id="btnNuevoMec">${icono('mas')}Agregar mecánico</button>
        <button type="button" id="btnNuevoAyu">${icono('mas')}Agregar ayudante</button>`;
      EPT.$('#btnNuevoMec').addEventListener('click', () => fichaMecanico(null, 'mecanico'));
      EPT.$('#btnNuevoAyu').addEventListener('click', () => fichaMecanico(null, 'ayudante'));
      v.innerHTML = Object.entries(TIPO_MEC).map(([t, g]) => { const ms = lista.filter(m => (m.tipo || 'mecanico') === t);
        return `<div class="panel" style="margin-bottom:16px"><header><h2>${g}</h2><span class="mute">${ms.filter(m => m.activo).length} trabajando</span></header>
          ${ms.length ? `<ul class="lista">${ms.map(m => `
          <li class="toca ${m.activo ? '' : 'apagado'}" data-id="${m.id}">
            <div class="q"><b>${esc(m.nombre)}</b></div>
            <span class="estado ${m.activo ? 'ok' : ''}">${m.activo ? 'Trabajando' : 'Ya no está'}</span>
          </li>`).join('')}</ul>` : `<div class="vacio">Todavía no hay ${g.toLowerCase()}.</div>`}</div>`; }).join('');
      v.querySelectorAll('li[data-id]').forEach(li => li.addEventListener('click', () => { const m = lista.find(x => x.id === li.dataset.id); fichaMecanico(m, m.tipo); }));
    },
  });

  function fichaMecanico(m, tipo) {
    EPT.ventana({
      titulo: m ? m.nombre : tipo === 'ayudante' ? 'Agregar ayudante' : 'Agregar mecánico',
      cuerpo: `<label class="campo">Nombre<input name="nombre" value="${esc(m ? m.nombre : '')}" required maxlength="80"></label>
        <label class="campo">Es<select name="tipo"><option value="mecanico" ${tipo !== 'ayudante' ? 'selected' : ''}>Mecánico</option>
          <option value="ayudante" ${tipo === 'ayudante' ? 'selected' : ''}>Ayudante</option></select></label>
        ${m ? `<label class="campo">Estado<select name="activo">
          <option value="1" ${m.activo ? 'selected' : ''}>Trabajando</option>
          <option value="0" ${m.activo ? '' : 'selected'}>Ya no está (no aparece en las listas)</option></select></label>` : ''}`,
      async alGuardar(f) {
        const d = Object.fromEntries(new FormData(f));
        await EPT.rpc('ept_mecanico_guardar', { p_id: m ? m.id : null, p_nombre: d.nombre, p_activo: m ? d.activo === '1' : true, p_tipo: d.tipo });
        EPT.aviso(m ? 'Guardado' : d.tipo === 'ayudante' ? 'Ayudante agregado' : 'Mecánico agregado');
        EPT.recargar();
      },
    });
  }
})();
