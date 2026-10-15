// Contenido del producto y diálogos de información (Colores, Materiales,
// Descripción). Se usa en la página de inicio y en la vista AR.

export const COLORES = [
	{ id: 'negro', nombre: 'Negro absoluto', hex: '#000000', rgb: '0, 0, 0', texto: '#ffffff' },
	{ id: 'blanco', nombre: 'Blanco óptico', hex: '#FFFFFF', rgb: '255, 255, 255', texto: '#000000' },
	{ id: 'rojo', nombre: 'Rojo sangre', hex: '#6B0606', rgb: '107, 6, 6', texto: '#ffffff' },
	{ id: 'hueso', nombre: 'Hueso', hex: '#DFD7C2', rgb: '223, 215, 194', texto: '#6b0606' },
];

export const MATERIALES = [
	{ parte: 'Paneles exteriores', pct: '70%', detalle: 'Cuero de becerro plena flor, acabado mate.' },
	{ parte: 'Panel electrocrómico', pct: '30%', detalle: 'Lámina flexible que cambia de color con el sistema integrado.' },
	{ parte: 'Forro interior', pct: '100%', detalle: 'Cuero de cordero.' },
	{ parte: 'Cordones', pct: '100%', detalle: 'Algodón encerado.' },
	{ parte: 'Suela', pct: '100%', detalle: 'Caucho vulcanizado.' },
];

export const DESCRIPCION = [
	'R3V3NGE CHROMA es un concepto de calzado urbano experimental que permite modificar su apariencia cromática mediante un sistema electrónico integrado en la estructura del producto. La zapatilla presenta una silueta voluminosa y futurista, construida a partir de diferentes paneles y materiales que permiten generar distintas configuraciones visuales.',
	'El producto busca convertir el calzado en una pieza adaptable, donde el usuario pueda modificar su apariencia sin cambiar de zapatillas. El cambio de color funciona como una extensión de la identidad del usuario y permite crear diferentes versiones de una misma pieza.',
];

const membrete = (n) => `
	<div class="dialogo__membrete">
		<span>UNA INVITACIÓN AL ARCHIVO</span>
		<img src="assets/img/wordmark-negro.png" alt="r3v3nge">
		<span>BOGOTÁ D.C. · R3V3NG3 ARCHIVE, 2026 · ${n}</span>
	</div>`;

let dialogEl = null;
let onCloseCb = null;

function ensureDialog() {
	if (dialogEl) return dialogEl;
	dialogEl = document.createElement('div');
	dialogEl.className = 'dialogo';
	dialogEl.setAttribute('role', 'dialog');
	dialogEl.setAttribute('aria-modal', 'true');
	dialogEl.innerHTML = '<div class="dialogo__carta papel"></div>';
	dialogEl.addEventListener('click', (e) => {
		if (e.target === dialogEl) closeDialog();
	});
	document.body.appendChild(dialogEl);
	return dialogEl;
}

export function closeDialog() {
	if (!dialogEl || !dialogEl.classList.contains('abierto')) return;
	dialogEl.classList.remove('abierto');
	if (onCloseCb) onCloseCb();
}

/**
 * Abre uno de los 3 diálogos.
 * @param {'colores'|'materiales'|'descripcion'} tipo
 * @param {object} opts { colorActual, onColor(id), onOpen(), onClose() }
 */
export function openDialog(tipo, opts = {}) {
	const el = ensureDialog();
	const carta = el.querySelector('.dialogo__carta');
	onCloseCb = opts.onClose || null;

	let html = '';
	if (tipo === 'colores') {
		html = `${membrete('UPDATE: 01')}
			<div class="dialogo__numero">01 / COLORES DISPONIBLES</div>
			<h2 class="dialogo__titulo">Color.</h2>
			<div class="dialogo__cuerpo">
				<p>Un mismo par, cuatro identidades. ${opts.onColor ? 'Toca un color para aplicarlo al modelo.' : 'Pruébalos sobre el modelo en el modo AR.'}</p>
				<div class="paleta">
					${COLORES.map((c) => `
						<button class="paleta__item ${c.id === opts.colorActual ? 'activa' : ''}" data-color="${c.id}"
							style="background:${c.hex};color:${c.texto}">
							<strong>${c.nombre}</strong>
							<span>(${c.rgb})</span>
							<span>${c.hex}</span>
						</button>`).join('')}
				</div>
			</div>`;
	} else if (tipo === 'materiales') {
		html = `${membrete('UPDATE: 02')}
			<div class="dialogo__numero">02 / COMPOSICIÓN</div>
			<h2 class="dialogo__titulo">Materiales.</h2>
			<div class="dialogo__cuerpo">
				<ul class="materiales">
					${MATERIALES.map((m) => `
						<li><b>${m.parte}</b><em>${m.pct}</em><span>${m.detalle}</span></li>`).join('')}
				</ul>
				<dl class="datos">
					<dt>SILUETA</dt><dd>High-top</dd>
					<dt>SISTEMA</dt><dd>Electrocrómico integrado</dd>
					<dt>ORIGEN</dt><dd>Bogotá D.C.</dd>
				</dl>
			</div>`;
	} else {
		html = `${membrete('UPDATE: 03')}
			<div class="dialogo__numero">03 / DESCRIPCIÓN</div>
			<h2 class="dialogo__titulo">CHROMA.</h2>
			<div class="dialogo__cuerpo">
				<p><b>A quien le interese,</b></p>
				${DESCRIPCION.map((t) => `<p>${t}</p>`).join('')}
			</div>`;
	}

	carta.innerHTML = html + '<button class="btn dialogo__cerrar">Cerrar</button>';
	carta.scrollTop = 0;
	carta.querySelector('.dialogo__cerrar').addEventListener('click', closeDialog);

	if (tipo === 'colores' && opts.onColor) {
		carta.querySelectorAll('[data-color]').forEach((b) => {
			b.addEventListener('click', () => {
				carta.querySelectorAll('[data-color]').forEach((x) => x.classList.remove('activa'));
				b.classList.add('activa');
				opts.onColor(b.dataset.color);
			});
		});
	}

	// forzar reflow para que la transición se vea
	void el.offsetWidth;
	el.classList.add('abierto');
	if (opts.onOpen) opts.onOpen();
}

document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') closeDialog();
});
