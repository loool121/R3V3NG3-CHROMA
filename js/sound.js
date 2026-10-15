// Diseño sonoro R3V3NG3: oscuro, industrial, minimalista.
// Todo se genera con la Web Audio API (no hay archivos de audio).

let ctx = null;
let master = null;
let reverb = null;
let drone = null;
let muted = false;

function init() {
	if (ctx) return ctx;
	const Ctx = window.AudioContext || window.webkitAudioContext;
	ctx = new Ctx();
	master = ctx.createGain();
	master.gain.value = 0.9;

	// compresor para que los golpes graves no saturen en el celular
	const comp = ctx.createDynamicsCompressor();
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
