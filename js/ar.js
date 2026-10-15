// R3V3NG3 CHROMA · modo AR
// Imagen de seguimiento: assets/marker/target.jpg (compilada en targets.mind)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MindARThree } from 'mindar-image-three';
import { COLORES, openDialog } from './producto.js';
import * as sonido from './sound.js';

const $ = (id) => document.getElementById(id);
const portada = $('portada');
const btnIniciar = $('iniciar');
const progreso = $('progreso');
const hud = $('hud');
const buscando = $('buscando');
const aviso = $('aviso');
const escena = $('escena');

// ---------------------------------------------------------------------------
// 1. Cargar el modelo mientras se ve la portada
// ---------------------------------------------------------------------------

let modelo = null;
let materialZapato = null;

const chroma = {
	uTintA: { value: new THREE.Color('#161616') },
	uTintB: { value: new THREE.Color('#161616') },
	uAmtA: { value: 1 },
	uAmtB: { value: 1 },
	uProg: { value: 1 },
	uMinY: { value: 0 },
	uMaxY: { value: 1 },
	uEdge: { value: new THREE.Color(0xdfd7c2) },
};

// Inyecta el "sistema electrocrómico" en el material del modelo: las zonas
// oscuras (cuero) toman el color elegido y el cambio sube por la zapatilla
// como una línea de luz. Las zonas claras (cordones, detalles) se conservan.
function aplicarShaderChroma(material, geometry) {
	geometry.computeBoundingBox();
	chroma.uMinY.value = geometry.boundingBox.min.y;
	chroma.uMaxY.value = geometry.boundingBox.max.y;

	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, chroma);

		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying float vChromaY;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvChromaY = position.y;');

		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>
				varying float vChromaY;
				uniform vec3 uTintA; uniform vec3 uTintB; uniform vec3 uEdge;
				uniform float uAmtA; uniform float uAmtB; uniform float uProg;
				uniform float uMinY; uniform float uMaxY;`)
			.replace('#include <map_fragment>', `#include <map_fragment>
				float chL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
				float chCuero = 1.0 - smoothstep(0.16, 0.40, chL);
				float chH = clamp((vChromaY - uMinY) / (uMaxY - uMinY), 0.0, 1.0);
				vec3 chA = mix(diffuseColor.rgb, uTintA * min(0.78 + chL * 3.0, 1.0), chCuero * uAmtA);
				vec3 chB = mix(diffuseColor.rgb, uTintB * min(0.78 + chL * 3.0, 1.0), chCuero * uAmtB);
				diffuseColor.rgb = mix(chA, chB, step(chH, uProg));
				float chBorde = (1.0 - smoothstep(0.0, 0.04, abs(chH - uProg))) * step(0.001, uProg) * step(uProg, 0.999);`)
			.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
				roughnessFactor = max(roughnessFactor, 0.62); // cuero mate, no plástico`)
			.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
				totalEmissiveRadiance += uEdge * chBorde * 2.5;`);
	};
	material.needsUpdate = true;
}

const loader = new GLTFLoader();
const cargaModelo = new Promise((resolve, reject) => {
	loader.load('assets/model/zapato.glb', (gltf) => {
		const raiz = gltf.scene;
		raiz.traverse((o) => {
			if (o.isMesh) {
				materialZapato = o.material;
				aplicarShaderChroma(o.material, o.geometry);
			}
		});

		// Normalizar: centrado, apoyado en y=0, largo = 1 unidad.
		const box = new THREE.Box3().setFromObject(raiz);
		const size = box.getSize(new THREE.Vector3());
		const center = box.getCenter(new THREE.Vector3());
		raiz.position.set(-center.x, -box.min.y, -center.z);
		const contenedor = new THREE.Group();
		contenedor.add(raiz);
		contenedor.scale.setScalar(1 / Math.max(size.x, size.z));
		modelo = contenedor;
		resolve();
	}, (e) => {
		if (e.lengthComputable) progreso.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
	}, reject);
});

cargaModelo.then(() => {
	progreso.style.width = '100%';
	btnIniciar.disabled = false;
	btnIniciar.textContent = 'Iniciar';
}).catch((e) => {
	console.error(e);
	btnIniciar.textContent = 'Error al cargar el modelo';
});

// ---------------------------------------------------------------------------
// 2. Cambio de color
// ---------------------------------------------------------------------------

let colorActual = 'negro';
let animColor = null;
let duracionColor = 900;

function cambiarColor(id, conSonido = true) {
	if (id === colorActual && !animColor) return;
	const c = COLORES.find((x) => x.id === id);
	if (!c) return;

	// el color actual pasa a ser "A" y el nuevo "B"; el barrido va de 0 a 1
	chroma.uTintA.value.copy(chroma.uTintB.value);
	chroma.uAmtA.value = chroma.uAmtB.value;
	chroma.uTintB.value.set(id === 'negro' ? '#161616' : c.hex);
	chroma.uAmtB.value = 1;
	chroma.uEdge.value.set(id === 'rojo' ? '#ff2a2a' : id === 'negro' ? '#6b0606' : '#ffffff');
	chroma.uProg.value = 0;
	animColor = { t0: performance.now(), dur: duracionColor };

	colorActual = id;
	document.querySelectorAll('.muestra').forEach((m) => m.classList.toggle('activa', m.dataset.color === id));
	if (conSonido) sonido.sfxColor();
	mostrarAviso(c.nombre);
}

const muestras = $('muestras');
COLORES.forEach((c) => {
	const b = document.createElement('button');
	b.className = 'muestra' + (c.id === colorActual ? ' activa' : '');
	b.style.background = c.hex;
	b.dataset.color = c.id;
	b.setAttribute('aria-label', c.nombre);
	b.addEventListener('click', () => cambiarColor(c.id));
	muestras.appendChild(b);
});

let avisoTimer = null;
function mostrarAviso(texto) {
	aviso.textContent = texto;
	aviso.classList.add('visible');
	clearTimeout(avisoTimer);
	avisoTimer = setTimeout(() => aviso.classList.remove('visible'), 1400);
}

// ---------------------------------------------------------------------------
// 3. Diálogos de información
// ---------------------------------------------------------------------------

document.querySelectorAll('[data-dialogo]').forEach((b) => {
	b.addEventListener('click', () => {
		sonido.sfxAbrir();
		openDialog(b.dataset.dialogo, {
			colorActual,
			onColor: (id) => cambiarColor(id),
			onClose: () => sonido.sfxCerrar(),
		});
	});
});

// sonido on/off
const btnSonido = $('sonido');
btnSonido.addEventListener('click', () => {
	const m = !sonido.isMuted();
	sonido.setMuted(m);
	btnSonido.querySelector('.on').style.display = m ? 'none' : '';
	btnSonido.querySelector('.off').style.display = m ? '' : 'none';
	if (!m) sonido.sfxClick();
});

// ---------------------------------------------------------------------------
// 4. AR
// ---------------------------------------------------------------------------

let mindar = null;
const pivote = new THREE.Group(); // gira con el dedo
const presentacion = new THREE.Group(); // animación de aparición
let visible = false;
let apareceT = 0;
let interactuando = false;

function sombraContacto() {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d');
	const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
	grad.addColorStop(0, 'rgba(0,0,0,0.55)');
	grad.addColorStop(0.6, 'rgba(0,0,0,0.2)');
	grad.addColorStop(1, 'rgba(0,0,0,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, 128, 128);
	const m = new THREE.Mesh(
		new THREE.PlaneGeometry(1.15, 0.55),
		new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
	);
	m.rotation.x = -Math.PI / 2;
	m.position.y = 0.002;
	return m;
}

async function iniciarAR() {
	mindar = new MindARThree({
		container: escena,
		imageTargetSrc: 'assets/marker/targets.mind',
		filterMinCF: 0.0001,
		filterBeta: 0.01,
		warmupTolerance: 3,
		missTolerance: 8,
		uiLoading: 'no',
		uiScanning: 'no',
		uiError: 'yes',
	});

	const { renderer, scene, camera } = mindar;
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.1;

	// iluminación de estudio
	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environmentIntensity = 0.55;
	scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.6));
	const sol = new THREE.DirectionalLight(0xffffff, 1.6);
	sol.position.set(0.5, 1, 2);
	scene.add(sol);

	const anchor = mindar.addAnchor(0);

	// El marcador está en el plano XY del ancla (+Z hacia la cámara).
	// La zapatilla se para "de pie" sobre la imagen: su +Y apunta a +Z.
	const base = new THREE.Group();
	base.rotation.x = Math.PI / 2;
	base.scale.setScalar(0.82); // 1 unidad = ancho de la imagen
	base.add(sombraContacto());
	pivote.add(modelo);
	pivote.rotation.y = -0.6;
	presentacion.add(pivote);
	base.add(presentacion);
	anchor.group.add(base);

	anchor.onTargetFound = () => {
		visible = true;
		apareceT = performance.now();
		buscando.classList.add('oculto');
		sonido.sfxAparece();
	};
	anchor.onTargetLost = () => {
		visible = false;
		buscando.classList.remove('oculto');
		sonido.sfxPierde();
	};

	await mindar.start();

	let prev = performance.now();
	renderer.setAnimationLoop(() => {
		const now = performance.now();
		const dt = Math.min((now - prev) / 1000, 0.1);
		prev = now;

		// aparición con rebote
		const k = Math.min((now - apareceT) / 700, 1);
		const s = k >= 1 ? 1 : 1 - Math.pow(1 - k, 3) * Math.cos(k * Math.PI * 1.5);
		presentacion.scale.setScalar(Math.max(0.001, s));
		presentacion.position.y = Math.sin(now / 900) * 0.012; // flota levemente

		// giro automático lento si nadie la toca
		if (!interactuando && visible) pivote.rotation.y += dt * 0.35;

		// barrido de color
		if (animColor) {
			const p = Math.min((now - animColor.t0) / animColor.dur, 1);
			chroma.uProg.value = p < 1 ? p * p * (3 - 2 * p) : 1;
			if (p >= 1) animColor = null;
		}

		renderer.render(scene, camera);
	});
}

// ---------------------------------------------------------------------------
// 5. Gestos: arrastrar para girar, pellizcar para escalar
// ---------------------------------------------------------------------------

const punteros = new Map();
let distInicial = 0;
let escalaInicial = 1;
let soltarTimer = null;

escena.addEventListener('pointerdown', (e) => {
	punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
	interactuando = true;
	clearTimeout(soltarTimer);
	if (punteros.size === 2) {
		const [a, b] = [...punteros.values()];
		distInicial = Math.hypot(a.x - b.x, a.y - b.y);
		escalaInicial = pivote.scale.x;
	}
});

escena.addEventListener('pointermove', (e) => {
	if (!punteros.has(e.pointerId)) return;
	const p = punteros.get(e.pointerId);
	if (punteros.size === 1) {
		pivote.rotation.y += (e.clientX - p.x) * 0.012;
	}
	p.x = e.clientX;
	p.y = e.clientY;
	if (punteros.size === 2) {
		const [a, b] = [...punteros.values()];
		const d = Math.hypot(a.x - b.x, a.y - b.y);
		pivote.scale.setScalar(THREE.MathUtils.clamp(escalaInicial * (d / distInicial), 0.5, 2.2));
	}
});

function soltar(e) {
	punteros.delete(e.pointerId);
	if (punteros.size === 0) {
		soltarTimer = setTimeout(() => { interactuando = false; }, 2500);
	}
}
escena.addEventListener('pointerup', soltar);
escena.addEventListener('pointercancel', soltar);
escena.style.touchAction = 'none';

// ---------------------------------------------------------------------------
// 6. Iniciar / salir
// ---------------------------------------------------------------------------

btnIniciar.addEventListener('click', async () => {
	sonido.unlock();
	sonido.sfxClick();
	btnIniciar.disabled = true;
	btnIniciar.textContent = 'Iniciando cámara…';
	try {
		await cargaModelo;
		await iniciarAR();
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

window.__chroma = { chroma, cambiarColor, pivote, get visible() { return visible; }, set duracion(v) { duracionColor = v; } };
