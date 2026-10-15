// Textura de la máscara blanca R3V3NG3 sobre la malla facial de MindAR.
// La malla usa las coordenadas UV del modelo canónico de MediaPipe:
// u = horizontal (0 izquierda de la imagen, 1 derecha), v = vertical
// (0 mentón, 1 frente). Se dibuja en un canvas con flipY de three.js,
// así que y_canvas = (1 - v) * alto.

// Contornos de los ojos (índices de landmarks de MediaPipe Face Mesh).
const OJO_A = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const OJO_B = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];

const S = 1024;

function cargarImagen(src) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

function trazarOjo(g, uvs, idx, escala) {
	const pts = idx.map((i) => [uvs[i][0] * S, (1 - uvs[i][1]) * S]);
	const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
	const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
	g.beginPath();
	pts.forEach(([x, y], k) => {
		const px = cx + (x - cx) * escala;
		const py = cy + (y - cy) * escala * 1.25;
		if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
	});
	g.closePath();
}

/**
 * Devuelve { color, rugosidad } (canvas) listos para CanvasTexture.
 * @param {number[][]} uvs  UVs de la malla (geometry.attributes.uv)
 */
export async function crearTexturasMascara(uvs, logoSrc = 'assets/img/logo-negro.png') {
	const logo = await cargarImagen(logoSrc);

	// --- color ---
	const color = document.createElement('canvas');
	color.width = color.height = S;
	const g = color.getContext('2d');

	// blanco con un leve degradado (más cálido en los bordes, como porcelana)
	const grad = g.createRadialGradient(S * 0.5, S * 0.45, S * 0.1, S * 0.5, S * 0.5, S * 0.62);
	grad.addColorStop(0, '#ffffff');
	grad.addColorStop(1, '#ecebe7');
	g.fillStyle = grad;
	g.fillRect(0, 0, S, S);

	// logo grande sobre la cara (de las cejas al mentón)
	const ancho = S * 0.84;
	const alto = ancho * (logo.height / logo.width);
	const cx = S * 0.5;
	const cy = (1 - 0.44) * S;
	g.drawImage(logo, cx - ancho / 2, cy - alto / 2, ancho, alto);

	// borde gris alrededor de los ojos (como el aro metálico de la referencia)
	g.lineJoin = 'round';
	g.strokeStyle = '#8d8d8d';
	g.lineWidth = 10;
	[OJO_A, OJO_B].forEach((o) => { trazarOjo(g, uvs, o, 1.55); g.stroke(); });

	// agujeros de los ojos: transparentes (el material usa alphaTest)
	g.globalCompositeOperation = 'destination-out';
	[OJO_A, OJO_B].forEach((o) => { trazarOjo(g, uvs, o, 1.4); g.fill(); });
	g.globalCompositeOperation = 'source-over';

	// --- rugosidad: piel de la máscara brillante, logo mate ---
	const rug = document.createElement('canvas');
	rug.width = rug.height = S;
	const r = rug.getContext('2d');
	r.fillStyle = 'rgb(70,70,70)';
	r.fillRect(0, 0, S, S);
	r.globalCompositeOperation = 'source-over';
	// el logo en blanco = rugoso
	const tmp = document.createElement('canvas');
	tmp.width = tmp.height = S;
	const t = tmp.getContext('2d');
	t.drawImage(logo, cx - ancho / 2, cy - alto / 2, ancho, alto);
	t.globalCompositeOperation = 'source-in';
	t.fillStyle = 'rgb(220,220,220)';
	t.fillRect(0, 0, S, S);
	r.drawImage(tmp, 0, 0);

	return { color, rugosidad: rug };
}

export function uvsDeGeometria(geometry) {
	const a = geometry.attributes.uv;
	const out = [];
	for (let i = 0; i < a.count; i++) out.push([a.getX(i), a.getY(i)]);
	return out;
}
