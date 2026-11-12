// Efectos visuales del filtro R3V3NG3:
// - Post-procesado de pantalla completa (modo archivo B/N, grano, viñeta,
//   glitch, temblor, pulso rojo, destello).
// - Ceniza y brasas cayendo.
// - Ráfaga de logos (boca abierta).
// - Brillo rojo de los ojos.
//
// La escena (cámara + 3D) se dibuja en una textura y luego pasa por un
// shader final. Así lo que se ve, la foto y el video son exactamente iguales.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Post-procesado
// ---------------------------------------------------------------------------

const POST_VS = /* glsl */`
	varying vec2 vUv;
	void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FS = /* glsl */`
	uniform sampler2D tScene;
	uniform float uTime, uArchivo, uGlitch, uShake, uRojo, uFlash;
	uniform vec2 uRes;
	uniform vec4 uVista; // canvas uv -> uv visible en pantalla (ox, oy, sx, sy)
	varying vec2 vUv;

	float hash(float n) { return fract(sin(n) * 43758.5453); }
	float hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

	void main() {
		vec2 uv = vUv;

		// temblor
		uv += uShake * vec2(sin(uTime * 97.0) * 0.010, cos(uTime * 71.0) * 0.008);

		// glitch: franjas horizontales desplazadas
		if (uGlitch > 0.001) {
			float f = floor(uTime * 22.0);
			float banda = floor(uv.y * 26.0);
			float r = hash(banda * 3.7 + f * 11.3);
			if (r < uGlitch * 0.55) uv.x += (hash(banda + f) - 0.5) * 0.14 * uGlitch;
		}

		// aberración cromática
		float ca = 0.0045 * uGlitch + 0.0012 * uArchivo + 0.003 * uShake;
		vec3 col;
		col.r = texture2D(tScene, uv + vec2(ca, 0.0)).r;
		col.g = texture2D(tScene, uv).g;
		col.b = texture2D(tScene, uv - vec2(ca, 0.0)).b;

		// modo archivo: blanco y negro con contraste
		float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
		vec3 bn = vec3(smoothstep(0.0, 0.9, l));
		col = mix(col, bn, uArchivo);

		vec4 o = linearToOutputTexel(vec4(col, 1.0));

		// coordenadas de la parte visible (para viñeta centrada en la pantalla)
		vec2 v = (vUv - uVista.xy) / uVista.zw;
		float d = distance(v, vec2(0.5));

		// grano (en espacio de pantalla)
		float g = hash2(floor(vUv * uRes) + fract(uTime * 13.0) * 100.0) - 0.5;
		o.rgb += g * (0.035 + 0.11 * uArchivo);

		// viñeta
		float vig = smoothstep(0.82, 0.28, d);
		o.rgb *= mix(1.0, vig, 0.25 + 0.55 * uArchivo);

		// pulso rojo sangre en los bordes (latido)
		o.rgb = mix(o.rgb, vec3(0.42, 0.02, 0.02), uRojo * smoothstep(0.22, 0.75, d) * 0.9);

		// rayas de escaneo del glitch
		o.rgb *= 1.0 - uGlitch * 0.25 * step(0.5, fract(vUv.y * uRes.y * 0.25));

		// destello
		o.rgb = mix(o.rgb, vec3(1.0), uFlash);

		gl_FragColor = vec4(clamp(o.rgb, 0.0, 1.0), 1.0);
	}
`;

export class PostFX {
	constructor(renderer) {
		this.renderer = renderer;
		this.size = new THREE.Vector2();
		this.rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4 });
		this.rt.texture.colorSpace = THREE.SRGBColorSpace;

		this.uniforms = {
			tScene: { value: this.rt.texture },
			uTime: { value: 0 },
			uArchivo: { value: 0 },
			uGlitch: { value: 0 },
			uShake: { value: 0 },
			uRojo: { value: 0 },
			uFlash: { value: 0 },
			uRes: { value: new THREE.Vector2(1, 1) },
			uVista: { value: new THREE.Vector4(0, 0, 1, 1) },
		};
		this.quad = new THREE.Mesh(
			new THREE.PlaneGeometry(2, 2),
			new THREE.ShaderMaterial({
				uniforms: this.uniforms,
				vertexShader: POST_VS,
				fragmentShader: POST_FS,
				depthTest: false,
				depthWrite: false,
			})
		);
		this.quad.frustumCulled = false;
		this.escenaPost = new THREE.Scene();
		this.escenaPost.add(this.quad);
		this.camPost = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	}

	_ajustar() {
		this.renderer.getDrawingBufferSize(this.size);
		if (this.rt.width !== this.size.x || this.rt.height !== this.size.y) {
			this.rt.setSize(this.size.x, this.size.y);
			this.uniforms.uRes.value.copy(this.size);
		}
	}

	/** escenas: lista de [scene, camera] dibujadas en orden sobre la textura */
	render(escenas) {
		this._ajustar();
		const r = this.renderer;
		r.setRenderTarget(this.rt);
		r.autoClear = false;
		r.setClearColor(0x000000, 1);
		r.clear(true, true, true);
		for (const [s, c] of escenas) {
			r.render(s, c);
			r.clearDepth();
		}
		r.setRenderTarget(null);
		r.render(this.escenaPost, this.camPost);
		r.autoClear = true;
	}
}

// ---------------------------------------------------------------------------
// Ceniza y brasas (capa 2D sobre la escena)
// ---------------------------------------------------------------------------

const CENIZA_VS = /* glsl */`
	attribute vec4 seed;
	uniform float uTime, uDensidad, uPx;
	varying float vAlpha;
	varying float vBrasa;
	varying float vRot;
	void main() {
		float vel = 0.035 + seed.y * 0.07;
		float y = 1.15 - mod(seed.x * 3.0 + uTime * vel, 2.3);
		float x = seed.z * 2.2 - 1.1 + sin(uTime * (0.4 + seed.w) + seed.x * 30.0) * 0.06;
		gl_Position = vec4(x, y, 0.0, 1.0);
		float activo = step(seed.w, uDensidad);
		vBrasa = step(0.93, seed.y);
		vAlpha = activo * (0.25 + seed.z * 0.5) * (vBrasa > 0.5 ? (0.6 + 0.4 * sin(uTime * 6.0 + seed.x * 50.0)) : 1.0);
		vRot = seed.x * 6.28 + uTime * (seed.w - 0.5) * 2.0;
		gl_PointSize = uPx * (1.4 + seed.w * 3.2) * (vBrasa > 0.5 ? 0.8 : 1.0);
	}
`;

const CENIZA_FS = /* glsl */`
	varying float vAlpha;
	varying float vBrasa;
	varying float vRot;
	void main() {
		vec2 p = gl_PointCoord - 0.5;
		float c = cos(vRot), s = sin(vRot);
		p = mat2(c, -s, s, c) * p;
		// copo irregular (rombo suavizado) o brasa redonda
		float forma = vBrasa > 0.5 ? length(p) * 2.0 : (abs(p.x) * 1.6 + abs(p.y) * 2.4);
		float a = smoothstep(1.0, 0.55, forma) * vAlpha;
		if (a < 0.01) discard;
		vec3 ceniza = vec3(0.62, 0.6, 0.57);
		vec3 brasa = vec3(1.0, 0.08, 0.02);
		gl_FragColor = vec4(mix(ceniza, brasa, vBrasa), a);
	}
`;

export function crearCeniza(cantidad = 260) {
	const geo = new THREE.BufferGeometry();
	const seeds = new Float32Array(cantidad * 4);
	for (let i = 0; i < cantidad * 4; i++) seeds[i] = Math.random();
	geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
	geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cantidad * 3), 3));
	const uniforms = {
		uTime: { value: 0 },
		uDensidad: { value: 0.35 },
		uPx: { value: 2 },
	};
	const puntos = new THREE.Points(geo, new THREE.ShaderMaterial({
		uniforms,
		vertexShader: CENIZA_VS,
		fragmentShader: CENIZA_FS,
		transparent: true,
		depthTest: false,
		depthWrite: false,
	}));
	puntos.frustumCulled = false;
	const escena = new THREE.Scene();
	escena.add(puntos);
	const camara = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	return { escena, camara, uniforms };
}

// ---------------------------------------------------------------------------
// Texturas
// ---------------------------------------------------------------------------

export function texturaBrillo(colorCentro = 'rgba(255,60,40,1)', colorBorde = 'rgba(107,6,6,0)') {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d');
	const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
	grad.addColorStop(0, 'rgba(255,220,200,1)');
	grad.addColorStop(0.1, colorCentro);
	grad.addColorStop(0.3, 'rgba(220,20,10,0.8)');
	grad.addColorStop(0.55, 'rgba(140,8,8,0.35)');
	grad.addColorStop(1, colorBorde);
	g.fillStyle = grad;
	g.fillRect(0, 0, 128, 128);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

// ---------------------------------------------------------------------------
// Ráfaga de logos
// ---------------------------------------------------------------------------

export class RafagaLogos {
	constructor(escena, texturaLogo) {
		this.escena = escena;
		this.tex = texturaLogo;
		this.items = [];
	}

	disparar(origen, color = 0xffffff, cantidad = 12) {
		for (let i = 0; i < cantidad; i++) {
			const m = new THREE.SpriteMaterial({
				map: this.tex,
				color,
				transparent: true,
				depthTest: false,
				depthWrite: false,
			});
			const s = new THREE.Sprite(m);
			s.renderOrder = 10;
			s.position.copy(origen);
			const a = Math.random() * Math.PI * 2;
			const v = 18 + Math.random() * 30;
			s.userData = {
				vel: new THREE.Vector3(Math.cos(a) * v, Math.sin(a) * v * 0.8 + 6, 10 + Math.random() * 20),
				giro: (Math.random() - 0.5) * 8,
				vida: 0,
				dur: 1.0 + Math.random() * 0.6,
				tam: 1.6 + Math.random() * 2.2,
			};
			m.rotation = Math.random() * Math.PI * 2;
			this.escena.add(s);
			this.items.push(s);
		}
	}

	actualizar(dt) {
		for (let i = this.items.length - 1; i >= 0; i--) {
			const s = this.items[i];
			const u = s.userData;
			u.vida += dt;
			const k = u.vida / u.dur;
			if (k >= 1) {
				this.escena.remove(s);
				s.material.dispose();
				this.items.splice(i, 1);
				continue;
			}
			u.vel.y -= 22 * dt; // gravedad
			u.vel.multiplyScalar(1 - dt * 0.8);
			s.position.addScaledVector(u.vel, dt);
			s.material.rotation += u.giro * dt;
			const esc = u.tam * (0.4 + Math.min(k * 4, 1) * 0.6 + k * 0.6);
			s.scale.set(esc, esc * 0.72, 1);
			s.material.opacity = 1 - k * k;
		}
	}
}
