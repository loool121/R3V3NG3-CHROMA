// R3V3NG3 CHROMA · filtro facial
//
// - Máscara blanca con el logo que cambia de color (sistema CHROMA).
// - Gestos: abrir la boca (rugido + ráfaga de logos), cerrar los ojos
//   (ojos de sangre + latido), girar la cabeza (siguiente color).
// - La zapatilla CHROMA orbita alrededor de la cabeza.
// - Ceniza, modo archivo B/N, glitch.
// - Foto y video con marco del archivo.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MindARThree } from 'mindar-face-three';
import { crearTexturasMascara, uvsDeGeometria } from './mascara.js';
import { COLORES, openDialog } from './producto.js';
import * as sonido from './sound.js';
import { PostFX, crearCeniza, texturaBrillo, RafagaLogos } from './filtro-efectos.js';

const $ = (id) => document.getElementById(id);
const portada = $('portada');
const btnIniciar = $('iniciar');
const progreso = $('progreso');
const hud = $('hud');
const buscando = $('buscando');
const escena = $('escena');
const aviso = $('aviso');
const etiqueta = $('etiqueta');

// ---------------------------------------------------------------------------
// Colores de la máscara (paleta del manual)
// ---------------------------------------------------------------------------

const PALETA = {
	negro: { base: '#141414', logo: '#ededed', borde: '#ffffff', zapato: '#161616', fx: 0xffffff },
	blanco: { base: '#f4f3ef', logo: '#0b0b0b', borde: '#6b0606', zapato: '#e9e7e2', fx: 0xffffff },
	rojo: { base: '#6b0606', logo: '#0b0b0b', borde: '#ff2a2a', zapato: '#6b0606', fx: 0xff3020 },
	hueso: { base: '#dfd7c2', logo: '#6b0606', borde: '#ffffff', zapato: '#dfd7c2', fx: 0xdfd7c2 },
};
const ORDEN = COLORES.map((c) => c.id);

const mk = {
	uBaseA: { value: new THREE.Color(PALETA.blanco.base) },
	uLogoA: { value: new THREE.Color(PALETA.blanco.logo) },
	uBaseB: { value: new THREE.Color(PALETA.blanco.base) },
	uLogoB: { value: new THREE.Color(PALETA.blanco.logo) },
	uProg: { value: 1 },
	uEdge: { value: new THREE.Color(PALETA.blanco.borde) },
	uSangre: { value: 0 },
};

function shaderMascara(material) {
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, mk);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>
				uniform vec3 uBaseA; uniform vec3 uLogoA; uniform vec3 uBaseB; uniform vec3 uLogoB;
				uniform vec3 uEdge; uniform float uProg; uniform float uSangre;`)
			.replace('#include <map_fragment>', `#include <map_fragment>
				float mL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
				float mK = smoothstep(0.02, 0.75, mL);
				float mSh = 0.9 + 0.1 * mL;
				vec3 mA = mix(uLogoA, uBaseA, mK) * mSh;
				vec3 mB = mix(uLogoB, uBaseB, mK) * mSh;
				float mH = vMapUv.y;
				diffuseColor.rgb = mix(mA, mB, step(mH, uProg));
				float mBorde = (1.0 - smoothstep(0.0, 0.035, abs(mH - uProg))) * step(0.001, uProg) * step(uProg, 0.999);
				float mLogo = 1.0 - mK;`)
			.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
				totalEmissiveRadiance += uEdge * mBorde * 3.0 + vec3(0.95, 0.02, 0.02) * uSangre * mLogo;`);
	};
	material.needsUpdate = true;
}

const zk = { uZapato: { value: new THREE.Color(PALETA.blanco.zapato) } };
const zapatoObjetivo = new THREE.Color(PALETA.blanco.zapato);

function shaderZapato(material) {
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, zk);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nuniform vec3 uZapato;')
			.replace('#include <map_fragment>', `#include <map_fragment>
				float zL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
				float zC = 1.0 - smoothstep(0.16, 0.40, zL);
				diffuseColor.rgb = mix(diffuseColor.rgb, uZapato * min(0.8 + zL * 3.0, 1.0), zC);`)
			.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
				roughnessFactor = max(roughnessFactor, 0.6);`);
	};
	material.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Precarga: zapatilla y logo
// ---------------------------------------------------------------------------

let zapato = null;
const cargaZapato = new Promise((resolve) => {
	new GLTFLoader().load('assets/model/zapato.glb', (gltf) => {
		const raiz = gltf.scene;
		raiz.traverse((o) => { if (o.isMesh) shaderZapato(o.material); });
		const box = new THREE.Box3().setFromObject(raiz);
		const size = box.getSize(new THREE.Vector3());
		const center = box.getCenter(new THREE.Vector3());
		raiz.position.set(-center.x, -center.y, -center.z);
		const cont = new THREE.Group();
		cont.add(raiz);
		cont.scale.setScalar(6.5 / Math.max(size.x, size.z)); // ~6.5 cm de largo
		zapato = cont;
		resolve();
	}, (e) => {
		if (e.lengthComputable) progreso.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
	}, () => resolve()); // si falla, el filtro sigue sin zapato
});

const texLogo = new THREE.TextureLoader().load('assets/img/logo-blanco.png');
texLogo.colorSpace = THREE.SRGBColorSpace;

cargaZapato.then(() => {
	progreso.style.width = '100%';
	btnIniciar.disabled = false;
	btnIniciar.textContent = 'Iniciar';
});

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

let mindar = null;
let mascara = null;
let post = null;
let ceniza = null;
let rafaga = null;
let orbita = null;
let ojos = [];
let colorActual = 'blanco';
let animColor = null;

const fx = {
	glitch: 0,
	shake: 0,
	flash: 0,
	archivo: 0,
	archivoObj: 0,
	sangre: 0,          // brillo de ojos/logo 0..1
	sangreHasta: 0,     // hasta cuándo se mantiene encendido (ms)
	latidoT0: -1e9,     // inicio del latido (ms)
};

// ---------------------------------------------------------------------------
// Cambio de color
// ---------------------------------------------------------------------------

function cambiarColor(id, opciones = {}) {
	if (id === colorActual && !animColor) return;
	const p = PALETA[id];
	const c = COLORES.find((x) => x.id === id);
	if (!p || !c) return;

	mk.uBaseA.value.copy(mk.uBaseB.value);
	mk.uLogoA.value.copy(mk.uLogoB.value);
	mk.uBaseB.value.set(p.base);
	mk.uLogoB.value.set(p.logo);
	mk.uEdge.value.set(p.borde);
	mk.uProg.value = 0;
	animColor = { t0: performance.now(), dur: 850 };
	zapatoObjetivo.set(p.zapato);

	colorActual = id;
	document.querySelectorAll('.muestra').forEach((m) => m.classList.toggle('activa', m.dataset.color === id));
	fx.glitch = Math.max(fx.glitch, 0.7);
	if (opciones.sonido !== false) {
		sonido.sfxColor();
		sonido.sfxGlitch();
	}
	mostrarAviso(c.nombre.toUpperCase() + '.');
	marcoSucio = true;
}

function colorVecino(dir) {
	const i = ORDEN.indexOf(colorActual);
	return ORDEN[(i + dir + ORDEN.length) % ORDEN.length];
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
// Gestos
// ---------------------------------------------------------------------------

const OJO_A = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const OJO_B = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];

const gesto = {
	bocaLista: true,
	bocaUltima: 0,
	ojosDesde: 0,
	ojosListos: true,
	giroListo: true,
	giroUltimo: 0,
	simulado: null, // para pruebas: { boca, ojos, giro }
};

function dist(a, b) {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function leerGestos(est) {
	let boca = 0;
	let ojosCerrados = 0;
	const bs = est && est.blendshapes && est.blendshapes.categories;
	if (bs && bs.length) {
		const v = {};
		for (const c of bs) v[c.categoryName] = c.score;
		boca = v.jawOpen ?? 0;
		ojosCerrados = Math.min(v.eyeBlinkLeft ?? 0, v.eyeBlinkRight ?? 0);
	} else if (est && est.metricLandmarks) {
		// respaldo geométrico si no hay blendshapes
		const L = est.metricLandmarks;
		const alto = dist(L[10], L[152]);
		boca = THREE.MathUtils.clamp((dist(L[13], L[14]) / alto - 0.03) / 0.14, 0, 1);
		const ea = dist(L[159], L[145]) / dist(L[33], L[133]);
		const eb = dist(L[386], L[374]) / dist(L[362], L[263]);
		ojosCerrados = THREE.MathUtils.clamp((0.2 - Math.max(ea, eb)) / 0.12, 0, 1);
	}
	// giro: el eje Z de la cara proyectado en el plano horizontal
	const e = mascara.matrix.elements;
	let giro = Math.atan2(e[8], e[10]);
	if (gesto.simulado) {
		boca = gesto.simulado.boca ?? boca;
		ojosCerrados = gesto.simulado.ojos ?? ojosCerrados;
		giro = gesto.simulado.giro ?? giro;
	}
	return { boca, ojosCerrados, giro };
}

function procesarGestos(now, est) {
	const { boca, ojosCerrados, giro } = leerGestos(est);

	// 1) boca abierta -> rugido + ráfaga de logos + temblor
	if (boca < 0.2) gesto.bocaLista = true;
	if (gesto.bocaLista && boca > 0.5 && now - gesto.bocaUltima > 900) {
		gesto.bocaLista = false;
		gesto.bocaUltima = now;
		rugido(est);
	}

	// 2) ojos cerrados ~0.5 s -> ojos de sangre + latido
	if (ojosCerrados > 0.55) {
		if (!gesto.ojosDesde) gesto.ojosDesde = now;
		if (gesto.ojosListos && now - gesto.ojosDesde > 450) {
			gesto.ojosListos = false;
			ojosDeSangre(now);
		}
	} else {
		gesto.ojosDesde = 0;
		if (now > fx.sangreHasta) gesto.ojosListos = true;
	}

	// 3) girar la cabeza -> siguiente / anterior color
	if (Math.abs(giro) < 0.14) gesto.giroListo = true;
	if (gesto.giroListo && Math.abs(giro) > 0.4 && now - gesto.giroUltimo > 700) {
		gesto.giroListo = false;
		gesto.giroUltimo = now;
		const dir = giro > 0 ? 1 : -1;
		sonido.sfxGiro(dir);
		cambiarColor(colorVecino(dir));
		marcarGesto('giro');
	}
}

const tmpV = new THREE.Vector3();

function puntoCara(est, indices) {
	const L = est && est.metricLandmarks;
	if (!L) return tmpV.set(0, -4.3, 6);
	tmpV.set(0, 0, 0);
	for (const i of indices) tmpV.x += L[i][0], tmpV.y += L[i][1], tmpV.z += L[i][2];
	return tmpV.multiplyScalar(1 / indices.length);
}

function rugido(est) {
	sonido.sfxRugido();
	fx.shake = 1;
	fx.glitch = Math.max(fx.glitch, 0.5);
	const boca = puntoCara(est, [13, 14, 78, 308]).clone();
	boca.z += 1.5;
	mascara.updateMatrixWorld();
	mascara.localToWorld(boca);
	rafaga.disparar(boca, PALETA[colorActual].fx, 14);
	mostrarAviso('RUGIDO.');
	marcarGesto('boca');
}

function ojosDeSangre(now) {
	sonido.sfxLatido();
	fx.latidoT0 = now;
	fx.sangreHasta = now + 4500;
	mostrarAviso('OJOS DE SANGRE.');
	marcarGesto('ojos');
}

// pulso visual sincronizado con el latido (sonido.LATIDOS)
function pulsoLatido(now) {
	const t = (now - fx.latidoT0) / 1000;
	let p = 0;
	for (let i = 0; i < sonido.LATIDOS.length; i++) {
		const d = t - sonido.LATIDOS[i];
		if (d >= 0 && d < 0.5) p = Math.max(p, (i % 2 === 0 ? 1 : 0.6) * Math.exp(-d * 9));
	}
	return p;
}

// ---------------------------------------------------------------------------
// Ayuda de gestos
// ---------------------------------------------------------------------------

const panelGestos = $('gestos');
let gestosTimer = null;

function mostrarGestos(ms = 7000) {
	panelGestos.classList.add('visible');
	clearTimeout(gestosTimer);
	gestosTimer = setTimeout(() => panelGestos.classList.remove('visible'), ms);
}

function marcarGesto(id) {
	const el = panelGestos.querySelector(`[data-gesto="${id}"]`);
	if (!el) return;
	el.classList.remove('hecho');
	void el.offsetWidth;
	el.classList.add('hecho');
}

$('ayuda').addEventListener('click', () => {
	sonido.sfxClick();
	if (panelGestos.classList.contains('visible')) {
		panelGestos.classList.remove('visible');
	} else {
		mostrarGestos(9000);
	}
});

// ---------------------------------------------------------------------------
// Escena
// ---------------------------------------------------------------------------

function vista() {
	// zona visible de la pantalla dentro del canvas (el canvas es "cover")
	const c = mindar.renderer.domElement;
	const cw = parseFloat(c.style.width) || c.clientWidth;
	const ch = parseFloat(c.style.height) || c.clientHeight;
	const L = parseFloat(c.style.left) || 0;
	const T = parseFloat(c.style.top) || 0;
	const W = escena.clientWidth;
	const H = escena.clientHeight;
	return { cw, ch, L, T, W, H };
}

async function iniciarFiltro() {
	mindar = new MindARThree({
		container: escena,
		uiLoading: 'no',
		uiScanning: 'no',
		uiError: 'yes',
	});

	const { renderer, scene, camera } = mindar;
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.toneMapping = THREE.NoToneMapping;

	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environmentIntensity = 0.5;
	scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 0.55));
	const luz = new THREE.DirectionalLight(0xffffff, 0.95);
	luz.position.set(0.3, 0.6, 1);
	scene.add(luz);

	// --- máscara ---
	mascara = mindar.addFaceMesh();
	const { color, rugosidad } = await crearTexturasMascara(uvsDeGeometria(mascara.geometry));
	const mapa = new THREE.CanvasTexture(color);
	mapa.colorSpace = THREE.SRGBColorSpace;
	mapa.anisotropy = 4;
	mascara.material = new THREE.MeshStandardMaterial({
		map: mapa,
		roughnessMap: new THREE.CanvasTexture(rugosidad),
		roughness: 1,
		metalness: 0.05,
		alphaTest: 0.5,
	});
	shaderMascara(mascara.material);
	mascara.renderOrder = 0;
	scene.add(mascara);

	// --- ojos de sangre (en coordenadas de la cara, en cm) ---
	const texBrillo = texturaBrillo();
	ojos = [OJO_A, OJO_B].map((idx) => {
		const s = new THREE.Sprite(new THREE.SpriteMaterial({
			map: texBrillo,
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			opacity: 0,
		}));
		s.userData.idx = idx;
		s.renderOrder = 5;
		mascara.add(s);
		return s;
	});

	// --- zapatilla en órbita + oclusor de la cabeza ---
	await cargaZapato;
	if (zapato) {
		const oclusor = new THREE.Mesh(
			new THREE.SphereGeometry(1, 32, 24),
			new THREE.MeshBasicMaterial({ colorWrite: false })
		);
		oclusor.scale.set(7.4, 10.5, 7.5);
		oclusor.position.set(0, 1.2, -4.2);
		oclusor.renderOrder = 1;
		mascara.add(oclusor);

		orbita = new THREE.Group();
		orbita.position.set(0, 4.5, -3.5);
		orbita.rotation.x = -0.32; // pasa por delante a la altura de la frente
		const brazo = new THREE.Group();
		zapato.position.set(13.5, 0, 0);
		zapato.traverse((o) => { if (o.isMesh) o.renderOrder = 2; });
		brazo.add(zapato);
		orbita.add(brazo);
		orbita.userData.brazo = brazo;
		mascara.add(orbita);
	}

	// --- efectos ---
	post = new PostFX(renderer);
	ceniza = crearCeniza();
	rafaga = new RafagaLogos(scene, texLogo);

	await mindar.start();

	// La cámara se dibuja dentro de la escena (así los efectos y la grabación
	// la incluyen). El <video> original queda oculto.
	const vt = new THREE.VideoTexture(mindar.video);
	vt.colorSpace = THREE.SRGBColorSpace;
	if (mindar.shouldFaceUser && !mindar.disableFaceMirror) {
		vt.repeat.x = -1;
		vt.offset.x = 1;
	}
	scene.background = vt;
	mindar.video.style.opacity = '0';

	let habiaCara = false;
	let prev = performance.now();

	renderer.setAnimationLoop(() => {
		const now = performance.now();
		const dt = Math.min((now - prev) / 1000, 0.1);
		prev = now;

		const hayCara = mascara.visible;
		if (hayCara !== habiaCara) {
			habiaCara = hayCara;
			buscando.classList.toggle('oculto', hayCara);
			if (hayCara) {
				sonido.sfxAparece();
				if (!panelGestos.dataset.visto) {
					panelGestos.dataset.visto = '1';
					mostrarGestos();
				}
			} else {
				sonido.sfxPierde();
			}
		}

		const est = hayCara ? mindar.getLatestEstimate() : null;
		if (hayCara) procesarGestos(now, est);

		// barrido de color
		if (animColor) {
			const p = Math.min((now - animColor.t0) / animColor.dur, 1);
			mk.uProg.value = p < 1 ? p * p * (3 - 2 * p) : 1;
			if (p >= 1) animColor = null;
		}
		zk.uZapato.value.lerp(zapatoObjetivo, 1 - Math.exp(-dt * 6));

		// ojos de sangre
		const latido = pulsoLatido(now);
		const objetivo = (now < fx.sangreHasta || gesto.ojosDesde) ? 1 : 0;
		fx.sangre += (objetivo - fx.sangre) * (1 - Math.exp(-dt * (objetivo ? 5 : 2)));
		mk.uSangre.value = fx.sangre * (0.55 + latido * 0.6);
		if (est && est.metricLandmarks) {
			for (const s of ojos) {
				const c = puntoCara(est, s.userData.idx);
				s.position.set(c.x, c.y, c.z + 0.9);
				const tam = 4.6 + latido * 2.8;
				s.scale.set(tam, tam, 1);
				s.material.opacity = fx.sangre;
			}
		}

		// órbita del zapato
		if (orbita) {
			const brazo = orbita.userData.brazo;
			brazo.rotation.y += dt * 1.1;
			zapato.rotation.y = Math.PI / 2;
			zapato.rotation.z = Math.sin(now / 600) * 0.15;
			if (hayCara) {
				const ang = brazo.rotation.y;
				const frente = -Math.sin(ang) * 0.5 + 0.5; // 1 = pasa por delante de la cara
				sonido.orbita(0.15 + frente * 0.85, Math.cos(ang));
			} else {
				sonido.orbita(0, 0);
			}
		}

		rafaga.actualizar(dt);

		// efectos de pantalla
		fx.archivo += (fx.archivoObj - fx.archivo) * (1 - Math.exp(-dt * 4));
		fx.glitch = Math.max(0, fx.glitch - dt * 1.6);
		fx.shake = Math.max(0, fx.shake - dt * 1.8);
		fx.flash = Math.max(0, fx.flash - dt * 3);

		const u = post.uniforms;
		u.uTime.value = now / 1000;
		u.uArchivo.value = fx.archivo;
		u.uGlitch.value = fx.glitch;
		u.uShake.value = fx.shake;
		u.uRojo.value = Math.max(latido * fx.sangre, 0);
		u.uFlash.value = fx.flash;
		const v = vista();
		u.uVista.value.set(-v.L / v.cw, 1 - (v.H - v.T) / v.ch, v.W / v.cw, v.H / v.ch);

		ceniza.uniforms.uTime.value = now / 1000;
		ceniza.uniforms.uDensidad.value = 0.35 + fx.archivo * 0.65;
		ceniza.uniforms.uPx.value = renderer.domElement.width / 420;

		post.render([[scene, camera], [ceniza.escena, ceniza.camara]]);

		if (pedidoFoto) {
			pedidoFoto = false;
			capturarFoto(v);
		}
		if (grabacion) cuadroGrabacion(v);
	});
}

// ---------------------------------------------------------------------------
// Marco del archivo (foto y video)
// ---------------------------------------------------------------------------

const wordmark = new Image();
wordmark.src = 'assets/img/wordmark-blanco.png';
let marcoSucio = true;
const marco = document.createElement('canvas');

function dibujarMarco(w, h) {
	if (marco.width !== w || marco.height !== h) {
		marco.width = w;
		marco.height = h;
		marcoSucio = true;
	}
	if (!marcoSucio) return marco;
	marcoSucio = false;
	const g = marco.getContext('2d');
	g.clearRect(0, 0, w, h);
	const u = w / 390; // unidad relativa al ancho de un celular
	const m = 14 * u;

	g.strokeStyle = 'rgba(255,255,255,0.85)';
	g.lineWidth = Math.max(1, 1.5 * u);
	g.strokeRect(m, m, w - m * 2, h - m * 2);

	g.shadowColor = 'rgba(0,0,0,0.55)';
	g.shadowBlur = 8 * u;
	g.fillStyle = '#ffffff';

	if (wordmark.complete && wordmark.naturalWidth) {
		const ww = w * 0.34;
		g.drawImage(wordmark, m + 10 * u, m + 12 * u, ww, ww * (wordmark.naturalHeight / wordmark.naturalWidth));
	}

	g.textBaseline = 'top';
	g.textAlign = 'right';
	g.font = `${10 * u}px Inconsolata, Consolas, monospace`;
	g.fillText('R3V3NG3 ARCHIVE, 2026', w - m - 10 * u, m + 12 * u);
	g.fillText('UPDATE: FILTRO', w - m - 10 * u, m + 25 * u);

	const c = COLORES.find((x) => x.id === colorActual);
	g.textBaseline = 'bottom';
	g.textAlign = 'left';
	g.font = `${30 * u}px 'Archivo Black', 'Arial Black', sans-serif`;
	g.fillText('CHROMA.', m + 10 * u, h - m - 10 * u);
	g.textAlign = 'right';
	g.font = `${10 * u}px Inconsolata, Consolas, monospace`;
	g.fillText(`COLOR: ${c.nombre.toUpperCase()}`, w - m - 10 * u, h - m - 24 * u);
	g.fillText(`${c.hex} · BOGOTÁ D.C.`, w - m - 10 * u, h - m - 11 * u);
	return marco;
}

function recorte(v) {
	const gl = mindar.renderer.domElement;
	const kx = gl.width / v.cw;
	const ky = gl.height / v.ch;
	return { sx: -v.L * kx, sy: -v.T * ky, sw: v.W * kx, sh: v.H * ky };
}

// ---------------------------------------------------------------------------
// Foto
// ---------------------------------------------------------------------------

let pedidoFoto = false;

function capturarFoto(v) {
	const gl = mindar.renderer.domElement;
	const r = recorte(v);
	const escala = Math.min(1, 1080 / r.sw);
	const w = Math.round(r.sw * escala);
	const h = Math.round(r.sh * escala);
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const g = c.getContext('2d');
	g.drawImage(gl, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
	g.drawImage(dibujarMarco(w, h), 0, 0);
	c.toBlob((blob) => mostrarResultado(blob, 'foto'), 'image/jpeg', 0.92);
}

$('foto').addEventListener('click', () => {
	if (!mindar || grabacion) return;
	sonido.sfxObturador();
	fx.flash = 0.9;
	setTimeout(() => { pedidoFoto = true; }, 60);
});

// ---------------------------------------------------------------------------
// Video (con sonido)
// ---------------------------------------------------------------------------

let grabacion = null;
const btnVideo = $('video');
const rec = $('rec');
const DURACION_MAX = 15000;

function tipoVideo() {
	const tipos = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
	return tipos.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}

function iniciarGrabacion() {
	if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
		mostrarAviso('TU NAVEGADOR NO GRABA VIDEO.');
		return;
	}
	const v = vista();
	const r = recorte(v);
	const escala = Math.min(1, 720 / r.sw);
	const c = document.createElement('canvas');
	c.width = Math.round(r.sw * escala / 2) * 2;
	c.height = Math.round(r.sh * escala / 2) * 2;
	const stream = c.captureStream();
	try {
		sonido.audioStream().getAudioTracks().forEach((t) => stream.addTrack(t));
	} catch (e) { /* sin audio */ }

	const mime = tipoVideo();
	let recorder;
	try {
		recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
	} catch (e) {
		recorder = new MediaRecorder(stream);
	}
	const partes = [];
	recorder.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
	recorder.onstop = () => {
		const blob = new Blob(partes, { type: recorder.mimeType || mime || 'video/webm' });
		stream.getVideoTracks().forEach((t) => t.stop());
		mostrarResultado(blob, 'video');
	};

	grabacion = { canvas: c, g: c.getContext('2d'), recorder, t0: performance.now() };
	sonido.sfxGrabar();
	recorder.start(250);
	btnVideo.classList.add('activo');
	btnVideo.querySelector('b').textContent = 'Detener';
	rec.hidden = false;
	etiqueta.hidden = true;
}

function cuadroGrabacion(v) {
	const gr = grabacion;
	const r = recorte(v);
	const { width: w, height: h } = gr.canvas;
	gr.g.drawImage(mindar.renderer.domElement, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
	gr.g.drawImage(dibujarMarco(w, h), 0, 0);
	const t = performance.now() - gr.t0;
	rec.querySelector('span').textContent = `00:${String(Math.floor(t / 1000)).padStart(2, '0')}`;
	if (t >= DURACION_MAX) detenerGrabacion();
}

function detenerGrabacion() {
	if (!grabacion) return;
	const gr = grabacion;
	grabacion = null;
	sonido.sfxDetener();
	setTimeout(() => { try { gr.recorder.stop(); } catch (e) {} }, 350); // que alcance a grabar el beep
	btnVideo.classList.remove('activo');
	btnVideo.querySelector('b').textContent = 'Video';
	rec.hidden = true;
	etiqueta.hidden = false;
}

btnVideo.addEventListener('click', () => {
	if (!mindar) return;
	if (grabacion) detenerGrabacion(); else iniciarGrabacion();
});

// ---------------------------------------------------------------------------
// Resultado: vista previa, guardar y compartir
// ---------------------------------------------------------------------------

function mostrarResultado(blob, tipo) {
	const url = URL.createObjectURL(blob);
	const ext = tipo === 'foto' ? 'jpg' : (blob.type.includes('mp4') ? 'mp4' : 'webm');
	const nombre = `r3v3ng3-chroma-${Date.now()}.${ext}`;
	const v = document.createElement('div');
	v.className = 'vista-foto';
	v.innerHTML = `
		${tipo === 'foto'
			? `<img src="${url}" alt="Foto con el filtro R3V3NG3">`
			: `<video src="${url}" controls autoplay loop playsinline></video>`}
		<div>
			<a class="btn btn--claro" download="${nombre}" href="${url}">Guardar</a>
			<button class="btn btn--claro" type="button" data-accion="compartir">Compartir</button>
			<button class="btn btn--claro" type="button" data-accion="cerrar">Cerrar</button>
		</div>`;
	const archivo = new File([blob], nombre, { type: blob.type });
	const btnComp = v.querySelector('[data-accion="compartir"]');
	if (!(navigator.canShare && navigator.canShare({ files: [archivo] }))) btnComp.remove();
	else btnComp.addEventListener('click', () => {
		navigator.share({ files: [archivo], title: 'R3V3NG3 CHROMA' }).catch(() => {});
	});
	v.querySelector('[data-accion="cerrar"]').addEventListener('click', () => {
		sonido.sfxCerrar();
		v.remove();
		URL.revokeObjectURL(url);
	});
	document.body.appendChild(v);
}

// ---------------------------------------------------------------------------
// Modo archivo e información
// ---------------------------------------------------------------------------

const btnArchivo = $('archivo');
btnArchivo.addEventListener('click', () => {
	const on = fx.archivoObj < 0.5;
	fx.archivoObj = on ? 1 : 0;
	fx.glitch = Math.max(fx.glitch, 0.6);
	btnArchivo.classList.toggle('activo', on);
	etiqueta.textContent = on ? 'MODO ARCHIVO · B/N' : 'FILTRO · R3V3NG3';
	sonido.sfxGlitch();
	if (on) sonido.crackleStart(); else sonido.crackleStop();
	mostrarAviso(on ? 'ARCHIVO.' : 'COLOR.');
});

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

// ---------------------------------------------------------------------------
// Iniciar / salir
// ---------------------------------------------------------------------------

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
	if (grabacion) detenerGrabacion();
	sonido.stopDrone();
	sonido.crackleStop();
	sonido.orbitaStop();
	try { mindar?.stop(); } catch (e) {}
});

// ganchos para pruebas
window.__filtro = {
	simular(g) { gesto.simulado = g; },
	cambiarColor,
	get colorActual() { return colorActual; },
	get mindar() { return mindar; },
	get mascara() { return mascara; },
	fx,
};
