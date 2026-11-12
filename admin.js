// EPT CONTROL OPERATIVO · Administración: usuarios, permisos por persona y mecánicos.
(function () {
  'use strict';
  const { sb, esc, icono, DEPARTAMENTOS } = EPT;

  // ---------- Usuarios ----------
  EPT.pantalla({
    id: 'usuarios', titulo: 'Usuarios', subtitulo: 'Quién entra al programa y qué puede hacer',
    icono: 'usuarios', grupo: 'Administración', atajo: 'Usuarios',
    ver: () => EPT.puede('usuarios.gestionar') || EPT.puede('permisos.asignar'),
    async mostrar(v) {
      const [usuarios, roles] = await Promise.all([
        EPT.leer(sb.from('usuarios').select('id,usuario,nombre,departamento,rol_id,activo').order('activo', { ascending: false }).order('nombre')),
        EPT.leer(sb.from('roles').select('id,nombre,departamento,todo').order('nombre')),
      ]);
      const rol = id => roles.find(r => r.id === id) || {};
      if (EPT.puede('usuarios.gestionar')) {
        EPT.$('#barraBotones').innerHTML = `<button type="button" class="prin" id="btnNuevoUsuario">${icono('mas')}Nuevo usuario</button>`;
        EPT.$('#btnNuevoUsuario').addEventListener('click', () => nuevoUsuario(roles));
      }
      v.innerHTML = `<div class="panel"><ul class="lista">${usuarios.map(u => `
        <li class="toca ${u.activo ? '' : 'apagado'}" data-id="${u.id}">
          <div class="q"><b>${esc(u.nombre)}</b><span>${esc(u.usuario)} · ${esc(rol(u.rol_id).nombre)}</span></div>
          <span class="estado ${u.activo ? 'ok' : ''}">${u.activo ? 'Activo' : 'Desactivado'}</span>
        </li>`).join('')}</ul></div>`;
      v.querySelectorAll('li[data-id]').forEach(li => li.addEventListener('click', () =>
        fichaUsuario(usuarios.find(u => u.id === li.dataset.id), roles)));
    },
  });

  const opcionesRol = (roles, sel) => roles.map(r =>
    `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('');

  function nuevoUsuario(roles) {
    EPT.ventana({
      titulo: 'Nuevo usuario', boton: 'Crear usuario',
      cuerpo: `
        <label class="campo">Nombre completo<input name="nombre" required maxlength="80"></label>
        <label class="campo">Usuario para entrar <small style="font-weight:400;color:var(--mute)">(sin espacios, ej. juan.perez)</small>
          <input name="usuario" required autocapitalize="none" spellcheck="false" maxlength="30"></label>
        <label class="campo">Departamento y rol<select name="rol" required>
          <option value="">Elija…</option>${opcionesRol(roles.filter(r => !r.todo || EPT.yo.departamento === 'admin'))}</select></label>
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
      EPT.leer(sb.from('permisos').select('codigo,departamento,descripcion').order('departamento').order('codigo')),
      EPT.leer(sb.from('rol_permisos').select('permiso').eq('rol_id', u.rol_id)),
      EPT.puede('permisos.asignar') ? EPT.leer(sb.from('usuario_permisos').select('permiso,concedido').eq('usuario_id', u.id)) : [],
    ]);
    const rol = roles.find(r => r.id === u.rol_id) || {};
    const delRol = new Set(rolPermisos.map(x => x.permiso));
    const cambios = Object.fromEntries(propios.filter(p => p.concedido !== null).map(p => [p.permiso, p.concedido]));
    const esYo = u.id === EPT.yo.id;
    const puedeEditar = EPT.puede('usuarios.gestionar');
    const puedePermisos = EPT.puede('permisos.asignar') && !esYo;

    const orden = ['taller', 'repuestos', 'almacen', 'caja', 'admin'];
    const tres = p => {
      const v = p.codigo in cambios ? (cambios[p.codigo] ? 'si' : 'no') : 'rol';
      const base = rol.todo || delRol.has(p.codigo) ? 'Sí' : 'No';
      return `<div class="tres" data-p="${p.codigo}">
        <button type="button" data-v="rol" aria-pressed="${v === 'rol'}" title="Lo que diga su rol">Rol (${base})</button>
        <button type="button" class="si" data-v="si" aria-pressed="${v === 'si'}">Sí</button>
        <button type="button" class="no" data-v="no" aria-pressed="${v === 'no'}">No</button></div>`;
    };
    const listaPermisos = !puedePermisos ? '' : `
      <details><summary style="cursor:pointer;font-weight:700;min-height:40px;display:flex;align-items:center">Permisos de esta persona</summary>
      <p style="margin:6px 0;color:var(--mute);font-size:13.5px">"Rol" = lo que trae su rol. Cambie solo lo que esta persona deba tener distinto. Se guarda al tocar.</p>
      ${orden.map(dep => `<div class="perm-dep">${esc(DEPARTAMENTOS[dep])}</div>` + permisos.filter(p => p.departamento === dep).map(p => `
        <div class="perm"><div class="q">${esc(p.descripcion)}</div>${tres(p)}</div>`).join('')).join('')}
      </details>`;

    EPT.ventana({
      titulo: u.nombre, boton: puedeEditar ? 'Guardar cambios' : '',
      cuerpo: `
        <p style="margin:0;color:var(--mute)">Usuario: <b style="color:var(--ink)">${esc(u.usuario)}</b></p>
        ${puedeEditar ? `
        <label class="campo">Nombre completo<input name="nombre" value="${esc(u.nombre)}" required maxlength="80"></label>
        <label class="campo">Departamento y rol<select name="rol">${opcionesRol(roles, u.rol_id)}</select></label>
        <label class="campo">Estado<select name="activo" ${esYo ? 'disabled' : ''}>
          <option value="1" ${u.activo ? 'selected' : ''}>Activo: puede entrar</option>
          <option value="0" ${u.activo ? '' : 'selected'}>Desactivado: no puede entrar</option></select></label>
        <div class="fila"><button type="button" data-clave>Cambiar contraseña</button></div>` : ''}
        ${listaPermisos}`,
      async alGuardar(f) {
        if (!puedeEditar) return;
        const d = Object.fromEntries(new FormData(f));
        await EPT.rpc('ept_cambiar_usuario', { p_id: u.id, p_nombre: d.nombre, p_rol: d.rol, p_activo: esYo ? true : d.activo === '1' });
        EPT.aviso('Cambios guardados');
        if (esYo) location.reload(); else EPT.recargar();
      },
      alAbrir(f) {
        const bc = f.querySelector('[data-clave]');
        if (bc) bc.addEventListener('click', () => cambiarClave(u));
        f.querySelectorAll('.tres').forEach(t => t.addEventListener('click', async e => {
          const b = e.target.closest('button[data-v]'); if (!b || b.getAttribute('aria-pressed') === 'true') return;
          const v = b.dataset.v;
          try {
            await EPT.rpc('ept_permiso_usuario', { p_id: u.id, p_permiso: t.dataset.p, p_concedido: v === 'rol' ? null : v === 'si' });
            t.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            EPT.aviso('Permiso guardado');
          } catch (er) { EPT.aviso(EPT.error(er), true); }
        }));
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

  // ---------- Mecánicos ----------
  EPT.pantalla({
    id: 'mecanicos', titulo: 'Mecánicos', subtitulo: 'La lista que se usa al pedir y despachar piezas',
    icono: 'mecanicos', grupo: 'Administración', atajo: 'Mecánicos',
    ver: () => EPT.puede('mecanicos.gestionar'),
    async mostrar(v) {
      const lista = await EPT.leer(sb.from('mecanicos').select('id,nombre,activo').order('activo', { ascending: false }).order('nombre'));
      EPT.$('#barraBotones').innerHTML = `<button type="button" class="prin" id="btnNuevoMec">${icono('mas')}Agregar mecánico</button>`;
      EPT.$('#btnNuevoMec').addEventListener('click', () => fichaMecanico(null));
      v.innerHTML = `<div class="panel">${lista.length ? `<ul class="lista">${lista.map(m => `
        <li class="toca ${m.activo ? '' : 'apagado'}" data-id="${m.id}">
          <div class="q"><b>${esc(m.nombre)}</b></div>
          <span class="estado ${m.activo ? 'ok' : ''}">${m.activo ? 'Trabajando' : 'Ya no está'}</span>
        </li>`).join('')}</ul>` : '<div class="vacio">Todavía no hay mecánicos. Toque "Agregar mecánico".</div>'}</div>`;
      v.querySelectorAll('li[data-id]').forEach(li => li.addEventListener('click', () => fichaMecanico(lista.find(m => m.id === li.dataset.id))));
    },
  });

  function fichaMecanico(m) {
    EPT.ventana({
      titulo: m ? m.nombre : 'Agregar mecánico',
      cuerpo: `<label class="campo">Nombre<input name="nombre" value="${esc(m ? m.nombre : '')}" required maxlength="80"></label>
        ${m ? `<label class="campo">Estado<select name="activo">
          <option value="1" ${m.activo ? 'selected' : ''}>Trabajando</option>
          <option value="0" ${m.activo ? '' : 'selected'}>Ya no está (no aparece en las listas)</option></select></label>` : ''}`,
      async alGuardar(f) {
        const d = Object.fromEntries(new FormData(f));
        await EPT.rpc('ept_mecanico_guardar', { p_id: m ? m.id : null, p_nombre: d.nombre, p_activo: m ? d.activo === '1' : true });
        EPT.aviso(m ? 'Guardado' : 'Mecánico agregado');
        EPT.recargar();
      },
    });
  }
})();
