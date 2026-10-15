// R3V3NG3 CHROMA · filtro facial: máscara blanca con el logo.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MindARThree } from 'mindar-face-three';
import { crearTexturasMascara, uvsDeGeometria } from './mascara.js';
import { openDialog } from './producto.js';
import * as sonido from './sound.js';

const $ = (id) => document.getElementById(id);
const portada = $('portada');
const btnIniciar = $('iniciar');
const progreso = $('progreso');
const hud = $('hud');
const buscando = $('buscando');
const escena = $('escena');

// El filtro no necesita descargar modelos propios: se habilita al cargar la página.
progreso.style.width = '100%';
btnIniciar.disabled = false;
btnIniciar.textContent = 'Iniciar';

let mindar = null;
let mascara = null;

async function iniciarFiltro() {
	mindar = new MindARThree({
		container: escena,
		uiLoading: 'no',
		uiScanning: 'no',
		uiError: 'yes',
	});

	const { renderer, scene, camera } = mindar;
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;

	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environmentIntensity = 0.8;
	scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
	const luz = new THREE.DirectionalLight(0xffffff, 1.3);
	luz.position.set(0.3, 0.6, 1);
	scene.add(luz);

	// Malla facial: se deforma con la cara (boca, cejas, mejillas).
	mascara = mindar.addFaceMesh();
	const { color, rugosidad } = await crearTexturasMascara(uvsDeGeometria(mascara.geometry));
	const mapa = new THREE.CanvasTexture(color);
	mapa.colorSpace = THREE.SRGBColorSpace;
	mapa.anisotropy = 4;
	const mapaRug = new THREE.CanvasTexture(rugosidad);

	mascara.material = new THREE.MeshStandardMaterial({
		map: mapa,
		roughnessMap: mapaRug,
		roughness: 1,
		metalness: 0.05,
		alphaTest: 0.5,
		transparent: false,
	});
	scene.add(mascara);

	await mindar.start();

	let habiaCara = false;
	renderer.setAnimationLoop(() => {
		const hayCara = mascara.visible;
		if (hayCara !== habiaCara) {
			habiaCara = hayCara;
			buscando.classList.toggle('oculto', hayCara);
			if (hayCara) sonido.sfxAparece(); else sonido.sfxPierde();
		}
		renderer.render(scene, camera);
	});
}

// ---------------------------------------------------------------------------
// Foto: combina la cámara y la máscara en una imagen descargable
// ---------------------------------------------------------------------------

function tomarFoto() {
	if (!mindar) return;
	const video = mindar.video;
	const gl = mindar.renderer.domElement;
	const w = escena.clientWidth;
	const h = escena.clientHeight;
	const dpr = Math.min(window.devicePixelRatio, 2);

	const c = document.createElement('canvas');
	c.width = w * dpr;
	c.height = h * dpr;
	const g = c.getContext('2d');
	g.scale(dpr, dpr);

	// el video está escalado tipo "cover" y en espejo, igual que en pantalla
	const vr = video.getBoundingClientRect();
	const er = escena.getBoundingClientRect();
	g.save();
	g.translate(vr.left - er.left + vr.width, vr.top - er.top);
	g.scale(-1, 1);
	g.drawImage(video, 0, 0, vr.width, vr.height);
	g.restore();

	mindar.renderer.render(mindar.scene, mindar.camera);
	const gr = gl.getBoundingClientRect();
	g.drawImage(gl, gr.left - er.left, gr.top - er.top, gr.width, gr.height);

	// marca de agua con el wordmark
	const wm = new Image();
	wm.onload = () => {
		const ww = w * 0.42;
		g.globalAlpha = 0.9;
		g.drawImage(wm, (w - ww) / 2, h - ww * (wm.height / wm.width) - 24, ww, ww * (wm.height / wm.width));
		mostrarFoto(c.toDataURL('image/jpeg', 0.92));
	};
	wm.src = 'assets/img/wordmark-blanco.png';

	const flash = document.createElement('div');
	flash.className = 'destello activo';
	document.body.appendChild(flash);
	requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.remove('activo')));
	setTimeout(() => flash.remove(), 600);
	sonido.sfxClick();
}

function mostrarFoto(url) {
	const v = document.createElement('div');
	v.className = 'vista-foto';
	v.innerHTML = `
		<img src="${url}" alt="Foto con el filtro R3V3NG3">
		<div>
			<a class="btn btn--claro" download="r3v3ng3-filtro.jpg" href="${url}">Guardar</a>
			<button class="btn btn--claro" type="button">Cerrar</button>
		</div>`;
	v.querySelector('button').addEventListener('click', () => { sonido.sfxCerrar(); v.remove(); });
	document.body.appendChild(v);
}

$('foto').addEventListener('click', tomarFoto);
$('producto').addEventListener('click', () => {
	sonido.sfxAbrir();
	openDialog('descripcion', { onClose: () => sonido.sfxCerrar() });
});

const btnSonido = $('sonido');
btnSonido.addEventListener('click', () => {
	const m = !sonido.isMuted();
	sonido.setMuted(m);
	btnSonido.querySelector('.on').style.display = m ? 'none' : '';
	btnSonido.querySelector('.off').style.display = m ? '' : 'none';
	if (!m) sonido.sfxClick();
});

btnIniciar.addEventListener('click', async () => {
	sonido.unlock();
	sonido.sfxClick();
	btnIniciar.disabled = true;
	btnIniciar.textContent = 'Iniciando cámara…';
	try {
		await iniciarFiltro();
		hud.hidden = false;
		portada.classList.add('oculta');
		setTimeout(() => portada.remove(), 500);
		sonido.startDrone();
	} catch (e) {
		console.error(e);
		btnIniciar.disabled = false;
		btnIniciar.textContent = 'Reintentar';
	}
});

$('salir').addEventListener('click', () => {
	sonido.stopDrone();
	try { mindar?.stop(); } catch (e) {}
});
