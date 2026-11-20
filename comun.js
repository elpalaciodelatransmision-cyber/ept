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

  // Los 8 pasos de una orden (el servidor guarda en cuál va cada una: ordenes.paso).
  // El mecánico no usa el programa: todo lo lleva Repuestos, y Caja cobra al final.
  EPT.PASOS = ['Entrada', 'Diagnóstico', 'Pedir repuestos', 'Repuestos despacha', 'Trabajo', 'Cierre del expediente', 'Caja', 'Entrega del vehículo'];
  EPT.barraPasos = (paso, todoHecho) => `<ol class="pasos" aria-label="Pasos de la orden">${EPT.PASOS.map((t, i) => {
    const n = i + 1, hecho = todoHecho || n < paso;
    return `<li class="${hecho ? 'hecho' : n === paso ? 'actual' : ''}"${n === paso && !todoHecho ? ' aria-current="step"' : ''}><span class="n">${hecho ? '✓' : n}</span><span class="t">${esc(t)}</span></li>`;
  }).join('')}</ol>`;
  const PIEZAS_CAMBIAN = /producto|importar|catalogo|equivalencia|lote|almacen_articulo/;
  EPT.cargarProductos = () => EPT.memoria('productos', () => EPT.leerTodo(() => sb.from('productos')
    .select('id,codigo,descripcion,unidad,numero_parte,precio,usada,codigo_barras,en_almacen').eq('activo', true).order('descripcion')).then(EPT.alfabetico), { cambiaCon: PIEZAS_CAMBIAN });

  // ---------- Familias y subfamilias del inventario (las usan el Almacén y Productos) ----------
  EPT.cargarFamilias = () => EPT.memoria('familias', async () => {
    const [fams, subs] = await Promise.all([
      EPT.leer(sb.from('familias').select('id,nombre,orden').eq('activo', true).order('orden')),
      EPT.leer(sb.from('subfamilias').select('id,familia_id,nombre,orden').eq('activo', true).order('orden'))]);
    const porSub = new Map(subs.map(s => [s.id, { ...s, familia: fams.find(f => f.id === s.familia_id) }]));
    return { fams, subs, porSub, subsDe: fid => subs.filter(s => s.familia_id === fid),
      nombre: sid => { const s = porSub.get(sid); return s ? s.familia.nombre + ' · ' + s.nombre : ''; } };
  }, { cambiaCon: /familia/ });
  // El programa ubica solo un artículo nuevo por su nombre: automática, mecánica, CVT, DCT, hidráulico, eléctrico,
  // lubricantes, filtros, tren motriz, tornillería, gastables, limpieza, herramientas… Devuelve la subfamilia (o la de
  // "Otros · Sin clasificar"). Quien lo registra puede cambiarla. Las reglas van de lo más específico a lo más general.
  const REGLAS_FAMILIA = [
    // aceites y fluidos primero ("aceite CVT" es lubricante, no pieza CVT)
    [/\b(atf|dexron|mercon|aceite de transmision automatica)\b/, 'Lubricantes, aceites y grasas', 'Aceite ATF'],
    [/aceite.*\bcvt\b|\bcvt\b.*(aceite|fluido)|\bns-?[23]\b|\bcvtf\b/, 'Lubricantes, aceites y grasas', 'Aceite CVT'],
    [/aceite.*(manual|transfer|diferencial|engranaje)|\b(75w|80w|85w|gl-?[45])\b/, 'Lubricantes, aceites y grasas', 'Aceite de caja manual y transfer'],
    [/aceite.*motor|\b(0w|5w|10w|15w|20w)-?\d/, 'Lubricantes, aceites y grasas', 'Aceite de motor'],
    [/\baditivo/, 'Lubricantes, aceites y grasas', 'Aditivos'],
    [/\bgrasa\b/, 'Lubricantes, aceites y grasas', 'Grasas'],
    [/liquido de freno|\bdot ?[345]\b|refrigerante|anticongelante|coolant|limpiaparabrisas|limpia ?vidrio/, 'Lubricantes, aceites y grasas', 'Líquido de frenos y otros fluidos'],
    [/\bspray\b|limpiador|wd-?40|penetrante|desengrasante en spray/, 'Lubricantes, aceites y grasas', 'Sprays y limpiadores'],
    [/\baceite\b/, 'Lubricantes, aceites y grasas', 'Aceite ATF'],
    // filtros
    [/filtro.*(transmision|caja|atf|cvt)/, 'Filtros', 'Filtros de transmisión'],
    [/filtro.*(aceite|motor)/, 'Filtros', 'Filtros de aceite de motor'],
    [/\bfiltro/, 'Filtros', 'Otros filtros'],
    // DCT / DSG y CVT
    [/\b(dsg|dct|mecatronic)/, 'Transmisión DCT / DSG', 'Otras piezas'],
    [/\bcvt\b.*(banda|cadena|correa)|(banda|cadena|correa).*\bcvt\b/, 'Transmisión CVT', 'Bandas y cadenas'],
    [/\bpolea/, 'Transmisión CVT', 'Poleas'],
    [/\bcvt\b.*(reten|sello|junta|empaque)|(reten|sello|junta|empaque).*\bcvt\b/, 'Transmisión CVT', 'Juntas, sellos y retenedores'],
    [/\bcvt\b.*(rodamiento|cojinete|balero)|(rodamiento|cojinete|balero).*\bcvt\b/, 'Transmisión CVT', 'Rodamientos'],
    [/\bcvt\b/, 'Transmisión CVT', 'Otras piezas'],
    // eléctrico y electrónico
    [/solenoide/, 'Eléctrico y electrónico', 'Solenoides'],
    [/\bsensor/, 'Eléctrico y electrónico', 'Sensores'],
    [/\bswitch|interruptor|inhibidor|neutral safety/, 'Eléctrico y electrónico', 'Switches'],
    [/\b(modulo|computadora|tcm|ecu|pcm)\b/, 'Eléctrico y electrónico', 'Módulos y computadoras (TCM)'],
    [/\barnes|ramal|conector electrico|\bsocket\b/, 'Eléctrico y electrónico', 'Arneses y conectores'],
    [/bombillo.*\b(2|dos) contactos?|\b1157\b|\b7443\b/, 'Guantes, bombillos y limpieza', 'Bombillos de 2 contactos'],
    [/bombillo|\b1156\b|\b7440\b/, 'Guantes, bombillos y limpieza', 'Bombillos de 1 contacto'],
    // hidráulico y enfriamiento
    [/cuerpo de valvula|valve body/, 'Sistema hidráulico y enfriamiento', 'Cuerpo de válvulas'],
    [/\bvalvula|placa separadora|separator plate/, 'Sistema hidráulico y enfriamiento', 'Válvulas y placas'],
    [/bomba de aceite|\bbomba\b/, 'Sistema hidráulico y enfriamiento', 'Bombas de aceite'],
    [/enfriador|serpentin|termostato|radiador/, 'Sistema hidráulico y enfriamiento', 'Enfriadores y termostatos'],
    [/\blinea|manguera|\bconector\b|niple/, 'Sistema hidráulico y enfriamiento', 'Líneas, mangueras y conectores'],
    // transmisión mecánica (caja manual)
    [/sincronizador|\bsincro/, 'Transmisión mecánica', 'Sincronizadores'],
    [/(disco|plato|collarin|kit) de clutch|clutch.*(plato|collarin|manual)|\bembrague|collarin/, 'Transmisión mecánica', 'Clutch (disco, plato y collarín)'],
    [/\b(engrane|pinon|corona)\b/, 'Transmisión mecánica', 'Engranes'],
    [/(caja|transmision) (manual|mecanica)/, 'Transmisión mecánica', 'Otras piezas'],
    // transmisión automática
    [/\bkit\b.*(reparacion|overhaul|master|maestro|banner)|\boverhaul/, 'Transmisión automática', 'Kits de reparación'],
    [/disco.*(friccion|clutch)|\bclutches\b|friction|\bfriccion/, 'Transmisión automática', 'Discos de fricción'],
    [/disco.*acero|\bsteel/, 'Transmisión automática', 'Discos de acero'],
    [/\bbanda\b/, 'Transmisión automática', 'Bandas'],
    [/sprag|rueda libre|one ?way/, 'Transmisión automática', 'Rueda libre (sprag)'],
    [/convertidor|torque converter/, 'Transmisión automática', 'Convertidores de torque'],
    [/\bcarter\b|\btapon\b|\bpan\b/, 'Transmisión automática', 'Cárter, juntas y tapones'],
    [/\b(piston|resorte|reten de resortes)\b/, 'Transmisión automática', 'Pistones, resortes y retenes'],
    [/\b(tambor|planetario|housing)\b/, 'Transmisión automática', 'Tambores, planetarios y ejes'],
    [/\b(buje|bushing|arandela de empuje|rodamiento|cojinete|balero)\b/, 'Transmisión automática', 'Bujes, rodamientos y arandelas'],
    [/\b(reten|retenedor|sello|o-?ring|junta|empaque|empacadura)\b/, 'Transmisión automática', 'Juntas, sellos y retenedores'],
    // tren motriz, soportes y mandos
    [/\bsoporte/, 'Tren motriz, soportes y mandos', 'Soportes'],
    [/\b(cable|palanca|selector|varillaje)\b/, 'Tren motriz, soportes y mandos', 'Cables, palancas y selectores'],
    [/\b(cardan|semieje|flecha homocinetica|yugo|cruceta|homocinetica)\b/, 'Tren motriz, soportes y mandos', 'Cardán, semiejes y yugos'],
    [/transfer|4x4/, 'Tren motriz, soportes y mandos', 'Caja de transferencia 4x4'],
    [/flexplate|flex plate|campana|varilla de medir|bayoneta/, 'Tren motriz, soportes y mandos', 'Flexplate, campana y varilla'],
    [/\b(eje|flecha)\b/, 'Transmisión automática', 'Tambores, planetarios y ejes'],
    // tornillería
    [/\btornillo|perno|esparrago/, 'Tornillería', 'Tornillos'],
    [/\btuerca/, 'Tornillería', 'Tuercas'],
    [/\barandela/, 'Tornillería', 'Arandelas'],
    [/abrazadera/, 'Tornillería', 'Abrazaderas'],
    [/\b(pasador|clip|seguro|chaveta|presilla)\b/, 'Tornillería', 'Pasadores, clips y seguros'],
    // gastables, limpieza, herramientas
    [/silicon|sellador|pegamento|loctite|permatex|junta liquida/, 'Misceláneos y gastables', 'Selladores, silicones y pegamentos'],
    [/\bcinta|amarre|tie ?wrap|teipe/, 'Misceláneos y gastables', 'Cintas y amarres'],
    [/\bguante/, 'Guantes, bombillos y limpieza', 'Guantes'],
    [/jabon|desengrasante|trapo|wipe|papel toalla|detergente|escoba|suape|cloro|limpieza/, 'Guantes, bombillos y limpieza', 'Materiales de limpieza'],
    [/calibrador|micrometro|reloj comparador|medidor|multimetro|escaner/, 'Herramientas y equipos', 'Medición'],
    [/compresor|gato|elevador|prensa|soldadora|esmeril|taladro/, 'Herramientas y equipos', 'Equipos'],
    [/herramienta especial|compresor de resortes|extractor/, 'Herramientas y equipos', 'Herramientas especiales de transmisión'],
    [/\b(llave|dado|alicate|destornillador|martillo|herramienta)\b/, 'Herramientas y equipos', 'Herramientas manuales'],
    [/bombilla|pintura|brocha|foco|lampara|bombillo de oficina/, 'Materiales de mantenimiento', 'Mantenimiento del local'],
  ];
  EPT.clasificar = (nombre, F) => {
    const t = llano(nombre);
    const buscar = (fam, sub) => F.subs.find(s => s.nombre === sub && F.porSub.get(s.id).familia.nombre === fam);
    for (const [re, fam, sub] of REGLAS_FAMILIA) if (re.test(t)) { const s = buscar(fam, sub); if (s) return s.id; }
    return (buscar('Otros', 'Sin clasificar') || {}).id || '';
  };
  // Las dos listas (familia → subfamilia) de un formulario; EPT.enlazarFamilias las conecta
  EPT.selectFamilias = (F, subId) => {
    const sel = subId ? F.porSub.get(subId) : null;
    const opF = F.fams.map(f => `<option value="${f.id}" ${sel && sel.familia_id === f.id ? 'selected' : ''}>${esc(f.nombre)}</option>`).join('');
    const opS = sel ? F.subsDe(sel.familia_id).map(s => `<option value="${s.id}" ${s.id === subId ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')
      : '<option value="">Elija primero la familia</option>';
    return `<label class="campo">Familia<select name="familia"><option value="">Elija…</option>${opF}</select></label>
      <label class="campo">Subfamilia<select name="subfamilia">${opS}</select></label>`;
  };
  EPT.enlazarFamilias = (F, raiz, alCambiar) => {
    const fam = raiz.querySelector('select[name=familia]'), sub = raiz.querySelector('select[name=subfamilia]');
    fam.addEventListener('change', () => {
      sub.innerHTML = fam.value ? F.subsDe(fam.value).map(s => `<option value="${s.id}">${esc(s.nombre)}</option>`).join('')
        : '<option value="">Elija primero la familia</option>';
      if (alCambiar) alCambiar(fam.value, sub.value);
    });
    sub.addEventListener('change', () => { if (alCambiar) alCambiar(fam.value, sub.value); });
  };
  // "Se cobra / No se cobra": dos botones; el valor queda en un campo escondido name="cobrable" ('1', '0' o '' sin elegir).
  // REGLA DEL DUEÑO: si no se elige ninguno, SE COBRA. Use EPT.seCobra(f) para leerlo.
  EPT.botonesCobro = (cobra, { etiqueta = 'Al cliente' } = {}) => `<div class="campo">${esc(etiqueta)}
      <div class="seg cobro" role="group" aria-label="${esc(etiqueta)}"><button type="button" data-cob="1" aria-pressed="${cobra === true}">Se cobra</button><button type="button" data-cob="0" aria-pressed="${cobra === false}">No se cobra</button></div>
      <input type="hidden" name="cobrable" value="${cobra === true ? '1' : cobra === false ? '0' : ''}"><small class="opc">Si no elige, se cobra.</small></div>`;
  EPT.seCobra = f => f.cobrable.value !== '0';
  // alCambiar(true|false) se llama al tocar; si devuelve una promesa que falla, los botones vuelven como estaban
  EPT.enlazarCobro = (raiz, alCambiar) => {
    const h = raiz.querySelector('input[name=cobrable]'), bs = [...raiz.querySelectorAll('.seg.cobro [data-cob]')];
    const pintar = v => { h.value = v === null ? '' : v ? '1' : '0'; bs.forEach(b => b.setAttribute('aria-pressed', v !== null && (b.dataset.cob === '1') === v)); };
    bs.forEach(b => b.addEventListener('click', async () => {
      const antes = h.value === '' ? null : h.value === '1', v = b.dataset.cob === '1'; if (v === antes) return;
      pintar(v);
      try { if (alCambiar) await alCambiar(v); } catch (e) { pintar(antes); EPT.aviso(EPT.error(e), true); }
    }));
    return { poner: pintar };
  };
  // buscador ya preparado (el texto de cada pieza se arma una sola vez, no en cada letra)
  EPT.buscadorPiezas = prods => {
    if (prods._buscador) return prods._buscador;
    const etiqueta = p => `${p.codigo} — ${p.descripcion}`;
    const textos = prods.map(p => llano(`${p.codigo} ${p.descripcion} ${p.numero_parte || ''} ${String(p.numero_parte || '').replace(/[^a-z0-9]/gi, '')} ${p.codigo_barras || ''}${p.usada ? ' usada' : ''}`));
    const porEtiqueta = new Map(prods.map(p => [etiqueta(p).toLowerCase(), p]));
    // el código de la casa (ACE-001) o el código de barras llevan a la misma pieza
    const porCodigo = new Map([...prods.filter(p => p.codigo_barras).map(p => [String(p.codigo_barras).trim().toLowerCase(), p]),
      ...prods.map(p => [String(p.codigo).toLowerCase(), p])]);
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
  // nada(texto) → html que se ofrece dentro de la lista cuando no se encuentra nada (un botón con data-nada); alNada(texto, campo) al tocarlo
  EPT.sugerencias = (caja, prods, { alElegir, libre = true, nada, alNada } = {}) => {
    const bp = EPT.buscadorPiezas(prods);
    let espera = null;
    const lista = inp => inp.parentElement.querySelector('.sugerencias');
    const cerrar = inp => { const ul = lista(inp); ul.hidden = true; ul.innerHTML = ''; };
    const elegir = (inp, li) => { inp.value = li.dataset.v; cerrar(inp); if (alElegir) alElegir(inp, bp.deTexto(inp.value)); };
    const mostrar = inp => {
      const ul = lista(inp); const r = bp.buscar(inp.value);
      ul.innerHTML = r.map((p, i) => `<li data-v="${esc(bp.etiqueta(p))}"${i === 0 ? ' class="activa"' : ''}><b>${esc(p.codigo)}</b> ${esc(p.descripcion)}${p.usada ? ' <span class="marca-usada">USADA</span>' : ''}</li>`).join('')
        || (inp.value.trim() ? `<li class="nada">${(nada && nada(inp.value.trim())) || (libre ? 'No está en el catálogo: se pedirá tal como lo escribió' : 'No se encontró. Pruebe con el código o otra palabra.')}</li>` : '');
      ul.hidden = !ul.innerHTML;
    };
    caja.addEventListener('input', e => {
      if (!e.target.classList.contains('pz-busca')) return;
      clearTimeout(espera); espera = setTimeout(() => mostrar(e.target), 90);
    });
    caja.addEventListener('keydown', e => {
      if (!e.target.classList.contains('pz-busca')) return;
      // Enter con un código exacto (escrito o del lector de barras, que da Enter antes de que salga la lista): se elige esa pieza
      if (e.key === 'Enter' && !e.target.parentElement.querySelector('.sugerencias li.activa')) {
        const exacta = bp.deTexto(e.target.value);
        if (exacta) { e.preventDefault(); clearTimeout(espera); e.target.value = bp.etiqueta(exacta); cerrar(e.target); if (alElegir) alElegir(e.target, exacta); return; }
      }
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
      const bn = e.target.closest('.sugerencias [data-nada]');
      if (bn && alNada) {
        e.preventDefault();
        const inp = bn.closest('.busca-pieza').querySelector('.pz-busca'); const t = inp.value.trim();
        cerrar(inp); alNada(t, inp); return;
      }
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
      <div class="pie"><button type="button" data-cerrar>${boton ? 'Cancelar' : 'Cerrar'}</button>${boton ? `<button class="prin" type="submit">${esc(boton)}</button>` : ''}</div>
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
      catch (e) { err.textContent = EPT.error(e); err.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      finally { if (enviar) enviar.disabled = false; }
    });
    d.showModal();
    if (alAbrir) alAbrir(f, d);
    const primero = f.querySelector('input:not([type=hidden]),select,textarea'); if (primero) primero.focus();
    return d;
  };

  // ---------- Lector de código de barras ----------
  // El lector "teclea" el código muy rápido y termina con Enter (o Tab). Se reconoce en CUALQUIER pantalla,
  // esté o no el cursor en un campo; si cayó dentro de un campo, el campo vuelve a quedar como estaba.
  // Qué se hace con la pieza escaneada:
  //   · en un buscador de piezas (Pedir repuestos, Servicios…) el buscador la elige solo;
  //   · en el campo "Código de barras" de una ventana, se queda escrito ahí (para registrar un artículo);
  //   · si la pantalla tiene una tabla de piezas (requisición, despacho, pedido del taller), se marca su renglón
  //     y el cursor queda en la cantidad;
  //   · si no, se abre la ficha de la pieza para consultar, dar ingreso o despachar (EPT.abridores).
  // Un código que no existe lo ofrece crear quien maneja el almacén (EPT.alDesconocido).
  EPT.abridores = [];
  const lector = { txt: '', t0: 0, ult: 0, campo: null, antes: null };
  const esCampo = el => el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea');
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const ahora = performance.now();
    if (e.key.length === 1) {
      if (ahora - lector.ult > 60) Object.assign(lector, { txt: '', t0: ahora, campo: e.target, antes: esCampo(e.target) ? e.target.value : null });
      lector.txt += e.key; lector.ult = ahora; return;
    }
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const { txt, t0, ult, campo, antes } = lector; lector.txt = '';
    // a mano nadie escribe 4 letras o más con menos de 40 milésimas entre una y otra
    if (txt.length < 4 || ahora - ult > 100 || (ult - t0) / (txt.length - 1) > 40) return;
    if (campo !== e.target) return;
    if (campo.classList && campo.classList.contains('pz-busca')) return;           // el buscador de piezas se encarga
    e.preventDefault(); e.stopPropagation();
    if (campo.matches && campo.matches('input[name=barras]')) return;               // se queda escrito en "Código de barras"
    if (antes != null) { campo.value = antes; campo.dispatchEvent(new Event('input', { bubbles: true })); }
    escaneado(txt.trim()).catch(err => EPT.aviso(EPT.error(err), true));
  }, true);

  async function escaneado(c) {
    const abierta = document.querySelector('dialog[open]');
    if (abierta) {
      if (abierta.querySelector('button[type=submit]')) { EPT.aviso('Termine o cancele la ventana abierta antes de escanear otra pieza', true); return; }
      abierta.close();                                                             // una ficha de consulta: se cambia por la nueva
    }
    const p = EPT.buscadorPiezas(await EPT.cargarProductos()).deTexto(c);
    if (!p) {
      if (EPT.alDesconocido && EPT.alDesconocido(c)) return;
      EPT.aviso(`El código ${c} no está registrado en el programa`, true); return;
    }
    // una pantalla que está armando un documento recibe la pieza escaneada (la agrega a su lista)
    if (EPT.alEscanear && await EPT.alEscanear(p)) return;
    const filas = [...document.querySelectorAll('#vista tr[data-pid]')];
    if (filas.length) {
      const tr = filas.find(x => x.dataset.pid === p.id);
      if (!tr) { EPT.aviso(`${p.codigo} · ${p.descripcion}: no está en esta lista`, true); return; }
      filas.forEach(x => x.classList.remove('escaneada')); tr.classList.add('escaneada');
      tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const inp = tr.querySelector('input.cant'); if (inp) { inp.focus(); inp.select(); }
      EPT.aviso(`${p.codigo} · ${p.descripcion}`); return;
    }
    for (const abrir of EPT.abridores) if (await abrir(p)) return;
    EPT.aviso(`${p.codigo} · ${p.descripcion}`);
  }
  EPT.puedeVer = id => { const s = EPT.pantallas.find(x => x.id === id); return !!s && (!s.ver || s.ver()); };

  // Cada pantalla: { id, titulo, subtitulo, icono, grupo (su departamento), pestana (nombre corto), explica (una línea
  //   que dice para qué sirve), peso (orden dentro del departamento), atajo, ver: () => boolean, mostrar: async (vista) => {} }
  // Cada departamento es UN renglón del menú. Al entrar, sus pantallas se ven como pestañas arriba
  // y como sub-renglones debajo del departamento en el menú (como los albaranes de Libra: un módulo, varios documentos).
  EPT.pantalla = p => EPT.pantallas.push(p);

  const GRUPOS = [undefined, 'Taller', 'Repuestos', 'Almacén', 'Caja', 'Administración'];
  const ICONO_GRUPO = { Taller: 'carro', Repuestos: 'estante', 'Almacén': 'anaquel', Caja: 'caja_reg', 'Administración': 'tablero' };
  // Pantallas que esta persona puede ver, en orden fijo por departamento; dentro de cada uno, el "peso"
  // y luego el orden en que se agregaron. Lo usan el menú, las pestañas y el Inicio, así siempre coinciden.
  const pantallasVisibles = () => EPT.pantallas.map((p, i) => ({ p, i })).filter(({ p }) => !p.ver || p.ver())
    .sort((a, b) => (GRUPOS.indexOf(a.p.grupo) - GRUPOS.indexOf(b.p.grupo)) || ((a.p.peso || 0) - (b.p.peso || 0)) || (a.i - b.i)).map(x => x.p);
  const delGrupo = g => pantallasVisibles().filter(p => p.grupo === g);
  const nombrePestana = p => p.pestana || p.titulo;

  function pintarMenu() {
    const act = EPT.pantallas.find(x => x.id === EPT.actual);
    let h = '';
    for (const p of pantallasVisibles().filter(x => !x.grupo)) {
      h += `<button type="button" data-ir="${p.id}" ${EPT.actual === p.id ? 'aria-current="page"' : ''}>${icono(p.icono)}<span>${esc(p.titulo)}</span></button>`;
    }
    for (const g of GRUPOS.slice(1)) {
      const ps = delGrupo(g); if (!ps.length) continue;
      const abierto = !!act && act.grupo === g;
      h += `<button type="button" data-ir="${ps[0].id}" ${abierto ? 'aria-current="page"' : ''}>${icono(ICONO_GRUPO[g])}<span>${esc(g)}</span></button>`;
      if (abierto && ps.length > 1) {
        h += `<div class="hijos">${ps.map(p => `<button type="button" data-ir="${p.id}" class="${p.id === EPT.actual ? 'act' : ''}">${esc(nombrePestana(p))}</button>`).join('')}</div>`;
      }
    }
    $('#menu').innerHTML = h;
  }

  // Pestañas del departamento arriba de la pantalla, con la línea que explica para qué sirve la que está abierta
  function pintarPestanas(p) {
    const ps = p.grupo ? delGrupo(p.grupo) : [];
    $('#pestanas').innerHTML = ps.length > 1
      ? `<nav class="pestanas" aria-label="${esc(p.grupo)}">${ps.map(x => `<button type="button" data-ir="${x.id}" class="${x.id === p.id ? 'act' : ''}" ${x.id === p.id ? 'aria-current="page"' : ''}>${esc(nombrePestana(x))}</button>`).join('')}</nav>
         ${p.explica ? `<p class="explica">${esc(p.explica)}</p>` : ''}`
      : '';
    return ps.length > 1;
  }

  EPT.ir = async id => {
    const p = EPT.pantallas.find(x => x.id === id && (!x.ver || x.ver())) || EPT.pantallas[0];
    EPT.actual = p.id; EPT.alEscanear = null;
    document.body.classList.remove('menu-abierto');
    const conPestanas = pintarPestanas(p);
    $('#titulo').textContent = conPestanas ? p.grupo : p.titulo;
    $('#subtitulo').textContent = conPestanas ? nombrePestana(p) : (p.subtitulo || '');
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
    // Modo claro ↔ oscuro. El botón dice a cuál se pasa; se recuerda en este aparato
    const TEMAS = { claro: 'oscuro', oscuro: 'claro' };
    const NOMBRE = { claro: ['sol', 'Modo claro'], oscuro: ['luna', 'Modo oscuro'] };
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
    $('#pestanas').addEventListener('click', e => { const b = e.target.closest('[data-ir]'); if (b) EPT.ir(b.dataset.ir); });

    const { data } = await sb.auth.getSession();
    if (!data.session) return mostrarEntrada();
    try { await cargarPersona(); await mostrarPrograma(); }
    catch (e) { await sb.auth.signOut().catch(() => {}); mostrarEntrada(EPT.error(e)); }
  };

  // ---------- Inicio: "¿Qué va a hacer?" ----------
  // Cada departamento pone sus botones con palabras de todos los días (EPT.verbo). Un departamento que no tiene
  // verbos muestra los atajos de sus pantallas. verbo: { grupo, titulo, sub, ir (pantalla), hacer (después de ir),
  // ver: () => boolean, prin (el más usado), cuenta: async () => número para la insignia, peso }
  EPT.verbos = [];
  EPT.verbo = v => EPT.verbos.push(v);

  EPT.pantalla({
    id: 'inicio', titulo: 'Inicio', icono: 'inicio',
    async mostrar(v) {
      const dep = DEPARTAMENTOS[EPT.yo.departamento] || '';
      const vis = pantallasVisibles();
      const bloques = GRUPOS.slice(1).map(g => {
        let vs = EPT.verbos.filter(x => x.grupo === g && (!x.ver || x.ver()) && (!x.ir || EPT.puedeVer(x.ir)))
          .sort((a, b) => (a.peso || 0) - (b.peso || 0));
        if (!vs.length) vs = vis.filter(p => p.grupo === g && p.atajo).map(p => ({ titulo: p.atajo, sub: p.explica || p.subtitulo || '', ir: p.id }));
        return { g, vs };
      }).filter(b => b.vs.length);
      const todos = bloques.flatMap(b => b.vs);
      const boton = x => `<button type="button" class="verbo ${x.prin ? 'prin' : ''}" data-v="${todos.indexOf(x)}">
          <b>${esc(x.titulo)}<span class="insignia"></span></b>${x.sub ? `<span>${esc(x.sub)}</span>` : ''}</button>`;
      v.innerHTML = `
        <div class="saludo"><h2>Hola, ${esc(EPT.yo.nombre.split(' ')[0])}</h2><p>${esc(dep)} · ¿Qué va a hacer?</p></div>
        ${bloques.length ? bloques.map(b => `<div class="bloque"><h3>${icono(ICONO_GRUPO[b.g])}${esc(b.g)}</h3><div class="verbos">${b.vs.map(boton).join('')}</div></div>`).join('')
        : `<div class="panel"><div class="vacio">Todavía no tiene pantallas asignadas. Hable con el administrador.</div></div>`}`;
      v.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', async () => {
        const x = todos[b.dataset.v];
        if (x.ir) await EPT.ir(x.ir);
        if (x.hacer) await x.hacer();
      }));
      // números de lo que espera (no detienen la pantalla)
      todos.forEach((x, i) => {
        if (!x.cuenta) return;
        x.cuenta().then(n => { const s = v.querySelector(`[data-v="${i}"] .insignia`); if (s && n > 0) s.textContent = n; }).catch(() => {});
      });

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
