// Diseño sonoro R3V3NG3: oscuro, industrial, minimalista.
// Todo se genera con la Web Audio API (no hay archivos de audio).

let ctx = null;
let master = null;
let reverb = null;
let drone = null;
let muted = false;
let comp = null;
let streamDest = null;

function init() {
	if (ctx) return ctx;
	const Ctx = window.AudioContext || window.webkitAudioContext;
	ctx = new Ctx();
	master = ctx.createGain();
	master.gain.value = 0.9;

	// compresor para que los golpes graves no saturen en el celular
	comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -14;
	comp.ratio.value = 4;
	master.connect(comp).connect(ctx.destination);

	// reverb de "sala de concreto": impulso de ruido con caída larga
	reverb = ctx.createConvolver();
	const len = ctx.sampleRate * 3.2;
	const ir = ctx.createBuffer(2, len, ctx.sampleRate);
	for (let ch = 0; ch < 2; ch++) {
		const d = ir.getChannelData(ch);
		for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
	}
	reverb.buffer = ir;
	const wet = ctx.createGain();
	wet.gain.value = 0.35;
	reverb.connect(wet).connect(master);
	return ctx;
}

/** Llamar dentro de un clic/toque del usuario. */
export function unlock() {
	init();
	if (ctx.state === 'suspended') ctx.resume();
	const b = ctx.createBuffer(1, 1, 22050);
	const s = ctx.createBufferSource();
	s.buffer = b;
	s.connect(ctx.destination);
	s.start(0);
}

export function setMuted(m) {
	muted = m;
	if (!ctx) return;
	master.gain.cancelScheduledValues(ctx.currentTime);
	master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.08);
}

export function isMuted() { return muted; }

function out(dry = 1, wet = 0.6) {
	const g = ctx.createGain();
	g.gain.value = dry;
	g.connect(master);
	if (wet > 0) {
		const w = ctx.createGain();
		w.gain.value = wet;
		g.connect(w).connect(reverb);
	}
	return g;
}

function noiseBuffer(seconds = 1) {
	const len = Math.floor(ctx.sampleRate * seconds);
	const b = ctx.createBuffer(1, len, ctx.sampleRate);
	const d = b.getChannelData(0);
	for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
	return b;
}

function env(param, t, a, peak, d) {
	param.setValueAtTime(0.0001, t);
	param.exponentialRampToValueAtTime(peak, t + a);
	param.exponentialRampToValueAtTime(0.0001, t + a + d);
}

// ---------------------------------------------------------------------------
// Drone ambiental (fondo continuo mientras la cámara está activa)
// ---------------------------------------------------------------------------

export function startDrone() {
	init();
	if (drone) return;
	const t = ctx.currentTime;
	const g = ctx.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(0.22, t + 4);

	const lp = ctx.createBiquadFilter();
	lp.type = 'lowpass';
	lp.frequency.value = 180;
	lp.Q.value = 6;

	// LFO lento que "respira" el filtro
	const lfo = ctx.createOscillator();
	const lfoGain = ctx.createGain();
	lfo.frequency.value = 0.07;
	lfoGain.gain.value = 90;
	lfo.connect(lfoGain).connect(lp.frequency);

	const oscs = [36.7, 36.95, 55.0, 73.6].map((f, i) => {
		const o = ctx.createOscillator();
		o.type = i < 2 ? 'sawtooth' : 'triangle';
		o.frequency.value = f;
		const og = ctx.createGain();
		og.gain.value = i < 2 ? 0.5 : 0.18;
		o.connect(og).connect(lp);
		return o;
	});

	// viento / estática muy filtrada
	const n = ctx.createBufferSource();
	n.buffer = noiseBuffer(4);
	n.loop = true;
	const bp = ctx.createBiquadFilter();
	bp.type = 'bandpass';
	bp.frequency.value = 420;
	bp.Q.value = 0.7;
	const ng = ctx.createGain();
	ng.gain.value = 0.05;
	n.connect(bp).connect(ng).connect(g);

	lp.connect(g);
	const o = out(1, 0.4);
	g.connect(o);

	lfo.start(t);
	oscs.forEach((x) => x.start(t));
	n.start(t);
	drone = { g, nodes: [lfo, n, ...oscs] };
}

export function stopDrone() {
	if (!drone) return;
	const t = ctx.currentTime;
	drone.g.gain.cancelScheduledValues(t);
	drone.g.gain.setTargetAtTime(0.0001, t, 0.4);
	const d = drone;
	setTimeout(() => d.nodes.forEach((x) => { try { x.stop(); } catch (e) {} }), 2000);
	drone = null;
}

// ---------------------------------------------------------------------------
// Efectos
// ---------------------------------------------------------------------------

/** Golpe grave + campana metálica inarmónica: al detectar el marcador o la cara. */
export function sfxAparece() {
	init();
	const t = ctx.currentTime;
	const o = out(1, 0.9);

	const sub = ctx.createOscillator();
	const sg = ctx.createGain();
	sub.type = 'sine';
	sub.frequency.setValueAtTime(110, t);
	sub.frequency.exponentialRampToValueAtTime(34, t + 0.9);
	env(sg.gain, t, 0.005, 0.9, 1.4);
	sub.connect(sg).connect(o);
	sub.start(t);
	sub.stop(t + 1.6);

	[220, 311.1, 467.3, 701.0].forEach((f, i) => {
		const x = ctx.createOscillator();
		const xg = ctx.createGain();
		x.type = 'sine';
		x.frequency.value = f * 1.003;
		env(xg.gain, t + 0.02, 0.003, 0.09 / (i + 1), 2.6);
		x.connect(xg).connect(o);
		x.start(t);
		x.stop(t + 3);
	});
}

/** Golpe industrial seco: al abrir un diálogo. */
export function sfxAbrir() {
	init();
	const t = ctx.currentTime;
	const o = out(0.9, 0.7);

	const n = ctx.createBufferSource();
	n.buffer = noiseBuffer(0.4);
	const bp = ctx.createBiquadFilter();
	bp.type = 'bandpass';
	bp.frequency.setValueAtTime(1800, t);
	bp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
	bp.Q.value = 2;
	const ng = ctx.createGain();
	env(ng.gain, t, 0.002, 0.8, 0.28);
	n.connect(bp).connect(ng).connect(o);
	n.start(t);

	const k = ctx.createOscillator();
	const kg = ctx.createGain();
	k.frequency.setValueAtTime(140, t);
	k.frequency.exponentialRampToValueAtTime(45, t + 0.3);
	env(kg.gain, t, 0.003, 0.8, 0.4);
	k.connect(kg).connect(o);
	k.start(t);
	k.stop(t + 0.5);
}

/** Barrido descendente apagado: al cerrar un diálogo. */
export function sfxCerrar() {
	init();
	const t = ctx.currentTime;
	const o = out(0.7, 0.5);
	const n = ctx.createBufferSource();
	n.buffer = noiseBuffer(0.5);
	const lp = ctx.createBiquadFilter();
	lp.type = 'lowpass';
	lp.frequency.setValueAtTime(2500, t);
	lp.frequency.exponentialRampToValueAtTime(120, t + 0.35);
	const g = ctx.createGain();
	env(g.gain, t, 0.01, 0.35, 0.35);
	n.connect(lp).connect(g).connect(o);
	n.start(t);
}

/** Zumbido eléctrico distorsionado: al cambiar de color (el sistema electrocrómico). */
export function sfxColor() {
	init();
	const t = ctx.currentTime;
	const o = out(0.75, 0.6);

	const shaper = ctx.createWaveShaper();
	const curve = new Float32Array(1024);
	for (let i = 0; i < 1024; i++) {
		const x = (i / 1023) * 2 - 1;
		curve[i] = Math.tanh(x * 6);
	}
	shaper.curve = curve;

	const bp = ctx.createBiquadFilter();
	bp.type = 'bandpass';
	bp.Q.value = 3;
	bp.frequency.setValueAtTime(300, t);
	bp.frequency.exponentialRampToValueAtTime(3200, t + 0.7);

	const g = ctx.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
	g.gain.setValueAtTime(0.5, t + 0.55);
	g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);

	[55, 55.4, 110.3].forEach((f) => {
		const x = ctx.createOscillator();
		x.type = 'square';
		x.frequency.value = f;
		x.connect(shaper);
		x.start(t);
		x.stop(t + 1);
	});

	// chispas
	const n = ctx.createBufferSource();
	n.buffer = noiseBuffer(1);
	const hp = ctx.createBiquadFilter();
	hp.type = 'highpass';
	hp.frequency.value = 4000;
	const ngain = ctx.createGain();
	ngain.gain.value = 0;
	for (let i = 0; i < 9; i++) {
		const tt = t + 0.05 + Math.random() * 0.7;
		ngain.gain.setValueAtTime(0.25, tt);
		ngain.gain.setValueAtTime(0, tt + 0.015);
	}
	n.connect(hp).connect(ngain).connect(o);
	n.start(t);

	shaper.connect(bp).connect(g).connect(o);
}

/** Clic seco para botones de interfaz. */
export function sfxClick() {
	init();
	const t = ctx.currentTime;
	const o = out(0.6, 0.15);
	const x = ctx.createOscillator();
	const g = ctx.createGain();
	x.type = 'square';
	x.frequency.setValueAtTime(900, t);
	x.frequency.exponentialRampToValueAtTime(180, t + 0.04);
	env(g.gain, t, 0.001, 0.25, 0.05);
	x.connect(g).connect(o);
	x.start(t);
	x.stop(t + 0.08);
}

/** Respiración/estática corta al perder el marcador o la cara. */
export function sfxPierde() {
	init();
	const t = ctx.currentTime;
	const o = out(0.5, 0.6);
	const x = ctx.createOscillator();
	const g = ctx.createGain();
	x.type = 'sine';
	x.frequency.setValueAtTime(180, t);
	x.frequency.exponentialRampToValueAtTime(60, t + 0.6);
	env(g.gain, t, 0.02, 0.25, 0.6);
	x.connect(g).connect(o);
	x.start(t);
	x.stop(t + 0.7);
}

// ===========================================================================
// FILTRO: sonidos de gestos, efectos y captura
// ===========================================================================

/** Pista de audio de la app, para grabar video con sonido. */
export function audioStream() {
	init();
	if (!streamDest) {
		streamDest = ctx.createMediaStreamDestination();
		comp.connect(streamDest);
	}
	return streamDest.stream;
}

function distorsion(k = 8) {
	const sh = ctx.createWaveShaper();
	const c = new Float32Array(2048);
	for (let i = 0; i < 2048; i++) {
		const x = (i / 2047) * 2 - 1;
		c[i] = Math.tanh(x * k);
	}
	sh.curve = c;
	sh.oversample = '2x';
	return sh;
}

/** Boca abierta: rugido industrial distorsionado con golpe sub-grave. */
export function sfxRugido() {
	init();
	const t = ctx.currentTime;
	const o = out(0.9, 1.0);

	// golpe
	const sub = ctx.createOscillator();
	const sg = ctx.createGain();
	sub.frequency.setValueAtTime(95, t);
	sub.frequency.exponentialRampToValueAtTime(28, t + 1.1);
	env(sg.gain, t, 0.004, 1.0, 1.3);
	sub.connect(sg).connect(o);
	sub.start(t);
	sub.stop(t + 1.5);

	// acorde distorsionado que se cierra
	const sh = distorsion(9);
	const lp = ctx.createBiquadFilter();
	lp.type = 'lowpass';
	lp.Q.value = 7;
	lp.frequency.setValueAtTime(2600, t);
	lp.frequency.exponentialRampToValueAtTime(160, t + 1.3);
	const g = ctx.createGain();
	env(g.gain, t, 0.02, 0.28, 1.4);
	[55, 58.27, 82.4, 110.6].forEach((f, i) => {
		const x = ctx.createOscillator();
		x.type = 'sawtooth';
		x.frequency.setValueAtTime(f * 1.5, t);
		x.frequency.exponentialRampToValueAtTime(f, t + 0.35);
		x.detune.value = (i - 1.5) * 9;
		x.connect(sh);
		x.start(t);
		x.stop(t + 1.6);
	});
	sh.connect(lp).connect(g).connect(o);

	// aire / grito filtrado
	const n = ctx.createBufferSource();
	n.buffer = noiseBuffer(1.4);
	const bp = ctx.createBiquadFilter();
	bp.type = 'bandpass';
	bp.Q.value = 1.4;
	bp.frequency.setValueAtTime(1400, t);
	bp.frequency.exponentialRampToValueAtTime(300, t + 1.2);
	const ng = ctx.createGain();
	env(ng.gain, t, 0.03, 0.35, 1.1);
	n.connect(bp).connect(ng).connect(o);
	n.start(t);
}

// tiempos (s) de los golpes del latido, para sincronizar lo visual
export const LATIDOS = [0, 0.24, 0.95, 1.19, 1.75, 1.97];

/** Ojos cerrados: latido que se acelera + tono agudo inquietante. */
export function sfxLatido() {
	init();
	const t = ctx.currentTime;
	const o = out(1, 0.7);
	LATIDOS.forEach((d, i) => {
		const tt = t + d;
		const fuerte = i % 2 === 0;
		const x = ctx.createOscillator();
		const g = ctx.createGain();
		x.type = 'sine';
		x.frequency.setValueAtTime(fuerte ? 70 : 58, tt);
		x.frequency.exponentialRampToValueAtTime(34, tt + 0.22);
		env(g.gain, tt, 0.006, fuerte ? 1.0 : 0.65, 0.26);
		x.connect(g).connect(o);
		x.start(tt);
		x.stop(tt + 0.35);

		const c = ctx.createBufferSource();
		c.buffer = noiseBuffer(0.1);
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 500;
		const cg = ctx.createGain();
		env(cg.gain, tt, 0.002, fuerte ? 0.35 : 0.2, 0.06);
		c.connect(lp).connect(cg).connect(o);
		c.start(tt);
	});

	// tono alto con vibrato, como un pitido en los oídos
	const hi = ctx.createOscillator();
	const vib = ctx.createOscillator();
	const vg = ctx.createGain();
	const hg = ctx.createGain();
	hi.frequency.value = 1244;
	vib.frequency.value = 5.5;
	vg.gain.value = 9;
	vib.connect(vg).connect(hi.frequency);
	hg.gain.setValueAtTime(0.0001, t);
	hg.gain.exponentialRampToValueAtTime(0.045, t + 1.2);
	hg.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
	hi.connect(hg).connect(out(0.8, 1));
	hi.start(t);
	vib.start(t);
	hi.stop(t + 3.3);
	vib.stop(t + 3.3);
}

/** Giro de cabeza: barrido de aire que cruza de un lado al otro. */
export function sfxGiro(dir = 1) {
	init();
	const t = ctx.currentTime;
	const o = out(0.8, 0.5);
	const n = ctx.createBufferSource();
	n.buffer = noiseBuffer(0.6);
	const bp = ctx.createBiquadFilter();
	bp.type = 'bandpass';
	bp.Q.value = 2.5;
	bp.frequency.setValueAtTime(250, t);
	bp.frequency.exponentialRampToValueAtTime(3000, t + 0.4);
	const g = ctx.createGain();
	env(g.gain, t, 0.12, 0.55, 0.35);
	const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
	if (pan) {
		pan.pan.setValueAtTime(-dir, t);
		pan.pan.linearRampToValueAtTime(dir, t + 0.45);
		n.connect(bp).connect(g).connect(pan).connect(o);
	} else {
		n.connect(bp).connect(g).connect(o);
	}
	n.start(t);
}

/** Interferencia digital corta (glitch). */
export function sfxGlitch() {
	init();
	const t = ctx.currentTime;
	const o = out(0.45, 0.2);
	for (let i = 0; i < 9; i++) {
		const tt = t + i * 0.035 + Math.random() * 0.02;
		const x = ctx.createOscillator();
		const g = ctx.createGain();
		x.type = 'square';
		x.frequency.value = 180 + Math.random() * 2600;
		g.gain.setValueAtTime(0.18, tt);
		g.gain.setValueAtTime(0, tt + 0.012 + Math.random() * 0.03);
		x.connect(g).connect(o);
		x.start(tt);
		x.stop(tt + 0.06);
	}
}

/** Obturador de cámara. */
export function sfxObturador() {
	init();
	const t = ctx.currentTime;
	const o = out(0.8, 0.35);
	[0, 0.07].forEach((d, i) => {
		const n = ctx.createBufferSource();
		n.buffer = noiseBuffer(0.08);
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = i ? 1800 : 3200;
		const g = ctx.createGain();
		env(g.gain, t + d, 0.001, i ? 0.4 : 0.6, 0.04);
		n.connect(hp).connect(g).connect(o);
		n.start(t + d);
	});
	const k = ctx.createOscillator();
	const kg = ctx.createGain();
	k.frequency.setValueAtTime(120, t);
	k.frequency.exponentialRampToValueAtTime(50, t + 0.12);
	env(kg.gain, t, 0.002, 0.5, 0.14);
	k.connect(kg).connect(o);
	k.start(t);
	k.stop(t + 0.2);
}

function beeps(freqs) {
	init();
	const t = ctx.currentTime;
	const o = out(0.6, 0.4);
	freqs.forEach((f, i) => {
		const x = ctx.createOscillator();
		const g = ctx.createGain();
		x.type = 'triangle';
		x.frequency.value = f;
		env(g.gain, t + i * 0.12, 0.004, 0.3, 0.12);
		x.connect(g).connect(o);
		x.start(t + i * 0.12);
		x.stop(t + i * 0.12 + 0.2);
	});
}
export const sfxGrabar = () => beeps([392, 196]);
export const sfxDetener = () => beeps([196, 392]);

// --- crujido de cinta / vinilo para el modo archivo ---
let crackle = null;

export function crackleStart() {
	init();
	if (crackle) return;
	const len = ctx.sampleRate * 3;
	const b = ctx.createBuffer(1, len, ctx.sampleRate);
	const d = b.getChannelData(0);
	for (let i = 0; i < len; i++) {
		d[i] = (Math.random() * 2 - 1) * 0.015;
		if (Math.random() < 0.0009) d[i] = (Math.random() * 2 - 1) * 0.9;
	}
	const src = ctx.createBufferSource();
	src.buffer = b;
	src.loop = true;
	const bp = ctx.createBiquadFilter();
	bp.type = 'bandpass';
	bp.frequency.value = 2200;
	bp.Q.value = 0.6;
	const g = ctx.createGain();
	g.gain.setValueAtTime(0.0001, ctx.currentTime);
	g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.4);
	const hum = ctx.createOscillator();
	hum.frequency.value = 60;
	const hg = ctx.createGain();
	hg.gain.value = 0.05;
	hum.connect(hg).connect(g);
	src.connect(bp).connect(g).connect(out(1, 0));
	src.start();
	hum.start();
	crackle = { g, nodes: [src, hum] };

	// "frenada de cinta" al entrar
	const t = ctx.currentTime;
	const x = ctx.createOscillator();
	const xg = ctx.createGain();
	x.type = 'sawtooth';
	x.frequency.setValueAtTime(440, t);
	x.frequency.exponentialRampToValueAtTime(40, t + 0.5);
	const lp = ctx.createBiquadFilter();
	lp.type = 'lowpass';
	lp.frequency.value = 900;
	env(xg.gain, t, 0.01, 0.25, 0.5);
	x.connect(lp).connect(xg).connect(out(0.8, 0.5));
	x.start(t);
	x.stop(t + 0.6);
}

export function crackleStop() {
	if (!crackle) return;
	const c = crackle;
	crackle = null;
	c.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
	setTimeout(() => c.nodes.forEach((n) => { try { n.stop(); } catch (e) {} }), 1000);
}

// --- zapato en órbita: zumbido de aire que se acerca y se aleja ---
let orb = null;

export function orbita(nivel, pan) {
	if (!ctx || ctx.state !== 'running') return;
	if (!orb) {
		const n = ctx.createBufferSource();
		n.buffer = noiseBuffer(3);
		n.loop = true;
		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.value = 700;
		bp.Q.value = 1.6;
		const hum = ctx.createOscillator();
		hum.type = 'triangle';
		hum.frequency.value = 146.8;
		const hg = ctx.createGain();
		hg.gain.value = 0.25;
		const g = ctx.createGain();
		g.gain.value = 0;
		const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
		n.connect(bp).connect(g);
		hum.connect(hg).connect(g);
		if (p) g.connect(p).connect(out(0.5, 0.3)); else g.connect(out(0.5, 0.3));
		n.start();
		hum.start();
		orb = { g, p, bp, nodes: [n, hum] };
	}
	const t = ctx.currentTime;
	orb.g.gain.setTargetAtTime(nivel * 0.22, t, 0.08);
	orb.bp.frequency.setTargetAtTime(500 + nivel * 900, t, 0.08);
	if (orb.p) orb.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.08);
}

export function orbitaStop() {
	if (!orb) return;
	const o = orb;
	orb = null;
	o.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
	setTimeout(() => o.nodes.forEach((n) => { try { n.stop(); } catch (e) {} }), 800);
}
